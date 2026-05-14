import { z } from 'zod'

const optionalText = (max: number) => z
  .union([z.string().max(max), z.literal(''), z.null()])
  .optional()
  .transform((value) => value ?? '')

export const createMaterialSchema = z.object({
  material_code: z
    .string()
    .trim()
    .max(64, 'Material code must be at most 64 characters')
    .regex(/^[A-Z0-9_-]+(?:-[A-Z0-9_-]+)*$/i, 'Material code can contain letters, numbers, dash, and underscore')
    .optional()
    .or(z.literal('')),
  cat_id: z.string().min(1, 'กรุณาเลือกหมวดหมู่'),
  category_id: optionalText(64),
  material_type_id: optionalText(64),
  code_spec_key: optionalText(12),
  mat_name_th: z
    .string()
    .trim()
    .min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(200, 'ชื่อยาวเกิน 200 ตัวอักษร'),
  mat_name_en: optionalText(200),
  normalized_name: optionalText(1000),
  spec: optionalText(500),
  brand: optionalText(100),
  model: optionalText(100),
  base_uom: z.string().min(1, 'กรุณาเลือกหน่วยนับ'),
  base_uom_id: optionalText(64),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
  note: optionalText(1000),
})

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>

export const updateMaterialSchema = createMaterialSchema.partial().extend({
  code_change_reason: optionalText(500),
  mat_name_th: z
    .string()
    .min(2, 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(200)
    .optional(),
})

export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>

export const createAliasSchema = z.object({
  material_id: z.string().min(1),
  alias_name: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อ')
    .max(200, 'ชื่อยาวเกิน 200 ตัวอักษร'),
  normalized_alias: optionalText(200),
  alias_type: z.enum(['COMMON', 'BRAND', 'ABBREV', 'LINE']),
  lang: z.enum(['TH', 'EN']).default('TH'),
  note: optionalText(500),
})

export type CreateAliasInput = z.infer<typeof createAliasSchema>

export const createUomConvSchema = z.object({
  material_id: z.string().min(1),
  from_uom: z.string().min(1, 'กรุณาเลือกหน่วยต้นทาง'),
  from_uom_id: optionalText(64),
  to_uom: z.string().min(1, 'กรุณาเลือกหน่วยปลายทาง'),
  to_uom_id: optionalText(64),
  factor: z
    .number({ invalid_type_error: 'ค่าต้องเป็นตัวเลข' })
    .positive('ค่าต้องมากกว่า 0'),
  formula_note: optionalText(500),
}).refine((d) => d.from_uom !== d.to_uom, {
  message: 'หน่วยต้นทางและปลายทางต้องไม่เหมือนกัน',
  path: ['to_uom'],
})

export type CreateUomConvInput = z.infer<typeof createUomConvSchema>
