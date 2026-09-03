-- Receipt duplicate detection by exact file content or supplier/document number.
-- Additive migration: existing receipt rows remain valid and file hashes are
-- populated only when a file is uploaded again through the application.

BEGIN;

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS file_sha256 text;

ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS receipt_no_normalized text
  GENERATED ALWAYS AS (
    nullif(upper(regexp_replace(btrim(receipt_no), '\s+', '', 'g')), '')
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_receipts_file_sha256_format_check'
      AND conrelid = 'public.purchase_receipts'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipts
      ADD CONSTRAINT purchase_receipts_file_sha256_format_check
      CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_receipts_file_sha256_unique
  ON public.purchase_receipts(file_sha256)
  WHERE file_sha256 IS NOT NULL AND status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_document
  ON public.purchase_receipts(supplier_id, receipt_no_normalized)
  WHERE supplier_id IS NOT NULL
    AND receipt_no_normalized IS NOT NULL
    AND status <> 'rejected';

COMMENT ON COLUMN public.purchase_receipts.file_sha256 IS
  'Lowercase SHA-256 of the original uploaded receipt bytes for exact duplicate detection.';

COMMENT ON COLUMN public.purchase_receipts.receipt_no_normalized IS
  'Generated uppercase document number without whitespace for supplier/document duplicate detection.';

NOTIFY pgrst, 'reload schema';

COMMIT;
