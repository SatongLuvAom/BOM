-- ============================================================
-- Phase 2A.12 - Material Types RLS Fix
-- ============================================================
-- Material type settings and material create/edit pages are protected by
-- Supabase Auth in the app. These policies let authenticated users read and
-- manage material type options through the protected app/API routes.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.material_types
  TO authenticated;

ALTER TABLE public.material_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_types_authenticated_select
  ON public.material_types;
CREATE POLICY material_types_authenticated_select
  ON public.material_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS material_types_authenticated_insert
  ON public.material_types;
CREATE POLICY material_types_authenticated_insert
  ON public.material_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS material_types_authenticated_update
  ON public.material_types;
CREATE POLICY material_types_authenticated_update
  ON public.material_types
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_types_authenticated_delete
  ON public.material_types;
CREATE POLICY material_types_authenticated_delete
  ON public.material_types
  FOR DELETE
  TO authenticated
  USING (true);
