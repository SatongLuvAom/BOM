-- ============================================================
-- Phase 2A.12 - Material Master Performance Indexes
-- ============================================================
-- Scope:
--   * Safe, additive indexes for Material Master navigation/search/filter pages.
--   * No data rewrite, no material_id changes, no BOM/BOQ reference changes.
--   * These may overlap with earlier phase indexes in older databases; names are
--     separate and IF NOT EXISTS to keep the migration safe.

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_master_code_active
  ON public.mat_master(upper(trim(material_code)))
  WHERE coalesce(is_deleted, false) = false
    AND nullif(trim(coalesce(material_code, '')), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_master_category_status_updated
  ON public.mat_master(cat_id, status, updated_at DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_master_category_uuid_status_updated
  ON public.mat_master(category_id, status, updated_at DESC)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_master_type_spec
  ON public.mat_master(material_type_id, code_spec_key)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_master_normalized_name
  ON public.mat_master(normalized_name)
  WHERE coalesce(is_deleted, false) = false
    AND nullif(trim(coalesce(normalized_name, '')), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_alias_normalized
  ON public.mat_alias(normalized_alias)
  WHERE coalesce(is_deleted, false) = false
    AND nullif(trim(coalesce(normalized_alias, '')), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_supplier_map_supplier_material
  ON public.mat_supplier_map(supplier_id, material_id)
  WHERE coalesce(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_phase2a12_mat_price_base_latest
  ON public.mat_price_base(material_id, quote_date DESC NULLS LAST, effective_date DESC, created_at DESC)
  WHERE coalesce(is_deleted, false) = false;
