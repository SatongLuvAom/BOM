-- ============================================================
-- MAT (Material Master) Schema - Phase 1
-- Tables: mat_uom, mat_category, mat_master, mat_alias, mat_uom_conv
-- ============================================================

-- MAT_UOM
CREATE TABLE IF NOT EXISTS mat_uom (
  uom_code    TEXT PRIMARY KEY,
  uom_name_th TEXT NOT NULL,
  uom_name_en TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- MAT_CATEGORY
CREATE TABLE IF NOT EXISTS mat_category (
  cat_id        TEXT PRIMARY KEY,
  cat_code      TEXT UNIQUE NOT NULL,
  cat_name_th   TEXT NOT NULL,
  cat_name_en   TEXT,
  parent_cat_id TEXT REFERENCES mat_category(cat_id) ON DELETE SET NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- MAT_MASTER
CREATE TABLE IF NOT EXISTS mat_master (
  material_id TEXT PRIMARY KEY,
  cat_id      TEXT NOT NULL REFERENCES mat_category(cat_id),
  mat_name_th TEXT NOT NULL,
  mat_name_en TEXT,
  spec        TEXT,
  brand       TEXT,
  base_uom    TEXT NOT NULL REFERENCES mat_uom(uom_code),
  status      TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- MAT_ALIAS
CREATE TABLE IF NOT EXISTS mat_alias (
  alias_id    TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES mat_master(material_id) ON DELETE CASCADE,
  alias_name  TEXT NOT NULL,
  alias_type  TEXT NOT NULL CHECK (alias_type IN ('COMMON', 'BRAND', 'ABBREV', 'LINE')),
  lang        TEXT DEFAULT 'TH' CHECK (lang IN ('TH', 'EN')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- MAT_UOM_CONV
CREATE TABLE IF NOT EXISTS mat_uom_conv (
  material_id TEXT NOT NULL REFERENCES mat_master(material_id) ON DELETE CASCADE,
  from_uom    TEXT NOT NULL REFERENCES mat_uom(uom_code),
  to_uom      TEXT NOT NULL REFERENCES mat_uom(uom_code),
  factor      NUMERIC(18,6) NOT NULL CHECK (factor > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, from_uom, to_uom),
  CONSTRAINT uom_conv_no_self CHECK (from_uom <> to_uom)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mat_master_cat_id   ON mat_master(cat_id);
CREATE INDEX IF NOT EXISTS idx_mat_master_status   ON mat_master(status);
CREATE INDEX IF NOT EXISTS idx_mat_master_name_th  ON mat_master USING gin(to_tsvector('simple', mat_name_th));
CREATE INDEX IF NOT EXISTS idx_mat_alias_mat_id    ON mat_alias(material_id);
CREATE INDEX IF NOT EXISTS idx_mat_alias_name      ON mat_alias(alias_name);
CREATE INDEX IF NOT EXISTS idx_mat_uom_conv_mat_id ON mat_uom_conv(material_id);

-- ── Triggers: updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mat_master_updated_at
  BEFORE UPDATE ON mat_master
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_category_updated_at
  BEFORE UPDATE ON mat_category
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- SUPPLIER
CREATE TABLE IF NOT EXISTS supplier (
  supplier_id       TEXT PRIMARY KEY,
  supplier_code     TEXT NOT NULL,
  supplier_name_th  TEXT NOT NULL,
  supplier_name_en  TEXT,
  tax_id            TEXT,
  contact_name      TEXT,
  phone             TEXT,
  email             TEXT,
  line_id           TEXT,
  address           TEXT,
  payment_terms     TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  note              TEXT,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- MAT_SUPPLIER_MAP
CREATE TABLE IF NOT EXISTS mat_supplier_map (
  material_id             TEXT NOT NULL REFERENCES mat_master(material_id),
  supplier_id             TEXT NOT NULL REFERENCES supplier(supplier_id),
  supplier_material_name  TEXT,
  supplier_sku            TEXT,
  is_preferred            BOOLEAN NOT NULL DEFAULT FALSE,
  lead_time_days          INT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  min_order_qty           NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_order_qty >= 0),
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  note                    TEXT,
  is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, supplier_id)
);

-- MAT_PRICE_BASE
CREATE TABLE IF NOT EXISTS mat_price_base (
  material_id       TEXT NOT NULL REFERENCES mat_master(material_id),
  supplier_id       TEXT NOT NULL REFERENCES supplier(supplier_id),
  effective_date    DATE NOT NULL,
  price_uom         TEXT NOT NULL REFERENCES mat_uom(uom_code),
  unit_price        NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
  currency_code     TEXT NOT NULL DEFAULT 'THB',
  min_order_qty     NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_order_qty >= 0),
  lead_time_days    INT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  is_tax_included   BOOLEAN NOT NULL DEFAULT FALSE,
  source_note       TEXT,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, supplier_id, effective_date),
  CONSTRAINT fk_mat_price_base_map
    FOREIGN KEY (material_id, supplier_id)
    REFERENCES mat_supplier_map(material_id, supplier_id)
);

-- MAT_AUDIT_LOG
CREATE TABLE IF NOT EXISTS mat_audit_log (
  audit_id     BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_key   TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_code_active
  ON supplier (supplier_code)
  WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_tax_id_active
  ON supplier (tax_id)
  WHERE is_deleted = FALSE AND tax_id IS NOT NULL AND tax_id <> '';

CREATE INDEX IF NOT EXISTS idx_supplier_status
  ON supplier(status);

CREATE INDEX IF NOT EXISTS idx_supplier_search_name
  ON supplier USING gin(to_tsvector('simple', coalesce(supplier_name_th, '') || ' ' || coalesce(supplier_name_en, '')));

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_supplier
  ON mat_supplier_map(supplier_id);

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_active
  ON mat_supplier_map(material_id, supplier_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_price_base_material
  ON mat_price_base(material_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_supplier
  ON mat_price_base(supplier_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_active
  ON mat_price_base(material_id, supplier_id, effective_date DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_audit_log_entity
  ON mat_audit_log(entity_type, entity_key, created_at DESC);

CREATE TRIGGER trg_supplier_updated_at
  BEFORE UPDATE ON supplier
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_supplier_map_updated_at
  BEFORE UPDATE ON mat_supplier_map
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_price_base_updated_at
  BEFORE UPDATE ON mat_price_base
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- RLS policies are centralized in supabase/rls_policies.sql.
-- Run that file after this split schema when using Supabase Auth.
