import { z } from 'zod'

const optionalText = (max: number) => z
  .union([z.string().max(max), z.literal(''), z.null()])
  .optional()
  .transform((value) => value ?? '')

export const createSupplierSchema = z.object({
  supplier_code: z
    .string()
    .min(2, 'Supplier code must be at least 2 characters')
    .max(20, 'Supplier code must be at most 20 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Supplier code must contain only A-Z, 0-9, underscore, or dash'),
  supplier_name_th: z
    .string()
    .min(2, 'Supplier name is required')
    .max(200, 'Supplier name must be at most 200 characters'),
  supplier_name_en: optionalText(200),
  tax_id: optionalText(32),
  contact_name: optionalText(120),
  phone: optionalText(50),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  line_id: optionalText(100),
  address: optionalText(1000),
  payment_terms: optionalText(200),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  note: optionalText(1000),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>

export const updateSupplierSchema = createSupplierSchema.partial()
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

export const createMatSupplierMapSchema = z.object({
  material_id: z.string().min(1, 'Material is required'),
  supplier_id: z.string().min(1, 'Supplier is required'),
  supplier_material_name: optionalText(200),
  supplier_sku: optionalText(100),
  is_preferred: z.boolean().default(false),
  lead_time_days: z.number().int().min(0).default(0),
  min_order_qty: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  note: optionalText(1000),
})

export type CreateMatSupplierMapInput = z.infer<typeof createMatSupplierMapSchema>

export const updateMatSupplierMapSchema = createMatSupplierMapSchema
  .omit({ material_id: true, supplier_id: true })
  .partial()

export type UpdateMatSupplierMapInput = z.infer<typeof updateMatSupplierMapSchema>

export const createMatPriceBaseSchema = z.object({
  material_id: z.string().min(1, 'Material is required'),
  supplier_id: z.string().min(1, 'Supplier is required'),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective date must use YYYY-MM-DD'),
  quote_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Quote date must use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid until must use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  price_uom: z.string().min(1, 'Price UOM is required'),
  price_uom_id: optionalText(64),
  unit_price: z.number().positive('Unit price must be greater than 0'),
  currency_code: z
    .string()
    .min(3, 'Currency must be 3 characters')
    .max(3, 'Currency must be 3 characters')
    .default('THB'),
  min_order_qty: z.number().min(0).default(0),
  lead_time_days: z.number().int().min(0).default(0),
  is_tax_included: z.boolean().default(false),
  vat_included: z.boolean().optional(),
  delivery_included: z.boolean().default(false),
  source_type: z
    .enum(['phone', 'line_chat', 'quotation', 'receipt', 'website', 'manual', 'other'])
    .optional()
    .or(z.literal('')),
  source_note: optionalText(1000),
  attachment_url: optionalText(1000),
})

export type CreateMatPriceBaseInput = z.infer<typeof createMatPriceBaseSchema>

export const updateMatPriceBaseSchema = createMatPriceBaseSchema
  .omit({ material_id: true, supplier_id: true, effective_date: true })
  .partial()

export type UpdateMatPriceBaseInput = z.infer<typeof updateMatPriceBaseSchema>
