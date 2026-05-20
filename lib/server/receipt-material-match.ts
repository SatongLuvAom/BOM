import { normalizeMaterialSearchText } from '@/lib/material-master'
import { writeAuditLog } from '@/lib/server-utils'
import {
  ReceiptImportError,
  deriveReceiptItemReviewStatus,
  listReceiptItems,
} from '@/lib/server/receipt-import'

type ReceiptMatchItem = {
  id: string
  item_name_raw: string | null
  raw_text: string | null
  material_id: string | null
  suggested_material_id: string | null
  action: string | null
  uom_raw: string | null
  uom_id: string | null
  unit_price: number | null
  match_reason: string | null
  review_status: string
}

type UomRelation = {
  id?: string | null
  uom_code: string | null
  uom_name_th: string | null
}

type MaterialMatchRow = {
  id: string
  material_id: string
  material_code: string | null
  mat_name_th: string | null
  mat_name_en: string | null
  normalized_name: string | null
  brand: string | null
  model: string | null
  spec: string | null
  code_spec_key: string | null
  base_uom: string | null
  base_uom_id: string | null
  category?: {
    cat_code: string | null
    cat_name_th: string | null
  } | null
  uom?: UomRelation | null
}

type AliasRow = {
  material_id: string | null
  material_uuid?: string | null
  alias_name: string | null
  normalized_alias: string | null
}

type MatchContext = {
  materials: MaterialMatchRow[]
  aliasesByMaterialId: Map<string, string[]>
  supplierMaterialIds: Set<string>
}

type MatchResult = {
  material: MaterialMatchRow
  score: number
  reason: string
}

export async function autoMatchReceiptItemMaterials(supabase: any, receiptId: string, userId: string) {
  const { data: receipt, error: receiptError } = await supabase
    .from('purchase_receipts')
    .select('id, status, supplier_id')
    .eq('id', receiptId)
    .maybeSingle()

  if (receiptError) throw new ReceiptImportError(receiptError.message, 500, 'DATABASE_ERROR', receiptError)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว จับคู่วัสดุไม่ได้', 400, 'BAD_REQUEST')

  const [{ data: items, error: itemError }, context] = await Promise.all([
    supabase
      .from('purchase_receipt_items')
      .select('id, item_name_raw, raw_text, material_id, suggested_material_id, action, uom_raw, uom_id, unit_price, match_reason, review_status')
      .eq('receipt_id', receiptId)
      .is('material_id', null)
      .neq('review_status', 'posted')
      .limit(300),
    loadMaterialMatchContext(supabase, receipt.supplier_id),
  ])

  if (itemError) throw new ReceiptImportError(itemError.message, 500, 'DATABASE_ERROR', itemError)

  const itemRows = (items ?? []) as ReceiptMatchItem[]
  const updates = itemRows.map((item) => {
    const candidates = findMaterialCandidatesForReceiptItem(item, context, 3)
    const best = candidates[0] ?? null

    if (!best) {
      return {
        item,
        highConfidence: false,
        hasCandidate: false,
        patch: {
          suggested_material_id: null,
          material_resolution_status: 'unresolved',
          match_confidence: null,
          match_reason: appendReason(item.match_reason, 'ไม่พบวัสดุในระบบ'),
          review_status: 'needs_review',
        },
      }
    }

    const highConfidence = best.score >= 90
    const nextAction = highConfidence && (!item.action || item.action === 'needs_review') ? 'update_price' : item.action
    const nextUomId = !item.uom_id && highConfidence ? best.material.base_uom_id : item.uom_id
    const nextUomRaw = !item.uom_id && highConfidence ? best.material.base_uom : item.uom_raw
    const nextReason = appendReason(
      appendReason(
        appendReason(item.match_reason, best.reason),
        highConfidence ? 'เลือกให้อัตโนมัติ' : 'พบวัสดุใกล้เคียง',
      ),
      nextUomId && !item.uom_id ? 'ใช้หน่วยจากวัสดุ' : '',
    )

    return {
      item,
      highConfidence,
      hasCandidate: true,
      patch: {
        material_id: highConfidence ? best.material.id : null,
        suggested_material_id: best.material.id,
        material_resolution_status: highConfidence ? 'matched_existing' : 'unresolved',
        uom_id: nextUomId,
        uom_raw: nextUomRaw,
        match_confidence: best.score,
        match_reason: nextReason,
        action: nextAction,
        review_status: deriveReceiptItemReviewStatus({
          action: nextAction,
          material_id: highConfidence ? best.material.id : null,
          uom_id: nextUomId,
          unit_price: item.unit_price,
        }),
      },
    }
  })

  if (updates.length > 0) {
    const results = await Promise.all(updates.map((update) => (
      supabase
        .from('purchase_receipt_items')
        .update(update.patch)
        .eq('id', update.item.id)
        .eq('receipt_id', receiptId)
        .is('material_id', null)
        .neq('review_status', 'posted')
        .select('id')
        .single()
    )))

    const failed = results.find((result) => result.error)
    if (failed?.error) throw new ReceiptImportError(failed.error.message, 500, 'DATABASE_ERROR', failed.error)

    await writeAuditLog({
      entityType: 'purchase_receipt',
      entityKey: receiptId,
      action: 'AUTO_MATCH_MATERIALS',
      payload: {
        autoSelected: updates.filter((update) => update.highConfidence).length,
        suggested: updates.filter((update) => update.hasCandidate && !update.highConfidence).length,
        notFound: updates.filter((update) => !update.hasCandidate).length,
      },
      createdBy: userId,
    })
  }

  const refreshedItems = await listReceiptItems(supabase, receiptId)
  const enrichedItems = await enrichReceiptItemsWithMaterialCandidates(supabase, refreshedItems, receipt.supplier_id)
  return {
    items: enrichedItems,
    autoSelected: updates.filter((update) => update.highConfidence).length,
    suggested: updates.filter((update) => update.hasCandidate && !update.highConfidence).length,
    notFound: updates.filter((update) => !update.hasCandidate).length,
    unresolved: updates.filter((update) => !update.highConfidence).length,
  }
}

export async function enrichReceiptItemsWithMaterialCandidates(supabase: any, items: any[], supplierId?: string | null) {
  const rows = items ?? []
  if (rows.length === 0) return rows

  const needsCandidates = rows.some((item) => !item.material_id && item.review_status !== 'posted')
  if (!needsCandidates) return rows

  const context = await loadMaterialMatchContext(supabase, supplierId)
  return rows.map((item) => {
    if (item.material_id || item.review_status === 'posted') return item
    const candidates = findMaterialCandidatesForReceiptItem(item, context, 3).map(toMaterialCandidate)
    return {
      ...item,
      match_candidates: candidates,
    }
  })
}

async function loadMaterialMatchContext(supabase: any, supplierId?: string | null): Promise<MatchContext> {
  const supplierPromise = supplierId
    ? supabase
      .from('mat_supplier_map')
      .select('material_id, material_uuid')
      .eq('is_deleted', false)
      .eq('supplier_id', supplierId)
      .limit(5000)
    : Promise.resolve({ data: [], error: null })

  const [{ data: materials, error: materialError }, { data: aliases, error: aliasError }, { data: supplierMaps, error: supplierError }] = await Promise.all([
    supabase
      .from('mat_master')
      .select(`
        id,
        material_id,
        material_code,
        mat_name_th,
        mat_name_en,
        normalized_name,
        brand,
        model,
        spec,
        code_spec_key,
        base_uom,
        base_uom_id,
        category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th),
        uom:mat_uom!mat_master_base_uom_fkey(id, uom_code, uom_name_th)
      `)
      .eq('is_deleted', false)
      .limit(3000),
    supabase
      .from('mat_alias')
      .select('material_id, material_uuid, alias_name, normalized_alias')
      .eq('is_deleted', false)
      .limit(5000),
    supplierPromise,
  ])

  if (materialError) throw new ReceiptImportError(materialError.message, 500, 'DATABASE_ERROR', materialError)
  if (aliasError) throw new ReceiptImportError(aliasError.message, 500, 'DATABASE_ERROR', aliasError)
  if (supplierError) throw new ReceiptImportError(supplierError.message, 500, 'DATABASE_ERROR', supplierError)

  return {
    materials: (materials ?? []) as MaterialMatchRow[],
    aliasesByMaterialId: groupAliases((aliases ?? []) as AliasRow[]),
    supplierMaterialIds: new Set((supplierMaps ?? []).flatMap((row: { material_id: string | null; material_uuid?: string | null }) => [
      row.material_id,
      row.material_uuid,
    ]).filter(Boolean) as string[]),
  }
}

function findMaterialCandidatesForReceiptItem(item: ReceiptMatchItem, context: MatchContext, limit: number) {
  return context.materials
    .map((material) => {
      const result = scoreMaterialForReceiptItem(
        item,
        material,
        getMaterialAliases(material, context.aliasesByMaterialId),
        context.supplierMaterialIds,
      )
      return { material, ...result }
    })
    .filter((result) => result.score >= 70)
    .sort((left, right) => right.score - left.score || getMaterialLabel(left.material).localeCompare(getMaterialLabel(right.material)))
    .slice(0, limit)
}

function scoreMaterialForReceiptItem(
  item: ReceiptMatchItem,
  material: MaterialMatchRow,
  aliases: string[],
  supplierMaterialIds: Set<string>,
) {
  const itemText = normalizeMaterialSearchText([item.item_name_raw, item.raw_text].filter(Boolean).join(' '))
  const itemName = normalizeMaterialSearchText(item.item_name_raw)
  const materialCode = normalizeMaterialSearchText(material.material_code ?? material.material_id)
  const names = [
    material.mat_name_th,
    material.mat_name_en,
    material.normalized_name,
  ].map((value) => normalizeMaterialSearchText(value))
  const materialText = normalizeMaterialSearchText([
    material.material_code,
    material.material_id,
    material.mat_name_th,
    material.mat_name_en,
    material.brand,
    material.model,
    material.spec,
    material.code_spec_key,
    ...aliases,
  ].filter(Boolean).join(' '))

  let score = 0
  let reason = ''

  if (materialCode && itemText.includes(materialCode)) {
    score = 98
    reason = 'พบรหัสวัสดุในรายการจากสลิป'
  } else if (itemName && names.some((name) => name && itemName === name)) {
    score = 95
    reason = 'ชื่อรายการตรงกับชื่อวัสดุ'
  } else if (names.some((name) => name.length >= 3 && itemText.includes(name))) {
    score = 90
    reason = 'ชื่อวัสดุอยู่ในรายการจากสลิป'
  } else {
    const aliasScore = bestAliasScore(itemText, aliases)
    if (aliasScore >= 0.9) {
      score = 92
      reason = 'Alias ตรงกับรายการจากสลิป'
    } else if (aliasScore >= 0.75) {
      score = 80
      reason = 'Alias ใกล้เคียงกับรายการจากสลิป'
    } else {
      const similarity = tokenSimilarity(itemText, materialText)
      if (similarity >= 0.8) {
        score = 85
        reason = 'ชื่อรายการใกล้เคียงกับวัสดุ'
      } else if (similarity >= 0.6) {
        score = 70
        reason = 'ชื่อรายการคล้ายวัสดุบางส่วน'
      }
    }
  }

  if (score > 0 && getMaterialKeys(material).some((key) => supplierMaterialIds.has(key))) {
    score = Math.min(98, score + 5)
    reason = appendReason(reason, 'ซัพพลายเออร์ตรงกับสลิป') ?? reason
  }

  const specState = compareSpecTokens(item.item_name_raw || item.raw_text || '', material)
  if (score > 0 && specState === 'conflict') {
    return {
      score: Math.min(score, 80),
      reason: 'ชื่อใกล้เคียงแต่สเปกต่างกัน',
    }
  }
  if (score >= 90 && specState === 'missing_material_spec') {
    return {
      score: 80,
      reason: 'พบสินค้าใกล้เคียง แต่ไม่มีสเปก/สีในวัสดุ ต้องตรวจสอบ',
    }
  }

  return { score, reason }
}

function toMaterialCandidate(result: MatchResult) {
  return {
    id: result.material.id,
    material_id: result.material.material_id,
    material_code: result.material.material_code,
    mat_name_th: result.material.mat_name_th ?? result.material.mat_name_en ?? result.material.material_code ?? result.material.material_id,
    mat_name_en: result.material.mat_name_en,
    spec: result.material.spec,
    code_spec_key: result.material.code_spec_key,
    base_uom: result.material.base_uom,
    base_uom_id: result.material.base_uom_id,
    category: result.material.category,
    uom: result.material.uom,
    match_confidence: result.score,
    match_reason: result.reason,
  }
}

function getMaterialLabel(material: MaterialMatchRow) {
  return material.material_code ?? material.mat_name_th ?? material.mat_name_en ?? material.material_id
}

function groupAliases(rows: AliasRow[]) {
  const aliases = new Map<string, string[]>()
  for (const row of rows) {
    const keys = [row.material_id, row.material_uuid].filter(Boolean) as string[]
    if (keys.length === 0) continue
    const values = [row.alias_name, row.normalized_alias].filter(Boolean) as string[]
    if (values.length === 0) continue
    for (const key of keys) {
      aliases.set(key, [...(aliases.get(key) ?? []), ...values])
    }
  }
  return aliases
}

function getMaterialKeys(material: MaterialMatchRow) {
  return [material.id, material.material_id].filter(Boolean)
}

function getMaterialAliases(material: MaterialMatchRow, aliasesByMaterialId: Map<string, string[]>) {
  return Array.from(new Set(getMaterialKeys(material).flatMap((key) => aliasesByMaterialId.get(key) ?? [])))
}

function bestAliasScore(itemText: string, aliases: string[]) {
  let best = 0
  for (const alias of aliases) {
    const normalized = normalizeMaterialSearchText(alias)
    if (!normalized) continue
    if (itemText === normalized || itemText.includes(normalized) || normalized.includes(itemText)) {
      best = Math.max(best, 0.95)
    } else {
      best = Math.max(best, tokenSimilarity(itemText, normalized))
    }
  }
  return best
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

function compareSpecTokens(itemText: string, material: MaterialMatchRow) {
  const itemTokens = specTokens(itemText)
  const materialTokens = specTokens([
    material.code_spec_key,
    material.spec,
    material.mat_name_th,
    material.mat_name_en,
    material.model,
  ].filter(Boolean).join(' '))

  if (itemTokens.size === 0) return 'none'
  if (materialTokens.size === 0) return 'missing_material_spec'
  for (const token of itemTokens) {
    if (materialTokens.has(token)) return 'match'
  }
  return 'conflict'
}

function specTokens(value: string | null | undefined) {
  const normalized = normalizeDigits(String(value ?? ''))
    .toUpperCase()
    .replace(/×/g, 'X')
    .replace(/มิลลิเมตร|ม\.ม\.|มม\.?|MM/g, 'MM')
    .replace(/เซนติเมตร|ซม\.?|CM/g, 'CM')
    .replace(/เมตร/g, 'M')
    .replace(/วัตต์/g, 'W')
    .replace(/โวลต์/g, 'V')
    .replace(/(\d)\s+(MM|CM|M|W|V)\b/g, '$1$2')

  const tokens = new Set<string>()
  const patterns = [
    /\b[A-Z]\d{3,5}\b/g,
    /\b\d{4}\b/g,
    /\b\d{1,4}(?:\.\d+)?(?:MM|CM|M|W|V)\b/g,
    /\b\d{2,4}X\d{2,4}(?:X\d{1,4})?(?:MM|CM|M)?\b/g,
    /\b\d{3}[A-Z]?\b/g,
  ]

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      addSpecToken(tokens, match[0])
    }
  }
  return tokens
}

function addSpecToken(tokens: Set<string>, token: string) {
  tokens.add(token)

  const unitMatch = token.match(/^(\d{1,4})(?:\.0+)?(MM|CM|M|W|V)$/)
  if (unitMatch) {
    const [, rawNo, unit] = unitMatch
    const no = Number(rawNo)
    if (Number.isFinite(no)) {
      tokens.add(`${no}${unit}`)
      if (no < 1000) tokens.add(`${String(no).padStart(3, '0')}${unit}`)
      if (unit === 'MM' && no < 1000) tokens.add(String(no).padStart(3, '0'))
    }
  }

  const threeOrFourDigit = token.match(/^\d{3,4}$/)
  if (threeOrFourDigit) {
    const no = Number(token)
    if (Number.isFinite(no)) tokens.add(`${no}MM`)
  }
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

function appendReason(existing: string | null | undefined, reason: string) {
  if (!reason) return String(existing ?? '').trim() || null
  const current = String(existing ?? '').trim()
  if (!current) return reason
  if (current.includes(reason)) return current
  return `${current}; ${reason}`
}
