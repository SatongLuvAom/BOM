-- ============================================================
-- Comments per BOQ Item
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS boq_comment (
  comment_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES boq_item(item_id) ON DELETE CASCADE,
  project_id TEXT        NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  author     TEXT        NOT NULL DEFAULT 'ผู้ใช้',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boq_comment_item    ON boq_comment(item_id);
CREATE INDEX IF NOT EXISTS idx_boq_comment_project ON boq_comment(project_id);

ALTER TABLE boq_comment ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
