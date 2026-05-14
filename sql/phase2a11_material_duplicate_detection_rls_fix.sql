-- ============================================================
-- Phase 2A.11 - Material Duplicate Detection RLS Fix
-- ============================================================
-- The duplicate review tables are only used behind protected app/API routes.
-- Keep them accessible to authenticated Supabase users while unauthenticated
-- users remain blocked by RLS.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.material_duplicate_groups,
     public.material_duplicate_candidates,
     public.material_duplicate_decisions
  TO authenticated;

ALTER TABLE public.material_duplicate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_duplicate_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_duplicate_groups_authenticated_select
  ON public.material_duplicate_groups;
CREATE POLICY material_duplicate_groups_authenticated_select
  ON public.material_duplicate_groups
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_duplicate_groups_authenticated_insert
  ON public.material_duplicate_groups;
CREATE POLICY material_duplicate_groups_authenticated_insert
  ON public.material_duplicate_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_groups_authenticated_update
  ON public.material_duplicate_groups;
CREATE POLICY material_duplicate_groups_authenticated_update
  ON public.material_duplicate_groups
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_groups_authenticated_delete
  ON public.material_duplicate_groups;
CREATE POLICY material_duplicate_groups_authenticated_delete
  ON public.material_duplicate_groups
  FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_duplicate_candidates_authenticated_select
  ON public.material_duplicate_candidates;
CREATE POLICY material_duplicate_candidates_authenticated_select
  ON public.material_duplicate_candidates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_duplicate_candidates_authenticated_insert
  ON public.material_duplicate_candidates;
CREATE POLICY material_duplicate_candidates_authenticated_insert
  ON public.material_duplicate_candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_candidates_authenticated_update
  ON public.material_duplicate_candidates;
CREATE POLICY material_duplicate_candidates_authenticated_update
  ON public.material_duplicate_candidates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_candidates_authenticated_delete
  ON public.material_duplicate_candidates;
CREATE POLICY material_duplicate_candidates_authenticated_delete
  ON public.material_duplicate_candidates
  FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_duplicate_decisions_authenticated_select
  ON public.material_duplicate_decisions;
CREATE POLICY material_duplicate_decisions_authenticated_select
  ON public.material_duplicate_decisions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_duplicate_decisions_authenticated_insert
  ON public.material_duplicate_decisions;
CREATE POLICY material_duplicate_decisions_authenticated_insert
  ON public.material_duplicate_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_decisions_authenticated_update
  ON public.material_duplicate_decisions;
CREATE POLICY material_duplicate_decisions_authenticated_update
  ON public.material_duplicate_decisions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_duplicate_decisions_authenticated_delete
  ON public.material_duplicate_decisions;
CREATE POLICY material_duplicate_decisions_authenticated_delete
  ON public.material_duplicate_decisions
  FOR DELETE
  TO authenticated
  USING (true);
