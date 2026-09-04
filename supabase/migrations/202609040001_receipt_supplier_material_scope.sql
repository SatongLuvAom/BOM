-- Requires phase2b receipt tables, phase2a UUIDs, and phase2b8 atomic candidate approval.
-- Phase 1: apply before the application release; old item writes/approval remain available.
-- After the new application is live, apply 202609040002_receipt_supplier_material_scope_enforce.sql.
-- Existing rows are deliberately not backfilled: unposted selections must be reviewed.
BEGIN;

ALTER TABLE public.purchase_receipt_items
  ADD COLUMN IF NOT EXISTS material_supplier_id uuid REFERENCES public.supplier(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.guard_receipt_material_supplier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_supplier uuid;
BEGIN
  IF NEW.material_id IS NULL OR NEW.action = 'ignore' THEN RETURN NEW; END IF;
  -- Serialize with supplier changes and the existing posting RPCs.
  SELECT supplier_id INTO v_supplier FROM public.purchase_receipts WHERE id = NEW.receipt_id FOR UPDATE;
  IF v_supplier IS NULL OR NEW.material_supplier_id IS DISTINCT FROM v_supplier THEN
    RAISE EXCEPTION 'ร้านของสลิปเปลี่ยนหรือยังไม่ได้ยืนยันวัสดุ กรุณาเลือกวัสดุใหม่';
  END IF;
  PERFORM 1 FROM public.mat_supplier_map msm
    JOIN public.supplier s ON s.supplier_id = msm.supplier_id AND s.id = v_supplier
    JOIN public.mat_master m ON m.material_id = msm.material_id AND m.id = NEW.material_id
    WHERE msm.is_active AND NOT msm.is_deleted AND NOT s.is_deleted AND NOT m.is_deleted
      AND s.status = 'ACTIVE' AND m.status = 'ACTIVE'
      AND msm.supplier_uuid = s.id
      AND (msm.material_uuid IS NULL OR msm.material_uuid = m.id)
    FOR SHARE OF msm, s, m;
  IF NOT FOUND THEN RAISE EXCEPTION 'วัสดุยังไม่ได้ผูกกับร้านนี้ หรือถูกปิดใช้งาน กรุณาตรวจสอบใหม่'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_receipt_materials_on_supplier_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.supplier_id IS NOT DISTINCT FROM NEW.supplier_id THEN RETURN NEW; END IF;
  IF OLD.status = 'posted' OR EXISTS (
    SELECT 1 FROM public.purchase_receipt_items WHERE receipt_id = NEW.id AND review_status = 'posted'
  ) THEN RAISE EXCEPTION 'มีรายการบันทึกราคาแล้ว เปลี่ยนร้านของสลิปนี้ไม่ได้'; END IF;

  UPDATE public.receipt_material_candidates SET proposed_supplier_id = NEW.supplier_id
    WHERE receipt_id = NEW.id AND status <> 'created';
  UPDATE public.purchase_receipt_items SET
    material_id = NULL, suggested_material_id = NULL, material_supplier_id = NULL,
    material_resolution_status = 'unresolved', match_confidence = NULL,
    match_reason = 'เปลี่ยนร้าน กรุณาตรวจและเลือกวัสดุใหม่',
    review_status = CASE WHEN action = 'ignore' THEN 'reviewed' ELSE 'needs_review' END,
    action = CASE WHEN action = 'ignore' THEN 'ignore' ELSE 'needs_review' END
    WHERE receipt_id = NEW.id AND review_status <> 'posted';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_supplier_change ON public.purchase_receipts;
CREATE TRIGGER trg_receipt_supplier_change AFTER UPDATE OF supplier_id ON public.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reset_receipt_materials_on_supplier_change();

CREATE OR REPLACE FUNCTION public.update_receipt_item_scoped(
  p_receipt_id uuid, p_item_id uuid, p_expected_supplier_id uuid,
  p_patch jsonb, p_confirm_supplier_link boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_receipt public.purchase_receipts%ROWTYPE;
  v_item public.purchase_receipt_items%ROWTYPE;
  v_supplier public.supplier%ROWTYPE;
  v_material public.mat_master%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_receipt FROM public.purchase_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_receipt.supplier_id IS DISTINCT FROM p_expected_supplier_id THEN
    RAISE EXCEPTION 'ร้านของสลิปเปลี่ยนแล้ว กรุณารีเฟรชและเลือกวัสดุใหม่';
  END IF;
  IF v_receipt.status = 'posted' THEN RAISE EXCEPTION 'สลิปนี้บันทึกราคาแล้ว'; END IF;
  SELECT * INTO v_item FROM public.purchase_receipt_items WHERE id = p_item_id AND receipt_id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt item not found'; END IF;
  IF v_item.review_status = 'posted' THEN RAISE EXCEPTION 'รายการนี้บันทึกราคาแล้ว'; END IF;
  v_item := jsonb_populate_record(v_item, p_patch);

  IF v_item.material_id IS NOT NULL AND v_item.action IS DISTINCT FROM 'ignore' THEN
    SELECT * INTO v_supplier FROM public.supplier
      WHERE id = v_receipt.supplier_id AND NOT is_deleted AND status = 'ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'กรุณายืนยันร้านที่ยังใช้งานอยู่'; END IF;
    SELECT * INTO v_material FROM public.mat_master
      WHERE id = v_item.material_id AND NOT is_deleted AND status = 'ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบวัสดุที่ยังใช้งานอยู่'; END IF;
    PERFORM 1 FROM public.mat_supplier_map
      WHERE supplier_id = v_supplier.supplier_id AND material_id = v_material.material_id
        AND supplier_uuid = v_supplier.id AND (material_uuid IS NULL OR material_uuid = v_material.id)
        AND is_active AND NOT is_deleted FOR SHARE;
    IF NOT FOUND THEN
      IF p_confirm_supplier_link IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'วัสดุยังไม่ได้ผูกกับร้านนี้ กรุณายืนยันผูกก่อนเลือก';
      END IF;
      INSERT INTO public.mat_supplier_map(material_id, material_uuid, supplier_id, supplier_uuid, supplier_material_name, is_active, is_deleted)
      VALUES(v_material.material_id, v_material.id, v_supplier.supplier_id, v_supplier.id, v_item.item_name_raw, true, false)
      ON CONFLICT(material_id, supplier_id) DO UPDATE SET
        material_uuid = EXCLUDED.material_uuid, supplier_uuid = EXCLUDED.supplier_uuid,
        is_active = true, is_deleted = false, deleted_at = NULL;
      INSERT INTO public.mat_audit_log(entity_type, entity_key, action, payload, created_by)
      VALUES('purchase_receipt_item', p_item_id::text, 'UPDATE',
        jsonb_build_object('event', 'CONFIRM_SUPPLIER_MATERIAL', 'receipt_id', p_receipt_id, 'supplier_id', v_supplier.id, 'material_id', v_material.id), auth.uid());
    END IF;
  END IF;

  -- Explicit column list: never accept privileged fields (receipt_id, posted status, timestamps) from JSON.
  UPDATE public.purchase_receipt_items SET
    line_no = v_item.line_no, raw_text = v_item.raw_text, item_name_raw = v_item.item_name_raw,
    item_name_normalized = v_item.item_name_normalized, qty = v_item.qty, uom_raw = v_item.uom_raw,
    uom_id = v_item.uom_id, unit_price = v_item.unit_price, line_total = v_item.line_total,
    vat_amount = v_item.vat_amount, discount_amount = v_item.discount_amount,
    material_id = v_item.material_id,
    material_supplier_id = CASE WHEN v_item.material_id IS NOT NULL THEN v_receipt.supplier_id END,
    suggested_material_id = v_item.suggested_material_id, material_candidate_id = v_item.material_candidate_id,
    material_resolution_status = v_item.material_resolution_status,
    match_confidence = v_item.match_confidence, match_reason = v_item.match_reason, action = v_item.action,
    review_status = public.fn_receipt_item_review_status_v1(v_item.action, v_item.material_id, v_item.uom_id, v_item.unit_price, NULL)
    WHERE id = p_item_id AND receipt_id = p_receipt_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_receipt_material_candidate_scoped(
  p_receipt_id uuid, p_candidate_id uuid, p_expected_supplier_id uuid,
  p_confirm_duplicate boolean DEFAULT false, p_actor_id uuid DEFAULT auth.uid(), p_candidate_patch jsonb DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_supplier uuid; v_item_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT supplier_id INTO v_supplier FROM public.purchase_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_supplier IS NULL OR v_supplier IS DISTINCT FROM p_expected_supplier_id THEN
    RAISE EXCEPTION 'ร้านของสลิปเปลี่ยนหรือยังไม่ยืนยัน กรุณารีเฟรชก่อนสร้างวัสดุ';
  END IF;
  SELECT receipt_item_id INTO v_item_id FROM public.receipt_material_candidates
    WHERE id = p_candidate_id AND receipt_id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material candidate not found'; END IF;
  UPDATE public.receipt_material_candidates SET proposed_supplier_id = v_supplier WHERE id = p_candidate_id;
  UPDATE public.purchase_receipt_items SET material_supplier_id = v_supplier
    WHERE id = v_item_id AND receipt_id = p_receipt_id AND material_id IS NULL AND review_status <> 'posted';
  IF NOT FOUND THEN RAISE EXCEPTION 'รายการนี้เลือกวัสดุหรือบันทึกราคาแล้ว กรุณารีเฟรช'; END IF;
  RETURN public.approve_receipt_material_candidate_atomic(p_receipt_id,p_candidate_id,p_confirm_duplicate,p_actor_id,p_candidate_patch);
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
      i.material_supplier_id,
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
      c.proposed_supplier_id,
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
    -- Repair cannot stand in for the user's confirmation after migration or a shop change.
    IF (rec.material_id IS NOT NULL OR rec.candidate_status = 'created')
       AND (
         v_receipt.supplier_id IS NULL
         OR rec.material_supplier_id IS DISTINCT FROM v_receipt.supplier_id
         OR (rec.candidate_status = 'created' AND rec.proposed_supplier_id IS DISTINCT FROM v_receipt.supplier_id)
       ) THEN
      v_warnings := v_warnings || jsonb_build_array('รายการ ' || rec.item_id::text || ': กรุณาเลือกวัสดุและยืนยันร้านใหม่');
      CONTINUE;
    END IF;

    IF rec.candidate_status = 'created'
       AND rec.created_material_id IS NOT NULL
       AND rec.created_material_exists IS NOT NULL
       AND (rec.material_id IS NULL OR rec.material_id = rec.created_material_id) THEN
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

REVOKE ALL ON FUNCTION public.guard_receipt_material_supplier() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_receipt_materials_on_supplier_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_receipt_item_scoped(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_receipt_item_scoped(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_receipt_material_candidate_scoped(uuid,uuid,uuid,boolean,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_receipt_material_candidate_scoped(uuid,uuid,uuid,boolean,uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
