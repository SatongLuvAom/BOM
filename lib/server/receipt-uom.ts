import { writeAuditLog } from '@/lib/server-utils'
import { ReceiptImportError, listReceiptItems } from '@/lib/server/receipt-import'

type ReceiptUomRow = {
  id: string
  uom_code: string | null
  uom_name_th: string | null
}

type ReceiptMaterialUomRow = {
  id: string
  material_id?: string | null
  material_code?: string | null
  mat_name_th?: string | null
  mat_name_en?: string | null
  spec?: string | null
  code_spec_key?: string | null
  base_uom?: string | null
  base_uom_id?: string | null
  uom?: ReceiptUomRow | null
}

type ReceiptItemUomLike = {
  id?: string
  item_name_raw?: string | null
  raw_text?: string | null
  uom_raw?: string | null
  uom?: string | null
  match_reason?: string | null
}

export type ReceiptUomInference = {
  uom_id: string | null
  uom_raw: string | null
  reason: 'receipt' | 'material' | 'rule' | 'missing'
  reasonText: string
}

const UOM_ALIASES: Record<string, string[]> = {
  PCS: ['PCS', 'PC', 'PIECE', 'PIECES', 'ชิ้น', 'อัน'],
  EA: ['EA', 'EACH', 'UNIT'],
  SHEET: ['SHEET', 'แผ่น'],
  M: ['M', 'METER', 'METRE', 'เมตร'],
  L: ['L', 'LTR', 'LITER', 'LITRE', 'ลิตร'],
  GALLON: ['GALLON', 'GAL', 'แกลลอน'],
  BOX: ['BOX', 'กล่อง'],
  ROLL: ['ROLL', 'ม้วน'],
  SET: ['SET', 'ชุด'],
  BAG: ['BAG', 'ถุง'],
  PAIL: ['PAIL', 'BUCKET', 'ถัง'],
  TUBE: ['TUBE', 'หลอด'],
  SQM: ['SQM', 'M2', 'ตารางเมตร', 'ตรม', 'ตร.ม.'],
}

const UOM_FALLBACKS: Record<string, string[]> = {
  PCS: ['PCS', 'EA'],
  EA: ['EA', 'PCS'],
  PAIL: ['PAIL', 'EA'],
  TUBE: ['TUBE', 'PCS', 'EA'],
}

export function normalizeReceiptUom(raw: string | null | undefined) {
  const text = normalizeDigits(String(raw ?? '').trim())
  if (!text) return ''
  return text
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[._/\\-]/g, '')
}

export function findUomByAliasOrCode(raw: string | null | undefined, uoms: ReceiptUomRow[]) {
  const key = normalizeReceiptUom(raw)
  if (!key) return null

  const exact = findUomByCodeOrName(key, uoms)
  if (exact) return exact

  for (const [code, aliases] of Object.entries(UOM_ALIASES)) {
    if (aliases.some((alias) => normalizeReceiptUom(alias) === key)) {
      const byPreferredCode = pickByCodes(UOM_FALLBACKS[code] ?? [code], uoms)
      if (byPreferredCode) return byPreferredCode
    }
  }

  if (key === 'PCS') return findUomByCodeOrName('EA', uoms)
  if (key === 'EA') return findUomByCodeOrName('PCS', uoms)
  if (key === 'PAIL') return findUomByCodeOrName('EA', uoms)
  if (key === 'TUBE') return findUomByCodeOrName('PCS', uoms)
  return null
}

export function inferUomFromItemName(itemName: string | null | undefined, uoms: ReceiptUomRow[]) {
  const text = normalizeDigits(String(itemName ?? '')).toLowerCase()
  const upper = text.toUpperCase()
  const hasDimension = /(\d+\s*(มม|ซม|เมตร|MM|CM|M|X|W)\b)|(\d+\s*[x×]\s*\d+)/i.test(upper)

  if (hasAny(text, ['ทินเนอร์', 'thinner'])) return pickByCodes(['GALLON', 'L'], uoms)
  if (hasAny(text, ['สี', 'paint', 'primer', 'coating'])) return pickByCodes(['L', 'GALLON'], uoms)
  if (hasAny(text, ['สกรู', 'screw'])) return pickByCodes(['BOX', 'PCS', 'EA'], uoms)
  if (hasAny(text, ['hmr', 'mdf', 'ไม้อัด', 'plywood', 'acrylic', 'อะคริลิค'])) return pickByCodes(['SHEET'], uoms)
  if (hasAny(text, ['ไม้'])) return pickByCodes(['SHEET', 'PCS', 'EA'], uoms)
  if (hasAny(text, ['สายไฟ', 'cable', 'wire'])) return pickByCodes(['M'], uoms)
  if (hasAny(text, ['เทป', 'tape'])) return pickByCodes(['ROLL'], uoms)
  if (hasAny(text, ['ซิลิโคน', 'silicone'])) return pickByCodes(['TUBE', 'PCS', 'EA'], uoms)
  if (hasAny(text, ['กาว', 'glue'])) return pickByCodes(['PCS', 'EA', 'L'], uoms)
  if (hasAny(text, ['กระจก', 'glass'])) return pickByCodes(hasDimension ? ['SQM', 'SHEET'] : ['SHEET', 'SQM'], uoms)
  if (hasAny(text, ['เหล็กกล่อง', 'steel box', 'pipe', 'ท่อ'])) return pickByCodes(hasDimension ? ['M', 'PCS', 'EA'] : ['PCS', 'EA', 'M'], uoms)
  return null
}

export function inferReceiptItemUom(
  item: ReceiptItemUomLike,
  material: ReceiptMaterialUomRow | null,
  uoms: ReceiptUomRow[],
  options: { preferMaterial?: boolean } = {},
): ReceiptUomInference {
  const preferMaterial = options.preferMaterial ?? true
  const materialInference = material ? inferUomFromMaterial(material, uoms) : null
  const receiptInference = inferUomFromReceiptRaw(item.uom_raw ?? item.uom ?? null, uoms)
  const ruleInference = inferUomFromRule(item, uoms)

  const ordered = preferMaterial
    ? [materialInference, receiptInference, ruleInference]
    : [receiptInference, materialInference, ruleInference]

  return ordered.find(Boolean) ?? {
    uom_id: null,
    uom_raw: null,
    reason: 'missing',
    reasonText: 'ยังไม่พบหน่วย',
  }
}

export async function fillMissingReceiptItemUoms(supabase: any, receiptId: string, userId: string) {
  const { data: receipt, error: receiptError } = await supabase
    .from('purchase_receipts')
    .select('id, status')
    .eq('id', receiptId)
    .maybeSingle()

  if (receiptError) throw new ReceiptImportError(receiptError.message, 500, 'DATABASE_ERROR', receiptError)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') {
    throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว เติมหน่วยไม่ได้', 400, 'BAD_REQUEST')
  }

  const [{ data: items, error: itemError }, { data: uoms, error: uomError }] = await Promise.all([
    supabase
      .from('purchase_receipt_items')
      .select('id, receipt_id, item_name_raw, raw_text, uom_raw, uom_id, material_id, suggested_material_id, match_reason')
      .eq('receipt_id', receiptId)
      .order('line_no', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('mat_uom')
      .select('id, uom_code, uom_name_th')
      .eq('is_deleted', false)
      .limit(500),
  ])

  if (itemError) throw new ReceiptImportError(itemError.message, 500, 'DATABASE_ERROR', itemError)
  if (uomError) throw new ReceiptImportError(uomError.message, 500, 'DATABASE_ERROR', uomError)

  const itemRows = (items ?? []) as Array<ReceiptItemUomLike & {
    material_id: string | null
    suggested_material_id: string | null
    uom_id: string | null
  }>
  const uomRows = (uoms ?? []) as ReceiptUomRow[]
  const materialIds = Array.from(new Set(
    itemRows
      .flatMap((item) => [item.material_id, item.suggested_material_id])
      .filter(Boolean) as string[],
  ))

  let materialRows: ReceiptMaterialUomRow[] = []
  if (materialIds.length > 0) {
    const { data: materials, error: materialError } = await supabase
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
        base_uom_id,
        uom:mat_uom!mat_master_base_uom_fkey(id, uom_code, uom_name_th)
      `)
      .eq('is_deleted', false)
      .in('id', materialIds)

    if (materialError) throw new ReceiptImportError(materialError.message, 500, 'DATABASE_ERROR', materialError)
    materialRows = (materials ?? []) as ReceiptMaterialUomRow[]
  }

  const materialById = new Map(materialRows.map((material) => [material.id, material]))
  const updates = itemRows
    .filter((item) => !item.uom_id)
    .map((item) => {
      const material = materialById.get(item.material_id ?? '') ?? materialById.get(item.suggested_material_id ?? '') ?? null
      const inference = inferReceiptItemUom(item, material, uomRows, { preferMaterial: true })
      if (!inference.uom_id) return null
      return {
        id: item.id!,
        uom_id: inference.uom_id,
        uom_raw: item.uom_raw || inference.uom_raw,
        match_reason: appendReason(item.match_reason, inference.reasonText),
      }
    })
    .filter(Boolean) as Array<{ id: string; uom_id: string; uom_raw: string | null; match_reason: string | null }>

  if (updates.length > 0) {
    const results = await Promise.all(updates.map((update) => (
      supabase
        .from('purchase_receipt_items')
        .update({
          uom_id: update.uom_id,
          uom_raw: update.uom_raw,
          match_reason: update.match_reason,
        })
        .eq('id', update.id)
        .eq('receipt_id', receiptId)
        .select('id')
        .single()
    )))

    const failed = results.find((result) => result.error)
    if (failed?.error) throw new ReceiptImportError(failed.error.message, 500, 'DATABASE_ERROR', failed.error)

    await writeAuditLog({
      entityType: 'purchase_receipt',
      entityKey: receiptId,
      action: 'AUTOFILL_UOM',
      payload: { filled: updates.length },
      createdBy: userId,
    })
  }

  const refreshedItems = await listReceiptItems(supabase, receiptId)
  const unresolved = refreshedItems.filter((item: any) => !item.uom_id).length
  return {
    items: refreshedItems,
    filled: updates.length,
    unresolved,
  }
}

function inferUomFromReceiptRaw(raw: string | null | undefined, uoms: ReceiptUomRow[]): ReceiptUomInference | null {
  const uom = findUomByAliasOrCode(raw, uoms)
  if (!uom) return null
  return {
    uom_id: uom.id,
    uom_raw: uom.uom_code || raw || null,
    reason: 'receipt',
    reasonText: 'อ่านจากสลิป',
  }
}

function inferUomFromMaterial(material: ReceiptMaterialUomRow, uoms: ReceiptUomRow[]): ReceiptUomInference | null {
  const uom = material.uom?.id
    ? material.uom
    : uoms.find((row) => row.id === material.base_uom_id) ?? findUomByAliasOrCode(material.base_uom, uoms)

  if (!uom?.id) return null
  return {
    uom_id: uom.id,
    uom_raw: uom.uom_code || uom.uom_name_th || material.base_uom || null,
    reason: 'material',
    reasonText: 'ใช้หน่วยจากวัสดุ',
  }
}

function inferUomFromRule(item: ReceiptItemUomLike, uoms: ReceiptUomRow[]): ReceiptUomInference | null {
  const text = [item.item_name_raw, item.raw_text].filter(Boolean).join(' ')
  const uom = inferUomFromItemName(text, uoms)
  if (!uom) return null
  return {
    uom_id: uom.id,
    uom_raw: uom.uom_code || uom.uom_name_th,
    reason: 'rule',
    reasonText: 'เดาจากชื่อสินค้า',
  }
}

function pickByCodes(codes: string[], uoms: ReceiptUomRow[]) {
  for (const code of codes) {
    const found = findUomByCodeOrName(code, uoms)
    if (found) return found
  }
  return null
}

function findUomByCodeOrName(value: string, uoms: ReceiptUomRow[]) {
  const key = normalizeReceiptUom(value)
  return uoms.find((uom) => (
    normalizeReceiptUom(uom.uom_code) === key
    || normalizeReceiptUom(uom.uom_name_th) === key
  )) ?? null
}

function appendReason(existing: string | null | undefined, reason: string) {
  const current = String(existing ?? '').trim()
  if (!current) return reason
  if (current.includes(reason)) return current
  return `${current}; ${reason}`
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value.toLowerCase()))
}

function normalizeDigits(value: string) {
  const thaiDigits: Record<string, string> = {
    '๐': '0',
    '๑': '1',
    '๒': '2',
    '๓': '3',
    '๔': '4',
    '๕': '5',
    '๖': '6',
    '๗': '7',
    '๘': '8',
    '๙': '9',
  }
  return value.replace(/[๐-๙]/g, (digit) => thaiDigits[digit] ?? digit)
}
