-- ============================================================
-- Material list page payload
-- ============================================================
-- Enriches the paginated list result inside PostgreSQL so the page does not
-- need a second network round for prices and quality inputs.

CREATE OR REPLACE FUNCTION public.list_materials_page(
  p_search text DEFAULT NULL,
  p_cat_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_has_price text DEFAULT NULL,
  p_stale_price text DEFAULT NULL,
  p_supplier_id text DEFAULT NULL,
  p_sort_by text DEFAULT NULL,
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
base AS MATERIALIZED (
  SELECT public.list_materials(
    p_search,
    p_cat_id,
    p_status,
    p_has_price,
    p_stale_price,
    p_supplier_id,
    p_sort_by,
    p_sort_dir,
    p_limit,
    p_offset
  ) AS payload
),
page_rows AS (
  SELECT
    item.material,
    item.row_position,
    item.material ->> 'material_id' AS material_id
  FROM base
  CROSS JOIN LATERAL jsonb_array_elements(
    coalesce(base.payload -> 'materials', '[]'::jsonb)
  ) WITH ORDINALITY AS item(material, row_position)
),
page_ids AS (
  SELECT DISTINCT material_id
  FROM page_rows
  WHERE material_id IS NOT NULL
),
alias_context AS (
  SELECT a.material_id, count(*)::integer AS alias_count
  FROM public.mat_alias a
  JOIN page_ids ids ON ids.material_id = a.material_id
  WHERE coalesce(a.is_deleted, false) = false
  GROUP BY a.material_id
),
supplier_context AS (
  SELECT
    msm.material_id,
    jsonb_agg(
      jsonb_build_object(
        'is_preferred', coalesce(msm.is_preferred, false),
        'is_active', coalesce(msm.is_active, true),
        'is_deleted', false
      )
      ORDER BY coalesce(msm.is_preferred, false) DESC, msm.supplier_id
    ) AS supplier_maps
  FROM public.mat_supplier_map msm
  JOIN page_ids ids ON ids.material_id = msm.material_id
  WHERE coalesce(msm.is_deleted, false) = false
  GROUP BY msm.material_id
),
uom_context AS (
  SELECT
    conv.material_id,
    jsonb_agg(
      jsonb_build_object(
        'from_uom', conv.from_uom,
        'from_uom_id', conv.from_uom_id,
        'to_uom', conv.to_uom,
        'to_uom_id', conv.to_uom_id,
        'is_deleted', false
      )
      ORDER BY conv.from_uom, conv.to_uom
    ) AS uom_conversions
  FROM public.mat_uom_conv conv
  JOIN page_ids ids ON ids.material_id = conv.material_id
  WHERE coalesce(conv.is_deleted, false) = false
  GROUP BY conv.material_id
),
enriched_rows AS (
  SELECT
    pr.row_position,
    pr.material || jsonb_build_object(
      'latest_price', CASE
        WHEN lp.material_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'material_id', lp.material_id,
          'material_uuid', lp.material_uuid,
          'material_code', lp.material_code,
          'supplier_id', lp.supplier_id,
          'supplier_name', lp.supplier_name,
          'effective_date', lp.effective_date,
          'quote_date', lp.quote_date,
          'valid_until', lp.valid_until,
          'price_uom', lp.price_uom,
          'price_uom_id', lp.price_uom_id,
          'price_uom_name_th', lp.price_uom_name_th,
          'unit_price', lp.unit_price,
          'currency_code', lp.currency_code,
          'min_order_qty', lp.min_order_qty,
          'lead_time_days', lp.lead_time_days,
          'vat_included', lp.vat_included,
          'delivery_included', lp.delivery_included,
          'source_type', lp.source_type,
          'source_note', lp.source_note,
          'created_at', lp.created_at,
          'is_stale', lp.is_stale,
          'price_status', lp.price_status
        )
      END,
      'quality_context', jsonb_build_object(
        'alias_count', coalesce(ac.alias_count, 0),
        'supplier_maps', coalesce(sc.supplier_maps, '[]'::jsonb),
        'uom_conversions', coalesce(uc.uom_conversions, '[]'::jsonb)
      )
    ) AS material
  FROM page_rows pr
  LEFT JOIN public.material_latest_prices lp ON lp.material_id = pr.material_id
  LEFT JOIN alias_context ac ON ac.material_id = pr.material_id
  LEFT JOIN supplier_context sc ON sc.material_id = pr.material_id
  LEFT JOIN uom_context uc ON uc.material_id = pr.material_id
)
SELECT jsonb_build_object(
  'materials', coalesce((
    SELECT jsonb_agg(er.material ORDER BY er.row_position)
    FROM enriched_rows er
  ), '[]'::jsonb),
  'total', coalesce((SELECT payload -> 'total' FROM base), '0'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.list_materials_page(text, text, text, text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_materials_page(text, text, text, text, text, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_materials_page(text, text, text, text, text, text, text, text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_materials_page(text, text, text, text, text, text, text, text, integer, integer) IS
  'Returns one filtered Material page with latest prices and compact quality inputs in one network round.';

NOTIFY pgrst, 'reload schema';
