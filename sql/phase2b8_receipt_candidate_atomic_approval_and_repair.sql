-- ============================================================
-- Phase 2B.8: Receipt material candidate atomic approval + repair
-- Keeps candidate approval in one PostgreSQL transaction and adds
-- a safe repair RPC for stale receipt item/candidate states.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.fn_receipt_item_review_status_v1(
  p_action text,
  p_material_id uuid,
  p_uom_id uuid,
  p_unit_price numeric,
  p_current_status text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_current_status = 'posted' THEN
    RETURN 'posted';
  END IF;

  IF p_action = 'ignore' THEN
    RETURN 'reviewed';
  END IF;

  IF p_action = 'create_material_needed' THEN
    RETURN 'needs_review';
  END IF;

  IF p_action = 'update_price' THEN
    IF p_material_id IS NOT NULL
       AND p_uom_id IS NOT NULL
       AND coalesce(p_unit_price, 0) > 0 THEN
      RETURN 'reviewed';
    END IF;

    RETURN 'needs_review';
  END IF;

  RETURN 'needs_review';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_append_receipt_reason_v1(
  p_existing text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_existing text := nullif(trim(coalesce(p_existing, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF v_reason IS NULL THEN
    RETURN v_existing;
  END IF;

  IF v_existing IS NULL THEN
    RETURN v_reason;
  END IF;

  IF position(v_reason in v_existing) > 0 THEN
    RETURN v_existing;
  END IF;

  RETURN v_existing || '; ' || v_reason;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_receipt_material_candidate_atomic(
  p_receipt_id uuid,
  p_candidate_id uuid,
  p_confirm_duplicate boolean DEFAULT false,
  p_actor_id uuid DEFAULT auth.uid(),
  p_candidate_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := coalesce(p_actor_id, auth.uid());
  v_receipt public.purchase_receipts%ROWTYPE;
  v_candidate public.receipt_material_candidates%ROWTYPE;
  v_item public.purchase_receipt_items%ROWTYPE;
  v_category public.mat_category%ROWTYPE;
  v_type public.material_types%ROWTYPE;
  v_uom public.mat_uom%ROWTYPE;
  v_supplier public.supplier%ROWTYPE;
  v_material_uuid uuid;
  v_material_code text;
  v_material_id text;
  v_spec_key text;
  v_aliases text[];
  v_alias text;
  v_duplicate_matches jsonb := '[]'::jsonb;
  v_duplicate_warning jsonb := NULL;
  v_warnings jsonb := '[]'::jsonb;
  v_try integer;
  v_next_action text;
  v_next_review_status text;
  v_next_uom_id uuid;
  v_next_uom_raw text;
BEGIN
  p_candidate_patch := coalesce(p_candidate_patch, '{}'::jsonb);

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT *
  INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found.';
  END IF;

  IF v_receipt.status = 'posted' THEN
    RAISE EXCEPTION 'สลิปนี้ถูกบันทึกเข้าระบบแล้ว แก้ไข Draft วัสดุไม่ได้';
  END IF;

  SELECT *
  INTO v_candidate
  FROM public.receipt_material_candidates
  WHERE id = p_candidate_id
    AND receipt_id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material candidate not found.';
  END IF;

  IF v_candidate.status = 'created' THEN
    RAISE EXCEPTION 'Draft วัสดุนี้สร้างเป็นวัสดุจริงแล้ว';
  END IF;

  SELECT *
  INTO v_item
  FROM public.purchase_receipt_items
  WHERE id = v_candidate.receipt_item_id
    AND receipt_id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt item not found.';
  END IF;

  IF v_item.review_status = 'posted' THEN
    RAISE EXCEPTION 'รายการนี้บันทึกราคาแล้ว ไม่สามารถสร้างวัสดุจาก Draft นี้ได้';
  END IF;

  IF p_candidate_patch ? 'proposed_aliases'
     AND jsonb_typeof(p_candidate_patch -> 'proposed_aliases') = 'array' THEN
    SELECT array_agg(value)
    INTO v_aliases
    FROM jsonb_array_elements_text(p_candidate_patch -> 'proposed_aliases') AS alias_values(value);
  ELSIF p_candidate_patch ? 'proposed_aliases' THEN
    v_aliases := NULL;
  ELSE
    v_aliases := v_candidate.proposed_aliases;
  END IF;

  UPDATE public.receipt_material_candidates
  SET
    proposed_mat_name_th = CASE WHEN p_candidate_patch ? 'proposed_mat_name_th' THEN nullif(trim(p_candidate_patch ->> 'proposed_mat_name_th'), '') ELSE proposed_mat_name_th END,
    proposed_mat_name_en = CASE WHEN p_candidate_patch ? 'proposed_mat_name_en' THEN nullif(trim(p_candidate_patch ->> 'proposed_mat_name_en'), '') ELSE proposed_mat_name_en END,
    proposed_category_id = CASE WHEN p_candidate_patch ? 'proposed_category_id' THEN nullif(p_candidate_patch ->> 'proposed_category_id', '')::uuid ELSE proposed_category_id END,
    proposed_material_type_id = CASE WHEN p_candidate_patch ? 'proposed_material_type_id' THEN nullif(p_candidate_patch ->> 'proposed_material_type_id', '')::uuid ELSE proposed_material_type_id END,
    proposed_code_spec_key = CASE WHEN p_candidate_patch ? 'proposed_code_spec_key' THEN nullif(upper(trim(p_candidate_patch ->> 'proposed_code_spec_key')), '') ELSE proposed_code_spec_key END,
    proposed_spec = CASE WHEN p_candidate_patch ? 'proposed_spec' THEN nullif(trim(p_candidate_patch ->> 'proposed_spec'), '') ELSE proposed_spec END,
    proposed_brand = CASE WHEN p_candidate_patch ? 'proposed_brand' THEN nullif(trim(p_candidate_patch ->> 'proposed_brand'), '') ELSE proposed_brand END,
    proposed_model = CASE WHEN p_candidate_patch ? 'proposed_model' THEN nullif(trim(p_candidate_patch ->> 'proposed_model'), '') ELSE proposed_model END,
    proposed_uom_id = CASE WHEN p_candidate_patch ? 'proposed_uom_id' THEN nullif(p_candidate_patch ->> 'proposed_uom_id', '')::uuid ELSE proposed_uom_id END,
    proposed_uom_raw = CASE WHEN p_candidate_patch ? 'proposed_uom_raw' THEN nullif(trim(p_candidate_patch ->> 'proposed_uom_raw'), '') ELSE proposed_uom_raw END,
    proposed_aliases = v_aliases,
    reviewed_by = v_actor_id,
    reviewed_at = now()
  WHERE id = p_candidate_id
    AND receipt_id = p_receipt_id
  RETURNING *
  INTO v_candidate;

  IF nullif(trim(coalesce(v_candidate.proposed_mat_name_th, '')), '') IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุชื่อวัสดุก่อนอนุมัติ';
  END IF;

  IF v_candidate.proposed_category_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกหมวดหมู่ก่อนอนุมัติ';
  END IF;

  IF v_candidate.proposed_uom_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกหน่วยนับก่อนอนุมัติ';
  END IF;

  SELECT *
  INTO v_category
  FROM public.mat_category
  WHERE id = v_candidate.proposed_category_id
    AND coalesce(is_deleted, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบหมวดหมู่';
  END IF;

  IF v_candidate.proposed_material_type_id IS NOT NULL THEN
    SELECT *
    INTO v_type
    FROM public.material_types
    WHERE id = v_candidate.proposed_material_type_id
      AND category_id = v_category.id
      AND coalesce(is_active, true) = true;
  ELSE
    SELECT *
    INTO v_type
    FROM public.material_types
    WHERE category_id = v_category.id
      AND coalesce(is_active, true) = true
    ORDER BY CASE WHEN upper(code_prefix) = 'GEN' THEN 0 ELSE 1 END, code_prefix
    LIMIT 1;

    v_warnings := v_warnings || jsonb_build_array('ไม่ได้ระบุชนิดวัสดุ ระบบใช้ชนิดวัสดุสำรองของหมวดนี้');
  END IF;

  IF v_type.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบชนิดวัสดุที่ใช้สร้างรหัสได้';
  END IF;

  SELECT *
  INTO v_uom
  FROM public.mat_uom
  WHERE id = v_candidate.proposed_uom_id
    AND coalesce(is_deleted, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบหน่วยนับ';
  END IF;

  v_spec_key := public.fn_material_code_sanitize_part(
    coalesce(v_candidate.proposed_code_spec_key, v_candidate.proposed_spec, 'GEN'),
    'GEN',
    12
  );
  IF length(v_spec_key) < 2 THEN
    v_spec_key := 'GEN';
  END IF;

  WITH candidate_values AS (
    SELECT
      public.fn_material_normalize_text(coalesce(v_candidate.proposed_mat_name_th, '') || ' ' || coalesce(v_candidate.proposed_mat_name_en, '')) AS name_key,
      public.fn_material_normalize_text(coalesce(v_candidate.proposed_spec, '') || ' ' || coalesce(v_spec_key, '')) AS spec_key
  ),
  matches AS (
    SELECT
      m.material_id,
      m.material_code,
      m.mat_name_th,
      m.spec,
      CASE
        WHEN public.fn_material_normalize_text(coalesce(m.mat_name_th, '') || ' ' || coalesce(m.mat_name_en, '')) = cv.name_key
          AND public.fn_material_normalize_text(coalesce(m.spec, '') || ' ' || coalesce(m.code_spec_key, '')) = cv.spec_key
          THEN 95
        WHEN public.fn_material_normalize_text(coalesce(m.mat_name_th, '') || ' ' || coalesce(m.mat_name_en, '')) = cv.name_key
          THEN 80
        ELSE 70
      END AS score,
      CASE
        WHEN public.fn_material_normalize_text(coalesce(m.spec, '') || ' ' || coalesce(m.code_spec_key, '')) IS DISTINCT FROM cv.spec_key
          THEN 'พบวัสดุชื่อใกล้เคียงแต่สเปกต่างกัน'
        ELSE 'พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่'
      END AS reason
    FROM public.mat_master m
    CROSS JOIN candidate_values cv
    WHERE coalesce(m.is_deleted, false) = false
      AND m.category_id = v_category.id
      AND cv.name_key <> ''
      AND (
        public.fn_material_normalize_text(coalesce(m.mat_name_th, '') || ' ' || coalesce(m.mat_name_en, '')) = cv.name_key
        OR public.fn_material_normalize_text(coalesce(m.mat_name_th, '') || ' ' || coalesce(m.mat_name_en, '')) LIKE '%' || cv.name_key || '%'
        OR cv.name_key LIKE '%' || public.fn_material_normalize_text(coalesce(m.mat_name_th, '') || ' ' || coalesce(m.mat_name_en, '')) || '%'
      )
    ORDER BY score DESC, m.created_at DESC
    LIMIT 3
  )
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'material_id', material_id,
      'material_code', material_code,
      'mat_name_th', mat_name_th,
      'spec', spec,
      'score', score,
      'reason', reason
    )),
    '[]'::jsonb
  )
  INTO v_duplicate_matches
  FROM matches;

  IF jsonb_array_length(v_duplicate_matches) > 0 THEN
    v_duplicate_warning := jsonb_build_object('matches', v_duplicate_matches);

    UPDATE public.receipt_material_candidates
    SET duplicate_warning = v_duplicate_warning
    WHERE id = p_candidate_id;

    IF NOT p_confirm_duplicate THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'DUPLICATE',
        'error', 'พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่',
        'details', jsonb_build_object(
          'requiresConfirmation', true,
          'duplicateWarning', v_duplicate_warning
        )
      );
    END IF;
  END IF;

  FOR v_try IN 1..25 LOOP
    v_material_code := public.fn_generate_material_code_v1(
      coalesce(v_category.code_prefix, v_category.cat_code),
      v_type.code_prefix,
      v_spec_key
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.mat_master m
      WHERE m.material_code = v_material_code
        AND coalesce(m.is_deleted, false) = false
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.mat_master m
    WHERE m.material_code = v_material_code
      AND coalesce(m.is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Generated material code conflicts with an existing material.';
  END IF;

  v_material_id := v_material_code;

  INSERT INTO public.mat_master (
    material_id,
    cat_id,
    mat_name_th,
    mat_name_en,
    spec,
    brand,
    base_uom,
    status,
    note,
    created_by,
    material_code,
    normalized_name,
    model,
    category_id,
    base_uom_id,
    material_type_id,
    code_spec_key,
    code_locked,
    code_generated_at,
    code_rule_version
  )
  VALUES (
    v_material_id,
    v_category.cat_id,
    trim(v_candidate.proposed_mat_name_th),
    nullif(trim(coalesce(v_candidate.proposed_mat_name_en, '')), ''),
    coalesce(v_candidate.proposed_spec, ''),
    coalesce(v_candidate.proposed_brand, ''),
    v_uom.uom_code,
    'ACTIVE',
    'Created from receipt material candidate ' || v_candidate.id::text,
    v_actor_id,
    v_material_code,
    public.fn_material_normalize_text(concat_ws(
      ' ',
      v_material_code,
      v_candidate.proposed_mat_name_th,
      v_candidate.proposed_mat_name_en,
      v_candidate.proposed_brand,
      v_candidate.proposed_model,
      v_candidate.proposed_spec
    )),
    coalesce(v_candidate.proposed_model, ''),
    v_category.id,
    v_uom.id,
    v_type.id,
    v_spec_key,
    true,
    now(),
    'v1'
  )
  RETURNING id
  INTO v_material_uuid;

  INSERT INTO public.material_code_history (
    material_id,
    old_code,
    new_code,
    change_reason,
    changed_by
  )
  VALUES (
    v_material_id,
    NULL,
    v_material_code,
    'Material code generated from receipt material candidate approval',
    v_actor_id
  );

  FOR v_alias IN
    SELECT DISTINCT nullif(trim(alias_value), '')
    FROM (
      SELECT v_item.raw_text AS alias_value
      UNION ALL SELECT v_item.item_name_raw
      UNION ALL SELECT unnest(coalesce(v_candidate.proposed_aliases, ARRAY[]::text[]))
    ) aliases
    WHERE nullif(trim(alias_value), '') IS NOT NULL
      AND nullif(trim(alias_value), '') <> v_material_code
  LOOP
    INSERT INTO public.mat_alias (
      alias_id,
      material_id,
      material_uuid,
      alias_name,
      normalized_alias,
      alias_type,
      lang,
      note,
      created_by
    )
    VALUES (
      'ALI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      v_material_id,
      v_material_uuid,
      v_alias,
      public.fn_material_normalize_text(v_alias),
      'COMMON',
      CASE WHEN v_alias ~ '[ก-๙]' THEN 'TH' ELSE 'EN' END,
      'Receipt material candidate alias',
      v_actor_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF coalesce(v_candidate.proposed_supplier_id, v_receipt.supplier_id) IS NOT NULL THEN
    SELECT *
    INTO v_supplier
    FROM public.supplier
    WHERE id = coalesce(v_candidate.proposed_supplier_id, v_receipt.supplier_id)
      AND coalesce(is_deleted, false) = false;

    IF v_supplier.id IS NOT NULL
       AND NOT EXISTS (
        SELECT 1
        FROM public.mat_supplier_map msm
        WHERE msm.material_id = v_material_id
          AND msm.supplier_id = v_supplier.supplier_id
          AND coalesce(msm.is_deleted, false) = false
      ) THEN
      INSERT INTO public.mat_supplier_map (
        material_id,
        material_uuid,
        supplier_id,
        supplier_uuid,
        supplier_material_name,
        is_preferred,
        is_active,
        note,
        created_by
      )
      VALUES (
        v_material_id,
        v_material_uuid,
        v_supplier.supplier_id,
        v_supplier.id,
        coalesce(v_item.item_name_raw, v_candidate.proposed_mat_name_th),
        true,
        true,
        'Created from receipt material candidate',
        v_actor_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  UPDATE public.receipt_material_candidates
  SET
    status = 'created',
    created_material_id = v_material_uuid,
    duplicate_warning = v_duplicate_warning,
    reviewed_by = v_actor_id,
    reviewed_at = now(),
    material_created_at = now()
  WHERE id = p_candidate_id
    AND receipt_id = p_receipt_id;

  v_next_action := CASE WHEN v_item.action = 'ignore' THEN 'ignore' ELSE 'update_price' END;
  v_next_uom_id := coalesce(v_item.uom_id, v_candidate.proposed_uom_id);
  v_next_uom_raw := coalesce(v_item.uom_raw, v_candidate.proposed_uom_raw, v_uom.uom_code);
  v_next_review_status := public.fn_receipt_item_review_status_v1(
    v_next_action,
    v_material_uuid,
    v_next_uom_id,
    coalesce(v_item.unit_price, v_candidate.proposed_unit_price),
    v_item.review_status
  );

  UPDATE public.purchase_receipt_items
  SET
    material_id = v_material_uuid,
    suggested_material_id = v_material_uuid,
    material_candidate_id = p_candidate_id,
    material_resolution_status = 'matched_existing',
    uom_id = v_next_uom_id,
    uom_raw = v_next_uom_raw,
    unit_price = coalesce(unit_price, v_candidate.proposed_unit_price),
    action = v_next_action,
    review_status = v_next_review_status,
    match_confidence = 100,
    match_reason = public.fn_append_receipt_reason_v1(match_reason, 'สร้างวัสดุใหม่จาก Draft และเลือกให้รายการนี้')
  WHERE id = v_item.id
    AND receipt_id = p_receipt_id;

  INSERT INTO public.mat_audit_log (entity_type, entity_key, action, payload, created_by)
  VALUES
    (
      'mat_master',
      v_material_id,
      'CREATE',
      jsonb_build_object(
        'source', 'receipt_material_candidate',
        'receipt_id', p_receipt_id,
        'candidate_id', p_candidate_id,
        'material_id', v_material_id,
        'material_uuid', v_material_uuid
      ),
      v_actor_id::text
    ),
    (
      'receipt_material_candidate',
      p_candidate_id::text,
      'UPDATE',
      jsonb_build_object(
        'event', 'APPROVE_CREATE_MATERIAL',
        'receipt_id', p_receipt_id,
        'receipt_item_id', v_item.id,
        'material_id', v_material_id,
        'material_uuid', v_material_uuid
      ),
      v_actor_id::text
    ),
    (
      'purchase_receipt_item',
      v_item.id::text,
      'UPDATE',
      jsonb_build_object(
        'event', 'LINK_CREATED_MATERIAL',
        'receipt_id', p_receipt_id,
        'candidate_id', p_candidate_id,
        'material_id', v_material_id,
        'material_uuid', v_material_uuid
      ),
      v_actor_id::text
    );

  RETURN jsonb_build_object(
    'ok', true,
    'material_id', v_material_uuid,
    'material_code', v_material_code,
    'candidate_id', p_candidate_id,
    'receipt_item_id', v_item.id,
    'warnings', v_warnings
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_receipt_state_v1(
  p_receipt_id uuid,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := coalesce(p_actor_id, auth.uid());
  v_receipt public.purchase_receipts%ROWTYPE;
  v_fixed_count integer := 0;
  v_changes jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  rec record;
  v_next_action text;
  v_next_status text;
  v_next_uom_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT *
  INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found.';
  END IF;

  FOR rec IN
    SELECT c.id, c.created_material_id
    FROM public.receipt_material_candidates c
    LEFT JOIN public.mat_master m ON m.id = c.created_material_id
    WHERE c.receipt_id = p_receipt_id
      AND c.status = 'created'
      AND c.created_material_id IS NOT NULL
      AND m.id IS NULL
  LOOP
    UPDATE public.receipt_material_candidates
    SET
      status = 'needs_review',
      created_material_id = NULL,
      material_created_at = NULL,
      duplicate_warning = coalesce(duplicate_warning, '{}'::jsonb) || jsonb_build_object('repair_warning', 'วัสดุที่เคยสร้างไม่พบในระบบ')
    WHERE id = rec.id;

    v_fixed_count := v_fixed_count + 1;
    v_warnings := v_warnings || jsonb_build_array('วัสดุที่เคยสร้างไม่พบในระบบ');
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'type', 'candidate_created_material_missing',
      'candidateId', rec.id,
      'materialId', rec.created_material_id
    ));
  END LOOP;

  FOR rec IN
    SELECT i.id, i.material_candidate_id
    FROM public.purchase_receipt_items i
    LEFT JOIN public.receipt_material_candidates c ON c.id = i.material_candidate_id
    WHERE i.receipt_id = p_receipt_id
      AND i.material_candidate_id IS NOT NULL
      AND c.id IS NULL
      AND i.review_status <> 'posted'
  LOOP
    UPDATE public.purchase_receipt_items
    SET
      material_candidate_id = NULL,
      material_resolution_status = 'unresolved',
      review_status = 'needs_review',
      match_reason = public.fn_append_receipt_reason_v1(match_reason, 'Draft วัสดุที่ผูกไว้ไม่พบในระบบ')
    WHERE id = rec.id;

    v_fixed_count := v_fixed_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'type', 'cleared_missing_candidate_link',
      'itemId', rec.id,
      'candidateId', rec.material_candidate_id
    ));
  END LOOP;

  FOR rec IN
    SELECT
      i.id AS item_id,
      i.material_id,
      i.material_candidate_id,
      i.action,
      i.review_status,
      i.uom_id,
      i.uom_raw,
      i.unit_price,
      i.match_reason,
      c.id AS candidate_id,
      c.status AS candidate_status,
      c.created_material_id,
      c.proposed_uom_id,
      c.proposed_uom_raw,
      m.id AS created_material_exists
    FROM public.purchase_receipt_items i
    LEFT JOIN public.receipt_material_candidates c
      ON c.id = i.material_candidate_id
      OR (c.receipt_item_id = i.id AND i.material_candidate_id IS NULL)
    LEFT JOIN public.mat_master m ON m.id = c.created_material_id
    WHERE i.receipt_id = p_receipt_id
      AND i.review_status <> 'posted'
  LOOP
    IF rec.candidate_status = 'created'
       AND rec.created_material_id IS NOT NULL
       AND rec.created_material_exists IS NOT NULL THEN
      v_next_action := CASE WHEN rec.action = 'ignore' THEN 'ignore' ELSE 'update_price' END;
      v_next_uom_id := coalesce(rec.uom_id, rec.proposed_uom_id);
      v_next_status := public.fn_receipt_item_review_status_v1(
        v_next_action,
        rec.created_material_id,
        v_next_uom_id,
        rec.unit_price,
        rec.review_status
      );

      UPDATE public.purchase_receipt_items
      SET
        material_id = rec.created_material_id,
        suggested_material_id = rec.created_material_id,
        material_candidate_id = rec.candidate_id,
        material_resolution_status = 'matched_existing',
        uom_id = v_next_uom_id,
        uom_raw = coalesce(rec.uom_raw, rec.proposed_uom_raw),
        action = v_next_action,
        review_status = v_next_status,
        match_confidence = 100,
        match_reason = public.fn_append_receipt_reason_v1(match_reason, 'ซ่อมการเชื่อม Draft วัสดุที่สร้างแล้ว')
      WHERE id = rec.item_id
        AND (
          material_id IS DISTINCT FROM rec.created_material_id
          OR suggested_material_id IS DISTINCT FROM rec.created_material_id
          OR material_candidate_id IS DISTINCT FROM rec.candidate_id
          OR material_resolution_status IS DISTINCT FROM 'matched_existing'
          OR uom_id IS DISTINCT FROM v_next_uom_id
          OR action IS DISTINCT FROM v_next_action
          OR review_status IS DISTINCT FROM v_next_status
        );

      IF FOUND THEN
        v_fixed_count := v_fixed_count + 1;
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'type', 'linked_item_to_candidate_material',
          'itemId', rec.item_id,
          'candidateId', rec.candidate_id,
          'materialId', rec.created_material_id
        ));
      END IF;
      CONTINUE;
    END IF;

    IF rec.material_id IS NOT NULL THEN
      v_next_action := CASE
        WHEN rec.action = 'ignore' THEN 'ignore'
        WHEN coalesce(rec.unit_price, 0) > 0 THEN 'update_price'
        ELSE coalesce(rec.action, 'needs_review')
      END;
      v_next_status := public.fn_receipt_item_review_status_v1(
        v_next_action,
        rec.material_id,
        rec.uom_id,
        rec.unit_price,
        rec.review_status
      );

      UPDATE public.purchase_receipt_items
      SET
        material_candidate_id = CASE WHEN rec.candidate_status = 'created' THEN rec.material_candidate_id ELSE NULL END,
        material_resolution_status = 'matched_existing',
        action = v_next_action,
        review_status = v_next_status
      WHERE id = rec.item_id
        AND (
          material_resolution_status IS DISTINCT FROM 'matched_existing'
          OR action IS DISTINCT FROM v_next_action
          OR review_status IS DISTINCT FROM v_next_status
          OR (rec.candidate_status IS DISTINCT FROM 'created' AND material_candidate_id IS NOT NULL)
        );

      IF FOUND THEN
        v_fixed_count := v_fixed_count + 1;
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'type', 'normalized_item_with_material',
          'itemId', rec.item_id,
          'materialId', rec.material_id
        ));
      END IF;
      CONTINUE;
    END IF;

    IF rec.action = 'ignore' THEN
      UPDATE public.purchase_receipt_items
      SET
        review_status = 'reviewed',
        material_resolution_status = 'ignored'
      WHERE id = rec.item_id
        AND (
          review_status IS DISTINCT FROM 'reviewed'
          OR material_resolution_status IS DISTINCT FROM 'ignored'
        );

      IF FOUND THEN
        v_fixed_count := v_fixed_count + 1;
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'type', 'normalized_ignored_item',
          'itemId', rec.item_id
        ));
      END IF;
      CONTINUE;
    END IF;

    IF rec.action = 'update_price'
       OR rec.review_status IN ('reviewed', 'ready') THEN
      UPDATE public.purchase_receipt_items
      SET
        review_status = 'needs_review',
        action = coalesce(action, 'update_price'),
        material_resolution_status = coalesce(material_resolution_status, 'unresolved'),
        match_reason = public.fn_append_receipt_reason_v1(match_reason, 'ต้องเลือกวัสดุก่อนอัปเดตราคา')
      WHERE id = rec.item_id
        AND (
          review_status IS DISTINCT FROM 'needs_review'
          OR action IS NULL
          OR material_resolution_status IS NULL
        );

      IF FOUND THEN
        v_fixed_count := v_fixed_count + 1;
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'type', 'reset_unlinked_update_item',
          'itemId', rec.item_id
        ));
      END IF;
    END IF;
  END LOOP;

  IF v_fixed_count > 0 THEN
    INSERT INTO public.mat_audit_log (entity_type, entity_key, action, payload, created_by)
    VALUES (
      'purchase_receipt',
      p_receipt_id::text,
      'UPDATE',
      jsonb_build_object(
        'event', 'REPAIR_STATE',
        'fixedCount', v_fixed_count,
        'changes', v_changes,
        'warnings', v_warnings
      ),
      v_actor_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'receiptId', p_receipt_id,
    'fixedCount', v_fixed_count,
    'warnings', v_warnings,
    'changes', v_changes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_receipt_material_candidate_atomic(uuid, uuid, boolean, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_receipt_state_v1(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_receipt_item_review_status_v1(text, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_append_receipt_reason_v1(text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.approve_receipt_material_candidate_atomic(uuid, uuid, boolean, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.repair_receipt_state_v1(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.approve_receipt_material_candidate_atomic(uuid, uuid, boolean, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_receipt_state_v1(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_receipt_item_review_status_v1(text, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_append_receipt_reason_v1(text, text) TO authenticated, service_role;
