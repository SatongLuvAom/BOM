-- ============================================================
-- Attachments — BOQ Project Files
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Create storage bucket (via SQL or Dashboard)
-- In Dashboard → Storage → New Bucket: name="boq-attachments", Public=false
-- OR run:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('boq-attachments', 'boq-attachments', false)
-- ON CONFLICT DO NOTHING;

-- 2. Metadata table
CREATE TABLE IF NOT EXISTS boq_attachment (
  attachment_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT        NOT NULL REFERENCES boq_project(project_id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  storage_path  TEXT        NOT NULL,   -- path inside bucket
  note          TEXT,
  uploaded_by   TEXT        DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boq_attachment_project ON boq_attachment(project_id);

ALTER TABLE boq_attachment ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
