import { z } from 'zod'

export const createBoqProjectSchema = z.object({
  project_name: z.string().min(1, 'กรุณาระบุชื่อโปรเจกต์'),
  customer_id:  z.string().nullable().optional(),
  client_name:  z.string().optional(),
  site_address: z.string().optional(),
  project_date: z.string().optional(),
  status:       z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']).optional(),
  note:         z.string().optional(),
})

export const updateBoqProjectSchema = createBoqProjectSchema.partial()

export const createBoqItemSchema = z.object({
  seq:           z.number().int().optional(),
  item_type:     z.enum(['MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION']),
  material_id:   z.string().nullable().optional(),
  item_name:     z.string().min(1, 'กรุณาระบุชื่อรายการ'),
  spec:          z.string().optional(),
  uom:           z.string().min(1, 'กรุณาระบุหน่วย'),
  qty:           z.number({ invalid_type_error: 'ระบุจำนวน' }).positive('qty ต้องมากกว่า 0'),
  waste_pct:     z.number().min(0).max(100).optional(),
  unit_price:    z.number({ invalid_type_error: 'ระบุราคา' }).min(0),
  estimated_unit_price: z.number().min(0).optional(),
  final_unit_price: z.number().min(0).optional(),
  price_source: z.enum(['MANUAL', 'LATEST_PRICE', 'AI', 'IMPORT', 'TEMPLATE', 'BOM', 'UNKNOWN']).optional(),
  price_snapshot_at: z.string().optional(),
  supplier_id: z.string().nullable().optional(),
  currency_code: z.string().optional(),
  note:          z.string().optional(),
})

export const updateBoqItemSchema = createBoqItemSchema
  .omit({ item_type: true })
  .partial()
