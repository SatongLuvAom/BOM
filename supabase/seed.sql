-- ============================================================
-- BOQ/MAT Demo Seed Data
-- Safe to rerun. Uses cat_code and supplier_code to avoid duplicate key conflicts
-- when an existing database already has different generated IDs.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- UOM
-- ------------------------------------------------------------

INSERT INTO mat_uom (uom_code, uom_name_th, uom_name_en) VALUES
  ('PCS',   'ชิ้น',         'Piece'),
  ('M',     'เมตร',         'Meter'),
  ('M2',    'ตารางเมตร',    'Square Meter'),
  ('M3',    'ลูกบาศก์เมตร', 'Cubic Meter'),
  ('KG',    'กิโลกรัม',     'Kilogram'),
  ('TON',   'ตัน',          'Ton'),
  ('BAG',   'ถุง',          'Bag'),
  ('ROLL',  'ม้วน',         'Roll'),
  ('SET',   'ชุด',          'Set'),
  ('BOX',   'กล่อง',        'Box'),
  ('SHEET', 'แผ่น',         'Sheet'),
  ('L',     'ลิตร',         'Liter'),
  ('CAN',   'กระป๋อง',      'Can')
ON CONFLICT (uom_code) DO UPDATE SET
  uom_name_th = EXCLUDED.uom_name_th,
  uom_name_en = EXCLUDED.uom_name_en,
  is_active = TRUE;

-- ------------------------------------------------------------
-- Categories
-- ------------------------------------------------------------

WITH seed_categories (cat_id, cat_code, cat_name_th, cat_name_en, is_active, sort_order) AS (
  VALUES
    ('C01', 'STL', 'เหล็กและโลหะ',             'Steel & Metal',       TRUE, 1),
    ('C02', 'WD',  'ไม้และวัสดุไม้',            'Wood & Timber',       TRUE, 2),
    ('C03', 'PNT', 'สีและสารเคลือบ',            'Paint & Coating',     TRUE, 3),
    ('C04', 'ELC', 'ไฟฟ้าและแสงสว่าง',          'Electrical & Light',  TRUE, 4),
    ('C05', 'FAB', 'ผ้าและวัสดุคลุม',           'Fabric & Covering',   TRUE, 5),
    ('C06', 'HW',  'อุปกรณ์ยึดและติดตั้ง',      'Hardware & Fixtures', TRUE, 6),
    ('C07', 'PLB', 'ประปาและระบายน้ำ',          'Plumbing',            TRUE, 7),
    ('C08', 'GLS', 'กระจกและอะคริลิค',          'Glass & Acrylic',     TRUE, 8)
),
updated AS (
  UPDATE mat_category c
  SET
    cat_name_th = s.cat_name_th,
    cat_name_en = s.cat_name_en,
    is_active = s.is_active,
    sort_order = s.sort_order
  FROM seed_categories s
  WHERE c.cat_code = s.cat_code
  RETURNING c.cat_code
)
INSERT INTO mat_category (cat_id, cat_code, cat_name_th, cat_name_en, is_active, sort_order)
SELECT s.cat_id, s.cat_code, s.cat_name_th, s.cat_name_en, s.is_active, s.sort_order
FROM seed_categories s
WHERE NOT EXISTS (
  SELECT 1
  FROM mat_category c
  WHERE c.cat_code = s.cat_code
)
ON CONFLICT (cat_id) DO NOTHING;

-- ------------------------------------------------------------
-- Materials
-- ------------------------------------------------------------

WITH seed_materials (
  material_id, cat_code, mat_name_th, mat_name_en, spec, brand, base_uom, status
) AS (
  VALUES
    ('STL-260101-0001', 'STL', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '40x40x2mm',   NULL,      'M',     'ACTIVE'),
    ('STL-260101-0002', 'STL', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '50x50x2mm',   NULL,      'M',     'ACTIVE'),
    ('STL-260101-0003', 'STL', 'เหล็กกล่องสี่เหลี่ยม', 'Square Steel Tube', '25x25x1.5mm', NULL,      'M',     'ACTIVE'),
    ('STL-260101-0004', 'STL', 'เหล็กแบน',             'Flat Bar',          '50x5mm',       NULL,      'M',     'ACTIVE'),
    ('STL-260101-0005', 'STL', 'เหล็กฉาก',             'Angle Iron',        '50x50x5mm',    NULL,      'M',     'ACTIVE'),
    ('WD-260101-0001',  'WD',  'ไม้อัดสักทอง',          'Plywood',           '12mm 4x8 ฟุต', NULL,      'SHEET', 'ACTIVE'),
    ('WD-260101-0002',  'WD',  'MDF',                   'MDF Board',         '18mm 4x8 ฟุต', NULL,      'SHEET', 'ACTIVE'),
    ('WD-260101-0003',  'WD',  'ไม้อัด',                'Plywood',           '6mm 4x8 ฟุต',  NULL,      'SHEET', 'ACTIVE'),
    ('PNT-260101-0001', 'PNT', 'สีรองพื้นโลหะ',         'Metal Primer',      '3.5L',         'TOA',     'CAN',   'ACTIVE'),
    ('PNT-260101-0002', 'PNT', 'สีทับหน้า',             'Topcoat',           '3.5L',         'TOA',     'CAN',   'ACTIVE'),
    ('ELC-260101-0001', 'ELC', 'หลอด LED T8',           'LED Tube T8',       '18W 60cm',     'Philips', 'PCS',   'ACTIVE'),
    ('ELC-260101-0002', 'ELC', 'รางไฟ LED',             'LED Track',         '1m',           NULL,      'M',     'ACTIVE'),
    ('ELC-260101-0003', 'ELC', 'สปอร์ตไลท์ LED',        'LED Spotlight',     '7W',           NULL,      'PCS',   'ACTIVE'),
    ('HW-260101-0001',  'HW',  'น็อตและสกรู M6',        'Bolt & Screw M6',   'M6x30mm',      NULL,      'BOX',   'ACTIVE'),
    ('GLS-260101-0001', 'GLS', 'กระจกใส',               'Clear Glass',       '5mm',          NULL,      'M2',    'ACTIVE')
)
INSERT INTO mat_master (
  material_id, cat_id, mat_name_th, mat_name_en, spec, brand, base_uom, status, is_deleted, deleted_at
)
SELECT
  s.material_id,
  c.cat_id,
  s.mat_name_th,
  s.mat_name_en,
  s.spec,
  s.brand,
  s.base_uom,
  s.status,
  FALSE,
  NULL
FROM seed_materials s
JOIN mat_category c ON c.cat_code = s.cat_code
ON CONFLICT (material_id) DO UPDATE SET
  cat_id = EXCLUDED.cat_id,
  mat_name_th = EXCLUDED.mat_name_th,
  mat_name_en = EXCLUDED.mat_name_en,
  spec = EXCLUDED.spec,
  brand = EXCLUDED.brand,
  base_uom = EXCLUDED.base_uom,
  status = EXCLUDED.status,
  is_deleted = FALSE,
  deleted_at = NULL;

-- ------------------------------------------------------------
-- Aliases
-- ------------------------------------------------------------

INSERT INTO mat_alias (alias_id, material_id, alias_name, alias_type, lang, is_deleted, deleted_at) VALUES
  ('ALI-001', 'STL-260101-0001', 'เหล็กกล่อง 40x40', 'COMMON', 'TH', FALSE, NULL),
  ('ALI-002', 'STL-260101-0001', 'Square Tube 40',   'COMMON', 'EN', FALSE, NULL),
  ('ALI-003', 'STL-260101-0002', 'เหล็กกล่อง 50x50', 'COMMON', 'TH', FALSE, NULL),
  ('ALI-004', 'STL-260101-0003', 'เหล็กกล่องเล็ก',   'COMMON', 'TH', FALSE, NULL),
  ('ALI-005', 'WD-260101-0001',  'ไม้อัด 12',        'ABBREV', 'TH', FALSE, NULL),
  ('ALI-006', 'WD-260101-0002',  'MDF 18',           'ABBREV', 'TH', FALSE, NULL),
  ('ALI-007', 'PNT-260101-0001', 'สีรองพื้น TOA',    'BRAND',  'TH', FALSE, NULL),
  ('ALI-008', 'ELC-260101-0001', 'หลอดนีออน LED',    'COMMON', 'TH', FALSE, NULL),
  ('ALI-009', 'ELC-260101-0001', 'LED T8 Philips',   'BRAND',  'EN', FALSE, NULL),
  ('ALI-010', 'GLS-260101-0001', 'กระจกใส 5 มิล',    'COMMON', 'TH', FALSE, NULL)
ON CONFLICT (alias_id) DO UPDATE SET
  material_id = EXCLUDED.material_id,
  alias_name = EXCLUDED.alias_name,
  alias_type = EXCLUDED.alias_type,
  lang = EXCLUDED.lang,
  is_deleted = FALSE,
  deleted_at = NULL;

-- ------------------------------------------------------------
-- UOM conversions
-- ------------------------------------------------------------

INSERT INTO mat_uom_conv (material_id, from_uom, to_uom, factor, is_deleted, deleted_at) VALUES
  ('WD-260101-0001',  'BOX', 'SHEET', 10,  FALSE, NULL),
  ('WD-260101-0002',  'BOX', 'SHEET', 10,  FALSE, NULL),
  ('WD-260101-0003',  'BOX', 'SHEET', 10,  FALSE, NULL),
  ('HW-260101-0001',  'BOX', 'PCS',   100, FALSE, NULL),
  ('PNT-260101-0001', 'CAN', 'L',     3.5, FALSE, NULL),
  ('PNT-260101-0002', 'CAN', 'L',     3.5, FALSE, NULL)
ON CONFLICT (material_id, from_uom, to_uom) DO UPDATE SET
  factor = EXCLUDED.factor,
  is_deleted = FALSE,
  deleted_at = NULL;

-- ------------------------------------------------------------
-- Suppliers
-- ------------------------------------------------------------

WITH seed_suppliers (
  supplier_id, supplier_code, supplier_name_th, supplier_name_en, tax_id,
  contact_name, phone, email, line_id, address, payment_terms, status, note
) AS (
  VALUES
    ('SUP-0001', 'SCG',     'SCG Distribution',      'SCG Distribution',      '0105550001111', 'Narin',   '0811111111', 'sales@scg.example',      '@scg_sales',      'Bangkok',       '30 days', 'ACTIVE',   'Preferred construction supplier'),
    ('SUP-0002', 'HOMEPRO', 'HomePro Supplier Hub',  'HomePro Supplier Hub',  '0105550002222', 'Mali',    '0822222222', 'vendor@homepro.example', '@homepro_vendor', 'Nonthaburi',    '15 days', 'ACTIVE',   NULL),
    ('SUP-0003', 'TOA',     'TOA Paint Thailand',    'TOA Paint Thailand',    '0105550003333', 'Somchai', '0833333333', 'b2b@toa.example',        '@toa_b2b',        'Samut Prakan',  '30 days', 'ACTIVE',   NULL),
    ('SUP-0004', 'LEGACY',  'Legacy Metals',         'Legacy Metals',         '0105550004444', 'Kanya',   '0844444444', 'sales@legacy.example',   '@legacy_metal',   'Pathum Thani',  'Cash',    'INACTIVE', 'Old supplier for archive tests')
),
updated AS (
  UPDATE supplier s
  SET
    supplier_name_th = ss.supplier_name_th,
    supplier_name_en = ss.supplier_name_en,
    tax_id = ss.tax_id,
    contact_name = ss.contact_name,
    phone = ss.phone,
    email = ss.email,
    line_id = ss.line_id,
    address = ss.address,
    payment_terms = ss.payment_terms,
    status = ss.status,
    note = ss.note,
    is_deleted = FALSE,
    deleted_at = NULL
  FROM seed_suppliers ss
  WHERE s.supplier_code = ss.supplier_code
  RETURNING s.supplier_code
)
INSERT INTO supplier (
  supplier_id, supplier_code, supplier_name_th, supplier_name_en, tax_id,
  contact_name, phone, email, line_id, address, payment_terms, status, note,
  is_deleted, deleted_at
)
SELECT
  ss.supplier_id,
  ss.supplier_code,
  ss.supplier_name_th,
  ss.supplier_name_en,
  ss.tax_id,
  ss.contact_name,
  ss.phone,
  ss.email,
  ss.line_id,
  ss.address,
  ss.payment_terms,
  ss.status,
  ss.note,
  FALSE,
  NULL
FROM seed_suppliers ss
WHERE NOT EXISTS (
  SELECT 1
  FROM supplier s
  WHERE s.supplier_code = ss.supplier_code
)
ON CONFLICT (supplier_id) DO NOTHING;

-- ------------------------------------------------------------
-- Material supplier maps
-- ------------------------------------------------------------

WITH seed_maps (
  material_id, supplier_code, supplier_material_name, supplier_sku,
  is_preferred, lead_time_days, min_order_qty, is_active, note
) AS (
  VALUES
    ('STL-260101-0001', 'SCG',     'Square Steel Tube 40x40x2', 'SCG-STL-4040', TRUE,  3, 10, TRUE,  'Fast moving item'),
    ('STL-260101-0001', 'LEGACY',  'Square Steel Tube 40x40x2', 'LEG-STL-4040', FALSE, 7, 20, FALSE, 'Legacy supplier'),
    ('PNT-260101-0001', 'TOA',     'TOA Metal Primer 3.5L',     'TOA-PRI-35',   TRUE,  2,  1, TRUE,  NULL),
    ('WD-260101-0001',  'HOMEPRO', 'Plywood 12mm 4x8',          'HP-WD-1201',   TRUE,  5,  5, TRUE,  NULL),
    ('ELC-260101-0001', 'HOMEPRO', 'LED Tube T8 18W 60cm',      'HP-LED-T8',    FALSE, 4, 12, TRUE,  'Batch purchase')
)
INSERT INTO mat_supplier_map (
  material_id, supplier_id, supplier_material_name, supplier_sku,
  is_preferred, lead_time_days, min_order_qty, is_active, note,
  is_deleted, deleted_at
)
SELECT
  sm.material_id,
  s.supplier_id,
  sm.supplier_material_name,
  sm.supplier_sku,
  sm.is_preferred,
  sm.lead_time_days,
  sm.min_order_qty,
  sm.is_active,
  sm.note,
  FALSE,
  NULL
FROM seed_maps sm
JOIN supplier s ON s.supplier_code = sm.supplier_code
ON CONFLICT (material_id, supplier_id) DO UPDATE SET
  supplier_material_name = EXCLUDED.supplier_material_name,
  supplier_sku = EXCLUDED.supplier_sku,
  is_preferred = EXCLUDED.is_preferred,
  lead_time_days = EXCLUDED.lead_time_days,
  min_order_qty = EXCLUDED.min_order_qty,
  is_active = EXCLUDED.is_active,
  note = EXCLUDED.note,
  is_deleted = FALSE,
  deleted_at = NULL;

-- ------------------------------------------------------------
-- Price history
-- ------------------------------------------------------------

WITH seed_prices (
  material_id, supplier_code, effective_date, price_uom, unit_price, currency_code,
  min_order_qty, lead_time_days, is_tax_included, source_note
) AS (
  VALUES
    ('STL-260101-0001', 'SCG',     DATE '2026-01-01', 'M',     145.50, 'THB', 10, 3, FALSE, 'Base contract price'),
    ('STL-260101-0001', 'SCG',     DATE '2026-03-01', 'M',     149.75, 'THB', 10, 3, FALSE, 'Adjusted after freight increase'),
    ('STL-260101-0001', 'LEGACY',  DATE '2025-12-01', 'M',     141.00, 'THB', 20, 7, FALSE, 'Legacy reference price'),
    ('PNT-260101-0001', 'TOA',     DATE '2026-02-15', 'CAN',   820.00, 'THB',  1, 2, TRUE,  'TOA dealer quote'),
    ('WD-260101-0001',  'HOMEPRO', DATE '2026-02-01', 'SHEET', 540.00, 'THB',  5, 5, FALSE, 'Quarterly price list'),
    ('ELC-260101-0001', 'HOMEPRO', DATE '2026-01-10', 'PCS',   125.00, 'THB', 12, 4, TRUE,  'Promo lot')
)
INSERT INTO mat_price_base (
  material_id, supplier_id, effective_date, price_uom, unit_price, currency_code,
  min_order_qty, lead_time_days, is_tax_included, source_note,
  is_deleted, deleted_at
)
SELECT
  sp.material_id,
  s.supplier_id,
  sp.effective_date,
  sp.price_uom,
  sp.unit_price,
  sp.currency_code,
  sp.min_order_qty,
  sp.lead_time_days,
  sp.is_tax_included,
  sp.source_note,
  FALSE,
  NULL
FROM seed_prices sp
JOIN supplier s ON s.supplier_code = sp.supplier_code
ON CONFLICT (material_id, supplier_id, effective_date) DO UPDATE SET
  price_uom = EXCLUDED.price_uom,
  unit_price = EXCLUDED.unit_price,
  currency_code = EXCLUDED.currency_code,
  min_order_qty = EXCLUDED.min_order_qty,
  lead_time_days = EXCLUDED.lead_time_days,
  is_tax_included = EXCLUDED.is_tax_included,
  source_note = EXCLUDED.source_note,
  is_deleted = FALSE,
  deleted_at = NULL;

-- ------------------------------------------------------------
-- Validation
-- ------------------------------------------------------------

DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM (
    VALUES
      ('mat_uom', 'PCS'),
      ('mat_uom', 'M'),
      ('mat_uom', 'M2'),
      ('mat_uom', 'SHEET'),
      ('mat_category_code', 'STL'),
      ('mat_category_code', 'WD'),
      ('mat_category_code', 'ELC'),
      ('mat_master', 'STL-260101-0001'),
      ('mat_master', 'WD-260101-0001'),
      ('supplier_code', 'SCG'),
      ('supplier_code', 'HOMEPRO')
  ) AS expected(entity_type, entity_key)
  WHERE NOT EXISTS (
    SELECT 1 FROM mat_uom u
    WHERE expected.entity_type = 'mat_uom'
      AND u.uom_code = expected.entity_key
  )
  AND NOT EXISTS (
    SELECT 1 FROM mat_category c
    WHERE expected.entity_type = 'mat_category_code'
      AND c.cat_code = expected.entity_key
  )
  AND NOT EXISTS (
    SELECT 1 FROM mat_master m
    WHERE expected.entity_type = 'mat_master'
      AND m.material_id = expected.entity_key
  )
  AND NOT EXISTS (
    SELECT 1 FROM supplier s
    WHERE expected.entity_type = 'supplier_code'
      AND s.supplier_code = expected.entity_key
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'seed.sql validation failed: % critical records missing', missing_count;
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
