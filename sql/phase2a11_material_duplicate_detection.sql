-- ============================================================
-- Phase 2A.11 - Material Duplicate Detection
-- ============================================================
-- Scope:
--   * Store review-only duplicate detection metadata.
--   * Do not merge, delete, or rewrite material records.
--   * Do not change BOM/BOQ references or BOQ price snapshots.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.material_duplicate_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text UNIQUE,
  status text NOT NULL DEFAULT 'UNRESOLVED',
  confidence_level text NOT NULL DEFAULT 'LOW',
  max_score numeric NOT NULL DEFAULT 0,
  recommended_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT material_duplicate_groups_status_check CHECK (
    status IN ('UNRESOLVED', 'CONFIRMED_DUPLICATE', 'NOT_DUPLICATE', 'REVIEW_LATER', 'MERGE_READY')
  ),
  CONSTRAINT material_duplicate_groups_confidence_check CHECK (
    confidence_level IN ('HIGH', 'MEDIUM', 'LOW')
  ),
  CONSTRAINT material_duplicate_groups_score_check CHECK (
    max_score >= 0 AND max_score <= 100
  )
);

CREATE TABLE IF NOT EXISTS public.material_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.material_duplicate_groups(id) ON DELETE CASCADE,
  material_id text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  matched_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_duplicate_candidates_score_check CHECK (
    score >= 0 AND score <= 100
  ),
  CONSTRAINT material_duplicate_candidates_unique_material UNIQUE (group_id, material_id)
);

CREATE TABLE IF NOT EXISTS public.material_duplicate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.material_duplicate_groups(id) ON DELETE CASCADE,
  decision text NOT NULL,
  note text,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_duplicate_decisions_decision_check CHECK (
    decision IN ('CONFIRMED_DUPLICATE', 'NOT_DUPLICATE', 'REVIEW_LATER', 'MERGE_READY')
  )
);

CREATE INDEX IF NOT EXISTS idx_material_duplicate_groups_status
  ON public.material_duplicate_groups(status, confidence_level, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_duplicate_groups_group_key
  ON public.material_duplicate_groups(group_key);

CREATE INDEX IF NOT EXISTS idx_material_duplicate_candidates_group
  ON public.material_duplicate_candidates(group_id);

CREATE INDEX IF NOT EXISTS idx_material_duplicate_candidates_material
  ON public.material_duplicate_candidates(material_id);

CREATE INDEX IF NOT EXISTS idx_material_duplicate_decisions_group
  ON public.material_duplicate_decisions(group_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.fn_material_duplicate_groups_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_duplicate_groups_touch_updated_at
  ON public.material_duplicate_groups;

CREATE TRIGGER trg_material_duplicate_groups_touch_updated_at
BEFORE UPDATE ON public.material_duplicate_groups
FOR EACH ROW
EXECUTE FUNCTION public.fn_material_duplicate_groups_touch_updated_at();

COMMENT ON TABLE public.material_duplicate_groups IS
  'Review-only duplicate material groups. Does not change material_id, BOM/BOQ references, or price snapshots.';

COMMENT ON TABLE public.material_duplicate_candidates IS
  'Candidate materials in a duplicate group with transparent scoring reasons.';

COMMENT ON TABLE public.material_duplicate_decisions IS
  'Owner/admin decisions for duplicate review groups. No automatic merge is performed.';
