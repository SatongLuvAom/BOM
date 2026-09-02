-- BOQ schema audit — one-result, read-only
--
-- Run this file once in the Supabase SQL Editor or with:
--   supabase db query --linked --file supabase/schema_audit.sql
--
-- The result contains only missing objects/columns/functions/RLS/bucket rows
-- plus one summary row with the public_schema_signature.
-- This file must not contain CREATE, ALTER, INSERT, UPDATE, DELETE, or DROP.

WITH
expected_objects(schema_name, object_name, object_kind, phase) AS (
  VALUES
    ('public', 'mat_uom', 'table', 'base'),
    ('public', 'mat_category', 'table', 'base'),
    ('public', 'mat_master', 'table', 'base'),
    ('public', 'mat_alias', 'table', 'base'),
    ('public', 'mat_uom_conv', 'table', 'base'),
    ('public', 'mat_audit_log', 'table', 'base'),
    ('public', 'supplier', 'table', 'base'),
    ('public', 'mat_supplier_map', 'table', 'base'),
    ('public', 'mat_price_base', 'table', 'base'),
    ('public', 'boq_project', 'table', 'base'),
    ('public', 'boq_item', 'table', 'base'),
    ('public', 'customer', 'table', 'base'),
    ('public', 'boq_attachment', 'table', 'base'),
    ('public', 'boq_comment', 'table', 'base'),
    ('public', 'boq_template', 'table', 'base'),
    ('public', 'boq_template_item', 'table', 'base'),
    ('public', 'bom_template', 'table', 'base'),
    ('public', 'bom_item', 'table', 'base'),
    ('public', 'audit_logs', 'table', 'production-hardening'),
    ('public', 'material_types', 'table', 'material-code'),
    ('public', 'material_code_sequences', 'table', 'material-code'),
    ('public', 'material_code_history', 'table', 'material-code'),
    ('public', 'material_duplicate_groups', 'table', 'duplicate-review'),
    ('public', 'material_duplicate_candidates', 'table', 'duplicate-review'),
    ('public', 'material_duplicate_decisions', 'table', 'duplicate-review'),
    ('public', 'purchase_receipts', 'table', 'receipt'),
    ('public', 'purchase_receipt_items', 'table', 'receipt'),
    ('public', 'receipt_material_candidates', 'table', 'receipt'),
    ('public', 'materials', 'view', 'material-views'),
    ('public', 'material_aliases', 'view', 'material-views'),
    ('public', 'material_suppliers', 'view', 'material-views'),
    ('public', 'price_history', 'view', 'material-views'),
    ('public', 'material_uom_conversions', 'view', 'material-views'),
    ('public', 'material_latest_prices', 'view', 'material-views'),
    ('public', 'material_quality_scores', 'view', 'material-views'),
    ('public', 'v_mat_latest_price', 'view', 'material-views'),
    ('public', 'v_phase2a9_core_qa_issues', 'view', 'quality'),
    ('storage', 'buckets', 'table', 'storage')
),
object_checks AS (
  SELECT
    'object'::text AS check_group,
    e.phase,
    e.schema_name,
    e.object_name,
    CASE e.object_kind
      WHEN 'table' THEN EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = e.schema_name
          AND c.relname = e.object_name
          AND c.relkind IN ('r', 'p', 'f')
      )
      WHEN 'view' THEN EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = e.schema_name
          AND c.relname = e.object_name
          AND c.relkind = 'v'
      )
      ELSE false
    END AS present,
    format('expected %s.%s', e.object_kind, e.object_name)::text AS details
  FROM expected_objects e
),
expected_columns(schema_name, table_name, column_name, phase) AS (
  VALUES
    ('public', 'mat_uom', 'id', 'production-hardening'),
    ('public', 'mat_category', 'id', 'production-hardening'),
    ('public', 'mat_category', 'code_prefix', 'material-code'),
    ('public', 'mat_master', 'id', 'production-hardening'),
    ('public', 'mat_master', 'material_code', 'material-code'),
    ('public', 'mat_master', 'category_id', 'material-hardening'),
    ('public', 'mat_master', 'base_uom_id', 'material-hardening'),
    ('public', 'mat_master', 'material_type_id', 'material-code'),
    ('public', 'mat_master', 'is_deleted', 'production-hardening'),
    ('public', 'mat_alias', 'material_uuid', 'material-hardening'),
    ('public', 'mat_alias', 'normalized_alias', 'material-hardening'),
    ('public', 'mat_uom_conv', 'material_uuid', 'material-hardening'),
    ('public', 'mat_supplier_map', 'material_uuid', 'material-hardening'),
    ('public', 'mat_supplier_map', 'supplier_uuid', 'material-hardening'),
    ('public', 'mat_price_base', 'material_uuid', 'material-hardening'),
    ('public', 'mat_price_base', 'supplier_uuid', 'material-hardening'),
    ('public', 'mat_price_base', 'quote_date', 'material-hardening'),
    ('public', 'mat_price_base', 'valid_until', 'material-hardening'),
    ('public', 'mat_price_base', 'source_type', 'material-hardening'),
    ('public', 'boq_project', 'customer_id', 'base'),
    ('public', 'boq_item', 'estimated_unit_price', 'production-hardening'),
    ('public', 'boq_item', 'final_unit_price', 'production-hardening'),
    ('public', 'boq_item', 'price_source', 'production-hardening'),
    ('public', 'boq_item', 'price_snapshot_at', 'production-hardening'),
    ('public', 'boq_item', 'supplier_id', 'production-hardening'),
    ('public', 'purchase_receipts', 'file_storage_path', 'receipt-ai'),
    ('public', 'purchase_receipts', 'ai_raw_text', 'receipt-ai'),
    ('public', 'purchase_receipts', 'ai_raw_json', 'receipt-ai'),
    ('public', 'purchase_receipt_items', 'material_candidate_id', 'receipt-candidate'),
    ('public', 'purchase_receipt_items', 'material_resolution_status', 'receipt-candidate')
),
column_checks AS (
  SELECT
    'column'::text AS check_group,
    e.phase,
    e.schema_name,
    e.table_name || '.' || e.column_name AS object_name,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = e.schema_name
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
    ) AS present,
    format('expected column %s.%s', e.table_name, e.column_name)::text AS details
  FROM expected_columns e
),
expected_functions(function_name, phase) AS (
  VALUES
    ('get_dashboard_stats', 'base'),
    ('get_latest_material_price', 'production-hardening'),
    ('get_material_price_history', 'production-hardening'),
    ('calculate_boq_item_total', 'production-hardening'),
    ('calculate_boq_total', 'production-hardening'),
    ('fn_material_code_preview_v1', 'material-code'),
    ('fn_generate_material_code_v1', 'material-code'),
    ('fn_apply_material_code_change_v1', 'material-code'),
    ('fn_apply_material_code_cleanup_v1', 'material-code'),
    ('delete_material_atomic', 'material-delete'),
    ('list_materials', 'material-list'),
    ('list_materials_page', 'material-list'),
    ('fn_post_purchase_receipt_to_price_history', 'receipt'),
    ('fn_post_purchase_receipt_ready_items', 'receipt'),
    ('approve_receipt_material_candidate_atomic', 'receipt-candidate'),
    ('repair_receipt_state_v1', 'receipt-candidate')
),
function_checks AS (
  SELECT
    'function'::text AS check_group,
    e.phase,
    'public'::text AS schema_name,
    e.function_name AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = e.function_name
    ) AS present,
    format('expected function public.%s', e.function_name)::text AS details
  FROM expected_functions e
),
expected_rls(schema_name, object_name, phase) AS (
  VALUES
    ('public', 'mat_uom', 'security'),
    ('public', 'mat_category', 'security'),
    ('public', 'mat_master', 'security'),
    ('public', 'mat_alias', 'security'),
    ('public', 'mat_uom_conv', 'security'),
    ('public', 'supplier', 'security'),
    ('public', 'mat_supplier_map', 'security'),
    ('public', 'mat_price_base', 'security'),
    ('public', 'boq_project', 'security'),
    ('public', 'boq_item', 'security'),
    ('public', 'customer', 'security'),
    ('public', 'boq_attachment', 'security'),
    ('public', 'boq_comment', 'security'),
    ('public', 'boq_template', 'security'),
    ('public', 'boq_template_item', 'security'),
    ('public', 'bom_template', 'security'),
    ('public', 'bom_item', 'security'),
    ('public', 'purchase_receipts', 'security'),
    ('public', 'purchase_receipt_items', 'security'),
    ('public', 'receipt_material_candidates', 'security'),
    ('storage', 'objects', 'security')
),
rls_checks AS (
  SELECT
    'rls'::text AS check_group,
    e.phase,
    e.schema_name,
    e.object_name,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = e.schema_name
        AND c.relname = e.object_name
      LIMIT 1
    ), false)
    AND EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = e.schema_name
        AND p.tablename = e.object_name
    ) AS present,
    format(
      'rls_enabled=%s; policy_count=%s',
      COALESCE((
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = e.schema_name
          AND c.relname = e.object_name
        LIMIT 1
      ), false),
      (SELECT count(*) FROM pg_policies p
       WHERE p.schemaname = e.schema_name
         AND p.tablename = e.object_name)
    )::text AS details
  FROM expected_rls e
),
material_delete_security_checks AS (
  SELECT
    'security'::text AS check_group,
    'material-delete'::text AS phase,
    'public'::text AS schema_name,
    'delete_material_atomic_security'::text AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'delete_material_atomic'
        AND p.prosecdef = true
        AND EXISTS (
          SELECT 1
          FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS config(value)
          WHERE config.value LIKE 'search_path=%public%pg_temp%'
        )
    ) AS present,
    'expected SECURITY DEFINER with fixed search_path=public,pg_temp'::text AS details

  UNION ALL

  SELECT
    'security'::text,
    'material-delete'::text,
    'public'::text,
    'delete_material_atomic_execute_grant'::text,
    coalesce(
      has_function_privilege(
        'authenticated',
        to_regprocedure('public.delete_material_atomic(text)'),
        'EXECUTE'
      ),
      false
    ),
    'expected authenticated EXECUTE grant'::text

  UNION ALL

  SELECT
    'security'::text,
    'material-delete'::text,
    'public'::text,
    'mat_master_direct_delete_revoked'::text,
    NOT has_table_privilege('authenticated', 'public.mat_master', 'DELETE'),
    'expected authenticated direct DELETE privilege to be revoked'::text
),
material_list_security_checks AS (
  SELECT
    'security'::text AS check_group,
    'material-list'::text AS phase,
    'public'::text AS schema_name,
    'list_materials_security'::text AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'list_materials'
        AND p.prosecdef = false
        AND EXISTS (
          SELECT 1
          FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS config(value)
          WHERE config.value LIKE 'search_path=%public%pg_temp%'
        )
    ) AS present,
    'expected SECURITY INVOKER with fixed search_path=public,pg_temp'::text AS details

  UNION ALL

  SELECT
    'security'::text,
    'material-list'::text,
    'public'::text,
    'list_materials_execute_grant'::text,
    coalesce(
      has_function_privilege(
        'authenticated',
        to_regprocedure('public.list_materials(text,text,text,text,text,text,text,text,integer,integer)'),
        'EXECUTE'
      ),
      false
    ),
    'expected authenticated EXECUTE grant'::text

  UNION ALL

  SELECT
    'security'::text,
    'material-list'::text,
    'public'::text,
    'list_materials_anon_execute_revoked'::text,
    NOT coalesce(
      has_function_privilege(
        'anon',
        to_regprocedure('public.list_materials(text,text,text,text,text,text,text,text,integer,integer)'),
        'EXECUTE'
      ),
      false
    ),
    'expected anon EXECUTE privilege to be revoked'::text

  UNION ALL

  SELECT
    'security'::text,
    'material-list'::text,
    'public'::text,
    'list_materials_page_security'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'list_materials_page'
        AND p.prosecdef = false
        AND EXISTS (
          SELECT 1
          FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS config(value)
          WHERE config.value LIKE 'search_path=%public%pg_temp%'
        )
    ),
    'expected SECURITY INVOKER with fixed search_path=public,pg_temp'::text

  UNION ALL

  SELECT
    'security'::text,
    'material-list'::text,
    'public'::text,
    'list_materials_page_execute_grant'::text,
    coalesce(
      has_function_privilege(
        'authenticated',
        to_regprocedure('public.list_materials_page(text,text,text,text,text,text,text,text,integer,integer)'),
        'EXECUTE'
      ),
      false
    ),
    'expected authenticated EXECUTE grant'::text

  UNION ALL

  SELECT
    'security'::text,
    'material-list'::text,
    'public'::text,
    'list_materials_page_anon_execute_revoked'::text,
    NOT coalesce(
      has_function_privilege(
        'anon',
        to_regprocedure('public.list_materials_page(text,text,text,text,text,text,text,text,integer,integer)'),
        'EXECUTE'
      ),
      false
    ),
    'expected anon EXECUTE privilege to be revoked'::text
),
bucket_checks AS (
  SELECT
    'storage'::text AS check_group,
    'storage'::text AS phase,
    'storage'::text AS schema_name,
    'boq-attachments'::text AS object_name,
    EXISTS (
      SELECT 1
      FROM storage.buckets b
      WHERE b.id = 'boq-attachments'
    ) AS present,
    COALESCE((
      SELECT format('public=%s; file_size_limit=%s', b.public, b.file_size_limit)
      FROM storage.buckets b
      WHERE b.id = 'boq-attachments'
    ), 'bucket missing')::text AS details
),
summary_checks AS (
  SELECT
    'summary'::text AS check_group,
    'schema'::text AS phase,
    'public'::text AS schema_name,
    'public_schema_signature'::text AS object_name,
    true AS present,
    format(
      'public_relation_count=%s; public_column_count=%s; public_schema_signature=%s',
      (SELECT count(DISTINCT table_name)
       FROM information_schema.columns
       WHERE table_schema = 'public'),
      (SELECT count(*)
       FROM information_schema.columns
       WHERE table_schema = 'public'),
      md5(coalesce((
        SELECT string_agg(
          format('%s.%s:%s:%s:%s', table_schema, table_name, ordinal_position,
                 column_name, data_type),
          '|' ORDER BY table_schema, table_name, ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
      ), ''))
    )::text AS details
),
all_checks AS (
  SELECT * FROM object_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM function_checks
  UNION ALL SELECT * FROM rls_checks
  UNION ALL SELECT * FROM material_delete_security_checks
  UNION ALL SELECT * FROM material_list_security_checks
  UNION ALL SELECT * FROM bucket_checks
  UNION ALL SELECT * FROM summary_checks
)
SELECT check_group, phase, schema_name, object_name, present, details
FROM all_checks
WHERE check_group = 'summary' OR present = false
ORDER BY
  CASE WHEN check_group = 'summary' THEN 0 ELSE 1 END,
  check_group,
  phase,
  schema_name,
  object_name;
