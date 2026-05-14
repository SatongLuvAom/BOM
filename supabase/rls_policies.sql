-- ============================================================
-- BOQ SYSTEM - RLS Policies
-- Run after setup_complete.sql for existing projects.
-- ============================================================

-- Policy strategy:
-- - anon role: no direct table access.
-- - authenticated role: app users can read, insert, and update app tables.
-- - table DELETE is intentionally not granted because the app uses soft delete via UPDATE.
-- - service_role still bypasses RLS for server-only integrations such as LINE lookup.
-- - There is no row ownership model yet because current tables do not have owner/team columns.

REVOKE USAGE ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  app_table text;
  app_tables text[] := ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'mat_audit_log',
    'boq_project',
    'boq_item',
    'customer',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'bom_template',
    'bom_item'
  ];
  mutable_tables text[] := ARRAY[
    'mat_uom',
    'mat_category',
    'mat_master',
    'mat_alias',
    'mat_uom_conv',
    'supplier',
    'mat_supplier_map',
    'mat_price_base',
    'boq_project',
    'boq_item',
    'customer',
    'boq_attachment',
    'boq_comment',
    'boq_template',
    'boq_template_item',
    'bom_template',
    'bom_item'
  ];
BEGIN
  FOREACH app_table IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', app_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', app_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', app_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_select', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_insert', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_update', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_delete', app_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'authenticated_all', app_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.role() = %L)',
      'authenticated_select',
      app_table,
      'authenticated'
    );
  END LOOP;

  FOREACH app_table IN ARRAY mutable_tables LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('GRANT INSERT, UPDATE ON TABLE public.%I TO authenticated', app_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.role() = %L)',
      'authenticated_insert',
      app_table,
      'authenticated'
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.role() = %L) WITH CHECK (auth.role() = %L)',
      'authenticated_update',
      app_table,
      'authenticated',
      'authenticated'
    );
  END LOOP;

  IF to_regclass('public.mat_audit_log') IS NOT NULL THEN
    EXECUTE 'GRANT INSERT ON TABLE public.mat_audit_log TO authenticated';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.role() = %L)',
      'authenticated_insert',
      'mat_audit_log',
      'authenticated'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.mat_audit_log_audit_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.mat_audit_log_audit_id_seq FROM anon;
    GRANT USAGE, SELECT ON SEQUENCE public.mat_audit_log_audit_id_seq TO authenticated;
  END IF;

  IF to_regclass('public.v_mat_latest_price') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.v_mat_latest_price FROM anon;
    GRANT SELECT ON TABLE public.v_mat_latest_price TO authenticated;
    ALTER VIEW public.v_mat_latest_price SET (security_invoker = true);
  END IF;
END $$;

-- Storage RLS for BOQ attachments.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('boq-attachments', 'boq-attachments', false, 20971520)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "boq attachments select" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments insert" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments update" ON storage.objects;
DROP POLICY IF EXISTS "boq attachments delete" ON storage.objects;

CREATE POLICY "boq attachments select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "boq attachments delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'boq-attachments' AND auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
