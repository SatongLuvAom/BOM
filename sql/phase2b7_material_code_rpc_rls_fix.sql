-- Phase 2B.7 - Material code RPC/RLS hardening
-- Fixes authenticated app calls to Material Code Standard v1 RPCs when
-- material_code_sequences/material_code_history have RLS enabled.

ALTER FUNCTION public.fn_material_code_preview_v1(text, text, text)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_generate_material_code_v1(text, text, text)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_apply_material_code_change_v1(text, uuid, text, text, uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION public.fn_apply_material_code_cleanup_v1(jsonb, uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_material_code_preview_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_generate_material_code_v1(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_apply_material_code_change_v1(text, uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_apply_material_code_cleanup_v1(jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_material_code_preview_v1(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_generate_material_code_v1(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_apply_material_code_change_v1(text, uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_apply_material_code_cleanup_v1(jsonb, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.fn_material_code_preview_v1(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_material_code_v1(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_apply_material_code_change_v1(text, uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_apply_material_code_cleanup_v1(jsonb, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'material_code_sequences'
      AND policyname = 'material_code_sequences_authenticated_select'
  ) THEN
    CREATE POLICY material_code_sequences_authenticated_select
      ON public.material_code_sequences
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'material_code_history'
      AND policyname = 'material_code_history_authenticated_select'
  ) THEN
    CREATE POLICY material_code_history_authenticated_select
      ON public.material_code_history
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'material_code_history'
      AND policyname = 'material_code_history_authenticated_insert'
  ) THEN
    CREATE POLICY material_code_history_authenticated_insert
      ON public.material_code_history
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;
