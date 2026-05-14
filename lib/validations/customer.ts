import { z } from 'zod'

export const createCustomerSchema = z.object({
  customer_code: z.string().optional(),
  customer_name: z.string().min(1, 'กรุณาระบุชื่อลูกค้า'),
  contact_name:  z.string().optional(),
  phone:         z.string().optional(),
  email:         z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
  address:       z.string().optional(),
  tax_id:        z.string().optional(),
  note:          z.string().optional(),
})

export const updateCustomerSchema = createCustomerSchema.partial()
