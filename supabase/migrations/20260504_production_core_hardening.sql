-- ============================================================
-- Production Core Hardening
-- Run after: supabase/setup_complete.sql
-- Purpose:
--   1) Add audit/id/soft-delete columns without changing existing business keys.
--   2) Add BOQ price snapshot fields.
--   3) Enable authenticated-only RLS. LINE webhook must use service role server-side.
--   4) Add BOQ/material price helper functions.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Audit column trigger
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_set_audit_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := NOW();
    END IF;

    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := NOW();
    END IF;

    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;

    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
    NEW.updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Add id + audit columns to core tables.
-- Existing natural/business keys remain unchanged:
-- material_id, supplier_id, effective_date, project_id, etc.
-- ------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'bom_template',
    'bom_item',
    'boq_project',
    'boq_item',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'customer'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id UUID', tbl);
      EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', tbl);
      EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (id)', 'uq_' || tbl || '_id', tbl);

      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', tbl);
      EXECUTE format('UPDATE public.%I SET created_at = NOW() WHERE created_at IS NULL', tbl);
      EXECUTE format('UPDATE public.%I SET updated_at = created_at WHERE updated_at IS NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT NOW()', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT NOW()', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET NOT NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET NOT NULL', tbl);

      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', tbl);
    END IF;
  END LOOP;
END;
$$;

-- Soft-delete flags for tables where records should remain queryable historically.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'boq_item',
    'boq_attachment',
    'boq_comment',
    'boq_template_item',
    'bom_item'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE', tbl);
      EXECUTE format('UPDATE public.%I SET is_deleted = FALSE WHERE is_deleted IS NULL', tbl);
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.mat_uom
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ------------------------------------------------------------
-- BOQ price snapshot fields
-- ------------------------------------------------------------

ALTER TABLE public.boq_item
  ADD COLUMN IF NOT EXISTS estimated_unit_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS final_unit_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS price_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES public.supplier(supplier_id) ON DELETE SET NULL;

UPDATE public.boq_item
SET
  estimated_unit_price = COALESCE(estimated_unit_price, unit_price, 0),
  final_unit_price = COALESCE(final_unit_price, unit_price, estimated_unit_price, 0),
  price_snapshot_at = COALESCE(price_snapshot_at, created_at)
WHERE estimated_unit_price IS NULL
   OR final_unit_price IS NULL
   OR price_snapshot_at IS NULL;

ALTER TABLE public.boq_item
  ALTER COLUMN estimated_unit_price SET DEFAULT 0,
  ALTER COLUMN estimated_unit_price SET NOT NULL,
  ALTER COLUMN final_unit_price SET DEFAULT 0,
  ALTER COLUMN final_unit_price SET NOT NULL;

ALTER TABLE public.boq_item
  DROP CONSTRAINT IF EXISTS boq_item_price_source_check;

ALTER TABLE public.boq_item
  ADD CONSTRAINT boq_item_price_source_check
  CHECK (price_source IN ('MANUAL', 'LATEST_PRICE', 'AI', 'IMPORT', 'TEMPLATE', 'BOM', 'UNKNOWN'));

CREATE INDEX IF NOT EXISTS idx_boq_item_project_active
  ON public.boq_item(project_id, seq)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_boq_item_supplier
  ON public.boq_item(supplier_id);

CREATE INDEX IF NOT EXISTS idx_boq_item_price_snapshot
  ON public.boq_item(material_id, supplier_id, price_snapshot_at DESC);

-- ------------------------------------------------------------
-- Audit triggers
-- ------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'bom_template',
    'bom_item',
    'boq_project',
    'boq_item',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'customer'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || tbl || '_audit_columns', tbl);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_audit_columns()',
        'trg_' || tbl || '_audit_columns',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Price and BOQ calculation helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_latest_material_price(p_material_id TEXT)
RETURNS TABLE (
  material_id TEXT,
  supplier_id TEXT,
  supplier_name_th TEXT,
  effective_date DATE,
  price_uom TEXT,
  price_uom_name_th TEXT,
  unit_price NUMERIC,
  currency_code TEXT,
  min_order_qty NUMERIC,
  lead_time_days INT,
  is_tax_included BOOLEAN,
  source_note TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.material_id,
    p.supplier_id,
    s.supplier_name_th,
    p.effective_date,
    p.price_uom,
    u.uom_name_th AS price_uom_name_th,
    p.unit_price,
    p.currency_code,
    p.min_order_qty,
    p.lead_time_days,
    p.is_tax_included,
    p.source_note
  FROM public.mat_price_base p
  JOIN public.supplier s ON s.supplier_id = p.supplier_id
  LEFT JOIN public.mat_uom u ON u.uom_code = p.price_uom
  LEFT JOIN public.mat_supplier_map msm
    ON msm.material_id = p.material_id
   AND msm.supplier_id = p.supplier_id
  WHERE p.material_id = p_material_id
    AND p.is_deleted = FALSE
    AND s.is_deleted = FALSE
    AND p.effective_date <= CURRENT_DATE
  ORDER BY
    p.effective_date DESC,
    COALESCE(msm.is_preferred, FALSE) DESC,
    p.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_material_price_history(p_material_id TEXT)
RETURNS TABLE (
  material_id TEXT,
  supplier_id TEXT,
  supplier_name_th TEXT,
  effective_date DATE,
  price_uom TEXT,
  price_uom_name_th TEXT,
  unit_price NUMERIC,
  currency_code TEXT,
  min_order_qty NUMERIC,
  lead_time_days INT,
  is_tax_included BOOLEAN,
  source_note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.material_id,
    p.supplier_id,
    s.supplier_name_th,
    p.effective_date,
    p.price_uom,
    u.uom_name_th AS price_uom_name_th,
    p.unit_price,
    p.currency_code,
    p.min_order_qty,
    p.lead_time_days,
    p.is_tax_included,
    p.source_note,
    p.created_at
  FROM public.mat_price_base p
  JOIN public.supplier s ON s.supplier_id = p.supplier_id
  LEFT JOIN public.mat_uom u ON u.uom_code = p.price_uom
  WHERE p.material_id = p_material_id
    AND p.is_deleted = FALSE
  ORDER BY p.effective_date DESC, p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.calculate_boq_item_total(p_boq_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ROUND(
      CASE
        WHEN bi.item_type = 'SECTION' OR COALESCE(bi.is_deleted, FALSE) THEN 0
        ELSE bi.qty * (1 + bi.waste_pct / 100) * COALESCE(bi.final_unit_price, bi.unit_price, bi.estimated_unit_price, 0)
      END,
      2
    ),
    0
  )
  FROM public.boq_item bi
  WHERE bi.item_id = p_boq_item_id;
$$;

CREATE OR REPLACE FUNCTION public.calculate_boq_total(p_boq_project_id TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ROUND(
      SUM(
        CASE
          WHEN bi.item_type = 'SECTION' OR COALESCE(bi.is_deleted, FALSE) THEN 0
          ELSE bi.qty * (1 + bi.waste_pct / 100) * COALESCE(bi.final_unit_price, bi.unit_price, bi.estimated_unit_price, 0)
        END
      ),
      2
    ),
    0
  )
  FROM public.boq_item bi
  WHERE bi.project_id = p_boq_project_id;
$$;

-- ------------------------------------------------------------
-- RLS: authenticated application users only.
-- Public LINE webhook uses a verified server route + service role client.
-- ------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mat_master',
    'mat_category',
    'mat_uom',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'bom_template',
    'bom_item',
    'boq_project',
    'boq_item',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'customer'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_authenticated_select', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_authenticated_insert', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_authenticated_update', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_authenticated_delete', tbl);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)',
        tbl || '_authenticated_select',
        tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (TRUE)',
        tbl || '_authenticated_insert',
        tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE)',
        tbl || '_authenticated_update',
        tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (TRUE)',
        tbl || '_authenticated_delete',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.mat_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mat_audit_log FROM anon;
GRANT SELECT, INSERT ON TABLE public.mat_audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mat_audit_log_audit_id_seq TO authenticated;

DROP POLICY IF EXISTS mat_audit_log_authenticated_select ON public.mat_audit_log;
DROP POLICY IF EXISTS mat_audit_log_authenticated_insert ON public.mat_audit_log;

CREATE POLICY mat_audit_log_authenticated_select
  ON public.mat_audit_log
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY mat_audit_log_authenticated_insert
  ON public.mat_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- Prevent anon reads through views/RPC.
ALTER VIEW IF EXISTS public.v_mat_latest_price SET (security_invoker = true);
REVOKE SELECT ON public.v_mat_latest_price FROM anon;
GRANT SELECT ON public.v_mat_latest_price TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_latest_material_price(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_material_price_history(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_boq_item_total(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_boq_total(TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_latest_material_price(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_material_price_history(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_boq_item_total(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_boq_total(TEXT) TO authenticated, service_role;

-- Storage bucket remains private and authenticated-only.
DROP POLICY IF EXISTS "boq attachments select" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments insert" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments update" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments delete" ON storage.objects;

CREATE POLICY "boq attachments select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'boq-attachments');

CREATE POLICY "boq attachments insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boq-attachments');

CREATE POLICY "boq attachments update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boq-attachments')
  WITH CHECK (bucket_id = 'boq-attachments');

CREATE POLICY "boq attachments delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boq-attachments');

NOTIFY pgrst, 'reload schema';
