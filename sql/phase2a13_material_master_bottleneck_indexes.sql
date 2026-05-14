-- ============================================================
-- Phase 2A.13 - Material Master Bottleneck Indexes
-- ============================================================
-- Scope:
--   * Safe, additive indexes for lazy-loaded material detail sections
--     and on-demand cleanup/QA queries.
--   * No data rewrite, no material_id changes, no BOM/BOQ reference changes.

CREATE INDEX IF NOT EXISTS idx_phase2a13_mat_alias_material_active
  ON public.mat_alias(material_id, created_at DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a13_mat_supplier_map_material_preferred
  ON public.mat_supplier_map(material_id, is_preferred DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a13_mat_uom_conv_material_active
  ON public.mat_uom_conv(material_id, created_at DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a13_bom_item_material_active
  ON public.bom_item(material_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a13_boq_item_material_active
  ON public.boq_item(material_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a13_mat_audit_log_material_entity
  ON public.mat_audit_log(entity_type, entity_key, created_at DESC)
  WHERE entity_type = 'mat_master';
