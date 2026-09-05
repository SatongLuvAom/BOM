export type ReceiptStatus = 'draft' | 'needs_review' | 'reviewed' | 'posted' | 'rejected'

export type ReceiptItemAction =
  | 'update_price'
  | 'create_material_needed'
  | 'ignore'
  | 'needs_review'

export type ReceiptItemReviewStatus = 'needs_review' | 'reviewed' | 'posted' | 'ignored'

export interface ReceiptSupplier {
  id: string
  supplier_id: string
  supplier_code: string | null
  supplier_name_th: string
  supplier_name_en?: string | null
  tax_id?: string | null
  phone?: string | null
  status?: 'ACTIVE' | 'INACTIVE'
}

export interface PurchaseReceipt {
  id: string
  receipt_no: string | null
  receipt_date: string | null
  supplier_id: string | null
  supplier_name_raw: string | null
  supplier_tax_id_raw: string | null
  subtotal: number | null
  vat: number | null
  discount: number | null
  grand_total: number | null
  file_url: string | null
  file_name: string | null
  file_mime_type: string | null
  file_storage_path: string | null
  ai_raw_text: string | null
  ai_raw_json: unknown | null
  status: ReceiptStatus
  confidence: number | null
  notes: string | null
  created_by: string | null
  reviewed_by: string | null
  posted_by: string | null
  created_at: string
  updated_at: string
  reviewed_at: string | null
  posted_at: string | null
  supplier?: ReceiptSupplier | null
  item_count?: number
}

export interface ReceiptMaterial {
  id: string
  material_id: string
  material_code: string | null
  mat_name_th: string
  mat_name_en: string | null
  spec: string | null
  code_spec_key: string | null
  base_uom: string | null
  base_uom_id: string | null
  category?: {
    cat_code: string | null
    cat_name_th: string | null
  } | null
  uom?: {
    id?: string | null
    uom_code: string | null
    uom_name_th: string | null
  } | null
}

export interface ReceiptUom {
  id: string
  uom_code: string
  uom_name_th: string
}

export interface ReceiptCategory {
  is_active?: boolean
  id: string
  cat_id: string
  cat_code: string | null
  cat_name_th: string | null
  code_prefix: string | null
}

export interface ReceiptMaterialType {
  id: string
  category_id: string
  name: string
  code_prefix: string
  is_active: boolean
}

export interface ReceiptMaterialCandidate {
  id: string
  receipt_id: string
  receipt_item_id: string
  proposed_mat_name_th: string | null
  proposed_mat_name_en: string | null
  proposed_category_id: string | null
  proposed_material_type_id: string | null
  proposed_code_spec_key: string | null
  proposed_spec: string | null
  proposed_brand: string | null
  proposed_model: string | null
  proposed_uom_id: string | null
  proposed_uom_raw: string | null
  proposed_supplier_id: string | null
  proposed_supplier_name_raw: string | null
  proposed_unit_price: number | null
  proposed_aliases: string[] | null
  ai_confidence: number | null
  ai_reason: string | null
  duplicate_warning: {
    matches?: Array<{
      material_id?: string | null
      material_code?: string | null
      mat_name_th?: string | null
      spec?: string | null
      reason?: string | null
      score?: number | null
    }>
  } | null
  status: 'needs_review' | 'approved' | 'rejected' | 'created'
  created_material_id: string | null
  reviewed_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  reviewed_at: string | null
  material_created_at: string | null
  category?: ReceiptCategory | null
  material_type?: ReceiptMaterialType | null
  uom?: ReceiptUom | null
  created_material?: Pick<ReceiptMaterial, 'id' | 'material_id' | 'material_code' | 'mat_name_th' | 'spec'> | null
}

export interface PurchaseReceiptItem {
  id: string
  receipt_id: string
  line_no: number | null
  raw_text: string | null
  item_name_raw: string | null
  item_name_normalized: string | null
  qty: number | null
  uom_raw: string | null
  uom_id: string | null
  unit_price: number | null
  line_total: number | null
  vat_amount: number | null
  discount_amount: number | null
  suggested_material_id: string | null
  material_id: string | null
  material_supplier_id: string | null
  material_candidate_id: string | null
  material_resolution_status: 'matched_existing' | 'candidate_created' | 'create_material_needed' | 'ignored' | 'unresolved' | null
  match_confidence: number | null
  match_reason: string | null
  review_status: ReceiptItemReviewStatus
  action: ReceiptItemAction | null
  created_at: string
  updated_at: string
  material?: ReceiptMaterial | null
  suggested_material?: ReceiptMaterial | null
  material_candidate?: ReceiptMaterialCandidate | null
  match_candidates?: MaterialCandidate[] | null
  uom?: ReceiptUom | null
}

export interface MaterialCandidate extends ReceiptMaterial {
  match_confidence?: number | null
  match_reason?: string | null
  latest_price?: {
    unit_price: number | null
    price_uom: string | null
    supplier_name: string | null
    effective_date: string | null
  } | null
}
