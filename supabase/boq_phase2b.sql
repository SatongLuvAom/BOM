-- ============================================================
-- BOQ Phase 2B — Add SECTION item type
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE boq_item DROP CONSTRAINT IF EXISTS boq_item_item_type_check;
ALTER TABLE boq_item ADD CONSTRAINT boq_item_item_type_check
  CHECK (item_type IN ('MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION'));

NOTIFY pgrst, 'reload schema';
