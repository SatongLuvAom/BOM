-- Phase 1.5: Supplier, material-supplier mapping, and base prices

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

DROP TRIGGER IF EXISTS trg_supplier_updated_at ON supplier;
CREATE TRIGGER trg_supplier_updated_at
  BEFORE UPDATE ON supplier
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_mat_supplier_map_updated_at ON mat_supplier_map;
CREATE TRIGGER trg_mat_supplier_map_updated_at
  BEFORE UPDATE ON mat_supplier_map
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_mat_price_base_updated_at ON mat_price_base;
CREATE TRIGGER trg_mat_price_base_updated_at
  BEFORE UPDATE ON mat_price_base
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
