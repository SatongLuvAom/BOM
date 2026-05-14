-- ============================================================
-- v_mat_latest_price
-- ราคาล่าสุด (effective_date ใหม่สุด) ต่อวัสดุ 1 แถว
-- Run in Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE VIEW v_mat_latest_price AS
SELECT DISTINCT ON (p.material_id)
  p.material_id,
  p.supplier_id,
  s.supplier_name_th  AS supplier_name,
  p.unit_price,
  p.currency_code,
  p.price_uom,
  p.effective_date
FROM mat_price_base p
JOIN supplier s ON s.supplier_id = p.supplier_id
WHERE p.is_deleted = false
ORDER BY p.material_id, p.effective_date DESC;

NOTIFY pgrst, 'reload schema';
