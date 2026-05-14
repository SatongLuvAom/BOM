-- ============================================================
-- Dashboard Stats Function
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_materials',  (SELECT COUNT(*) FROM mat_master),
    'active_materials', (SELECT COUNT(*) FROM mat_master WHERE status = 'ACTIVE'),
    'total_suppliers',  (SELECT COUNT(*) FROM supplier WHERE is_deleted = false),
    'total_prices',     (SELECT COUNT(*) FROM mat_price_base WHERE is_deleted = false),
    'missing_alias', (
      SELECT COUNT(*) FROM mat_master m
      WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM mat_alias a WHERE a.material_id = m.material_id)
    ),
    'missing_uom_conv', (
      SELECT COUNT(*) FROM mat_master m
      WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM mat_uom_conv c WHERE c.material_id = m.material_id)
    ),
    'missing_price', (
      SELECT COUNT(*) FROM mat_master m
      WHERE m.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM mat_price_base p
        WHERE p.material_id = m.material_id AND p.is_deleted = false
      )
    ),
    'by_category', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT c.cat_id, c.cat_code, c.cat_name_th,
               COUNT(m.material_id)::int AS count
        FROM mat_category c
        LEFT JOIN mat_master m ON m.cat_id = c.cat_id
        WHERE c.is_active = true
        GROUP BY c.cat_id, c.cat_code, c.cat_name_th
        ORDER BY COUNT(m.material_id) DESC
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';
