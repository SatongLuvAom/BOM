-- ============================================================
-- Phase 2B.5: Receipt Material Candidates
-- Human-reviewed material drafts created from unmatched receipt items.
-- Safe/additive migration for Supabase.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.receipt_material_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  receipt_item_id uuid NOT NULL REFERENCES public.purchase_receipt_items(id) ON DELETE CASCADE,
  proposed_mat_name_th text,
  proposed_mat_name_en text,
  proposed_category_id uuid REFERENCES public.mat_category(id) ON DELETE RESTRICT,
  proposed_material_type_id uuid REFERENCES public.material_types(id) ON DELETE RESTRICT,
  proposed_code_spec_key text,
  proposed_spec text,
  proposed_brand text,
  proposed_model text,
  proposed_uom_id uuid REFERENCES public.mat_uom(id) ON DELETE RESTRICT,
  proposed_uom_raw text,
  proposed_supplier_id uuid REFERENCES public.supplier(id) ON DELETE RESTRICT,
  proposed_supplier_name_raw text,
  proposed_unit_price numeric,
  proposed_aliases text[],
  ai_confidence numeric,
  ai_reason text,
  duplicate_warning jsonb,
  status text NOT NULL DEFAULT 'needs_review',
  created_material_id uuid REFERENCES public.mat_master(id) ON DELETE RESTRICT,
  reviewed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  material_created_at timestamptz
);

ALTER TABLE public.receipt_material_candidates
  ADD COLUMN IF NOT EXISTS proposed_aliases text[],
  ADD COLUMN IF NOT EXISTS duplicate_warning jsonb,
  ADD COLUMN IF NOT EXISTS created_material_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS material_created_at timestamptz;

ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS material_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS material_resolution_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipt_material_candidates_receipt_item_unique'
  ) THEN
    ALTER TABLE public.receipt_material_candidates
      ADD CONSTRAINT receipt_material_candidates_receipt_item_unique UNIQUE (receipt_item_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'receipt_material_candidates_status_check'
  ) THEN
    ALTER TABLE public.receipt_material_candidates
      ADD CONSTRAINT receipt_material_candidates_status_check
      CHECK (status IN ('needs_review', 'approved', 'rejected', 'created'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_receipt_items_material_candidate_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_receipt_items
      ADD CONSTRAINT purchase_receipt_items_material_candidate_id_fkey
      FOREIGN KEY (material_candidate_id)
      REFERENCES public.receipt_material_candidates(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_receipt_items_material_resolution_status_check'
  ) THEN
    ALTER TABLE public.purchase_receipt_items
      ADD CONSTRAINT purchase_receipt_items_material_resolution_status_check
      CHECK (
        material_resolution_status IS NULL OR material_resolution_status IN (
          'matched_existing',
          'candidate_created',
          'create_material_needed',
          'ignored',
          'unresolved'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receipt_material_candidates_receipt_id
  ON public.receipt_material_candidates(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_material_candidates_receipt_item_id
  ON public.receipt_material_candidates(receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_receipt_material_candidates_status
  ON public.receipt_material_candidates(status);
CREATE INDEX IF NOT EXISTS idx_receipt_material_candidates_created_material_id
  ON public.receipt_material_candidates(created_material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_material_candidate_id
  ON public.purchase_receipt_items(material_candidate_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_resolution_status
  ON public.purchase_receipt_items(material_resolution_status);

CREATE OR REPLACE FUNCTION public.fn_receipt_material_candidates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_material_candidates_set_updated_at ON public.receipt_material_candidates;
CREATE TRIGGER trg_receipt_material_candidates_set_updated_at
  BEFORE UPDATE ON public.receipt_material_candidates
  FOR EACH ROW EXECUTE FUNCTION public.fn_receipt_material_candidates_set_updated_at();

ALTER TABLE public.receipt_material_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_material_candidates_authenticated_all ON public.receipt_material_candidates;
CREATE POLICY receipt_material_candidates_authenticated_all
  ON public.receipt_material_candidates
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_material_candidates TO authenticated;
