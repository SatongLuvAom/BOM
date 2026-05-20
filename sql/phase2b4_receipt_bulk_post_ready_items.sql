-- Phase 2B.4 Receipt Import: bulk post only ready receipt items.
-- Safe and additive: uses existing purchase_receipt_items.review_status = 'posted'
-- as the item-level posted marker, so no production columns are renamed/dropped.

CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_ready_post
  ON public.purchase_receipt_items(receipt_id, action, review_status)
  WHERE action = 'update_price';

CREATE OR REPLACE FUNCTION public.fn_post_purchase_receipt_ready_items(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt public.purchase_receipts%ROWTYPE;
  v_posted_count integer := 0;
  v_skipped_count integer := 0;
  v_skipped_reasons jsonb := '[]'::jsonb;
  v_finalized boolean := false;
BEGIN
  SELECT *
  INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  IF v_receipt.status = 'posted' THEN
    RAISE EXCEPTION 'Receipt is already posted';
  END IF;

  IF v_receipt.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required before posting receipt prices';
  END IF;

  SELECT
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', i.id,
          'line_no', i.line_no,
          'item_name', i.item_name_raw,
          'reason',
            CASE
              WHEN i.review_status = 'posted' THEN 'บันทึกแล้ว'
              WHEN i.action IS DISTINCT FROM 'update_price' THEN 'ไม่ได้เลือกอัปเดตราคา'
              WHEN i.review_status IS DISTINCT FROM 'reviewed' THEN 'ยังต้องตรวจสอบ'
              WHEN i.material_id IS NULL THEN 'ยังไม่ได้เลือกวัสดุ'
              WHEN NOT EXISTS (
                SELECT 1 FROM public.mat_master m
                WHERE m.id = i.material_id AND coalesce(m.is_deleted, false) = false
              ) THEN 'วัสดุไม่ถูกต้อง'
              WHEN i.uom_id IS NULL THEN 'ยังไม่มีหน่วย'
              WHEN NOT EXISTS (
                SELECT 1 FROM public.mat_uom u
                WHERE u.id = i.uom_id AND coalesce(u.is_deleted, false) = false
              ) THEN 'หน่วยไม่ถูกต้อง'
              WHEN i.unit_price IS NULL OR i.unit_price <= 0 THEN 'ยังไม่มีราคา'
              ELSE 'ข้อมูลยังไม่ครบ'
            END
        )
        ORDER BY i.line_no NULLS LAST, i.created_at
      ),
      '[]'::jsonb
    )
  INTO v_skipped_count, v_skipped_reasons
  FROM public.purchase_receipt_items i
  WHERE i.receipt_id = p_receipt_id
    AND i.review_status <> 'posted'
    AND NOT (
      i.action = 'update_price'
      AND i.review_status = 'reviewed'
      AND i.material_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mat_master m
        WHERE m.id = i.material_id AND coalesce(m.is_deleted, false) = false
      )
      AND i.uom_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.mat_uom u
        WHERE u.id = i.uom_id AND coalesce(u.is_deleted, false) = false
      )
      AND i.unit_price IS NOT NULL
      AND i.unit_price > 0
    );

  WITH ready AS (
    SELECT
      i.id AS item_id,
      i.qty,
      i.uom_raw,
      i.unit_price,
      i.line_no,
      i.item_name_raw,
      m.material_id,
      m.id AS material_uuid,
      m.base_uom,
      s.supplier_id,
      s.id AS supplier_uuid,
      u.id AS uom_id,
      u.uom_code
    FROM public.purchase_receipt_items i
    JOIN public.mat_master m
      ON m.id = i.material_id
     AND coalesce(m.is_deleted, false) = false
    JOIN public.supplier s
      ON s.id = v_receipt.supplier_id
     AND coalesce(s.is_deleted, false) = false
    JOIN public.mat_uom u
      ON u.id = i.uom_id
     AND coalesce(u.is_deleted, false) = false
    WHERE i.receipt_id = p_receipt_id
      AND i.action = 'update_price'
      AND i.review_status = 'reviewed'
      AND i.material_id IS NOT NULL
      AND i.uom_id IS NOT NULL
      AND i.unit_price IS NOT NULL
      AND i.unit_price > 0
    FOR UPDATE OF i SKIP LOCKED
  ),
  inserted AS (
    INSERT INTO public.mat_price_base (
      material_id,
      material_uuid,
      supplier_id,
      supplier_uuid,
      effective_date,
      quote_date,
      valid_until,
      price_uom,
      price_uom_id,
      unit_price,
      currency_code,
      min_order_qty,
      lead_time_days,
      is_tax_included,
      vat_included,
      delivery_included,
      source_type,
      source_note,
      attachment_url,
      created_by,
      updated_by
    )
    SELECT
      ready.material_id,
      ready.material_uuid,
      ready.supplier_id,
      ready.supplier_uuid,
      coalesce(v_receipt.receipt_date, current_date),
      coalesce(v_receipt.receipt_date, current_date),
      NULL::date,
      coalesce(nullif(ready.uom_code, ''), nullif(upper(trim(ready.uom_raw)), ''), nullif(ready.base_uom, '')),
      ready.uom_id,
      ready.unit_price,
      'THB',
      coalesce(ready.qty, 0),
      0,
      true,
      true,
      false,
      'receipt',
      concat_ws(
        ' | ',
        'Receipt Import v1',
        nullif(v_receipt.receipt_no, ''),
        nullif(v_receipt.supplier_name_raw, ''),
        concat('line ', coalesce(ready.line_no::text, ready.item_id::text))
      ),
      v_receipt.file_url,
      p_user_id,
      p_user_id
    FROM ready
    RETURNING id
  ),
  updated AS (
    UPDATE public.purchase_receipt_items i
    SET review_status = 'posted',
        updated_at = now()
    FROM ready
    WHERE i.id = ready.item_id
    RETURNING i.id
  )
  SELECT count(*) INTO v_posted_count FROM inserted;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_receipt_items i
    WHERE i.receipt_id = p_receipt_id
      AND (
        i.action IS NULL
        OR i.action = 'needs_review'
        OR i.review_status = 'needs_review'
        OR (i.action = 'update_price' AND i.review_status <> 'posted')
      )
  ) THEN
    UPDATE public.purchase_receipts
    SET status = 'posted',
        posted_by = p_user_id,
        posted_at = now(),
        updated_at = now()
    WHERE id = p_receipt_id;
    v_finalized := true;
  ELSE
    UPDATE public.purchase_receipts
    SET status = CASE
          WHEN EXISTS (
            SELECT 1 FROM public.purchase_receipt_items i
            WHERE i.receipt_id = p_receipt_id
              AND (
                i.action IS NULL
                OR i.action = 'needs_review'
                OR i.review_status = 'needs_review'
              )
          )
          THEN 'needs_review'
          ELSE 'reviewed'
        END,
        updated_at = now()
    WHERE id = p_receipt_id;
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', p_receipt_id,
    'posted_count', v_posted_count,
    'skipped_count', v_skipped_count,
    'skipped_reasons', v_skipped_reasons,
    'finalized', v_finalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_post_purchase_receipt_ready_items(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_post_purchase_receipt_to_price_history(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.purchase_receipt_items i
    WHERE i.receipt_id = p_receipt_id
      AND (
        i.action IS NULL
        OR i.action = 'needs_review'
        OR i.review_status = 'needs_review'
      )
  ) THEN
    RAISE EXCEPTION 'Receipt still has unresolved review items';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_receipt_items i
    WHERE i.receipt_id = p_receipt_id
      AND i.action = 'update_price'
  ) THEN
    RAISE EXCEPTION 'No receipt items are approved for price update';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_receipt_items i
    WHERE i.receipt_id = p_receipt_id
      AND i.action = 'update_price'
      AND i.review_status <> 'posted'
      AND (
        i.material_id IS NULL
        OR i.uom_id IS NULL
        OR i.unit_price IS NULL
        OR i.unit_price <= 0
      )
  ) THEN
    RAISE EXCEPTION 'Approved price items require material, unit, and positive unit price';
  END IF;

  RETURN public.fn_post_purchase_receipt_ready_items(p_receipt_id, p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_post_purchase_receipt_to_price_history(uuid, uuid) TO authenticated;
