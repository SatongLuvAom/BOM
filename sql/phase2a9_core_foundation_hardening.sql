-- ============================================================
-- Phase 2A.9 Core Foundation Hardening
-- Next.js + Supabase BOQ web app only.
--
-- Do not run this against any separate LINE Bot codebase.
-- This migration does not modify /api/line/webhook or LINE behavior.
--
-- Existing table-name mapping used by the app:
--   materials                => public.mat_master
--   categories               => public.mat_category
--   uom                      => public.mat_uom
--   suppliers                => public.supplier
--   material_aliases         => public.mat_alias
--   material_suppliers       => public.mat_supplier_map
--   price_history            => public.mat_price_base
--   material_uom_conversions => public.mat_uom_conv
--   bom_templates            => public.bom_template
--   bom_items                => public.bom_item
--   boq_projects             => public.boq_project
--   boq_items                => public.boq_item
--   audit_logs               => public.audit_logs / public.mat_audit_log
--
-- Design:
--   * Keep legacy business keys such as material_id, supplier_id, uom_code.
--   * Keep UUID id columns added by earlier phases.
--   * Do not duplicate confusing columns.
--   * Use NOT VALID checks so existing legacy rows are not rewritten or blocked.
--   * Create unique indexes only when current data is clean enough.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Helper: add a CHECK constraint only if it does not exist.
-- NOT VALID means existing rows are not scanned, but new/updated rows must comply.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_phase2a9_add_check_not_valid(
  target_table regclass,
  constraint_name text,
  check_sql text
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = target_table
      AND conname = constraint_name
  ) THEN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID',
      target_table,
      constraint_name,
      check_sql
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Ensure common audit / soft-delete columns exist on operational tables.
-- ------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mat_master',
    'mat_category',
    'mat_uom',
    'supplier',
    'mat_alias',
    'mat_supplier_map',
    'mat_price_base',
    'mat_uom_conv',
    'bom_template',
    'bom_item',
    'boq_project',
    'boq_item'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()', tbl);
      EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', tbl);
      EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(id)', 'uq_phase2a9_' || tbl || '_id', tbl);

      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', tbl);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Data integrity checks for new/updated rows.
-- ------------------------------------------------------------
SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_master'::regclass,
  'mat_master_status_phase2a9_check',
  'status IS NULL OR status IN (''ACTIVE'', ''INACTIVE'', ''DISCONTINUED'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.supplier'::regclass,
  'supplier_status_phase2a9_check',
  'status IS NULL OR status IN (''ACTIVE'', ''INACTIVE'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_price_base'::regclass,
  'mat_price_base_unit_price_positive_phase2a9_check',
  'unit_price > 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_price_base'::regclass,
  'mat_price_base_min_order_qty_nonnegative_phase2a9_check',
  'min_order_qty IS NULL OR min_order_qty >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_price_base'::regclass,
  'mat_price_base_lead_time_nonnegative_phase2a9_check',
  'lead_time_days IS NULL OR lead_time_days >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_price_base'::regclass,
  'mat_price_base_source_type_phase2a9_check',
  'source_type IS NULL OR source_type IN (''phone'', ''line_chat'', ''quotation'', ''receipt'', ''website'', ''manual'', ''other'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_uom_conv'::regclass,
  'mat_uom_conv_factor_positive_phase2a9_check',
  'factor > 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_uom_conv'::regclass,
  'mat_uom_conv_no_self_phase2a9_check',
  '(from_uom IS NULL OR to_uom IS NULL OR from_uom <> to_uom) AND (from_uom_id IS NULL OR to_uom_id IS NULL OR from_uom_id <> to_uom_id)'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_supplier_map'::regclass,
  'mat_supplier_map_min_order_qty_nonnegative_phase2a9_check',
  'min_order_qty IS NULL OR min_order_qty >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.mat_supplier_map'::regclass,
  'mat_supplier_map_lead_time_nonnegative_phase2a9_check',
  'lead_time_days IS NULL OR lead_time_days >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.bom_item'::regclass,
  'bom_item_qty_per_unit_positive_phase2a9_check',
  'qty_per_unit > 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.bom_item'::regclass,
  'bom_item_waste_pct_nonnegative_phase2a9_check',
  'waste_pct IS NULL OR waste_pct >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.bom_item'::regclass,
  'bom_item_type_phase2a9_check',
  'item_type IN (''MAT'', ''LABOR'', ''SERVICE'', ''MISC'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_project'::regclass,
  'boq_project_status_phase2a9_check',
  'status IN (''DRAFT'', ''CONFIRMED'', ''CANCELLED'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_item'::regclass,
  'boq_item_qty_positive_phase2a9_check',
  'qty > 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_item'::regclass,
  'boq_item_waste_pct_nonnegative_phase2a9_check',
  'waste_pct IS NULL OR waste_pct >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_item'::regclass,
  'boq_item_unit_price_nonnegative_phase2a9_check',
  'unit_price IS NULL OR unit_price >= 0'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_item'::regclass,
  'boq_item_type_phase2a9_check',
  'item_type IN (''MAT'', ''LABOR'', ''SERVICE'', ''MISC'', ''SECTION'')'
);

SELECT public.fn_phase2a9_add_check_not_valid(
  'public.boq_item'::regclass,
  'boq_item_price_source_phase2a9_check',
  'price_source IS NULL OR price_source IN (''MANUAL'', ''LATEST_PRICE'', ''AI'', ''IMPORT'', ''TEMPLATE'', ''BOM'', ''UNKNOWN'')'
);

-- ------------------------------------------------------------
-- Indexes for FK clarity, delete safety, search, and exports.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_master_material_code
  ON public.mat_master(material_code);

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_master_category
  ON public.mat_master(cat_id, category_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_master_base_uom
  ON public.mat_master(base_uom, base_uom_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_alias_material_normalized
  ON public.mat_alias(material_id, normalized_alias)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_supplier_map_material_supplier
  ON public.mat_supplier_map(material_id, supplier_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_price_base_material_quote
  ON public.mat_price_base(material_id, quote_date DESC NULLS LAST, effective_date DESC, created_at DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_price_base_supplier
  ON public.mat_price_base(supplier_id, quote_date DESC NULLS LAST)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_price_base_price_uom
  ON public.mat_price_base(price_uom, price_uom_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_uom_conv_material_uoms
  ON public.mat_uom_conv(material_id, from_uom, to_uom)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_bom_item_material
  ON public.bom_item(material_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_bom_item_bom_active
  ON public.bom_item(bom_id, seq)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_boq_item_material
  ON public.boq_item(material_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_boq_item_project_active
  ON public.boq_item(project_id, seq)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a9_mat_audit_log_entity_created
  ON public.mat_audit_log(entity_type, entity_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase2a9_audit_logs_entity_created
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- ------------------------------------------------------------
-- Safe unique constraints. These are skipped with NOTICE if old data has duplicates.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.mat_master
    WHERE coalesce(is_deleted, false) = false
      AND nullif(trim(material_code), '') IS NOT NULL
    GROUP BY upper(trim(material_code))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_phase2a9_mat_master_material_code_active
      ON public.mat_master(upper(trim(material_code)))
      WHERE coalesce(is_deleted, false) = false
        AND nullif(trim(material_code), '') IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped uq_phase2a9_mat_master_material_code_active: duplicate active material_code values exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mat_alias
    WHERE coalesce(is_deleted, false) = false
      AND nullif(trim(coalesce(normalized_alias, alias_name)), '') IS NOT NULL
    GROUP BY material_id, lower(trim(coalesce(normalized_alias, alias_name)))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_phase2a9_mat_alias_material_alias_active
      ON public.mat_alias(material_id, lower(trim(coalesce(normalized_alias, alias_name))))
      WHERE coalesce(is_deleted, false) = false
        AND nullif(trim(coalesce(normalized_alias, alias_name)), '') IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped uq_phase2a9_mat_alias_material_alias_active: duplicate active aliases exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mat_supplier_map
    WHERE coalesce(is_deleted, false) = false
    GROUP BY material_id, supplier_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_phase2a9_mat_supplier_map_pair_active
      ON public.mat_supplier_map(material_id, supplier_id)
      WHERE coalesce(is_deleted, false) = false;
  ELSE
    RAISE NOTICE 'Skipped uq_phase2a9_mat_supplier_map_pair_active: duplicate active supplier mappings exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mat_uom_conv
    WHERE coalesce(is_deleted, false) = false
    GROUP BY material_id, from_uom, to_uom
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_phase2a9_mat_uom_conv_triplet_active
      ON public.mat_uom_conv(material_id, from_uom, to_uom)
      WHERE coalesce(is_deleted, false) = false;
  ELSE
    RAISE NOTICE 'Skipped uq_phase2a9_mat_uom_conv_triplet_active: duplicate active UOM conversions exist.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Hard-delete safety triggers.
-- The web app mostly archives/soft-deletes. These triggers guard direct SQL hard deletes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_phase2a9_prevent_material_delete_when_used()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bom_item bi
    WHERE coalesce(bi.is_deleted, false) = false
      AND bi.material_id = OLD.material_id
  ) OR EXISTS (
    SELECT 1
    FROM public.boq_item qi
    WHERE coalesce(qi.is_deleted, false) = false
      AND qi.material_id = OLD.material_id
  ) THEN
    RAISE EXCEPTION 'Cannot delete this material because it is used in BOM or BOQ.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phase2a9_prevent_material_delete_when_used ON public.mat_master;
CREATE TRIGGER trg_phase2a9_prevent_material_delete_when_used
  BEFORE DELETE ON public.mat_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a9_prevent_material_delete_when_used();

CREATE OR REPLACE FUNCTION public.fn_phase2a9_prevent_supplier_delete_when_used()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mat_supplier_map msm
    WHERE coalesce(msm.is_deleted, false) = false
      AND (msm.supplier_id = OLD.supplier_id OR msm.supplier_uuid = OLD.id)
  ) OR EXISTS (
    SELECT 1
    FROM public.mat_price_base p
    WHERE coalesce(p.is_deleted, false) = false
      AND (p.supplier_id = OLD.supplier_id OR p.supplier_uuid = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Cannot delete supplier because it is used in price history or material supplier mappings.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phase2a9_prevent_supplier_delete_when_used ON public.supplier;
CREATE TRIGGER trg_phase2a9_prevent_supplier_delete_when_used
  BEFORE DELETE ON public.supplier
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a9_prevent_supplier_delete_when_used();

CREATE OR REPLACE FUNCTION public.fn_phase2a9_prevent_category_delete_when_used()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mat_master m
    WHERE coalesce(m.is_deleted, false) = false
      AND (m.cat_id = OLD.cat_id OR m.category_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Cannot delete category because it is used by materials.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phase2a9_prevent_category_delete_when_used ON public.mat_category;
CREATE TRIGGER trg_phase2a9_prevent_category_delete_when_used
  BEFORE DELETE ON public.mat_category
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a9_prevent_category_delete_when_used();

CREATE OR REPLACE FUNCTION public.fn_phase2a9_prevent_uom_delete_when_used()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mat_master m
    WHERE coalesce(m.is_deleted, false) = false
      AND (m.base_uom = OLD.uom_code OR m.base_uom_id = OLD.id)
  ) OR EXISTS (
    SELECT 1 FROM public.mat_price_base p
    WHERE coalesce(p.is_deleted, false) = false
      AND (p.price_uom = OLD.uom_code OR p.price_uom_id = OLD.id)
  ) OR EXISTS (
    SELECT 1 FROM public.bom_item bi
    WHERE coalesce(bi.is_deleted, false) = false
      AND bi.uom = OLD.uom_code
  ) OR EXISTS (
    SELECT 1 FROM public.boq_item qi
    WHERE coalesce(qi.is_deleted, false) = false
      AND qi.uom = OLD.uom_code
  ) OR EXISTS (
    SELECT 1 FROM public.mat_uom_conv c
    WHERE coalesce(c.is_deleted, false) = false
      AND (
        c.from_uom = OLD.uom_code OR c.to_uom = OLD.uom_code OR
        c.from_uom_id = OLD.id OR c.to_uom_id = OLD.id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot delete UOM because it is used by materials, price history, BOM, BOQ, or conversions.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phase2a9_prevent_uom_delete_when_used ON public.mat_uom;
CREATE TRIGGER trg_phase2a9_prevent_uom_delete_when_used
  BEFORE DELETE ON public.mat_uom
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a9_prevent_uom_delete_when_used();

CREATE OR REPLACE FUNCTION public.fn_phase2a9_prevent_bom_template_hard_delete_when_used()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bom_item bi
    WHERE bi.bom_id = OLD.bom_id
      AND coalesce(bi.is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Archive BOM template instead of hard deleting it while it has BOM items.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phase2a9_prevent_bom_template_hard_delete_when_used ON public.bom_template;
CREATE TRIGGER trg_phase2a9_prevent_bom_template_hard_delete_when_used
  BEFORE DELETE ON public.bom_template
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a9_prevent_bom_template_hard_delete_when_used();

-- ------------------------------------------------------------
-- QA issue view for admin review. The UI also computes this without requiring the view.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_phase2a9_core_qa_issues AS
WITH active_materials AS (
  SELECT *
  FROM public.mat_master
  WHERE coalesce(is_deleted, false) = false
),
active_aliases AS (
  SELECT *
  FROM public.mat_alias
  WHERE coalesce(is_deleted, false) = false
),
active_supplier_maps AS (
  SELECT *
  FROM public.mat_supplier_map
  WHERE coalesce(is_deleted, false) = false
),
active_prices AS (
  SELECT *
  FROM public.mat_price_base
  WHERE coalesce(is_deleted, false) = false
),
active_bom_items AS (
  SELECT *
  FROM public.bom_item
  WHERE coalesce(is_deleted, false) = false
),
active_boq_items AS (
  SELECT *
  FROM public.boq_item
  WHERE coalesce(is_deleted, false) = false
)
SELECT
  'duplicate_material_code'::text AS issue_type,
  'mat_master'::text AS entity_type,
  upper(trim(material_code)) AS entity_key,
  NULL::text AS material_id,
  ('Duplicate active material_code: ' || upper(trim(material_code)) || ' (' || count(*) || ' rows)')::text AS message,
  'error'::text AS severity
FROM active_materials
WHERE nullif(trim(material_code), '') IS NOT NULL
GROUP BY upper(trim(material_code))
HAVING count(*) > 1

UNION ALL
SELECT
  'duplicate_alias'::text,
  'mat_alias'::text,
  material_id || ':' || lower(trim(coalesce(normalized_alias, alias_name))),
  material_id,
  'Duplicate alias for material: ' || lower(trim(coalesce(normalized_alias, alias_name))),
  'warning'::text
FROM active_aliases
WHERE nullif(trim(coalesce(normalized_alias, alias_name)), '') IS NOT NULL
GROUP BY material_id, lower(trim(coalesce(normalized_alias, alias_name)))
HAVING count(*) > 1

UNION ALL
SELECT
  'duplicate_supplier_mapping'::text,
  'mat_supplier_map'::text,
  material_id || ':' || supplier_id,
  material_id,
  'Duplicate supplier mapping for material/supplier: ' || material_id || ' / ' || supplier_id,
  'warning'::text
FROM active_supplier_maps
GROUP BY material_id, supplier_id
HAVING count(*) > 1

UNION ALL
SELECT
  'material_without_category'::text,
  'mat_master'::text,
  material_id,
  material_id,
  'Material has no category.',
  'warning'::text
FROM active_materials
WHERE cat_id IS NULL AND category_id IS NULL

UNION ALL
SELECT
  'material_without_uom'::text,
  'mat_master'::text,
  material_id,
  material_id,
  'Material has no base UOM.',
  'warning'::text
FROM active_materials
WHERE base_uom IS NULL AND base_uom_id IS NULL

UNION ALL
SELECT
  'material_without_price'::text,
  'mat_master'::text,
  m.material_id,
  m.material_id,
  'Material has no active price history.',
  'warning'::text
FROM active_materials m
WHERE NOT EXISTS (
  SELECT 1
  FROM active_prices p
  WHERE p.material_id = m.material_id
     OR p.material_uuid = m.id
)

UNION ALL
SELECT
  'bom_item_missing_identity'::text,
  'bom_item'::text,
  item_id::text,
  material_id,
  'BOM item has no material_id and no item_name.',
  'error'::text
FROM active_bom_items
WHERE material_id IS NULL
  AND nullif(trim(coalesce(item_name, '')), '') IS NULL

UNION ALL
SELECT
  'bom_item_invalid_qty_per_unit'::text,
  'bom_item'::text,
  item_id::text,
  material_id,
  'BOM item qty_per_unit must be greater than 0.',
  'error'::text
FROM active_bom_items
WHERE qty_per_unit IS NULL OR qty_per_unit <= 0

UNION ALL
SELECT
  'boq_item_missing_snapshot_price'::text,
  'boq_item'::text,
  item_id::text,
  material_id,
  'BOQ material item has no price snapshot value.',
  'warning'::text
FROM active_boq_items
WHERE item_type = 'MAT'
  AND material_id IS NOT NULL
  AND coalesce(unit_price, estimated_unit_price, final_unit_price, 0) <= 0;

GRANT SELECT ON public.v_phase2a9_core_qa_issues TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_phase2a9_add_check_not_valid(regclass, text, text);

NOTIFY pgrst, 'reload schema';
