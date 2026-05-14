-- ============================================================
-- BOQ SYSTEM — Complete Setup (All Phases)
-- Copy entire file → Supabase SQL Editor → Run
-- ============================================================

-- ── Shared trigger function ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PHASE 1 — Material Master
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

CREATE TABLE IF NOT EXISTS mat_audit_log (
  audit_id    BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_key  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Phase 1.5 — Suppliers & Prices ───────────────────────────

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

-- ============================================================
-- PHASE 2A — BOQ Projects
-- ============================================================

CREATE TABLE IF NOT EXISTS boq_project (
  project_id    TEXT PRIMARY KEY,
  project_name  TEXT NOT NULL,
  client_name   TEXT,
  site_address  TEXT,
  project_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  note          TEXT,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boq_item (
  item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL DEFAULT 0,
  item_type     TEXT NOT NULL DEFAULT 'MAT'
                CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION')),
  material_id   TEXT REFERENCES mat_master(material_id),
  item_name     TEXT NOT NULL,
  spec          TEXT,
  uom           TEXT NOT NULL,
  qty           NUMERIC(14,4) NOT NULL DEFAULT 1,
  waste_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  final_qty     NUMERIC(14,4) GENERATED ALWAYS AS (qty * (1 + waste_pct / 100)) STORED,
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(16,2) GENERATED ALWAYS AS (qty * (1 + waste_pct / 100) * unit_price) STORED,
  currency_code TEXT NOT NULL DEFAULT 'THB',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PHASE 2B — Customer, Attachments, Comments, Templates
-- ============================================================

CREATE TABLE IF NOT EXISTS customer (
  customer_id   TEXT PRIMARY KEY,
  customer_code TEXT,
  customer_name TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  tax_id        TEXT,
  note          TEXT,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE boq_project
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customer(customer_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS boq_attachment (
  attachment_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT        NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  storage_path  TEXT        NOT NULL,
  note          TEXT,
  uploaded_by   TEXT        DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boq_comment (
  comment_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES boq_item(item_id) ON DELETE CASCADE,
  project_id TEXT        NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  author     TEXT        NOT NULL DEFAULT 'ผู้ใช้',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boq_template (
  template_id   TEXT        PRIMARY KEY,
  template_name TEXT        NOT NULL,
  description   TEXT,
  category      TEXT,
  is_deleted    BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boq_template_item (
  item_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   TEXT          NOT NULL REFERENCES boq_template(template_id) ON DELETE CASCADE,
  seq           INTEGER       NOT NULL DEFAULT 0,
  item_type     TEXT          NOT NULL DEFAULT 'MAT'
                CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION')),
  material_id   TEXT,
  item_name     TEXT          NOT NULL,
  spec          TEXT,
  uom           TEXT          NOT NULL,
  qty           NUMERIC(14,4) NOT NULL DEFAULT 1,
  waste_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT          NOT NULL DEFAULT 'THB',
  note          TEXT
);

-- ============================================================
-- PHASE 2C - BOM Templates
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_template (
  bom_id       TEXT        PRIMARY KEY,
  bom_name     TEXT        NOT NULL,
  bom_category TEXT,
  unit         TEXT        NOT NULL DEFAULT 'ตรม.',
  description  TEXT,
  is_deleted   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bom_item (
  item_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id       TEXT          NOT NULL REFERENCES bom_template(bom_id) ON DELETE CASCADE,
  seq          INTEGER       NOT NULL DEFAULT 0,
  item_type    TEXT          NOT NULL DEFAULT 'MAT'
               CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC')),
  material_id  TEXT          REFERENCES mat_master(material_id),
  item_name    TEXT          NOT NULL,
  uom          TEXT          NOT NULL,
  qty_per_unit NUMERIC(14,6) NOT NULL DEFAULT 1,
  waste_pct    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  note         TEXT
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
CREATE INDEX IF NOT EXISTS idx_supplier_status        ON supplier(status);
CREATE INDEX IF NOT EXISTS idx_supplier_search_name
  ON supplier USING gin(to_tsvector('simple', coalesce(supplier_name_th,'') || ' ' || coalesce(supplier_name_en,'')));

CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_supplier ON mat_supplier_map(supplier_id);
CREATE INDEX IF NOT EXISTS idx_mat_supplier_map_active
  ON mat_supplier_map(material_id, supplier_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_price_base_material  ON mat_price_base(material_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_mat_price_base_supplier  ON mat_price_base(supplier_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_mat_price_base_active
  ON mat_price_base(material_id, supplier_id, effective_date DESC) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_mat_audit_log_entity     ON mat_audit_log(entity_type, entity_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_boq_project_status   ON boq_project(status);
CREATE INDEX IF NOT EXISTS idx_boq_project_deleted  ON boq_project(is_deleted);
CREATE INDEX IF NOT EXISTS idx_boq_project_date     ON boq_project(project_date DESC);
CREATE INDEX IF NOT EXISTS idx_boq_project_customer ON boq_project(customer_id);
CREATE INDEX IF NOT EXISTS idx_boq_item_project     ON boq_item(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_item_seq         ON boq_item(project_id, seq);
CREATE INDEX IF NOT EXISTS idx_boq_item_material    ON boq_item(material_id);
CREATE INDEX IF NOT EXISTS idx_boq_attachment_project ON boq_attachment(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_comment_item     ON boq_comment(item_id);
CREATE INDEX IF NOT EXISTS idx_boq_comment_project  ON boq_comment(project_id);
CREATE INDEX IF NOT EXISTS idx_customer_name        ON customer(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_deleted     ON customer(is_deleted);
CREATE INDEX IF NOT EXISTS idx_boq_template_deleted ON boq_template(is_deleted);
CREATE INDEX IF NOT EXISTS idx_boq_template_item_template ON boq_template_item(template_id, seq);
CREATE INDEX IF NOT EXISTS idx_bom_template_deleted ON bom_template(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bom_item_bom ON bom_item(bom_id, seq);

-- ============================================================
-- TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_mat_master_updated_at       ON mat_master;
DROP TRIGGER IF EXISTS trg_mat_category_updated_at     ON mat_category;
DROP TRIGGER IF EXISTS trg_supplier_updated_at         ON supplier;
DROP TRIGGER IF EXISTS trg_mat_supplier_map_updated_at ON mat_supplier_map;
DROP TRIGGER IF EXISTS trg_mat_price_base_updated_at   ON mat_price_base;
DROP TRIGGER IF EXISTS trg_boq_project_updated_at      ON boq_project;
DROP TRIGGER IF EXISTS trg_boq_item_updated_at         ON boq_item;
DROP TRIGGER IF EXISTS trg_customer_updated_at         ON customer;
DROP TRIGGER IF EXISTS trg_boq_template_updated_at     ON boq_template;
DROP TRIGGER IF EXISTS trg_bom_template_updated_at     ON bom_template;

CREATE TRIGGER trg_mat_master_updated_at
  BEFORE UPDATE ON mat_master       FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_mat_category_updated_at
  BEFORE UPDATE ON mat_category     FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_supplier_updated_at
  BEFORE UPDATE ON supplier         FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_mat_supplier_map_updated_at
  BEFORE UPDATE ON mat_supplier_map FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_mat_price_base_updated_at
  BEFORE UPDATE ON mat_price_base   FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_boq_project_updated_at
  BEFORE UPDATE ON boq_project      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_boq_item_updated_at
  BEFORE UPDATE ON boq_item         FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_customer_updated_at
  BEFORE UPDATE ON customer         FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_boq_template_updated_at
  BEFORE UPDATE ON boq_template     FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_bom_template_updated_at
  BEFORE UPDATE ON bom_template     FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_mat_latest_price AS
SELECT DISTINCT ON (p.material_id)
  p.material_id,
  p.supplier_id,
  s.supplier_name_th AS supplier_name,
  p.unit_price,
  p.currency_code,
  p.price_uom,
  p.effective_date
FROM mat_price_base p
JOIN supplier s ON s.supplier_id = p.supplier_id
WHERE p.is_deleted = false
ORDER BY p.material_id, p.effective_date DESC;

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result json;
BEGIN
  SELECT json_build_object(
    'total_materials',  (SELECT COUNT(*) FROM mat_master),
    'active_materials', (SELECT COUNT(*) FROM mat_master WHERE status = 'ACTIVE'),
    'total_suppliers',  (SELECT COUNT(*) FROM supplier WHERE is_deleted = false),
    'total_prices',     (SELECT COUNT(*) FROM mat_price_base WHERE is_deleted = false),
    'missing_alias', (
      SELECT COUNT(*) FROM mat_master m WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM mat_alias a WHERE a.material_id = m.material_id)
    ),
    'missing_uom_conv', (
      SELECT COUNT(*) FROM mat_master m WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM mat_uom_conv c WHERE c.material_id = m.material_id)
    ),
    'missing_price', (
      SELECT COUNT(*) FROM mat_master m WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM mat_price_base p WHERE p.material_id = m.material_id AND p.is_deleted = false
      )
    ),
    'by_category', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT c.cat_id, c.cat_code, c.cat_name_th, COUNT(m.material_id)::int AS count
        FROM mat_category c
        LEFT JOIN mat_master m ON m.cat_id = c.cat_id
        WHERE c.is_active = true
        GROUP BY c.cat_id, c.cat_code, c.cat_name_th
        ORDER BY COUNT(m.material_id) DESC
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (production baseline)
-- ============================================================

-- Policy strategy:
-- - anon role: no direct table access.
-- - authenticated role: app users can read, insert, and update app tables.
-- - table DELETE is intentionally not granted because the app uses soft delete via UPDATE.
-- - service_role still bypasses RLS for server-only integrations such as LINE lookup.
-- - There is no row ownership model yet because current tables do not have owner/team columns.

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
    'mat_audit_log',
    'boq_project',
    'boq_item',
    'customer',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'bom_template',
    'bom_item'
  ];
  mutable_tables text[] := ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'boq_project',
    'boq_item',
    'customer',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'bom_template',
    'bom_item'
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
-- STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('boq-attachments', 'boq-attachments', false, 20971520)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "boq attachments select" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments insert" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments update" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments delete" ON storage.objects;

CREATE POLICY "boq attachments select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

-- ============================================================
-- RELOAD PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
