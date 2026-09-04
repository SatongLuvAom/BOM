import { z } from 'zod'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { inferSpecKeyFromMaterialText, inferTypePrefixFromText } from '@/lib/material-code'
import { writeAuditLog } from '@/lib/server-utils'
import {
  ReceiptImportError,
  getReceiptById,
  listReceiptItems,
} from '@/lib/server/receipt-import'
import { enrichReceiptItemsWithMaterialCandidates } from '@/lib/server/receipt-material-match'

export const receiptMaterialCandidateUpdateSchema = z.object({
  proposed_mat_name_th: z.string().trim().min(2).max(200).optional(),
  proposed_mat_name_en: z.string().trim().max(200).nullable().optional(),
  proposed_category_id: z.string().uuid().nullable().optional(),
  proposed_material_type_id: z.string().uuid().nullable().optional(),
  proposed_code_spec_key: z.string().trim().max(12).nullable().optional(),
  proposed_spec: z.string().trim().max(500).nullable().optional(),
  proposed_brand: z.string().trim().max(100).nullable().optional(),
  proposed_model: z.string().trim().max(100).nullable().optional(),
  proposed_uom_id: z.string().uuid().nullable().optional(),
  proposed_uom_raw: z.string().trim().max(50).nullable().optional(),
  proposed_aliases: z.array(z.string().trim().min(1).max(200)).max(10).nullable().optional(),
  status: z.enum(['needs_review', 'approved', 'rejected', 'created']).optional(),
})

export const approveReceiptMaterialCandidateSchema = receiptMaterialCandidateUpdateSchema.extend({
  expected_supplier_id: z.string().uuid(),
  confirmDuplicate: z.boolean().optional().default(false),
})

export const generateReceiptMaterialCandidatesSchema = z.object({
  itemIds: z.array(z.string().uuid()).max(100).optional(),
})

export const RECEIPT_MATERIAL_CANDIDATE_SELECT = `
  id,
  receipt_id,
  receipt_item_id,
  proposed_mat_name_th,
  proposed_mat_name_en,
  proposed_category_id,
  proposed_material_type_id,
  proposed_code_spec_key,
  proposed_spec,
  proposed_brand,
  proposed_model,
  proposed_uom_id,
  proposed_uom_raw,
  proposed_supplier_id,
  proposed_supplier_name_raw,
  proposed_unit_price,
  proposed_aliases,
  ai_confidence,
  ai_reason,
  duplicate_warning,
  status,
  created_material_id,
  reviewed_by,
  created_by,
  created_at,
  updated_at,
  reviewed_at,
  material_created_at,
  category:mat_category!receipt_material_candidates_proposed_category_id_fkey(id, cat_id, cat_code, cat_name_th, code_prefix),
  material_type:material_types!receipt_material_candidates_proposed_material_type_id_fkey(id, category_id, name, code_prefix),
  uom:mat_uom!receipt_material_candidates_proposed_uom_id_fkey(id, uom_code, uom_name_th),
  created_material:mat_master!receipt_material_candidates_created_material_id_fkey(id, material_id, material_code, mat_name_th, spec)
`

type CandidateInput = z.infer<typeof receiptMaterialCandidateUpdateSchema>

type ReceiptCandidateItem = {
  id: string
  receipt_id: string
  line_no: number | null
  raw_text: string | null
  item_name_raw: string | null
  uom_raw: string | null
  uom_id: string | null
  unit_price: number | null
  material_id: string | null
  suggested_material_id: string | null
  material_candidate_id?: string | null
  match_confidence: number | null
  match_reason: string | null
  review_status: string
  action: string | null
}

type CategoryRow = {
  id: string
  cat_id: string
  cat_code: string | null
  cat_name_th: string | null
  code_prefix: string | null
}

type MaterialTypeRow = {
  id: string
  category_id: string
  name: string
  code_prefix: string
  is_active: boolean
}

export async function getReceiptMaterialCandidates(supabase: any, receiptId: string) {
  const { data, error } = await supabase
    .from('receipt_material_candidates')
    .select(RECEIPT_MATERIAL_CANDIDATE_SELECT)
    .eq('receipt_id', receiptId)
    .order('created_at', { ascending: true })

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  return data ?? []
}

export function attachMaterialCandidatesToItems(items: any[], candidates: any[]) {
  const candidateByItemId = new Map<string, any>()
  for (const candidate of candidates ?? []) {
    candidateByItemId.set(candidate.receipt_item_id, candidate)
  }
  return (items ?? []).map((item) => ({
    ...item,
    material_candidate: candidateByItemId.get(item.id) ?? null,
  }))
}

export async function listReceiptReviewItems(supabase: any, receiptId: string, supplierId?: string | null) {
  const [items, candidates] = await Promise.all([
    listReceiptItems(supabase, receiptId),
    getReceiptMaterialCandidates(supabase, receiptId),
  ])
  const enrichedItems = await enrichReceiptItemsWithMaterialCandidates(supabase, items, supplierId)
  return attachMaterialCandidatesToItems(enrichedItems, candidates)
}

export async function ensureReceiptMaterialCandidatesForReview(
  supabase: any,
  receiptId: string,
  userId: string,
  supplierId?: string | null,
) {
  if (!supplierId) return listReceiptItems(supabase, receiptId)
  const items = await listReceiptReviewItems(supabase, receiptId, supplierId)
  const missingCandidateItemIds = items
    .filter(shouldCreateMaterialCandidateForItem)
    .map((item) => item.id)

  if (missingCandidateItemIds.length === 0) return items

  const generated = await generateReceiptMaterialCandidates(supabase, receiptId, userId, {
    itemIds: missingCandidateItemIds,
  })

  return generated.items
}

export async function generateReceiptMaterialCandidates(
  supabase: any,
  receiptId: string,
  userId: string,
  input: { itemIds?: string[] } = {},
) {
  const { data: receipt, error: receiptError } = await supabase
    .from('purchase_receipts')
    .select('id, status, supplier_id, supplier_name_raw')
    .eq('id', receiptId)
    .maybeSingle()

  if (receiptError) throw new ReceiptImportError(receiptError.message, 500, 'DATABASE_ERROR', receiptError)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว สร้าง Draft วัสดุไม่ได้', 400, 'BAD_REQUEST')
  if (!receipt.supplier_id) throw new ReceiptImportError('กรุณายืนยันร้านค้าและบันทึก Draft ก่อนสร้าง Draft วัสดุ', 400, 'VALIDATION_ERROR')

  let itemQuery = supabase
    .from('purchase_receipt_items')
    .select('id, receipt_id, line_no, raw_text, item_name_raw, uom_raw, uom_id, unit_price, material_id, suggested_material_id, material_candidate_id, match_confidence, match_reason, review_status, action')
    .eq('receipt_id', receiptId)
    .is('material_id', null)
    .neq('review_status', 'posted')
    .limit(300)

  if (input.itemIds?.length) {
    itemQuery = itemQuery.in('id', input.itemIds)
  }

  const [{ data: items, error: itemError }, existingCandidates, masterData, duplicateMaterials] = await Promise.all([
    itemQuery,
    getReceiptMaterialCandidates(supabase, receiptId),
    loadMaterialDraftMasterData(supabase),
    loadDuplicateCheckMaterials(supabase),
  ])

  if (itemError) throw new ReceiptImportError(itemError.message, 500, 'DATABASE_ERROR', itemError)

  const existingByItem = new Map((existingCandidates ?? []).map((candidate: any) => [candidate.receipt_item_id, candidate]))
  const candidateRows = (items ?? [])
    .filter(shouldCreateMaterialCandidateForItem)
    .filter((item: ReceiptCandidateItem) => !item.material_candidate_id && !existingByItem.has(item.id))
    .map((item: ReceiptCandidateItem) => buildCandidatePayload(item, receipt, masterData, duplicateMaterials, userId))
    .filter(Boolean) as any[]

  if (candidateRows.length === 0) {
    const reviewItems = await listReceiptReviewItems(supabase, receiptId, receipt.supplier_id)
    return { items: reviewItems, candidates: existingCandidates, created: 0, skipped: (items ?? []).length }
  }

  const { data: createdCandidates, error: insertError } = await supabase
    .from('receipt_material_candidates')
    .insert(candidateRows)
    .select(RECEIPT_MATERIAL_CANDIDATE_SELECT)

  if (insertError) throw new ReceiptImportError(insertError.message, 500, 'DATABASE_ERROR', insertError)

  const linkedResults = await Promise.all((createdCandidates ?? []).map((candidate: any) => (
    supabase
      .from('purchase_receipt_items')
      .update({
        material_candidate_id: candidate.id,
        material_resolution_status: 'candidate_created',
        action: 'create_material_needed',
        review_status: 'needs_review',
      })
      .eq('id', candidate.receipt_item_id)
      .eq('receipt_id', receiptId)
      .is('material_id', null)
      .neq('review_status', 'posted')
      .select('id')
  )))
  const failedLink = linkedResults.find((result) => result.error)
  if (failedLink?.error) throw new ReceiptImportError(failedLink.error.message, 500, 'DATABASE_ERROR', failedLink.error)
  // A competing selection/post owns the row; do not overwrite it or count it as linked.
  const linkedItemIds = linkedResults.flatMap((result) => (result.data ?? []).map((item: any) => item.id))

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: receiptId,
    action: 'CREATE_MATERIAL_CANDIDATES',
    payload: {
      created: linkedItemIds.length,
      item_ids: linkedItemIds,
    },
    createdBy: userId,
  })

  const reviewItems = await listReceiptReviewItems(supabase, receiptId, receipt.supplier_id)
  const candidates = await getReceiptMaterialCandidates(supabase, receiptId)
  return {
    items: reviewItems,
    candidates,
    created: linkedItemIds.length,
    skipped: Math.max(0, (items ?? []).length - linkedItemIds.length),
  }
}

export async function updateReceiptMaterialCandidate(
  supabase: any,
  receiptId: string,
  candidateId: string,
  input: CandidateInput,
  userId: string,
) {
  const candidate = await getCandidateForUpdate(supabase, receiptId, candidateId)
  if (candidate.status === 'created') {
    throw new ReceiptImportError('Draft วัสดุนี้สร้างเป็นวัสดุจริงแล้ว แก้ไขไม่ได้', 400, 'BAD_REQUEST')
  }
  if (input.status === 'created') {
    throw new ReceiptImportError('ต้องอนุมัติผ่านปุ่มอนุมัติและสร้างวัสดุเท่านั้น', 400, 'VALIDATION_ERROR')
  }

  const patch = normalizeCandidatePatch(input)
  if (Object.keys(patch).length === 0) return candidate

  const duplicateWarning = await buildDuplicateWarning(supabase, {
    proposed_mat_name_th: patch.proposed_mat_name_th ?? candidate.proposed_mat_name_th,
    proposed_mat_name_en: patch.proposed_mat_name_en ?? candidate.proposed_mat_name_en,
    proposed_spec: patch.proposed_spec ?? candidate.proposed_spec,
    proposed_code_spec_key: patch.proposed_code_spec_key ?? candidate.proposed_code_spec_key,
    proposed_category_id: patch.proposed_category_id ?? candidate.proposed_category_id,
  })

  const { data, error } = await supabase
    .from('receipt_material_candidates')
    .update({
      ...patch,
      duplicate_warning: duplicateWarning,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', candidateId)
    .eq('receipt_id', receiptId)
    .select(RECEIPT_MATERIAL_CANDIDATE_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'receipt_material_candidate',
    entityKey: candidateId,
    action: 'UPDATE',
    payload: { before: candidate, after: data },
    createdBy: userId,
  })

  return data
}

export async function approveReceiptMaterialCandidate(
  supabase: any,
  receiptId: string,
  candidateId: string,
  input: z.infer<typeof approveReceiptMaterialCandidateSchema>,
  userId: string,
) {
  const { data, error } = await supabase.rpc('approve_receipt_material_candidate_scoped', {
    p_expected_supplier_id: input.expected_supplier_id,
    p_receipt_id: receiptId,
    p_candidate_id: candidateId,
    p_confirm_duplicate: Boolean(input.confirmDuplicate),
    p_actor_id: userId,
    p_candidate_patch: normalizeCandidatePatch(input),
  })

  if (error) {
    throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  }

  if (data?.ok === false) {
    throw new ReceiptImportError(
      data.error ?? 'พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่',
      data.code === 'DUPLICATE' ? 409 : 400,
      data.code ?? 'VALIDATION_ERROR',
      data.details,
    )
  }

  if (!data?.ok) {
    throw new ReceiptImportError('อนุมัติแล้วแต่ระบบไม่ส่งผลลัพธ์กลับมา', 500, 'DATABASE_ERROR', data)
  }

  const receipt = await getReceiptForCandidateAction(supabase, receiptId)
  const [items, candidates] = await Promise.all([
    listReceiptReviewItems(supabase, receiptId, receipt.supplier_id),
    getReceiptMaterialCandidates(supabase, receiptId),
  ])
  const updatedCandidate = candidates.find((candidate: any) => candidate.id === candidateId) ?? null

  return {
    candidate: updatedCandidate,
    material: {
      id: data.material_id,
      material_code: data.material_code,
    },
    items,
    result: data,
  }
}

export async function repairReceiptState(supabase: any, receiptId: string, userId: string) {
  const { data, error } = await supabase.rpc('repair_receipt_state_v1', {
    p_receipt_id: receiptId,
    p_actor_id: userId,
  })

  if (error) {
    throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  }

  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')

  const items = await listReceiptReviewItems(supabase, receiptId, receipt.supplier_id)
  return {
    summary: data,
    receipt,
    items,
  }
}

async function getCandidateForUpdate(supabase: any, receiptId: string, candidateId: string) {
  const [receipt, candidateRes] = await Promise.all([
    getReceiptForCandidateAction(supabase, receiptId),
    supabase
      .from('receipt_material_candidates')
      .select(RECEIPT_MATERIAL_CANDIDATE_SELECT)
      .eq('id', candidateId)
      .eq('receipt_id', receiptId)
      .maybeSingle(),
  ])

  const { data: candidate, error } = candidateRes
  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  if (!candidate) throw new ReceiptImportError('Material candidate not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว แก้ไข Draft วัสดุไม่ได้', 400, 'BAD_REQUEST')
  return candidate
}

async function getReceiptForCandidateAction(supabase: any, receiptId: string) {
  const { data: receipt, error } = await supabase
    .from('purchase_receipts')
    .select('id, status, supplier_id, supplier_name_raw, receipt_no')
    .eq('id', receiptId)
    .maybeSingle()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว', 400, 'BAD_REQUEST')
  return receipt
}

function normalizeCandidatePatch(input: CandidateInput) {
  const allowedKeys = new Set([
    'proposed_mat_name_th',
    'proposed_mat_name_en',
    'proposed_category_id',
    'proposed_material_type_id',
    'proposed_code_spec_key',
    'proposed_spec',
    'proposed_brand',
    'proposed_model',
    'proposed_uom_id',
    'proposed_uom_raw',
    'proposed_aliases',
    'status',
  ])
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) continue
    if (value === undefined) continue
    patch[key] = typeof value === 'string' ? value.trim() || null : value
  }
  return patch
}

async function loadMaterialDraftMasterData(supabase: any) {
  const [{ data: categories, error: categoryError }, { data: materialTypes, error: typeError }] = await Promise.all([
    supabase
      .from('mat_category')
      .select('id, cat_id, cat_code, cat_name_th, code_prefix')
      .eq('is_deleted', false)
      .order('sort_order'),
    supabase
      .from('material_types')
      .select('id, category_id, name, code_prefix, is_active')
      .eq('is_active', true)
      .order('code_prefix'),
  ])

  if (categoryError) throw new ReceiptImportError(categoryError.message, 500, 'DATABASE_ERROR', categoryError)
  if (typeError) throw new ReceiptImportError(typeError.message, 500, 'DATABASE_ERROR', typeError)

  return {
    categories: (categories ?? []) as CategoryRow[],
    materialTypes: (materialTypes ?? []) as MaterialTypeRow[],
  }
}

async function loadDuplicateCheckMaterials(supabase: any) {
  const { data, error } = await supabase
    .from('mat_master')
    .select('id, material_id, material_code, mat_name_th, mat_name_en, spec, code_spec_key, category_id')
    .eq('is_deleted', false)
    .limit(5000)

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
  return data ?? []
}

function buildCandidatePayload(
  item: ReceiptCandidateItem,
  receipt: { id: string; supplier_id: string | null; supplier_name_raw: string | null },
  masterData: { categories: CategoryRow[]; materialTypes: MaterialTypeRow[] },
  duplicateMaterials: any[],
  userId: string,
) {
  const itemName = String(item.item_name_raw || item.raw_text || '').trim()
  if (itemName.length < 2) return null

  const proposed = inferCandidateMaterialData(itemName, item.raw_text, masterData)
  const duplicateWarning = buildDuplicateWarningFromRows(duplicateMaterials, {
    proposed_mat_name_th: proposed.proposed_mat_name_th,
    proposed_mat_name_en: proposed.proposed_mat_name_en,
    proposed_spec: proposed.proposed_spec,
    proposed_code_spec_key: proposed.proposed_code_spec_key,
    proposed_category_id: proposed.proposed_category_id,
  })

  return {
    receipt_id: receipt.id,
    receipt_item_id: item.id,
    ...proposed,
    proposed_uom_id: item.uom_id,
    proposed_uom_raw: item.uom_raw,
    proposed_supplier_id: receipt.supplier_id,
    proposed_supplier_name_raw: receipt.supplier_name_raw,
    proposed_unit_price: item.unit_price,
    proposed_aliases: Array.from(new Set([item.raw_text, item.item_name_raw].filter(Boolean))).slice(0, 3),
    ai_confidence: item.match_confidence,
    ai_reason: item.match_reason || 'ไม่พบวัสดุเดิมในระบบ สร้าง Draft วัสดุจากรายการสลิป',
    duplicate_warning: duplicateWarning,
    status: 'needs_review',
    created_by: userId,
  }
}

function inferCandidateMaterialData(
  itemName: string,
  rawText: string | null,
  masterData: { categories: CategoryRow[]; materialTypes: MaterialTypeRow[] },
) {
  const text = [itemName, rawText].filter(Boolean).join(' ')
  const typePrefix = inferTypePrefixFromText({
    matNameTh: itemName,
    matNameEn: itemName,
    spec: rawText,
  })
  const materialType = masterData.materialTypes.find((type) => type.code_prefix === typePrefix) ?? null
  const category = materialType
    ? masterData.categories.find((row) => row.id === materialType.category_id) ?? null
    : inferCategoryFromText(text, masterData.categories)
  const categoryType = materialType && category?.id === materialType.category_id
    ? materialType
    : masterData.materialTypes.find((type) => type.category_id === category?.id && type.code_prefix === typePrefix) ?? null
  const specKey = inferSpecKeyFromMaterialText({
    matNameTh: itemName,
    matNameEn: itemName,
    spec: rawText || itemName,
  })

  return {
    proposed_mat_name_th: itemName,
    proposed_mat_name_en: /[A-Za-z]/.test(itemName) && !/[\u0E00-\u0E7F]/.test(itemName) ? itemName : null,
    proposed_category_id: category?.id ?? null,
    proposed_material_type_id: categoryType?.id ?? null,
    proposed_code_spec_key: specKey,
    proposed_spec: specKey && specKey !== 'GEN' ? specKey : rawText || null,
    proposed_brand: null,
    proposed_model: null,
  }
}

function inferCategoryFromText(text: string, categories: CategoryRow[]) {
  const normalized = normalizeMaterialSearchText(text)
  const rules: Array<{ prefix: string[]; pattern: RegExp }> = [
    { prefix: ['WD', 'STR'], pattern: /hmr|mdf|ply|plywood|wood|ไม้|ไม้อัด/ },
    { prefix: ['PT', 'PNT', 'CHEM'], pattern: /paint|primer|thinner|สี|ทินเนอร์|รองพื้น/ },
    { prefix: ['ELE', 'ELC'], pattern: /led|wire|cable|switch|plug|ไฟ|สายไฟ|สวิตช์|ปลั๊ก/ },
    { prefix: ['HW'], pattern: /hinge|screw|handle|lock|บานพับ|สกรู|มือจับ|กุญแจ/ },
    { prefix: ['MT', 'MET'], pattern: /steel|pipe|tube|เหล็ก|ท่อ/ },
    { prefix: ['LAM', 'FNR'], pattern: /laminate|hpl|edge|ลามิเนต|ปิดขอบ/ },
    { prefix: ['PRN'], pattern: /print|vinyl|sticker|พิมพ์|สติ๊กเกอร์|ไวนิล/ },
    { prefix: ['ACR', 'GLS'], pattern: /acrylic|glass|mirror|อะคริลิค|กระจก/ },
    { prefix: ['ADH'], pattern: /glue|silicone|sealant|tape|กาว|ซิลิโคน|เทป/ },
  ]

  for (const rule of rules) {
    if (!rule.pattern.test(normalized)) continue
    const match = categories.find((category) => rule.prefix.includes(String(category.code_prefix ?? category.cat_code ?? '').toUpperCase()))
    if (match) return match
  }

  return categories.find((category) => ['MISC', 'GEN'].includes(String(category.code_prefix ?? category.cat_code ?? '').toUpperCase()))
    ?? categories[0]
    ?? null
}

async function buildDuplicateWarning(supabase: any, candidate: {
  proposed_mat_name_th?: string | null
  proposed_mat_name_en?: string | null
  proposed_spec?: string | null
  proposed_code_spec_key?: string | null
  proposed_category_id?: string | null
}) {
  const rows = await loadDuplicateCheckMaterials(supabase)
  return buildDuplicateWarningFromRows(rows, candidate)
}

function buildDuplicateWarningFromRows(rows: any[], candidate: {
  proposed_mat_name_th?: string | null
  proposed_mat_name_en?: string | null
  proposed_spec?: string | null
  proposed_code_spec_key?: string | null
  proposed_category_id?: string | null
}) {
  const candidateName = normalizeMaterialSearchText([candidate.proposed_mat_name_th, candidate.proposed_mat_name_en].filter(Boolean).join(' '))
  const candidateSpec = normalizeMaterialSearchText([candidate.proposed_spec, candidate.proposed_code_spec_key].filter(Boolean).join(' '))
  if (!candidateName) return null

  const matches = rows
    .filter((row) => !candidate.proposed_category_id || row.category_id === candidate.proposed_category_id)
    .map((row) => {
      const rowName = normalizeMaterialSearchText([row.mat_name_th, row.mat_name_en].filter(Boolean).join(' '))
      const rowSpec = normalizeMaterialSearchText([row.spec, row.code_spec_key].filter(Boolean).join(' '))
      const sameName = rowName === candidateName
      const similarName = tokenSimilarity(candidateName, rowName) >= 0.65 || rowName.includes(candidateName) || candidateName.includes(rowName)
      const sameSpec = candidateSpec && rowSpec ? candidateSpec === rowSpec : false
      if (!sameName && !similarName) return null
      return {
        material_id: row.material_id,
        material_code: row.material_code,
        mat_name_th: row.mat_name_th,
        spec: row.spec,
        reason: sameName && sameSpec ? 'ชื่อและสเปกใกล้เคียงวัสดุเดิม' : 'พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่',
        score: sameName ? (sameSpec ? 95 : 80) : 70,
      }
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, 3)

  return matches.length > 0 ? { matches } : null
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection)
}

function shouldCreateMaterialCandidateForItem(item: {
  id?: string
  raw_text?: string | null
  item_name_raw?: string | null
  material_id?: string | null
  material_candidate_id?: string | null
  action?: string | null
  review_status?: string | null
}) {
  if (item.material_id || item.material_candidate_id) return false
  if (item.review_status === 'posted' || item.action === 'ignore') return false
  const itemName = String(item.item_name_raw || item.raw_text || '').trim()
  return itemName.length >= 2
}
