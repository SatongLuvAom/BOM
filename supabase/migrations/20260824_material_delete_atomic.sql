-- ============================================================
-- Atomic Material Delete
-- Run after the current material hardening migrations.
--
-- The function keeps the existing hard-delete behavior, but moves
-- all related deletes and audit writes into one PostgreSQL transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_material_atomic(
  p_material_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_material public.mat_master%ROWTYPE;
  v_material_key text;
  v_bom_count bigint := 0;
  v_boq_count bigint := 0;
  v_prices jsonb := '[]'::jsonb;
  v_supplier_mappings jsonb := '[]'::jsonb;
  v_aliases jsonb := '[]'::jsonb;
  v_uom_conversions jsonb := '[]'::jsonb;
  v_audit_payload jsonb;
  v_deleted_prices integer := 0;
  v_deleted_supplier_mappings integer := 0;
  v_deleted_aliases integer := 0;
  v_deleted_uom_conversions integer := 0;
  v_deleted_materials integer := 0;
  v_constraint_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication required.';
  END IF;

  SELECT m.*
  INTO v_material
  FROM public.mat_master m
  WHERE m.material_id = p_material_id
    AND coalesce(m.is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'NOT_FOUND'
    );
  END IF;

  SELECT count(*)
  INTO v_bom_count
  FROM public.bom_item bi
  WHERE bi.material_id = v_material.material_id;

  SELECT count(*)
  INTO v_boq_count
  FROM public.boq_item qi
  WHERE qi.material_id = v_material.material_id;

  IF v_bom_count > 0 OR v_boq_count > 0 THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'RELATION_IN_USE',
      'counts', jsonb_build_object(
        'bom_items', v_bom_count,
        'boq_items', v_boq_count
      )
    );
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.effective_date DESC), '[]'::jsonb)
  INTO v_prices
  FROM public.mat_price_base p
  WHERE p.material_id = v_material.material_id
     OR p.material_uuid = v_material.id;

  SELECT coalesce(jsonb_agg(to_jsonb(msm) ORDER BY msm.supplier_id), '[]'::jsonb)
  INTO v_supplier_mappings
  FROM public.mat_supplier_map msm
  WHERE msm.material_id = v_material.material_id
     OR msm.material_uuid = v_material.id;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.alias_name), '[]'::jsonb)
  INTO v_aliases
  FROM public.mat_alias a
  WHERE a.material_id = v_material.material_id
     OR a.material_uuid = v_material.id;

  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.from_uom, c.to_uom), '[]'::jsonb)
  INTO v_uom_conversions
  FROM public.mat_uom_conv c
  WHERE c.material_id = v_material.material_id
     OR c.material_uuid = v_material.id;

  v_material_key := coalesce(to_jsonb(v_material)->>'material_code', v_material.material_id);
  v_audit_payload := jsonb_build_object(
    'material', to_jsonb(v_material),
    'aliases', v_aliases,
    'supplier_mappings', v_supplier_mappings,
    'price_history', v_prices,
    'uom_conversions', v_uom_conversions
  );

  -- This nested block is a PostgreSQL subtransaction. A foreign-key
  -- failure rolls back every child delete before returning the reason.
  BEGIN
    DELETE FROM public.mat_price_base p
    WHERE p.material_id = v_material.material_id
       OR p.material_uuid = v_material.id;
    GET DIAGNOSTICS v_deleted_prices = ROW_COUNT;

    DELETE FROM public.mat_supplier_map msm
    WHERE msm.material_id = v_material.material_id
       OR msm.material_uuid = v_material.id;
    GET DIAGNOSTICS v_deleted_supplier_mappings = ROW_COUNT;

    DELETE FROM public.mat_alias a
    WHERE a.material_id = v_material.material_id
       OR a.material_uuid = v_material.id;
    GET DIAGNOSTICS v_deleted_aliases = ROW_COUNT;

    DELETE FROM public.mat_uom_conv c
    WHERE c.material_id = v_material.material_id
       OR c.material_uuid = v_material.id;
    GET DIAGNOSTICS v_deleted_uom_conversions = ROW_COUNT;

    DELETE FROM public.mat_master m
    WHERE m.material_id = v_material.material_id;
    GET DIAGNOSTICS v_deleted_materials = ROW_COUNT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      RETURN jsonb_build_object(
        'deleted', false,
        'reason', 'RELATION_IN_USE',
        'constraint', nullif(v_constraint_name, ''),
        'counts', jsonb_build_object(
          'bom_items', v_bom_count,
          'boq_items', v_boq_count
        )
      );
  END;

  IF v_deleted_materials <> 1 THEN
    RAISE EXCEPTION 'Atomic material delete affected % material rows.', v_deleted_materials;
  END IF;

  INSERT INTO public.mat_audit_log (
    entity_type,
    entity_key,
    action,
    payload,
    created_by
  )
  VALUES (
    'mat_master',
    v_material_key,
    'DELETE',
    v_audit_payload,
    v_actor_id::text
  );

  -- audit_logs is part of the production-hardening path, but keep the
  -- migration compatible with older databases that only have mat_audit_log.
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE
      'INSERT INTO public.audit_logs
        (entity_type, entity_id, action, old_value, new_value, note)
       VALUES ($1, NULL, $2, $3, NULL, $4)'
    USING 'mat_master', 'DELETE', v_audit_payload, v_material_key;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'material_id', v_material.material_id,
    'material_key', v_material_key,
    'deleted_counts', jsonb_build_object(
      'materials', v_deleted_materials,
      'prices', v_deleted_prices,
      'supplier_mappings', v_deleted_supplier_mappings,
      'aliases', v_deleted_aliases,
      'uom_conversions', v_deleted_uom_conversions
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_material_atomic(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_material_atomic(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_material_atomic(text) TO authenticated;

-- Prevent authenticated clients from bypassing the transaction with a
-- direct DELETE. The SECURITY DEFINER function remains the delete boundary.
REVOKE DELETE ON TABLE public.mat_master FROM authenticated;

COMMENT ON FUNCTION public.delete_material_atomic(text) IS
  'Atomically deletes one unused material, its direct child rows, and audit records.';

NOTIFY pgrst, 'reload schema';
