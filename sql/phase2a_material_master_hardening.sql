-- ============================================================
-- Phase 2A: Material Master Hardening
-- Run after: sql/phase1_single_user_production.sql or
--            supabase/migrations/20260504_production_core_hardening.sql
--
-- Migration assumptions:
--   1) The legacy app uses public.mat_master.material_id as a human-readable
--      material code and as the historical FK target.
--   2) Phase 1 added UUID id columns to core tables, but did not switch the
--      existing business-key relationships.
--   3) This migration is additive and compatibility-preserving: it backfills
--      mat_master.material_code from the legacy material_id, adds UUID
--      reference columns to dependent tables, and exposes hardened views.
--   4) Existing BOM/BOQ material_id values are preserved so old BOQ snapshots
--      and BOM import continue to work while new code can resolve materials by
--      UUID id or material_code.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Shared helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_material_normalize_text(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(coalesce(input_text, ''))), '\s+', ' ', 'g'),
          '\b(sq\.?\s*m\.?|sqm|m2)\b',
          'sqm',
          'g'
        ),
        '\b(pcs?|piece|pieces)\b',
        'pcs',
        'g'
      ),
      '\b(mm\.?|millimeter|millimetre)\b',
      'mm',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_add_uuid_id(table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id uuid', table_name);
  EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', table_name);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', table_name);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', table_name);
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(id)', 'uq_' || table_name || '_id', table_name);
END;
$$;

SELECT public.fn_phase2a_add_uuid_id('mat_master');
SELECT public.fn_phase2a_add_uuid_id('mat_category');
SELECT public.fn_phase2a_add_uuid_id('mat_uom');
SELECT public.fn_phase2a_add_uuid_id('mat_alias');
SELECT public.fn_phase2a_add_uuid_id('mat_uom_conv');
SELECT public.fn_phase2a_add_uuid_id('supplier');
SELECT public.fn_phase2a_add_uuid_id('mat_supplier_map');
SELECT public.fn_phase2a_add_uuid_id('mat_price_base');

-- Soft-delete flags expected by the web app.
ALTER TABLE public.mat_category
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.mat_uom
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ------------------------------------------------------------
-- Material master
-- ------------------------------------------------------------

ALTER TABLE public.mat_master
  ADD COLUMN IF NOT EXISTS material_code text,
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS base_uom_id uuid;

UPDATE public.mat_master
SET material_code = material_id
WHERE nullif(trim(material_code), '') IS NULL
  AND nullif(trim(material_id), '') IS NOT NULL;

WITH missing AS (
  SELECT ctid, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.mat_master
  WHERE nullif(trim(material_code), '') IS NULL
)
UPDATE public.mat_master m
SET material_code = 'MAT-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(missing.rn::text, 4, '0')
FROM missing
WHERE m.ctid = missing.ctid;

UPDATE public.mat_master m
SET
  normalized_name = public.fn_material_normalize_text(
    concat_ws(' ', m.material_code, m.mat_name_th, m.mat_name_en, m.brand, m.model, m.spec)
  ),
  category_id = coalesce(m.category_id, c.id),
  base_uom_id = coalesce(m.base_uom_id, u.id)
FROM public.mat_category c, public.mat_uom u
WHERE c.cat_id = m.cat_id
  AND u.uom_code = m.base_uom;

ALTER TABLE public.mat_master
  ALTER COLUMN material_code SET NOT NULL,
  ALTER COLUMN mat_name_th SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_master_material_code
  ON public.mat_master(material_code);

CREATE INDEX IF NOT EXISTS idx_mat_master_material_code
  ON public.mat_master(material_code);

CREATE INDEX IF NOT EXISTS idx_mat_master_normalized_name
  ON public.mat_master(normalized_name);

CREATE INDEX IF NOT EXISTS idx_mat_master_brand_model_spec
  ON public.mat_master(brand, model, spec);

CREATE INDEX IF NOT EXISTS idx_mat_master_category_id
  ON public.mat_master(category_id);

CREATE INDEX IF NOT EXISTS idx_mat_master_base_uom_id
  ON public.mat_master(base_uom_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_master_category_id_fkey'
  ) THEN
    ALTER TABLE public.mat_master
      ADD CONSTRAINT mat_master_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.mat_category(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_master_base_uom_id_fkey'
  ) THEN
    ALTER TABLE public.mat_master
      ADD CONSTRAINT mat_master_base_uom_id_fkey
      FOREIGN KEY (base_uom_id) REFERENCES public.mat_uom(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_sync_mat_master()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.material_code IS NULL OR trim(NEW.material_code) = '' THEN
    NEW.material_code := NEW.material_id;
  END IF;

  NEW.normalized_name := public.fn_material_normalize_text(
    concat_ws(' ', NEW.material_code, NEW.mat_name_th, NEW.mat_name_en, NEW.brand, NEW.model, NEW.spec)
  );

  IF NEW.category_id IS NULL AND NEW.cat_id IS NOT NULL THEN
    SELECT id INTO NEW.category_id
    FROM public.mat_category
    WHERE cat_id = NEW.cat_id
    LIMIT 1;
  END IF;

  IF NEW.base_uom_id IS NULL AND NEW.base_uom IS NOT NULL THEN
    SELECT id INTO NEW.base_uom_id
    FROM public.mat_uom
    WHERE uom_code = NEW.base_uom
    LIMIT 1;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase2a_sync_mat_master ON public.mat_master;
CREATE TRIGGER trg_phase2a_sync_mat_master
  BEFORE INSERT OR UPDATE ON public.mat_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a_sync_mat_master();

-- ------------------------------------------------------------
-- Aliases
-- ------------------------------------------------------------

ALTER TABLE public.mat_alias
  ADD COLUMN IF NOT EXISTS material_uuid uuid,
  ADD COLUMN IF NOT EXISTS normalized_alias text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.mat_alias a
SET
  material_uuid = coalesce(a.material_uuid, m.id),
  normalized_alias = public.fn_material_normalize_text(a.alias_name)
FROM public.mat_master m
WHERE m.material_id = a.material_id;

CREATE INDEX IF NOT EXISTS idx_mat_alias_material_uuid
  ON public.mat_alias(material_uuid);

CREATE INDEX IF NOT EXISTS idx_mat_alias_normalized_alias
  ON public.mat_alias(normalized_alias);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_alias_material_normalized_active
  ON public.mat_alias(material_id, normalized_alias)
  WHERE coalesce(is_deleted, false) = false
    AND normalized_alias IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_alias_material_uuid_normalized_active
  ON public.mat_alias(material_uuid, normalized_alias)
  WHERE coalesce(is_deleted, false) = false
    AND material_uuid IS NOT NULL
    AND normalized_alias IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_alias_material_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_alias
      ADD CONSTRAINT mat_alias_material_uuid_fkey
      FOREIGN KEY (material_uuid) REFERENCES public.mat_master(id) ON DELETE CASCADE NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_sync_mat_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_alias := public.fn_material_normalize_text(NEW.alias_name);

  IF NEW.material_uuid IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT id INTO NEW.material_uuid
    FROM public.mat_master
    WHERE material_id = NEW.material_id OR material_code = NEW.material_id
    LIMIT 1;
  END IF;

  IF NEW.updated_at IS NULL THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase2a_sync_mat_alias ON public.mat_alias;
CREATE TRIGGER trg_phase2a_sync_mat_alias
  BEFORE INSERT OR UPDATE ON public.mat_alias
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a_sync_mat_alias();

-- ------------------------------------------------------------
-- Supplier mapping
-- ------------------------------------------------------------

ALTER TABLE public.mat_supplier_map
  ADD COLUMN IF NOT EXISTS material_uuid uuid,
  ADD COLUMN IF NOT EXISTS supplier_uuid uuid;

UPDATE public.mat_supplier_map msm
SET
  material_uuid = coalesce(msm.material_uuid, m.id),
  supplier_uuid = coalesce(msm.supplier_uuid, s.id)
FROM public.mat_master m, public.supplier s
WHERE m.material_id = msm.material_id
  AND s.supplier_id = msm.supplier_id;

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_material_uuid
  ON public.mat_supplier_map(material_uuid);

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_supplier_uuid
  ON public.mat_supplier_map(supplier_uuid);

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_material_supplier
  ON public.mat_supplier_map(material_id, supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_supplier_map_uuid_active
  ON public.mat_supplier_map(material_uuid, supplier_uuid)
  WHERE coalesce(is_deleted, false) = false
    AND material_uuid IS NOT NULL
    AND supplier_uuid IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_supplier_map_material_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_supplier_map
      ADD CONSTRAINT mat_supplier_map_material_uuid_fkey
      FOREIGN KEY (material_uuid) REFERENCES public.mat_master(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_supplier_map_supplier_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_supplier_map
      ADD CONSTRAINT mat_supplier_map_supplier_uuid_fkey
      FOREIGN KEY (supplier_uuid) REFERENCES public.supplier(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_sync_mat_supplier_map()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.material_uuid IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT id INTO NEW.material_uuid
    FROM public.mat_master
    WHERE material_id = NEW.material_id OR material_code = NEW.material_id
    LIMIT 1;
  END IF;

  IF NEW.supplier_uuid IS NULL AND NEW.supplier_id IS NOT NULL THEN
    SELECT id INTO NEW.supplier_uuid
    FROM public.supplier
    WHERE supplier_id = NEW.supplier_id
    LIMIT 1;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase2a_sync_mat_supplier_map ON public.mat_supplier_map;
CREATE TRIGGER trg_phase2a_sync_mat_supplier_map
  BEFORE INSERT OR UPDATE ON public.mat_supplier_map
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a_sync_mat_supplier_map();

-- ------------------------------------------------------------
-- Price history hardening
-- ------------------------------------------------------------

ALTER TABLE public.mat_price_base
  ADD COLUMN IF NOT EXISTS material_uuid uuid,
  ADD COLUMN IF NOT EXISTS supplier_uuid uuid,
  ADD COLUMN IF NOT EXISTS price_uom_id uuid,
  ADD COLUMN IF NOT EXISTS quote_date date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS vat_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_included boolean NOT NULL DEFAULT false;

UPDATE public.mat_price_base p
SET
  material_uuid = coalesce(p.material_uuid, m.id),
  supplier_uuid = coalesce(p.supplier_uuid, s.id),
  price_uom_id = coalesce(p.price_uom_id, u.id),
  quote_date = coalesce(p.quote_date, p.effective_date),
  vat_included = coalesce(p.vat_included, p.is_tax_included, false)
FROM public.mat_master m, public.supplier s, public.mat_uom u
WHERE m.material_id = p.material_id
  AND s.supplier_id = p.supplier_id
  AND u.uom_code = p.price_uom;

ALTER TABLE public.mat_price_base
  DROP CONSTRAINT IF EXISTS mat_price_base_source_type_check;

ALTER TABLE public.mat_price_base
  ADD CONSTRAINT mat_price_base_source_type_check
  CHECK (
    source_type IS NULL OR source_type IN (
      'phone',
      'line_chat',
      'quotation',
      'receipt',
      'website',
      'manual',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_mat_price_base_material_quote_date
  ON public.mat_price_base(material_id, quote_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_material_uuid_quote_date
  ON public.mat_price_base(material_uuid, quote_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_price_uom_id
  ON public.mat_price_base(price_uom_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_price_base_material_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_price_base
      ADD CONSTRAINT mat_price_base_material_uuid_fkey
      FOREIGN KEY (material_uuid) REFERENCES public.mat_master(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_price_base_supplier_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_price_base
      ADD CONSTRAINT mat_price_base_supplier_uuid_fkey
      FOREIGN KEY (supplier_uuid) REFERENCES public.supplier(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_price_base_price_uom_id_fkey'
  ) THEN
    ALTER TABLE public.mat_price_base
      ADD CONSTRAINT mat_price_base_price_uom_id_fkey
      FOREIGN KEY (price_uom_id) REFERENCES public.mat_uom(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_sync_mat_price_base()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.material_uuid IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT id INTO NEW.material_uuid
    FROM public.mat_master
    WHERE material_id = NEW.material_id OR material_code = NEW.material_id
    LIMIT 1;
  END IF;

  IF NEW.supplier_uuid IS NULL AND NEW.supplier_id IS NOT NULL THEN
    SELECT id INTO NEW.supplier_uuid
    FROM public.supplier
    WHERE supplier_id = NEW.supplier_id
    LIMIT 1;
  END IF;

  IF NEW.price_uom_id IS NULL AND NEW.price_uom IS NOT NULL THEN
    SELECT id INTO NEW.price_uom_id
    FROM public.mat_uom
    WHERE uom_code = NEW.price_uom
    LIMIT 1;
  END IF;

  NEW.quote_date := coalesce(NEW.quote_date, NEW.effective_date);
  NEW.vat_included := coalesce(NEW.vat_included, NEW.is_tax_included, false);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase2a_sync_mat_price_base ON public.mat_price_base;
CREATE TRIGGER trg_phase2a_sync_mat_price_base
  BEFORE INSERT OR UPDATE ON public.mat_price_base
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a_sync_mat_price_base();

-- ------------------------------------------------------------
-- UOM conversions
-- ------------------------------------------------------------

ALTER TABLE public.mat_uom_conv
  ADD COLUMN IF NOT EXISTS material_uuid uuid,
  ADD COLUMN IF NOT EXISTS from_uom_id uuid,
  ADD COLUMN IF NOT EXISTS to_uom_id uuid,
  ADD COLUMN IF NOT EXISTS formula_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.mat_uom_conv c
SET
  material_uuid = coalesce(c.material_uuid, m.id),
  from_uom_id = coalesce(c.from_uom_id, fu.id),
  to_uom_id = coalesce(c.to_uom_id, tu.id)
FROM public.mat_master m, public.mat_uom fu, public.mat_uom tu
WHERE m.material_id = c.material_id
  AND fu.uom_code = c.from_uom
  AND tu.uom_code = c.to_uom;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mat_uom_conv_uuid_active
  ON public.mat_uom_conv(material_uuid, from_uom_id, to_uom_id)
  WHERE coalesce(is_deleted, false) = false
    AND material_uuid IS NOT NULL
    AND from_uom_id IS NOT NULL
    AND to_uom_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mat_uom_conv_material_uuid
  ON public.mat_uom_conv(material_uuid);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_uom_conv_material_uuid_fkey'
  ) THEN
    ALTER TABLE public.mat_uom_conv
      ADD CONSTRAINT mat_uom_conv_material_uuid_fkey
      FOREIGN KEY (material_uuid) REFERENCES public.mat_master(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_uom_conv_from_uom_id_fkey'
  ) THEN
    ALTER TABLE public.mat_uom_conv
      ADD CONSTRAINT mat_uom_conv_from_uom_id_fkey
      FOREIGN KEY (from_uom_id) REFERENCES public.mat_uom(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mat_uom_conv_to_uom_id_fkey'
  ) THEN
    ALTER TABLE public.mat_uom_conv
      ADD CONSTRAINT mat_uom_conv_to_uom_id_fkey
      FOREIGN KEY (to_uom_id) REFERENCES public.mat_uom(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_phase2a_sync_mat_uom_conv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.material_uuid IS NULL AND NEW.material_id IS NOT NULL THEN
    SELECT id INTO NEW.material_uuid
    FROM public.mat_master
    WHERE material_id = NEW.material_id OR material_code = NEW.material_id
    LIMIT 1;
  END IF;

  IF NEW.from_uom_id IS NULL AND NEW.from_uom IS NOT NULL THEN
    SELECT id INTO NEW.from_uom_id
    FROM public.mat_uom
    WHERE uom_code = NEW.from_uom
    LIMIT 1;
  END IF;

  IF NEW.to_uom_id IS NULL AND NEW.to_uom IS NOT NULL THEN
    SELECT id INTO NEW.to_uom_id
    FROM public.mat_uom
    WHERE uom_code = NEW.to_uom
    LIMIT 1;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase2a_sync_mat_uom_conv ON public.mat_uom_conv;
CREATE TRIGGER trg_phase2a_sync_mat_uom_conv
  BEFORE INSERT OR UPDATE ON public.mat_uom_conv
  FOR EACH ROW EXECUTE FUNCTION public.fn_phase2a_sync_mat_uom_conv();

-- ------------------------------------------------------------
-- Delete safety
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_prevent_material_delete_when_used()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bom_item bi
    WHERE bi.material_id = OLD.material_id
      AND coalesce(bi.is_deleted, false) = false
  ) OR EXISTS (
    SELECT 1
    FROM public.boq_item qi
    WHERE qi.material_id = OLD.material_id
      AND coalesce(qi.is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Cannot delete this material because it is used in BOM or BOQ.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_material_delete_when_used ON public.mat_master;
CREATE TRIGGER trg_prevent_material_delete_when_used
  BEFORE DELETE ON public.mat_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_material_delete_when_used();

CREATE OR REPLACE FUNCTION public.fn_prevent_supplier_delete_when_used()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mat_supplier_map msm
    WHERE msm.supplier_id = OLD.supplier_id
      AND coalesce(msm.is_deleted, false) = false
  ) OR EXISTS (
    SELECT 1
    FROM public.mat_price_base p
    WHERE p.supplier_id = OLD.supplier_id
      AND coalesce(p.is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Cannot delete supplier because it is used in material supplier mappings or price history.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_supplier_delete_when_used ON public.supplier;
CREATE TRIGGER trg_prevent_supplier_delete_when_used
  BEFORE DELETE ON public.supplier
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_supplier_delete_when_used();

-- ------------------------------------------------------------
-- Hardened views for new code and exports
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW public.materials AS
SELECT
  id,
  material_code,
  mat_name_th,
  mat_name_en,
  normalized_name,
  brand,
  model,
  spec,
  category_id,
  base_uom_id,
  status,
  note,
  created_at,
  updated_at
FROM public.mat_master
WHERE coalesce(is_deleted, false) = false;

CREATE OR REPLACE VIEW public.material_aliases AS
SELECT
  id,
  material_uuid AS material_id,
  alias_name,
  normalized_alias,
  note,
  created_at
FROM public.mat_alias
WHERE coalesce(is_deleted, false) = false;

CREATE OR REPLACE VIEW public.material_suppliers AS
SELECT
  id,
  material_uuid AS material_id,
  supplier_uuid AS supplier_id,
  supplier_sku,
  is_preferred,
  note,
  created_at
FROM public.mat_supplier_map
WHERE coalesce(is_deleted, false) = false;

CREATE OR REPLACE VIEW public.price_history AS
SELECT
  id,
  material_uuid AS material_id,
  supplier_uuid AS supplier_id,
  unit_price AS price,
  price_uom_id,
  quote_date,
  valid_until,
  source_type,
  source_note,
  attachment_url,
  vat_included,
  delivery_included,
  min_order_qty,
  lead_time_days,
  created_at
FROM public.mat_price_base
WHERE coalesce(is_deleted, false) = false;

CREATE OR REPLACE VIEW public.material_uom_conversions AS
SELECT
  id,
  material_uuid AS material_id,
  from_uom_id,
  to_uom_id,
  factor,
  formula_note,
  created_at
FROM public.mat_uom_conv
WHERE coalesce(is_deleted, false) = false;

CREATE OR REPLACE VIEW public.material_latest_prices AS
SELECT DISTINCT ON (p.material_id)
  m.id AS material_uuid,
  p.material_id,
  m.material_code,
  p.supplier_id,
  s.supplier_name_th AS supplier_name,
  p.effective_date,
  coalesce(p.quote_date, p.effective_date) AS quote_date,
  p.price_uom,
  u.uom_name_th AS price_uom_name_th,
  p.unit_price,
  p.currency_code,
  p.min_order_qty,
  p.lead_time_days,
  coalesce(p.vat_included, p.is_tax_included, false) AS vat_included,
  p.delivery_included,
  p.source_type,
  p.source_note,
  p.created_at,
  (coalesce(p.quote_date, p.effective_date, p.created_at::date) < current_date - interval '30 days') AS is_stale,
  CASE
    WHEN coalesce(p.quote_date, p.effective_date, p.created_at::date) < current_date - interval '30 days'
      THEN 'STALE'
    ELSE 'OK'
  END AS price_status
FROM public.mat_price_base p
JOIN public.mat_master m ON m.material_id = p.material_id
JOIN public.supplier s ON s.supplier_id = p.supplier_id
LEFT JOIN public.mat_uom u ON u.uom_code = p.price_uom
WHERE coalesce(p.is_deleted, false) = false
  AND coalesce(m.is_deleted, false) = false
  AND coalesce(s.is_deleted, false) = false
ORDER BY
  p.material_id,
  coalesce(p.quote_date, p.effective_date, p.created_at::date) DESC,
  p.created_at DESC;

CREATE OR REPLACE VIEW public.v_mat_latest_price AS
SELECT
  material_id,
  supplier_id,
  supplier_name,
  unit_price,
  currency_code,
  price_uom,
  effective_date,
  quote_date,
  is_stale,
  price_status
FROM public.material_latest_prices;

CREATE OR REPLACE VIEW public.material_quality_scores AS
SELECT
  m.material_id,
  m.id AS material_uuid,
  m.material_code,
  (
    CASE WHEN nullif(m.material_code, '') IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN nullif(m.mat_name_th, '') IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN m.category_id IS NOT NULL OR m.cat_id IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN m.base_uom_id IS NOT NULL OR m.base_uom IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mat_supplier_map msm
      WHERE msm.material_id = m.material_id AND coalesce(msm.is_deleted, false) = false
    ) THEN 15 ELSE 0 END +
    CASE WHEN mlp.material_id IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN EXISTS (
      SELECT 1 FROM public.mat_alias a
      WHERE a.material_id = m.material_id AND coalesce(a.is_deleted, false) = false
    ) THEN 10 ELSE 0 END +
    CASE WHEN nullif(concat_ws('', m.spec, m.brand, m.model), '') IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN mlp.material_id IS NOT NULL AND mlp.is_stale = false THEN 15 ELSE 0 END
  ) AS quality_score,
  CASE
    WHEN m.base_uom IS NULL AND m.base_uom_id IS NULL THEN 'Missing UOM'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.mat_supplier_map msm
      WHERE msm.material_id = m.material_id AND coalesce(msm.is_deleted, false) = false
    ) THEN 'Missing supplier'
    WHEN mlp.material_id IS NULL THEN 'Missing price'
    WHEN mlp.is_stale THEN 'Price stale'
    WHEN (
      CASE WHEN nullif(m.material_code, '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN nullif(m.mat_name_th, '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN m.category_id IS NOT NULL OR m.cat_id IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN m.base_uom_id IS NOT NULL OR m.base_uom IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN EXISTS (
        SELECT 1 FROM public.mat_supplier_map msm
        WHERE msm.material_id = m.material_id AND coalesce(msm.is_deleted, false) = false
      ) THEN 15 ELSE 0 END +
      CASE WHEN mlp.material_id IS NOT NULL THEN 20 ELSE 0 END +
      CASE WHEN EXISTS (
        SELECT 1 FROM public.mat_alias a
        WHERE a.material_id = m.material_id AND coalesce(a.is_deleted, false) = false
      ) THEN 10 ELSE 0 END +
      CASE WHEN nullif(concat_ws('', m.spec, m.brand, m.model), '') IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN mlp.material_id IS NOT NULL AND mlp.is_stale = false THEN 15 ELSE 0 END
    ) >= 85 THEN 'Ready'
    ELSE 'Incomplete'
  END AS quality_label
FROM public.mat_master m
LEFT JOIN public.material_latest_prices mlp ON mlp.material_id = m.material_id
WHERE coalesce(m.is_deleted, false) = false;

GRANT SELECT ON public.materials TO authenticated, service_role;
GRANT SELECT ON public.material_aliases TO authenticated, service_role;
GRANT SELECT ON public.material_suppliers TO authenticated, service_role;
GRANT SELECT ON public.price_history TO authenticated, service_role;
GRANT SELECT ON public.material_uom_conversions TO authenticated, service_role;
GRANT SELECT ON public.material_latest_prices TO authenticated, service_role;
GRANT SELECT ON public.material_quality_scores TO authenticated, service_role;
GRANT SELECT ON public.v_mat_latest_price TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
