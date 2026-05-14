-- ============================================================
-- BOQ Phase 2A Schema
-- Run in Supabase SQL Editor
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

CREATE INDEX IF NOT EXISTS idx_boq_project_status  ON boq_project(status);
CREATE INDEX IF NOT EXISTS idx_boq_project_deleted ON boq_project(is_deleted);
CREATE INDEX IF NOT EXISTS idx_boq_project_date    ON boq_project(project_date DESC);

CREATE TABLE IF NOT EXISTS boq_item (
  item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL DEFAULT 0,
  item_type     TEXT NOT NULL DEFAULT 'MAT'
                CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC')),
  material_id   TEXT REFERENCES mat_master(material_id),
  item_name     TEXT NOT NULL,
  spec          TEXT,
  uom           TEXT NOT NULL,
  qty           NUMERIC(14, 4) NOT NULL DEFAULT 1,
  waste_pct     NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  final_qty     NUMERIC(14, 4) GENERATED ALWAYS AS (qty * (1 + waste_pct / 100)) STORED,
  unit_price    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(16, 2) GENERATED ALWAYS AS (qty * (1 + waste_pct / 100) * unit_price) STORED,
  currency_code TEXT NOT NULL DEFAULT 'THB',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boq_item_project  ON boq_item(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_item_seq      ON boq_item(project_id, seq);
CREATE INDEX IF NOT EXISTS idx_boq_item_material ON boq_item(material_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_boq_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boq_project_updated_at ON boq_project;
CREATE TRIGGER trg_boq_project_updated_at
  BEFORE UPDATE ON boq_project
  FOR EACH ROW EXECUTE FUNCTION update_boq_updated_at();

DROP TRIGGER IF EXISTS trg_boq_item_updated_at ON boq_item;
CREATE TRIGGER trg_boq_item_updated_at
  BEFORE UPDATE ON boq_item
  FOR EACH ROW EXECUTE FUNCTION update_boq_updated_at();

ALTER TABLE boq_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq_item    ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
