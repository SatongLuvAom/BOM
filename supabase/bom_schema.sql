-- ============================================================
-- BOM (Bill of Materials) — Booth Work Package Library
-- Run in Supabase SQL Editor
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

CREATE INDEX IF NOT EXISTS idx_bom_template_deleted  ON bom_template(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bom_item_bom          ON bom_item(bom_id, seq);

CREATE OR REPLACE FUNCTION fn_bom_template_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bom_template_updated_at ON bom_template;
CREATE TRIGGER trg_bom_template_updated_at
  BEFORE UPDATE ON bom_template FOR EACH ROW EXECUTE FUNCTION fn_bom_template_updated_at();

ALTER TABLE bom_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_item     ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
