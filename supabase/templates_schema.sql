-- ============================================================
-- BOQ Template Library
-- Run in Supabase SQL Editor
-- ============================================================

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
  item_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   TEXT        NOT NULL REFERENCES boq_template(template_id) ON DELETE CASCADE,
  seq           INTEGER     NOT NULL DEFAULT 0,
  item_type     TEXT        NOT NULL DEFAULT 'MAT'
                CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION')),
  material_id   TEXT,
  item_name     TEXT        NOT NULL,
  spec          TEXT,
  uom           TEXT        NOT NULL,
  qty           NUMERIC(14,4) NOT NULL DEFAULT 1,
  waste_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT        NOT NULL DEFAULT 'THB',
  note          TEXT
);

CREATE INDEX IF NOT EXISTS idx_boq_template_deleted ON boq_template(is_deleted);
CREATE INDEX IF NOT EXISTS idx_boq_template_item_template ON boq_template_item(template_id, seq);

CREATE OR REPLACE FUNCTION update_boq_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boq_template_updated_at ON boq_template;
CREATE TRIGGER trg_boq_template_updated_at
  BEFORE UPDATE ON boq_template
  FOR EACH ROW EXECUTE FUNCTION update_boq_template_updated_at();

ALTER TABLE boq_template      ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_template_item ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
