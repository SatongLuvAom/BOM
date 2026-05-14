-- ============================================================
-- Customer Module
-- Run in Supabase SQL Editor
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

CREATE INDEX IF NOT EXISTS idx_customer_name    ON customer(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_deleted ON customer(is_deleted);

-- Link BOQ → Customer
ALTER TABLE boq_project
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customer(customer_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_boq_project_customer ON boq_project(customer_id);

-- updated_at trigger (reuse BOQ function if exists, else create)
CREATE OR REPLACE FUNCTION update_customer_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_updated_at ON customer;
CREATE TRIGGER trg_customer_updated_at
  BEFORE UPDATE ON customer
  FOR EACH ROW EXECUTE FUNCTION update_customer_updated_at();

ALTER TABLE customer ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
