// ============================================================
// Customer — TypeScript Types
// ============================================================

export interface Customer {
  id:            string
  customer_id:   string
  customer_code: string | null
  customer_name: string
  contact_name:  string | null
  phone:         string | null
  email:         string | null
  address:       string | null
  tax_id:        string | null
  note:          string | null
  is_deleted:    boolean
  deleted_at:    string | null
  created_by:    string | null
  updated_by:    string | null
  created_at:    string
  updated_at:    string
}

export interface CreateCustomerPayload {
  customer_code?: string
  customer_name: string
  contact_name?: string
  phone?:        string
  email?:        string
  address?:      string
  tax_id?:       string
  note?:         string
}

export interface UpdateCustomerPayload extends Partial<CreateCustomerPayload> {}

export interface CustomerListParams {
  search?: string
  page?:   number
  limit?:  number
}

export interface CustomerWithStats extends Customer {
  project_count?: number
  total_value?:   number
}
