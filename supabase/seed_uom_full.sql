-- ============================================================
-- Full UOM Seed for BOQ/MAT
-- Safe to rerun. Existing UOM names are standardized by uom_code.
-- ============================================================

INSERT INTO mat_uom (uom_code, uom_name_th, uom_name_en) VALUES
  -- Count / package
  ('EA',       'ชิ้น',              'Each'),
  ('PCS',      'ชิ้น',              'Piece'),
  ('UNIT',     'หน่วย',             'Unit'),
  ('SET',      'ชุด',               'Set'),
  ('PAIR',     'คู่',               'Pair'),
  ('DOZ',      'โหล',               'Dozen'),
  ('LOT',      'ล็อต',              'Lot'),
  ('JOB',      'งาน',               'Job'),
  ('LS',       'เหมารวม',           'Lump sum'),
  ('BOX',      'กล่อง',             'Box'),
  ('PACK',     'แพ็ค',              'Pack'),
  ('BAG',      'ถุง',               'Bag'),
  ('SACK',     'กระสอบ',            'Sack'),
  ('ROLL',     'ม้วน',              'Roll'),
  ('SHEET',    'แผ่น',              'Sheet'),
  ('BUNDLE',   'มัด',               'Bundle'),
  ('CASE',     'ลัง',               'Case'),
  ('CARTON',   'กล่องกระดาษ',       'Carton'),
  ('PALLET',   'พาเลท',             'Pallet'),
  ('CAN',      'กระป๋อง',           'Can'),
  ('BOTTLE',   'ขวด',               'Bottle'),
  ('TUBE',     'หลอด',              'Tube'),
  ('PAIL',     'ถัง',               'Pail'),
  ('DRUM',     'ถังดรัม',           'Drum'),

  -- Length
  ('MM',       'มิลลิเมตร',         'Millimeter'),
  ('CM',       'เซนติเมตร',         'Centimeter'),
  ('M',        'เมตร',              'Meter'),
  ('KM',       'กิโลเมตร',          'Kilometer'),
  ('IN',       'นิ้ว',              'Inch'),
  ('FT',       'ฟุต',               'Foot'),
  ('YD',       'หลา',               'Yard'),

  -- Area
  ('MM2',      'ตารางมิลลิเมตร',    'Square millimeter'),
  ('CM2',      'ตารางเซนติเมตร',    'Square centimeter'),
  ('M2',       'ตารางเมตร',         'Square meter'),
  ('SQM',      'ตารางเมตร',         'Square meter'),
  ('KM2',      'ตารางกิโลเมตร',     'Square kilometer'),
  ('FT2',      'ตารางฟุต',          'Square foot'),
  ('IN2',      'ตารางนิ้ว',         'Square inch'),
  ('WAH2',     'ตารางวา',           'Square wah'),
  ('NGAN',     'งาน',               'Ngan'),
  ('RAI',      'ไร่',               'Rai'),

  -- Volume / capacity
  ('CC',       'ซีซี',              'Cubic centimeter'),
  ('ML',       'มิลลิลิตร',         'Milliliter'),
  ('L',        'ลิตร',              'Liter'),
  ('M3',       'ลูกบาศก์เมตร',      'Cubic meter'),
  ('FT3',      'ลูกบาศก์ฟุต',       'Cubic foot'),
  ('GAL',      'แกลลอน',            'Gallon'),

  -- Weight
  ('MG',       'มิลลิกรัม',         'Milligram'),
  ('G',        'กรัม',              'Gram'),
  ('KG',       'กิโลกรัม',          'Kilogram'),
  ('TON',      'ตัน',               'Metric ton'),
  ('LB',       'ปอนด์',             'Pound'),

  -- Time / labor
  ('MIN',      'นาที',              'Minute'),
  ('HR',       'ชั่วโมง',           'Hour'),
  ('DAY',      'วัน',               'Day'),
  ('WK',       'สัปดาห์',           'Week'),
  ('MO',       'เดือน',             'Month'),
  ('YEAR',     'ปี',                'Year'),
  ('MAN_HR',   'คน-ชั่วโมง',        'Man hour'),
  ('MAN_DAY',  'คน-วัน',            'Man day'),
  ('CREW_DAY', 'ทีม-วัน',           'Crew day'),

  -- Electrical / mechanical
  ('W',        'วัตต์',             'Watt'),
  ('KW',       'กิโลวัตต์',         'Kilowatt'),
  ('VA',       'โวลต์แอมป์',        'Volt ampere'),
  ('KVA',      'กิโลโวลต์แอมป์',    'Kilovolt ampere'),
  ('V',        'โวลต์',             'Volt'),
  ('A',        'แอมป์',             'Ampere'),
  ('OHM',      'โอห์ม',             'Ohm'),
  ('HZ',       'เฮิรตซ์',           'Hertz'),
  ('BTU',      'บีทียู',            'BTU'),
  ('HP',       'แรงม้า',            'Horsepower'),

  -- Pressure / force
  ('N',        'นิวตัน',            'Newton'),
  ('KN',       'กิโลนิวตัน',        'Kilonewton'),
  ('BAR',      'บาร์',              'Bar'),
  ('PSI',      'พีเอสไอ',           'PSI'),
  ('PA',       'ปาสกาล',            'Pascal'),
  ('KPA',      'กิโลปาสกาล',        'Kilopascal'),
  ('MPA',      'เมกะปาสกาล',        'Megapascal'),

  -- Common BOQ points / service units
  ('POINT',    'จุด',               'Point'),
  ('OUTLET',   'จุดจ่าย',           'Outlet'),
  ('CIRCUIT',  'วงจร',              'Circuit'),
  ('LINE',     'ไลน์',              'Line'),
  ('ROOM',     'ห้อง',              'Room'),
  ('FLOOR',    'ชั้น',              'Floor'),
  ('TRIP',     'เที่ยว',            'Trip'),
  ('PERSON',   'คน',                'Person'),
  ('SHIFT',    'กะ',                'Shift')
ON CONFLICT (uom_code) DO UPDATE SET
  uom_name_th = EXCLUDED.uom_name_th,
  uom_name_en = EXCLUDED.uom_name_en;

-- Seed validation: keep this file safe to rerun and fail if core UOMs are missing.
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM (
    VALUES
      ('EA'),
      ('PCS'),
      ('SET'),
      ('BOX'),
      ('M'),
      ('M2'),
      ('M3'),
      ('KG'),
      ('TON'),
      ('L'),
      ('SHEET'),
      ('ROLL'),
      ('HR'),
      ('DAY'),
      ('POINT')
  ) AS expected(uom_code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM mat_uom u
    WHERE u.uom_code = expected.uom_code
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'seed_uom_full.sql validation failed: % core UOM records missing', missing_count;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
