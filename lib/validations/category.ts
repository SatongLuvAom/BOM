import { z } from 'zod'

export const createCategorySchema = z.object({
  cat_code: z
    .string()
    .min(2, 'รหัสต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(10, 'รหัสยาวเกิน 10 ตัวอักษร')
    .regex(/^[A-Z0-9]+$/, 'รหัสต้องเป็นตัวพิมพ์ใหญ่หรือตัวเลขเท่านั้น'),
  cat_name_th: z
    .string()
    .min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(200, 'ชื่อยาวเกิน 200 ตัวอักษร'),
  cat_name_en: z.string().max(200).optional().or(z.literal('')),
  parent_cat_id: z.string().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = createCategorySchema.partial()
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

export const createUomSchema = z.object({
  uom_code: z
    .string()
    .min(1, 'กรุณาระบุรหัส')
    .max(10, 'รหัสยาวเกิน 10 ตัวอักษร')
    .regex(/^[A-Z0-9_]+$/, 'รหัสต้องเป็นตัวพิมพ์ใหญ่หรือตัวเลขเท่านั้น'),
  uom_name_th: z
    .string()
    .min(1, 'กรุณาระบุชื่อภาษาไทย')
    .max(50, 'ชื่อยาวเกิน 50 ตัวอักษร'),
  uom_name_en: z.string().max(50).optional().or(z.literal('')),
})

export type CreateUomInput = z.infer<typeof createUomSchema>
