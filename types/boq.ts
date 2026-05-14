// ============================================================
// BOQ (Bill of Quantities) — TypeScript Types
// ============================================================

export type BoqStatus   = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
export type BoqItemType = 'MAT' | 'LABOR' | 'SERVICE' | 'MISC' | 'SECTION'
export type BoqPriceSource = 'MANUAL' | 'LATEST_PRICE' | 'AI' | 'IMPORT' | 'TEMPLATE' | 'BOM' | 'UNKNOWN'

export interface BoqProject {
  id:           string
  project_id:   string
  project_name: string
  customer_id:  string | null
  client_name:  string | null
  site_address: string | null
  project_date: string
  status:       BoqStatus
  note:         string | null
  is_deleted:   boolean
  deleted_at:   string | null
  created_by:   string | null
  updated_by:   string | null
  created_at:   string
  updated_at:   string
  // Joined
  items?: BoqItem[]
  customer?: { customer_id: string; customer_name: string } | null
}

export interface BoqItem {
  id:            string
  item_id:       string
  project_id:    string
  seq:           number
  item_type:     BoqItemType
  material_id:   string | null
  item_name:     string
  spec:          string | null
  uom:           string
  qty:           number
  waste_pct:     number
  final_qty:     number   // generated column
  unit_price:    number
  estimated_unit_price: number
  final_unit_price: number
  price_source: BoqPriceSource
  price_snapshot_at: string | null
  supplier_id: string | null
  total_price:   number   // generated column
  currency_code: string
  note:          string | null
  is_deleted:    boolean
  deleted_at:    string | null
  created_by:    string | null
  updated_by:    string | null
  created_at:    string
  updated_at:    string
}

// ── API Payloads ──────────────────────────────────────────────

export interface CreateBoqProjectPayload {
  project_name: string
  customer_id?:  string | null
  client_name?:  string
  site_address?: string
  project_date?: string
  status?:       BoqStatus
  note?:         string
}

export interface UpdateBoqProjectPayload extends Partial<CreateBoqProjectPayload> {}

export interface CreateBoqItemPayload {
  seq?:          number
  item_type:     BoqItemType
  material_id?:  string | null
  item_name:     string
  spec?:         string
  uom:           string
  qty:           number
  waste_pct?:    number
  unit_price:    number
  estimated_unit_price?: number
  final_unit_price?: number
  price_source?: BoqPriceSource
  price_snapshot_at?: string
  supplier_id?: string | null
  currency_code?: string
  note?:         string
}

export interface UpdateBoqItemPayload
  extends Partial<Omit<CreateBoqItemPayload, 'item_type'>> {}

// ── AI Price Suggestion ───────────────────────────────────────

export interface AiPriceSuggestion {
  item_id:         string
  item_name:       string
  current_price:   number
  suggested_price: number
  confidence:      'high' | 'medium' | 'low'
  reasoning:       string
}

// ── API Response ──────────────────────────────────────────────

export interface BoqProjectListParams {
  search?: string
  status?: BoqStatus | ''
  page?:   number
  limit?:  number
}
