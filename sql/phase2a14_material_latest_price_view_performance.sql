-- ============================================================
-- Phase 2A.14 - Material Latest Price View Performance
-- ============================================================
-- Scope:
--   * Keep the latest-price view as the lightweight source for Material Master
--     list/detail/cleanup summaries.
--   * Add columns already needed by app logic so pages do not need to read and
--     sort the full price table just to compute price expiry and UOM warnings.
--   * No data rewrite, no material_id changes, no BOM/BOQ reference changes.

CREATE OR REPLACE VIEW public.material_latest_prices AS
SELECT DISTINCT ON (p.material_id)
  m.id AS material_uuid,
  p.material_id,
  m.material_code,
  p.supplier_id,
  s.supplier_name_th AS supplier_name,
  p.effective_date,
  coalesce(p.quote_date, p.effective_date) AS quote_date,
  p.price_uom,
  u.uom_name_th AS price_uom_name_th,
  p.unit_price,
  p.currency_code,
  p.min_order_qty,
  p.lead_time_days,
  coalesce(p.vat_included, p.is_tax_included, false) AS vat_included,
  p.delivery_included,
  p.source_type,
  p.source_note,
  p.created_at,
  (coalesce(p.quote_date, p.effective_date, p.created_at::date) < current_date - interval '30 days') AS is_stale,
  CASE
    WHEN p.valid_until IS NOT NULL AND p.valid_until < current_date
      THEN 'EXPIRED'
    WHEN coalesce(p.quote_date, p.effective_date, p.created_at::date) < current_date - interval '30 days'
      THEN 'STALE'
    ELSE 'OK'
  END AS price_status,
  -- Added at the end so CREATE OR REPLACE VIEW remains compatible with the
  -- existing material_latest_prices column order in production.
  p.valid_until,
  p.price_uom_id
FROM public.mat_price_base p
JOIN public.mat_master m ON m.material_id = p.material_id
JOIN public.supplier s ON s.supplier_id = p.supplier_id
LEFT JOIN public.mat_uom u ON u.id = p.price_uom_id OR (p.price_uom_id IS NULL AND u.uom_code = p.price_uom)
WHERE coalesce(p.is_deleted, false) = false
  AND coalesce(m.is_deleted, false) = false
  AND coalesce(s.is_deleted, false) = false
ORDER BY
  p.material_id,
  coalesce(p.quote_date, p.effective_date, p.created_at::date) DESC,
  p.created_at DESC;

CREATE OR REPLACE VIEW public.v_mat_latest_price AS
SELECT
  material_id,
  supplier_id,
  supplier_name,
  unit_price,
  currency_code,
  price_uom,
  effective_date,
  quote_date,
  is_stale,
  price_status
FROM public.material_latest_prices;

GRANT SELECT ON public.material_latest_prices TO authenticated, service_role;
GRANT SELECT ON public.v_mat_latest_price TO authenticated, service_role;
