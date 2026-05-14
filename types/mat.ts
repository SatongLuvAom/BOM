// ============================================================
// MAT (Material Master) - TypeScript Types
// ============================================================

export interface MatUom {
  id: string
  uom_code: string
  uom_name_th: string
  uom_name_en: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MatCategory {
  id: string
  cat_id: string
  cat_code: string
  code_prefix: string | null
  cat_name_th: string
  cat_name_en: string | null
  parent_cat_id: string | null
  is_active: boolean
  sort_order: number
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  parent?: Pick<MatCategory, 'cat_id' | 'cat_code' | 'cat_name_th'> | null
  children?: MatCategory[]
}

export type MatStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'
export type AliasType = 'COMMON' | 'BRAND' | 'ABBREV' | 'LINE'
export type AliasLang = 'TH' | 'EN'
export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export interface MaterialType {
  id: string
  category_id: string
  name: string
  code_prefix: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Pick<MatCategory, 'id' | 'cat_id' | 'cat_code' | 'cat_name_th' | 'code_prefix'> | null
}

export interface MaterialCodeHistory {
  id: string
  material_id: string
  old_code: string | null
  new_code: string
  change_reason: string
  changed_by: string | null
  changed_at: string
}

export interface MatMaster {
  id: string
  material_id: string
  material_code: string | null
  cat_id: string
  category_id: string | null
  mat_name_th: string
  mat_name_en: string | null
  normalized_name: string | null
  spec: string | null
  brand: string | null
  model: string | null
  base_uom: string
  base_uom_id: string | null
  material_type_id: string | null
  code_spec_key: string | null
  code_locked: boolean
  code_generated_at: string | null
  code_rule_version: string | null
  status: MatStatus
  note: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  // Joined
  category?: Pick<MatCategory, 'id' | 'cat_id' | 'cat_code' | 'cat_name_th' | 'code_prefix'>
  uom?: Pick<MatUom, 'uom_code' | 'uom_name_th'>
  material_type?: Pick<MaterialType, 'id' | 'name' | 'code_prefix'> | null
  code_history?: MaterialCodeHistory[]
  aliases?: MatAlias[]
  uom_conversions?: MatUomConv[]
  supplier_maps?: MatSupplierMap[]
  prices?: MatPriceBase[]
  latest_price?: MatLatestPrice | null
  quality?: MatQualityScore | null
}

export interface MatAlias {
  id: string
  alias_id: string
  material_id: string
  material_uuid: string | null
  alias_name: string
  normalized_alias: string | null
  alias_type: AliasType
  lang: AliasLang
  note: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface MatUomConv {
  id: string
  material_id: string
  material_uuid: string | null
  from_uom: string
  from_uom_id: string | null
  to_uom: string
  to_uom_id: string | null
  factor: number
  formula_note: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  from_uom_data?: Pick<MatUom, 'uom_code' | 'uom_name_th'>
  to_uom_data?: Pick<MatUom, 'uom_code' | 'uom_name_th'>
}

export interface Supplier {
  id: string
  supplier_id: string
  supplier_code: string
  supplier_name_th: string
  supplier_name_en: string | null
  tax_id: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  line_id: string | null
  address: string | null
  payment_terms: string | null
  status: SupplierStatus
  note: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface MatSupplierMap {
  id: string
  material_id: string
  material_uuid: string | null
  supplier_id: string
  supplier_uuid: string | null
  supplier_material_name: string | null
  supplier_sku: string | null
  is_preferred: boolean
  lead_time_days: number
  min_order_qty: number
  is_active: boolean
  note: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  material?: Pick<MatMaster, 'material_id' | 'mat_name_th' | 'spec' | 'base_uom'>
  supplier?: Pick<Supplier, 'supplier_id' | 'supplier_code' | 'supplier_name_th' | 'status'>
}

export interface MatPriceBase {
  id: string
  material_id: string
  material_uuid: string | null
  supplier_id: string
  supplier_uuid: string | null
  effective_date: string
  quote_date: string | null
  valid_until: string | null
  price_uom: string
  price_uom_id: string | null
  unit_price: number
  currency_code: string
  min_order_qty: number
  lead_time_days: number
  is_tax_included: boolean
  vat_included: boolean
  delivery_included: boolean
  source_type: string | null
  source_note: string | null
  attachment_url: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  material?: Pick<MatMaster, 'material_id' | 'mat_name_th' | 'spec' | 'base_uom'>
  supplier?: Pick<Supplier, 'supplier_id' | 'supplier_code' | 'supplier_name_th'>
  uom?: Pick<MatUom, 'uom_code' | 'uom_name_th'>
}

export interface MatLatestPrice {
  material_uuid?: string | null
  material_id: string
  material_code?: string | null
  supplier_id: string | null
  supplier_name: string | null
  effective_date: string | null
  quote_date?: string | null
  valid_until?: string | null
  price_uom: string | null
  price_uom_id?: string | null
  price_uom_name_th?: string | null
  unit_price: number
  currency_code: string
  min_order_qty?: number | null
  lead_time_days?: number | null
  vat_included?: boolean
  delivery_included?: boolean
  source_type?: string | null
  source_note?: string | null
  created_at?: string | null
  is_stale?: boolean
  price_status?: string
}

export interface MatQualityScore {
  material_id: string
  material_uuid?: string | null
  material_code?: string | null
  quality_score: number
  quality_label: string
  breakdown?: {
    key: string
    label: string
    points: number
    earned: number
    ok: boolean
    reason?: string
    issueKind?: string
  }[]
  issues?: {
    key: string
    label: string
    points: number
    earned: number
    ok: boolean
    reason?: string
    issueKind?: string
  }[]
  warnings?: {
    kind: string
    message: string
  }[]
  is_price_expired?: boolean
  is_price_stale?: boolean
}

export interface MatAuditLog {
  audit_id: number
  entity_type: string
  entity_key: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
  payload: Record<string, unknown> | null
  created_at: string
  created_by: string | null
}

// ── API Payloads ──────────────────────────────────────────────

export interface CreateMaterialPayload {
  material_code?: string
  cat_id: string
  category_id?: string
  material_type_id?: string
  code_spec_key?: string
  mat_name_th: string
  mat_name_en?: string
  normalized_name?: string
  spec?: string
  brand?: string
  model?: string
  base_uom: string
  base_uom_id?: string
  status?: MatStatus
  note?: string
}

export interface UpdateMaterialPayload extends Partial<CreateMaterialPayload> {}

export interface CreateCategoryPayload {
  cat_code: string
  cat_name_th: string
  cat_name_en?: string
  parent_cat_id?: string
  is_active?: boolean
  sort_order?: number
}

export interface UpdateCategoryPayload extends Partial<CreateCategoryPayload> {}

export interface CreateAliasPayload {
  material_id: string
  alias_name: string
  normalized_alias?: string
  alias_type: AliasType
  lang?: AliasLang
  note?: string
}

export interface CreateUomConvPayload {
  material_id: string
  from_uom: string
  from_uom_id?: string
  to_uom: string
  to_uom_id?: string
  factor: number
  formula_note?: string
}

export interface CreateSupplierPayload {
  supplier_code: string
  supplier_name_th: string
  supplier_name_en?: string
  tax_id?: string
  contact_name?: string
  phone?: string
  email?: string
  line_id?: string
  address?: string
  payment_terms?: string
  status?: SupplierStatus
  note?: string
}

export interface UpdateSupplierPayload extends Partial<CreateSupplierPayload> {}

export interface CreateMatSupplierMapPayload {
  material_id: string
  supplier_id: string
  supplier_material_name?: string
  supplier_sku?: string
  is_preferred?: boolean
  lead_time_days?: number
  min_order_qty?: number
  is_active?: boolean
  note?: string
}

export interface UpdateMatSupplierMapPayload extends Partial<CreateMatSupplierMapPayload> {}

export interface CreateMatPriceBasePayload {
  material_id: string
  supplier_id: string
  effective_date: string
  quote_date?: string
  valid_until?: string
  price_uom: string
  price_uom_id?: string
  unit_price: number
  currency_code?: string
  min_order_qty?: number
  lead_time_days?: number
  is_tax_included?: boolean
  vat_included?: boolean
  delivery_included?: boolean
  source_type?: string
  source_note?: string
  attachment_url?: string
}

export interface UpdateMatPriceBasePayload
  extends Partial<Omit<CreateMatPriceBasePayload, 'material_id' | 'supplier_id' | 'effective_date'>> {}

// ── Query Params ──────────────────────────────────────────────

export interface MaterialListParams {
  search?: string
  cat_id?: string
  status?: MatStatus | ''
  page?: number
  limit?: number
}

export interface SupplierListParams {
  search?: string
  status?: SupplierStatus | ''
  page?: number
  limit?: number
}

export interface MatPriceListParams {
  search?: string
  material_id?: string
  supplier_id?: string
  effective_from?: string
  effective_to?: string
  page?: number
  limit?: number
}

// ── API Response ──────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
