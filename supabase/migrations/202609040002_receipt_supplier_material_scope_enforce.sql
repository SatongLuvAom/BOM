-- Phase 2: apply immediately AFTER the supplier-scope application is serving Production.
-- Requires 202609040001_receipt_supplier_material_scope.sql.
BEGIN;

DROP TRIGGER IF EXISTS trg_receipt_material_supplier ON public.purchase_receipt_items;

-- Legacy selections were never confirmed against a shop. Keep their contents but
-- exclude them from bulk-ready posting until the user explicitly reselects them.
UPDATE public.purchase_receipt_items
SET review_status = 'needs_review'
WHERE review_status = 'reviewed' AND action = 'update_price'
  AND material_id IS NOT NULL AND material_supplier_id IS NULL;

CREATE TRIGGER trg_receipt_material_supplier BEFORE INSERT OR UPDATE ON public.purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_material_supplier();

-- Only the checked wrapper may invoke the old implementation for authenticated users.
REVOKE ALL ON FUNCTION public.approve_receipt_material_candidate_atomic(uuid,uuid,boolean,uuid,jsonb) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
