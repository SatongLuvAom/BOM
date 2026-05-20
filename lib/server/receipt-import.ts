import { z } from 'zod'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { resolveMaterialSearchMatches } from '@/lib/server/material-search'
import { writeAuditLog } from '@/lib/server-utils'

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()])
  .optional()
  .transform((value) => value || null)

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : Number(value)),
  z.number().finite().nullable(),
)

const optionalUuid = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .optional()
  .transform((value) => value || null)

export const receiptStatusSchema = z.enum(['draft', 'needs_review', 'reviewed', 'posted', 'rejected'])
export const receiptItemActionSchema = z.enum(['update_price', 'create_material_needed', 'ignore', 'needs_review'])
export const receiptItemReviewStatusSchema = z.enum(['needs_review', 'reviewed', 'posted', 'ignored'])

export const createReceiptDraftSchema = z.object({
  supplier_id: optionalUuid,
  supplier_name_raw: optionalString,
  supplier_tax_id_raw: optionalString,
  receipt_date: optionalDate,
  receipt_no: optionalString,
  subtotal: optionalNumber,
  vat: optionalNumber,
  discount: optionalNumber,
  grand_total: optionalNumber,
  notes: optionalString,
})

export const updateReceiptDraftSchema = createReceiptDraftSchema.extend({
  status: receiptStatusSchema.optional(),
})

export const createReceiptItemSchema = z.object({
  line_no: optionalNumber,
  raw_text: optionalString,
  item_name_raw: optionalString,
  qty: optionalNumber,
  uom_raw: optionalString,
  uom_id: optionalUuid,
  unit_price: optionalNumber,
  line_total: optionalNumber,
  vat_amount: optionalNumber,
  discount_amount: optionalNumber,
  suggested_material_id: optionalUuid,
  material_id: optionalUuid,
  match_confidence: optionalNumber,
  match_reason: optionalString,
  review_status: receiptItemReviewStatusSchema.optional(),
  action: receiptItemActionSchema.optional().nullable(),
})

export const updateReceiptItemSchema = createReceiptItemSchema.partial()

export type CreateReceiptDraftInput = z.infer<typeof createReceiptDraftSchema>
export type UpdateReceiptDraftInput = z.infer<typeof updateReceiptDraftSchema>
export type CreateReceiptItemInput = z.infer<typeof createReceiptItemSchema>
export type UpdateReceiptItemInput = z.infer<typeof updateReceiptItemSchema>

export class ReceiptImportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'BAD_REQUEST',
    public details?: unknown,
  ) {
    super(message)
  }
}

export const RECEIPT_SELECT = `
  id,
  receipt_no,
  receipt_date,
  supplier_id,
  supplier_name_raw,
  supplier_tax_id_raw,
  subtotal,
  vat,
  discount,
  grand_total,
  file_url,
  file_name,
  file_mime_type,
  status,
  confidence,
  notes,
  created_by,
  reviewed_by,
  posted_by,
  created_at,
  updated_at,
  reviewed_at,
  posted_at,
  supplier:supplier!purchase_receipts_supplier_id_fkey(id, supplier_id, supplier_code, supplier_name_th)
`

export const RECEIPT_ITEM_SELECT = `
  id,
  receipt_id,
  line_no,
  raw_text,
  item_name_raw,
  item_name_normalized,
  qty,
  uom_raw,
  uom_id,
  unit_price,
  line_total,
  vat_amount,
  discount_amount,
  suggested_material_id,
  material_id,
  match_confidence,
  match_reason,
  review_status,
  action,
  created_at,
  updated_at,
  material:mat_master!purchase_receipt_items_material_id_fkey(
    id,
    material_id,
    material_code,
    mat_name_th,
    mat_name_en,
    spec,
    code_spec_key,
    base_uom,
    category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th),
    uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th)
  ),
  suggested_material:mat_master!purchase_receipt_items_suggested_material_id_fkey(
    id,
    material_id,
    material_code,
    mat_name_th,
    mat_name_en,
    spec,
    code_spec_key,
    base_uom
  ),
  uom:mat_uom!purchase_receipt_items_uom_id_fkey(id, uom_code, uom_name_th)
`

function normalizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function normalizeReceiptPayload(input: CreateReceiptDraftInput | UpdateReceiptDraftInput, userId?: string) {
  return {
    receipt_no: normalizeNullableText(input.receipt_no),
    receipt_date: input.receipt_date ?? null,
    supplier_id: input.supplier_id ?? null,
    supplier_name_raw: normalizeNullableText(input.supplier_name_raw),
    supplier_tax_id_raw: normalizeNullableText(input.supplier_tax_id_raw),
    subtotal: input.subtotal,
    vat: input.vat,
    discount: input.discount,
    grand_total: input.grand_total,
    notes: normalizeNullableText(input.notes),
    ...(userId ? { created_by: userId } : {}),
    ...('status' in input && input.status ? { status: input.status } : {}),
  }
}

function nextReviewStatus(action: string | null | undefined, requested?: string | null) {
  if (requested && requested !== 'needs_review') return requested
  if (action === 'update_price' || action === 'ignore' || action === 'create_material_needed') return 'reviewed'
  return 'needs_review'
}

function normalizeReceiptItemPayload(input: CreateReceiptItemInput | UpdateReceiptItemInput) {
  const action = input.action || null
  const itemName = normalizeNullableText(input.item_name_raw)

  return {
    line_no: input.line_no === null || input.line_no === undefined ? null : Math.trunc(Number(input.line_no)),
    raw_text: normalizeNullableText(input.raw_text),
    item_name_raw: itemName,
    item_name_normalized: normalizeMaterialSearchText(itemName),
    qty: input.qty,
    uom_raw: normalizeNullableText(input.uom_raw),
    uom_id: input.uom_id ?? null,
    unit_price: input.unit_price,
    line_total: input.line_total,
    vat_amount: input.vat_amount,
    discount_amount: input.discount_amount,
    suggested_material_id: input.suggested_material_id ?? null,
    material_id: input.material_id ?? null,
    match_confidence: input.match_confidence,
    match_reason: normalizeNullableText(input.match_reason),
    action,
    review_status: nextReviewStatus(action, input.review_status),
  }
}

export function isReceiptSchemaMissing(error: any) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`
  return (
    text.includes('42P01') ||
    text.includes('PGRST205') ||
    text.includes('purchase_receipts') ||
    text.includes('purchase_receipt_items') ||
    text.includes('fn_post_purchase_receipt_to_price_history')
  )
}

export async function createReceiptDraft(supabase: any, input: CreateReceiptDraftInput, userId: string) {
  const { data, error } = await supabase
    .from('purchase_receipts')
    .insert(normalizeReceiptPayload(input, userId))
    .select(RECEIPT_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: data.id,
    action: 'CREATE',
    payload: data,
    createdBy: userId,
  })

  return data
}

export async function updateReceiptDraft(supabase: any, id: string, input: UpdateReceiptDraftInput, userId: string) {
  const existing = await getReceiptById(supabase, id)
  if (!existing) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (existing.status === 'posted') {
    throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว แก้ไขหัวสลิปไม่ได้', 400, 'BAD_REQUEST')
  }

  const { data, error } = await supabase
    .from('purchase_receipts')
    .update({
      ...normalizeReceiptPayload(input),
      reviewed_by: input.status === 'reviewed' ? userId : existing.reviewed_by,
      reviewed_at: input.status === 'reviewed' ? new Date().toISOString() : existing.reviewed_at,
    })
    .eq('id', id)
    .select(RECEIPT_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: id,
    action: 'UPDATE',
    payload: { before: existing, after: data },
    createdBy: userId,
  })

  return data
}

export async function getReceiptById(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('purchase_receipts')
    .select(RECEIPT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  return data
}

export async function listReceiptItems(supabase: any, receiptId: string) {
  const { data, error } = await supabase
    .from('purchase_receipt_items')
    .select(RECEIPT_ITEM_SELECT)
    .eq('receipt_id', receiptId)
    .order('line_no', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  return data ?? []
}

export async function addReceiptItem(supabase: any, receiptId: string, input: CreateReceiptItemInput, userId: string) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว เพิ่มรายการไม่ได้', 400, 'BAD_REQUEST')

  const { data, error } = await supabase
    .from('purchase_receipt_items')
    .insert({
      ...normalizeReceiptItemPayload(input),
      receipt_id: receiptId,
    })
    .select(RECEIPT_ITEM_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await supabase
    .from('purchase_receipts')
    .update({ status: 'needs_review' })
    .eq('id', receiptId)
    .neq('status', 'posted')

  await writeAuditLog({
    entityType: 'purchase_receipt_item',
    entityKey: data.id,
    action: 'CREATE',
    payload: data,
    createdBy: userId,
  })

  return data
}

export async function updateReceiptItem(supabase: any, receiptId: string, itemId: string, input: UpdateReceiptItemInput, userId: string) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว แก้ไขรายการไม่ได้', 400, 'BAD_REQUEST')

  const { data: before, error: beforeError } = await supabase
    .from('purchase_receipt_items')
    .select(RECEIPT_ITEM_SELECT)
    .eq('id', itemId)
    .eq('receipt_id', receiptId)
    .maybeSingle()

  if (beforeError) throw new ReceiptImportError(beforeError.message, 500, 'DATABASE_ERROR', beforeError)
  if (!before) throw new ReceiptImportError('Receipt item not found', 404, 'NOT_FOUND')

  const { data, error } = await supabase
    .from('purchase_receipt_items')
    .update(normalizeReceiptItemPayload({ ...before, ...input }))
    .eq('id', itemId)
    .eq('receipt_id', receiptId)
    .select(RECEIPT_ITEM_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt_item',
    entityKey: itemId,
    action: 'UPDATE',
    payload: { before, after: data },
    createdBy: userId,
  })

  return data
}

export async function deleteReceiptItem(supabase: any, receiptId: string, itemId: string, userId: string) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว ลบรายการไม่ได้', 400, 'BAD_REQUEST')

  const { data: before, error: beforeError } = await supabase
    .from('purchase_receipt_items')
    .select(RECEIPT_ITEM_SELECT)
    .eq('id', itemId)
    .eq('receipt_id', receiptId)
    .maybeSingle()

  if (beforeError) throw new ReceiptImportError(beforeError.message, 500, 'DATABASE_ERROR', beforeError)
  if (!before) throw new ReceiptImportError('Receipt item not found', 404, 'NOT_FOUND')

  const { error } = await supabase
    .from('purchase_receipt_items')
    .delete()
    .eq('id', itemId)
    .eq('receipt_id', receiptId)

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt_item',
    entityKey: itemId,
    action: 'DELETE',
    payload: before,
    createdBy: userId,
  })
}

export async function deleteReceiptDraft(supabase: any, id: string, userId: string) {
  const existing = await getReceiptById(supabase, id)
  if (!existing) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (existing.status === 'posted') {
    throw new ReceiptImportError('ไม่สามารถลบสลิปที่บันทึกเข้าระบบแล้วได้', 400, 'BAD_REQUEST')
  }

  const { error } = await supabase
    .from('purchase_receipts')
    .delete()
    .eq('id', id)

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: id,
    action: 'DELETE',
    payload: existing,
    createdBy: userId,
  })
}

export async function searchMaterialCandidates(supabase: any, search: string, limit = 8) {
  const normalized = normalizeMaterialSearchText(search)
  if (normalized.length < 2) return []

  const rankedIds = await resolveMaterialSearchMatches(supabase, normalized)
  if (rankedIds.length === 0) return []

  const limitedIds = rankedIds.slice(0, Math.min(limit, 10))
  const { data, error } = await supabase
    .from('mat_master')
    .select(`
      id,
      material_id,
      material_code,
      mat_name_th,
      mat_name_en,
      spec,
      code_spec_key,
      base_uom,
      category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th),
      uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th)
    `)
    .eq('is_deleted', false)
    .in('material_id', limitedIds)

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  const order = new Map(limitedIds.map((materialId, index) => [materialId, index]))
  return (data ?? []).sort((left: any, right: any) => {
    return (order.get(left.material_id) ?? 999) - (order.get(right.material_id) ?? 999)
  })
}

export async function validateReceiptBeforePosting(supabase: any, id: string) {
  const receipt = await getReceiptById(supabase, id)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')

  const items = await listReceiptItems(supabase, id)
  const errors: string[] = []

  if (receipt.status === 'posted') errors.push('สลิปนี้ถูกบันทึกเข้าระบบแล้ว')
  if (!receipt.supplier_id) errors.push('ต้องเลือกซัพพลายเออร์ก่อนบันทึกราคา')
  if (!items.some((item: any) => item.action === 'update_price')) errors.push('ยังไม่มีรายการที่เลือกให้อัปเดตราคา')

  for (const item of items as any[]) {
    if (!item.action || item.action === 'needs_review' || item.review_status === 'needs_review') {
      errors.push(`รายการ ${item.line_no ?? item.item_name_raw ?? item.id} ยังต้องตรวจสอบ`)
      continue
    }

    if (item.action === 'update_price') {
      if (!item.material_id) errors.push(`รายการ ${item.line_no ?? item.item_name_raw ?? item.id} ยังไม่ได้เลือกวัสดุ`)
      if (!item.unit_price || Number(item.unit_price) <= 0) errors.push(`รายการ ${item.line_no ?? item.item_name_raw ?? item.id} ยังไม่มีราคา/หน่วยที่ถูกต้อง`)
    }
  }

  if (errors.length > 0) {
    throw new ReceiptImportError('ยังบันทึกราคาเข้าระบบไม่ได้', 400, 'VALIDATION_ERROR', errors)
  }

  return { receipt, items }
}

export async function postReceiptToPriceHistory(supabase: any, id: string, userId: string) {
  await validateReceiptBeforePosting(supabase, id)

  const { data, error } = await supabase.rpc('fn_post_purchase_receipt_to_price_history', {
    p_receipt_id: id,
    p_user_id: userId,
  })

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: id,
    action: 'POST',
    payload: data,
    createdBy: userId,
  })

  return data
}
