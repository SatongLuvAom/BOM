-- ============================================================
-- Phase 1: Single User Production
-- Run in Supabase SQL Editor after setup_complete.sql.
-- Safe to rerun.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared updated_at trigger.
CREATE OR REPLACE FUNCTION public.fn_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic helper to add production metadata columns safely.
CREATE OR REPLACE FUNCTION public.fn_phase1_add_common_columns(table_name text)
RETURNS void AS $$
BEGIN
  IF to_regclass(format('public.%I', table_name)) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()', table_name);
  EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', table_name);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', table_name);
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(id)', 'uq_' || table_name || '_id', table_name);

  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false', table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL', table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid NULL', table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by uuid NULL', table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()', table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', table_name);

  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || table_name || '_updated_at', table_name);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at()',
    'trg_' || table_name || '_updated_at',
    table_name
  );
END;
$$ LANGUAGE plpgsql;

SELECT public.fn_phase1_add_common_columns('mat_master');
SELECT public.fn_phase1_add_common_columns('mat_category');
SELECT public.fn_phase1_add_common_columns('mat_uom');
SELECT public.fn_phase1_add_common_columns('mat_alias');
SELECT public.fn_phase1_add_common_columns('mat_uom_conv');
SELECT public.fn_phase1_add_common_columns('supplier');
SELECT public.fn_phase1_add_common_columns('mat_supplier_map');
SELECT public.fn_phase1_add_common_columns('mat_price_base');
SELECT public.fn_phase1_add_common_columns('boq_project');
SELECT public.fn_phase1_add_common_columns('boq_item');
SELECT public.fn_phase1_add_common_columns('boq_attachment');
SELECT public.fn_phase1_add_common_columns('boq_comment');
SELECT public.fn_phase1_add_common_columns('boq_template');
SELECT public.fn_phase1_add_common_columns('boq_template_item');
SELECT public.fn_phase1_add_common_columns('bom_template');
SELECT public.fn_phase1_add_common_columns('bom_item');
SELECT public.fn_phase1_add_common_columns('customer');

DROP FUNCTION IF EXISTS public.fn_phase1_add_common_columns(text);

-- Audit log for production actions.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NULL,
  action text NOT NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON public.audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);

-- Default active-row indexes for faster list/search pages.
CREATE INDEX IF NOT EXISTS idx_mat_master_active_rows ON public.mat_master(updated_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_mat_category_active_rows ON public.mat_category(sort_order, cat_code) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_mat_uom_active_rows ON public.mat_uom(uom_code) WHERE is_deleted = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_mat_alias_active_rows ON public.mat_alias(material_id, alias_name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_supplier_active_rows ON public.supplier(updated_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_active_rows ON public.mat_supplier_map(material_id, supplier_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_mat_price_base_active_rows ON public.mat_price_base(material_id, supplier_id, effective_date DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_project_active_rows ON public.boq_project(created_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_item_active_rows ON public.boq_item(project_id, seq) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bom_template_active_rows ON public.bom_template(bom_name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_bom_item_active_rows ON public.bom_item(bom_id, seq) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_template_active_rows ON public.boq_template(created_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_template_item_active_rows ON public.boq_template_item(template_id, seq) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_comment_active_rows ON public.boq_comment(project_id, item_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_boq_attachment_active_rows ON public.boq_attachment(project_id, created_at DESC) WHERE is_deleted = false;

-- Latest price view must exclude deleted material, supplier, and price rows.
CREATE OR REPLACE VIEW public.v_mat_latest_price AS
SELECT DISTINCT ON (p.material_id)
  p.material_id,
  p.supplier_id,
  s.supplier_name_th AS supplier_name,
  p.unit_price,
  p.currency_code,
  p.price_uom,
  p.effective_date
FROM public.mat_price_base p
JOIN public.supplier s ON s.supplier_id = p.supplier_id AND s.is_deleted = false
JOIN public.mat_master m ON m.material_id = p.material_id AND m.is_deleted = false
WHERE p.is_deleted = false
ORDER BY p.material_id, p.effective_date DESC;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_materials',  (SELECT COUNT(*) FROM public.mat_master WHERE is_deleted = false),
    'active_materials', (SELECT COUNT(*) FROM public.mat_master WHERE status = 'ACTIVE' AND is_deleted = false),
    'total_suppliers',  (SELECT COUNT(*) FROM public.supplier WHERE is_deleted = false),
    'total_prices',     (SELECT COUNT(*) FROM public.mat_price_base WHERE is_deleted = false),
    'missing_alias', (
      SELECT COUNT(*)
      FROM public.mat_master m
      WHERE m.status = 'ACTIVE'
        AND m.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM public.mat_alias a
          WHERE a.material_id = m.material_id AND a.is_deleted = false
        )
    ),
    'missing_uom_conv', (
      SELECT COUNT(*)
      FROM public.mat_master m
      WHERE m.status = 'ACTIVE'
        AND m.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM public.mat_uom_conv c
          WHERE c.material_id = m.material_id AND c.is_deleted = false
        )
    ),
    'missing_price', (
      SELECT COUNT(*)
      FROM public.mat_master m
      WHERE m.status = 'ACTIVE'
        AND m.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM public.mat_price_base p
          WHERE p.material_id = m.material_id AND p.is_deleted = false
        )
    ),
    'by_category', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT c.cat_id, c.cat_code, c.cat_name_th, COUNT(m.material_id)::int AS count
        FROM public.mat_category c
        LEFT JOIN public.mat_master m
          ON m.cat_id = c.cat_id AND m.is_deleted = false
        WHERE c.is_active = true AND c.is_deleted = false
        GROUP BY c.cat_id, c.cat_code, c.cat_name_th
        ORDER BY COUNT(m.material_id) DESC
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Optional restore helper for future admin/trash tooling.
CREATE OR REPLACE FUNCTION public.restore_soft_deleted_record(target_table text, key_column text, key_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_table !~ '^[a-z_][a-z0-9_]*$' OR key_column !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid identifier';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET is_deleted = false, deleted_at = NULL, updated_at = now() WHERE %I::text = $1',
    target_table,
    key_column
  ) USING key_value;
END;
$$;

-- RLS remains app-authenticated. App-level owner guard enforces single-owner access.
DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    'mat_master',
    'mat_category',
    'mat_uom',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'boq_project',
    'boq_item',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'bom_template',
    'bom_item',
    'customer',
    'audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_select', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_insert', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_update', table_name);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.role() = %L)',
      'authenticated_select',
      table_name,
      'authenticated'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.role() = %L)',
      'authenticated_insert',
      table_name,
      'authenticated'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
      'authenticated_update',
      table_name,
      'authenticated',
      'authenticated'
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
