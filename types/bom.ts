export type BomItemType = 'MAT' | 'LABOR' | 'SERVICE' | 'MISC'

export interface BomTemplate {
  id:           string
  bom_id:       string
  bom_name:     string
  bom_category: string | null
  unit:         string
  description:  string | null
  is_deleted:   boolean
  deleted_at:   string | null
  created_by:   string | null
  updated_by:   string | null
  created_at:   string
  updated_at:   string
  items?:       BomItem[]
}

export interface BomItem {
  id:           string
  item_id:      string
  bom_id:       string
  seq:          number
  item_type:    BomItemType
  material_id:  string | null
  item_name:    string
  uom:          string
  qty_per_unit: number
  waste_pct:    number
  note:         string | null
  is_deleted:   boolean
  deleted_at:   string | null
  created_at:   string
  updated_at:   string
}

export interface CreateBomPayload {
  bom_name:     string
  bom_category: string
  unit:         string
  description:  string
  items: {
    seq:          number
    item_type:    BomItemType
    material_id:  string
    item_name:    string
    uom:          string
    qty_per_unit: number
    waste_pct:    number
    note:         string
  }[]
}
