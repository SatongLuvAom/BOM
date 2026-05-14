-- ============================================================
-- BOQ SYSTEM — Full Setup (Phase 1 + Phase 1.5)
-- Copy & paste entire file into Supabase SQL Editor → Run
-- ============================================================

-- ── Trigger function (shared) ─────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS mat_uom (
  uom_code    TEXT PRIMARY KEY,
  uom_name_th TEXT NOT NULL,
  uom_name_en TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS mat_alias (
  alias_id    TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES mat_master(material_id) ON DELETE CASCADE,
  alias_name  TEXT NOT NULL,
  alias_type  TEXT NOT NULL CHECK (alias_type IN ('COMMON', 'BRAND', 'ABBREV', 'LINE')),
  lang        TEXT DEFAULT 'TH' CHECK (lang IN ('TH', 'EN')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mat_uom_conv (
  material_id TEXT NOT NULL REFERENCES mat_master(material_id) ON DELETE CASCADE,
  from_uom    TEXT NOT NULL REFERENCES mat_uom(uom_code),
  to_uom      TEXT NOT NULL REFERENCES mat_uom(uom_code),
  factor      NUMERIC(18,6) NOT NULL CHECK (factor > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, from_uom, to_uom),
  CONSTRAINT uom_conv_no_self CHECK (from_uom <> to_uom)
);

CREATE TABLE IF NOT EXISTS supplier (
  supplier_id      TEXT PRIMARY KEY,
  supplier_code    TEXT NOT NULL,
  supplier_name_th TEXT NOT NULL,
  supplier_name_en TEXT,
  tax_id           TEXT,
  contact_name     TEXT,
  phone            TEXT,
  email            TEXT,
  line_id          TEXT,
  address          TEXT,
  payment_terms    TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  note             TEXT,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mat_supplier_map (
  material_id            TEXT NOT NULL REFERENCES mat_master(material_id),
  supplier_id            TEXT NOT NULL REFERENCES supplier(supplier_id),
  supplier_material_name TEXT,
  supplier_sku           TEXT,
  is_preferred           BOOLEAN NOT NULL DEFAULT FALSE,
  lead_time_days         INT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  min_order_qty          NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_order_qty >= 0),
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  note                   TEXT,
  is_deleted             BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS mat_price_base (
  material_id     TEXT NOT NULL REFERENCES mat_master(material_id),
  supplier_id     TEXT NOT NULL REFERENCES supplier(supplier_id),
  effective_date  DATE NOT NULL,
  price_uom       TEXT NOT NULL REFERENCES mat_uom(uom_code),
  unit_price      NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
  currency_code   TEXT NOT NULL DEFAULT 'THB',
  min_order_qty   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_order_qty >= 0),
  lead_time_days  INT NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  is_tax_included BOOLEAN NOT NULL DEFAULT FALSE,
  source_note     TEXT,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (material_id, supplier_id, effective_date),
  CONSTRAINT fk_mat_price_base_map
    FOREIGN KEY (material_id, supplier_id)
    REFERENCES mat_supplier_map(material_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS mat_audit_log (
  audit_id    BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_key  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_mat_master_cat_id      ON mat_master(cat_id);
CREATE INDEX IF NOT EXISTS idx_mat_master_status      ON mat_master(status);
CREATE INDEX IF NOT EXISTS idx_mat_master_name_th     ON mat_master USING gin(to_tsvector('simple', mat_name_th));
CREATE INDEX IF NOT EXISTS idx_mat_alias_mat_id       ON mat_alias(material_id);
CREATE INDEX IF NOT EXISTS idx_mat_alias_name         ON mat_alias(alias_name);
CREATE INDEX IF NOT EXISTS idx_mat_uom_conv_mat_id    ON mat_uom_conv(material_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_code_active
  ON supplier (supplier_code) WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_tax_id_active
  ON supplier (tax_id) WHERE is_deleted = FALSE AND tax_id IS NOT NULL AND tax_id <> '';

CREATE INDEX IF NOT EXISTS idx_supplier_status
  ON supplier(status);

CREATE INDEX IF NOT EXISTS idx_supplier_search_name
  ON supplier USING gin(to_tsvector('simple', coalesce(supplier_name_th,'') || ' ' || coalesce(supplier_name_en,'')));

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_supplier
  ON mat_supplier_map(supplier_id);

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_active
  ON mat_supplier_map(material_id, supplier_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_price_base_material
  ON mat_price_base(material_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_supplier
  ON mat_price_base(supplier_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_mat_price_base_active
  ON mat_price_base(material_id, supplier_id, effective_date DESC) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_audit_log_entity
  ON mat_audit_log(entity_type, entity_key, created_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_mat_master_updated_at      ON mat_master;
DROP TRIGGER IF EXISTS trg_mat_category_updated_at    ON mat_category;
DROP TRIGGER IF EXISTS trg_supplier_updated_at        ON supplier;
DROP TRIGGER IF EXISTS trg_mat_supplier_map_updated_at ON mat_supplier_map;
DROP TRIGGER IF EXISTS trg_mat_price_base_updated_at  ON mat_price_base;

CREATE TRIGGER trg_mat_master_updated_at
  BEFORE UPDATE ON mat_master
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_category_updated_at
  BEFORE UPDATE ON mat_category
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_supplier_updated_at
  BEFORE UPDATE ON supplier
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_supplier_map_updated_at
  BEFORE UPDATE ON mat_supplier_map
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_mat_price_base_updated_at
  BEFORE UPDATE ON mat_price_base
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO mat_uom (uom_code, uom_name_th, uom_name_en) VALUES
  ('PCS',   'ชิ้น',          'Piece'),
  ('M',     'เมตร',          'Meter'),
  ('M2',    'ตารางเมตร',     'Square Meter'),
  ('M3',    'ลูกบาศก์เมตร', 'Cubic Meter'),
  ('KG',    'กิโลกรัม',     'Kilogram'),
  ('TON',   'ตัน',           'Ton'),
  ('BAG',   'ถุง',           'Bag'),
  ('ROLL',  'ม้วน',          'Roll'),
  ('SET',   'ชุด',           'Set'),
  ('BOX',   'กล่อง',         'Box'),
  ('SHEET', 'แผ่น',          'Sheet'),
  ('L',     'ลิตร',          'Liter'),
  ('CAN',   'กระป๋อง',       'Can')
ON CONFLICT (uom_code) DO NOTHING;

INSERT INTO mat_category (cat_id, cat_code, cat_name_th, cat_name_en, is_active, sort_order) VALUES
  ('C01', 'STL', 'เหล็กและโลหะ',         'Steel & Metal',       TRUE, 1),
  ('C02', 'WD',  'ไม้และวัสดุไม้',        'Wood & Timber',       TRUE, 2),
  ('C03', 'PNT', 'สีและสารเคลือบ',        'Paint & Coating',     TRUE, 3),
  ('C04', 'ELC', 'ไฟฟ้าและแสงสว่าง',     'Electrical & Light',  TRUE, 4),
  ('C05', 'FAB', 'ผ้าและวัสดุคลุม',       'Fabric & Covering',   TRUE, 5),
  ('C06', 'HW',  'อุปกรณ์ยึดและติดตั้ง', 'Hardware & Fixtures', TRUE, 6),
  ('C07', 'PLB', 'ประปาและระบายน้ำ',      'Plumbing',            TRUE, 7),
  ('C08', 'GLS', 'กระจกและอะคริลิค',      'Glass & Acrylic',     TRUE, 8)
ON CONFLICT (cat_id) DO NOTHING;

INSERT INTO mat_master (material_id, cat_id, mat_name_th, mat_name_en, spec, brand, base_uom, status) VALUES
  ('STL-260101-0001', 'C01', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '40×40×2mm',    NULL,      'M',     'ACTIVE'),
  ('STL-260101-0002', 'C01', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '50×50×2mm',    NULL,      'M',     'ACTIVE'),
  ('STL-260101-0003', 'C01', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '25×25×1.5mm',  NULL,      'M',     'ACTIVE'),
  ('STL-260101-0004', 'C01', 'เหล็กแบน',              'Flat Bar',          '50×5mm',        NULL,      'M',     'ACTIVE'),
  ('STL-260101-0005', 'C01', 'เหล็กฉาก',              'Angle Iron',        '50×50×5mm',     NULL,      'M',     'ACTIVE'),
  ('WD-260101-0001',  'C02', 'ไม้อัดสักทอง',          'Plywood',           '12mm 4×8 ฟุต', NULL,      'SHEET', 'ACTIVE'),
  ('WD-260101-0002',  'C02', 'MDF',                   'MDF Board',         '18mm 4×8 ฟุต', NULL,      'SHEET', 'ACTIVE'),
  ('WD-260101-0003',  'C02', 'ไม้อัด',                'Plywood',           '6mm 4×8 ฟุต',  NULL,      'SHEET', 'ACTIVE'),
  ('PNT-260101-0001', 'C03', 'สีรองพื้นโลหะ',         'Metal Primer',      '3.5L',          'TOA',     'CAN',   'ACTIVE'),
  ('PNT-260101-0002', 'C03', 'สีทับหน้า',             'Topcoat',           '3.5L',          'TOA',     'CAN',   'ACTIVE'),
  ('ELC-260101-0001', 'C04', 'หลอด LED T8',           'LED Tube T8',       '18W 60cm',      'Philips', 'PCS',   'ACTIVE'),
  ('ELC-260101-0002', 'C04', 'รางไฟ LED',             'LED Track',         '1m',            NULL,      'M',     'ACTIVE'),
  ('ELC-260101-0003', 'C04', 'สปอตไลท์ LED',          'LED Spotlight',     '7W',            NULL,      'PCS',   'ACTIVE'),
  ('HW-260101-0001',  'C06', 'น็อตและสกรู M6',        'Bolt & Screw M6',   'M6×30mm',       NULL,      'BOX',   'ACTIVE'),
  ('GLS-260101-0001', 'C08', 'กระจกใส',               'Clear Glass',       '5mm',           NULL,      'M2',    'ACTIVE')
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO mat_alias (alias_id, material_id, alias_name, alias_type, lang) VALUES
  ('ALI-001', 'STL-260101-0001', 'เหล็กกล่อง 40x40',   'COMMON', 'TH'),
  ('ALI-002', 'STL-260101-0001', 'Square Tube 40',      'COMMON', 'EN'),
  ('ALI-003', 'STL-260101-0002', 'เหล็กกล่อง 50x50',   'COMMON', 'TH'),
  ('ALI-004', 'STL-260101-0003', 'เหล็กกล่องเล็ก',     'COMMON', 'TH'),
  ('ALI-005', 'WD-260101-0001',  'ไม้อัด 12',           'ABBREV', 'TH'),
  ('ALI-006', 'WD-260101-0002',  'MDF 18',              'ABBREV', 'TH'),
  ('ALI-007', 'PNT-260101-0001', 'สีรองพื้น TOA',       'BRAND',  'TH'),
  ('ALI-008', 'ELC-260101-0001', 'หลอดนีออน LED',       'COMMON', 'TH'),
  ('ALI-009', 'ELC-260101-0001', 'LED T8 Philips',      'BRAND',  'EN'),
  ('ALI-010', 'GLS-260101-0001', 'กระจกใส 5 มิล',       'COMMON', 'TH')
ON CONFLICT (alias_id) DO NOTHING;

INSERT INTO mat_uom_conv (material_id, from_uom, to_uom, factor) VALUES
  ('WD-260101-0001',  'BOX', 'SHEET', 10),
  ('WD-260101-0002',  'BOX', 'SHEET', 10),
  ('WD-260101-0003',  'BOX', 'SHEET', 10),
  ('HW-260101-0001',  'BOX', 'PCS',   100),
  ('PNT-260101-0001', 'CAN', 'L',     3.5),
  ('PNT-260101-0002', 'CAN', 'L',     3.5)
ON CONFLICT (material_id, from_uom, to_uom) DO NOTHING;

INSERT INTO supplier (
  supplier_id, supplier_code, supplier_name_th, supplier_name_en,
  tax_id, contact_name, phone, email, line_id, address, payment_terms, status, note
) VALUES
  ('SUP-0001', 'SCG',     'SCG Distribution',     'SCG Distribution',     '0105550001111', 'Narin',   '0811111111', 'sales@scg.example',      '@scg_sales',      'Bangkok',       '30 days', 'ACTIVE',   'Preferred construction supplier'),
  ('SUP-0002', 'HOMEPRO', 'HomePro Supplier Hub', 'HomePro Supplier Hub', '0105550002222', 'Mali',    '0822222222', 'vendor@homepro.example', '@homepro_vendor', 'Nonthaburi',    '15 days', 'ACTIVE',   NULL),
  ('SUP-0003', 'TOA',     'TOA Paint Thailand',   'TOA Paint Thailand',   '0105550003333', 'Somchai', '0833333333', 'b2b@toa.example',        '@toa_b2b',        'Samut Prakan',  '30 days', 'ACTIVE',   NULL),
  ('SUP-0004', 'LEGACY',  'Legacy Metals',        'Legacy Metals',        '0105550004444', 'Kanya',   '0844444444', 'sales@legacy.example',   '@legacy_metal',   'Pathum Thani',  'Cash',    'INACTIVE', 'Old supplier for archive tests')
ON CONFLICT (supplier_id) DO NOTHING;

INSERT INTO mat_supplier_map (
  material_id, supplier_id, supplier_material_name, supplier_sku,
  is_preferred, lead_time_days, min_order_qty, is_active, note
) VALUES
  ('STL-260101-0001', 'SUP-0001', 'Square Steel Tube 40x40x2', 'SCG-STL-4040', TRUE,  3, 10, TRUE,  'Fast moving item'),
  ('STL-260101-0001', 'SUP-0004', 'Square Steel Tube 40x40x2', 'LEG-STL-4040', FALSE, 7, 20, FALSE, 'Legacy supplier'),
  ('PNT-260101-0001', 'SUP-0003', 'TOA Metal Primer 3.5L',     'TOA-PRI-35',   TRUE,  2,  1, TRUE,  NULL),
  ('WD-260101-0001',  'SUP-0002', 'Plywood 12mm 4x8',          'HP-WD-1201',   TRUE,  5,  5, TRUE,  NULL),
  ('ELC-260101-0001', 'SUP-0002', 'LED Tube T8 18W 60cm',      'HP-LED-T8',    FALSE, 4, 12, TRUE,  'Batch purchase')
ON CONFLICT (material_id, supplier_id) DO NOTHING;

INSERT INTO mat_price_base (
  material_id, supplier_id, effective_date, price_uom, unit_price, currency_code,
  min_order_qty, lead_time_days, is_tax_included, source_note
) VALUES
  ('STL-260101-0001', 'SUP-0001', '2026-01-01', 'M',     145.50, 'THB', 10, 3, FALSE, 'Base contract price'),
  ('STL-260101-0001', 'SUP-0001', '2026-03-01', 'M',     149.75, 'THB', 10, 3, FALSE, 'Adjusted after freight increase'),
  ('STL-260101-0001', 'SUP-0004', '2025-12-01', 'M',     141.00, 'THB', 20, 7, FALSE, 'Legacy reference price'),
  ('PNT-260101-0001', 'SUP-0003', '2026-02-15', 'CAN',   820.00, 'THB',  1, 2, TRUE,  'TOA dealer quote'),
  ('WD-260101-0001',  'SUP-0002', '2026-02-01', 'SHEET', 540.00, 'THB',  5, 5, FALSE, 'Quarterly price list'),
  ('ELC-260101-0001', 'SUP-0002', '2026-01-10', 'PCS',   125.00, 'THB', 12, 4, TRUE,  'Promo lot')
ON CONFLICT (material_id, supplier_id, effective_date) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (production baseline)
-- ============================================================

REVOKE USAGE ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  app_table text;
  app_tables text[] := ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'mat_audit_log'
  ];
  mutable_tables text[] := ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base'
  ];
BEGIN
  FOREACH app_table IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', app_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', app_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', app_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_select', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_insert', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_update', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_delete', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_all', app_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.role() = %L)',
      'authenticated_select',
      app_table,
      'authenticated'
    );
  END LOOP;

  FOREACH app_table IN ARRAY mutable_tables LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('GRANT INSERT, UPDATE ON TABLE public.%I TO authenticated', app_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.role() = %L)',
      'authenticated_insert',
      app_table,
      'authenticated'
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
      'authenticated_update',
      app_table,
      'authenticated',
      'authenticated'
    );
  END LOOP;

  IF to_regclass('public.mat_audit_log') IS NOT NULL THEN
    EXECUTE 'GRANT INSERT ON TABLE public.mat_audit_log TO authenticated';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.role() = %L)',
      'authenticated_insert',
      'mat_audit_log',
      'authenticated'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.mat_audit_log_audit_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.mat_audit_log_audit_id_seq FROM anon;
    GRANT USAGE, SELECT ON SEQUENCE public.mat_audit_log_audit_id_seq TO authenticated;
  END IF;

  IF to_regclass('public.v_mat_latest_price') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.v_mat_latest_price FROM anon;
    GRANT SELECT ON TABLE public.v_mat_latest_price TO authenticated;
    ALTER VIEW public.v_mat_latest_price SET (security_invoker = true);
  END IF;
END $$;

-- ============================================================
-- RELOAD PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
