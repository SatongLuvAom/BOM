-- ============================================================
-- Phase 2B: Receipt Import v1
-- Draft + manual review foundation. No OCR/AI in this phase.
-- Safe/additive migration for Supabase.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text,
  receipt_date date,
  supplier_id uuid,
  supplier_name_raw text,
  supplier_tax_id_raw text,
  subtotal numeric,
  vat numeric,
  discount numeric,
  grand_total numeric,
  file_url text,
  file_name text,
  file_mime_type text,
  status text NOT NULL DEFAULT 'draft',
  confidence numeric,
  notes text,
  created_by uuid,
  reviewed_by uuid,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  posted_at timestamptz,
  CONSTRAINT purchase_receipts_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.supplier(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL,
  line_no int,
  raw_text text,
  item_name_raw text,
  item_name_normalized text,
  qty numeric,
  uom_raw text,
  uom_id uuid,
  unit_price numeric,
  line_total numeric,
  vat_amount numeric,
  discount_amount numeric,
  suggested_material_id uuid,
  material_id uuid,
  match_confidence numeric,
  match_reason text,
  review_status text NOT NULL DEFAULT 'needs_review',
  action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_receipt_items_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  CONSTRAINT purchase_receipt_items_uom_id_fkey
    FOREIGN KEY (uom_id) REFERENCES public.mat_uom(id) ON DELETE RESTRICT,
  CONSTRAINT purchase_receipt_items_suggested_material_id_fkey
    FOREIGN KEY (suggested_material_id) REFERENCES public.mat_master(id) ON DELETE RESTRICT,
  CONSTRAINT purchase_receipt_items_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES public.mat_master(id) ON DELETE RESTRICT
);

ALTER TABLE public.purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_status_check;
ALTER TABLE public.purchase_receipts
  ADD CONSTRAINT purchase_receipts_status_check
  CHECK (status IN ('draft', 'needs_review', 'reviewed', 'posted', 'rejected'));

ALTER TABLE public.purchase_receipt_items
  DROP CONSTRAINT IF EXISTS purchase_receipt_items_review_status_check;
ALTER TABLE public.purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_review_status_check
  CHECK (review_status IN ('needs_review', 'reviewed', 'posted', 'ignored'));

ALTER TABLE public.purchase_receipt_items
  DROP CONSTRAINT IF EXISTS purchase_receipt_items_action_check;
ALTER TABLE public.purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_action_check
  CHECK (
    action IS NULL OR action IN (
      'update_price',
      'create_material_needed',
      'ignore',
      'needs_review'
    )
  );

ALTER TABLE public.purchase_receipt_items
  DROP CONSTRAINT IF EXISTS purchase_receipt_items_positive_qty_check;
ALTER TABLE public.purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_positive_qty_check
  CHECK (qty IS NULL OR qty > 0);

ALTER TABLE public.purchase_receipt_items
  DROP CONSTRAINT IF EXISTS purchase_receipt_items_positive_unit_price_check;
ALTER TABLE public.purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_positive_unit_price_check
  CHECK (unit_price IS NULL OR unit_price > 0);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_status
  ON public.purchase_receipts(status);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_receipt_date
  ON public.purchase_receipts(receipt_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_id
  ON public.purchase_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt_id
  ON public.purchase_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_material_id
  ON public.purchase_receipt_items(material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_suggested_material_id
  ON public.purchase_receipt_items(suggested_material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_review_status
  ON public.purchase_receipt_items(review_status);

CREATE OR REPLACE FUNCTION public.fn_purchase_receipts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_receipts_set_updated_at ON public.purchase_receipts;
CREATE TRIGGER trg_purchase_receipts_set_updated_at
  BEFORE UPDATE ON public.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_receipts_set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_receipt_items_set_updated_at ON public.purchase_receipt_items;
CREATE TRIGGER trg_purchase_receipt_items_set_updated_at
  BEFORE UPDATE ON public.purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_receipts_set_updated_at();

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_receipts_authenticated_all ON public.purchase_receipts;
CREATE POLICY purchase_receipts_authenticated_all
  ON public.purchase_receipts
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS purchase_receipt_items_authenticated_all ON public.purchase_receipt_items;
CREATE POLICY purchase_receipt_items_authenticated_all
  ON public.purchase_receipt_items
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_items TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_post_purchase_receipt_to_price_history(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt public.purchase_receipts%ROWTYPE;
  v_inserted_count integer := 0;
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
      AND (
        i.material_id IS NULL
        OR i.unit_price IS NULL
        OR i.unit_price <= 0
      )
  ) THEN
    RAISE EXCEPTION 'Approved price items require material and positive unit price';
  END IF;

  WITH inserted AS (
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
      m.material_id,
      m.id,
      s.supplier_id,
      s.id,
      coalesce(v_receipt.receipt_date, current_date),
      coalesce(v_receipt.receipt_date, current_date),
      NULL::date,
      coalesce(nullif(u.uom_code, ''), nullif(upper(trim(i.uom_raw)), ''), nullif(m.base_uom, ''), 'EA'),
      u.id,
      i.unit_price,
      'THB',
      coalesce(i.qty, 0),
      0,
      true,
      true,
      false,
      'receipt',
      concat_ws(' | ', 'Receipt Import v1', nullif(v_receipt.receipt_no, ''), nullif(v_receipt.supplier_name_raw, '')),
      v_receipt.file_url,
      p_user_id,
      p_user_id
    FROM public.purchase_receipt_items i
    JOIN public.mat_master m
      ON m.id = i.material_id
     AND coalesce(m.is_deleted, false) = false
    JOIN public.supplier s
      ON s.id = v_receipt.supplier_id
     AND coalesce(s.is_deleted, false) = false
    LEFT JOIN public.mat_uom u
      ON u.id = i.uom_id
     AND coalesce(u.is_deleted, false) = false
    WHERE i.receipt_id = p_receipt_id
      AND i.action = 'update_price'
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted;

  UPDATE public.purchase_receipt_items
  SET review_status = CASE
      WHEN action = 'update_price' THEN 'posted'
      WHEN action = 'ignore' THEN 'ignored'
      ELSE 'reviewed'
    END,
    updated_at = now()
  WHERE receipt_id = p_receipt_id;

  UPDATE public.purchase_receipts
  SET status = 'posted',
      posted_by = p_user_id,
      posted_at = now(),
      updated_at = now()
  WHERE id = p_receipt_id;

  RETURN jsonb_build_object(
    'receipt_id', p_receipt_id,
    'inserted_prices', v_inserted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_post_purchase_receipt_to_price_history(uuid, uuid) TO authenticated;
