-- ============================================================
-- Phase 2B.2: Receipt AI/OCR with Gemini
-- Additive migration for receipt extraction metadata and private file path.
-- ============================================================

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS file_storage_path text;

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS ai_raw_text text;

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS ai_raw_json jsonb;

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_file_storage_path
  ON public.purchase_receipts(file_storage_path)
  WHERE file_storage_path IS NOT NULL;

NOTIFY pgrst, 'reload schema';
