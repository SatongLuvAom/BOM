import { getMaterialRouteId, normalizeMaterialSearchText } from '@/lib/material-master'
import { fetchLatestPriceMap, type LatestMaterialPrice } from '@/lib/server/material-quality-data'

type SupabaseLike = {
  from: (table: string) => any
}

export type DuplicateConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type DuplicateStatus =
  | 'UNRESOLVED'
  | 'CONFIRMED_DUPLICATE'
  | 'NOT_DUPLICATE'
  | 'REVIEW_LATER'
  | 'MERGE_READY'

export type DuplicateDecision = Exclude<DuplicateStatus, 'UNRESOLVED'>

export type DuplicateReason = {
  key: string
  label: string
  points: number
  detail?: string
}

export type MaterialDuplicateCandidate = {
  material_id: string
  route_id: string
  score: number
  matched_reasons: DuplicateReason[]
  material: DuplicateMaterial | null
}

export type MaterialDuplicateGroup = {
  id: string
  duplicate_group_id: string
  group_key: string | null
  status: DuplicateStatus
  confidence_level: DuplicateConfidence
  max_score: number
  recommended_action: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by: string | null
  decisions: DuplicateDecisionRow[]
  candidates: MaterialDuplicateCandidate[]
}

export type DuplicateDecisionRow = {
  id: string
  group_id: string
  decision: DuplicateDecision
  note: string | null
  decided_by: string | null
  decided_at: string
}

export type DuplicateScanSummary = {
  scanned_materials: number
  candidate_pairs: number
  groups_written: number
  high: number
  medium: number
  low: number
}

type DuplicateScanResult = {
  group_key: string
  material_ids: [string, string]
  score: number
  confidence_level: DuplicateConfidence
  matched_reasons: DuplicateReason[]
  recommended_action: string
}

type DuplicateMaterial = {
  id: string | null
  material_id: string
  material_code: string | null
  mat_name_th: string | null
  mat_name_en: string | null
  category_id: string | null
  cat_id: string | null
  material_type_id: string | null
  code_spec_key: string | null
  base_uom: string | null
  base_uom_id: string | null
  brand: string | null
  model: string | null
  spec: string | null
  status: string | null
  category: { id?: string | null; cat_id?: string | null; cat_code?: string | null; cat_name_th?: string | null; code_prefix?: string | null } | null
  material_type: { id?: string | null; name?: string | null; code_prefix?: string | null } | null
  uom: { uom_code?: string | null; uom_name_th?: string | null } | null
  aliases: { alias_name: string | null; normalized_alias: string | null }[]
  supplier_maps: {
    supplier_id: string | null
    supplier_sku: string | null
    supplier_material_name: string | null
    is_preferred: boolean | null
    supplier?: { supplier_name_th?: string | null; supplier_code?: string | null } | null
  }[]
  latest_price: LatestMaterialPrice | null
  bom_usage_count: number
  boq_usage_count: number
}

const STANDARD_CODE_RE = /^([A-Z0-9]{2,5})-([A-Z0-9]{2,8})-([A-Z0-9]{2,12})-[0-9]{4}$/
const GENERAL_SPEC_KEYS = new Set(['GEN', 'GENERAL', 'NA', 'N/A', 'NONE', '-'])
const SPEC_RISK_REASON_KEYS = new Set(['different_spec', 'same_name_different_spec', 'ambiguous_spec'])

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function cleanKey(value: string | null | undefined) {
  return normalizeMaterialSearchText(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactKey(value: string | null | undefined) {
  return cleanKey(value).replace(/\s+/g, '')
}

function upperCode(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase()
}

function standardCodeParts(value: string | null | undefined) {
  const match = upperCode(value).match(STANDARD_CODE_RE)
  return match
    ? { category: match[1], type: match[2], spec: match[3] }
    : null
}

function standardCodeGroup(value: string | null | undefined) {
  const parts = standardCodeParts(value)
  return parts ? `${parts.category}-${parts.type}-${parts.spec}` : ''
}

function standardCategoryType(value: string | null | undefined) {
  const parts = standardCodeParts(value)
  return parts ? `${parts.category}-${parts.type}` : ''
}

function meaningfulSpecKey(value: string | null | undefined) {
  const key = upperCode(value).replace(/[^A-Z0-9]+/g, '')
  return key && !GENERAL_SPEC_KEYS.has(key) ? key : ''
}

function sameNonEmpty(left: string | null | undefined, right: string | null | undefined) {
  const a = compactKey(left)
  const b = compactKey(right)
  return Boolean(a && b && a === b)
}

function ngrams(value: string, size = 2) {
  const cleaned = compactKey(value)
  if (!cleaned) return new Set<string>()
  if (cleaned.length <= size) return new Set([cleaned])

  const output = new Set<string>()
  for (let index = 0; index <= cleaned.length - size; index += 1) {
    output.add(cleaned.slice(index, index + size))
  }
  return output
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const token of left) {
    if (right.has(token)) intersection += 1
  }
  return intersection / (left.size + right.size - intersection)
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = cleanKey(left)
  const b = cleanKey(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if ((a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) return 0.8

  const tokenScore = jaccard(new Set(a.split(' ').filter(Boolean)), new Set(b.split(' ').filter(Boolean)))
  const gramScore = jaccard(ngrams(a), ngrams(b))
  return Math.max(tokenScore, gramScore)
}

function exactNameMatch(left: DuplicateMaterial, right: DuplicateMaterial) {
  return (
    Boolean(cleanKey(left.mat_name_th) && cleanKey(left.mat_name_th) === cleanKey(right.mat_name_th))
    || Boolean(cleanKey(left.mat_name_en) && cleanKey(left.mat_name_en) === cleanKey(right.mat_name_en))
  )
}

function namePoints(left: DuplicateMaterial, right: DuplicateMaterial) {
  const th = textSimilarity(left.mat_name_th, right.mat_name_th)
  const en = textSimilarity(left.mat_name_en, right.mat_name_en)
  const score = Math.max(th, en)

  if (score >= 0.9) return 20
  if (score >= 0.75) return 16
  if (score >= 0.6) return 12
  if (score >= 0.45) return 8
  if (score >= 0.35) return 5
  return 0
}

function extractDimensions(material: DuplicateMaterial) {
  const text = compactKey([
    material.material_code,
    material.mat_name_th,
    material.mat_name_en,
    material.brand,
    material.model,
    material.spec,
  ].filter(Boolean).join(' '))

  const dimensions = new Set<string>()
  const patterns = [
    /\d{1,4}(?:\.\d+)?(?:mm|cm|m|sqm|w|v)/g,
    /\d{2,4}x\d{2,4}(?:x\d{1,4})?/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      dimensions.add(match[0])
    }
  }

  return dimensions
}

function normalizeDimensionText(value: string | null | undefined) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/×/g, 'X')
    .replace(/มิลลิเมตร|ม\.ม\.|มม\.?|มม/gi, 'MM')
    .replace(/เซนติเมตร|ซม\.?|ซม/gi, 'CM')
    .replace(/เมตร/gi, 'M')
    .replace(/วัตต์/gi, 'W')
    .replace(/โวลต์/gi, 'V')
    .replace(/นิ้ว/gi, 'IN')
    .replace(/(\d)\s+(MM|CM|M|W|V|IN)\b/g, '$1$2')
}

function addSpecToken(tokens: Set<string>, value: string | null | undefined) {
  const token = upperCode(value).replace(/\s+/g, '')
  if (!token) return

  tokens.add(token)

  const metricMatch = token.match(/^(\d{1,3})(MM)$/)
  if (metricMatch) {
    const padded = metricMatch[1].padStart(3, '0')
    tokens.add(padded)
    tokens.add(`${padded}MM`)
  }

  const wattMatch = token.match(/^(\d{1,3})W$/)
  if (wattMatch) {
    tokens.add(`${wattMatch[1].padStart(3, '0')}W`)
  }
}

function extractSpecTokens(material: DuplicateMaterial) {
  const tokens = new Set<string>()
  const codeParts = standardCodeParts(material.material_code)
  const codeSpec = meaningfulSpecKey(codeParts?.spec)
  const formSpec = meaningfulSpecKey(material.code_spec_key)

  if (codeSpec) addSpecToken(tokens, codeSpec)
  if (formSpec) addSpecToken(tokens, formSpec)

  const text = normalizeDimensionText([
    material.mat_name_th,
    material.mat_name_en,
    material.spec,
    material.model,
  ].filter(Boolean).join(' '))

  const patterns = [
    /\b\d{1,4}(?:\.\d+)?(?:MM|CM|M|W|V|IN)\b/g,
    /\b\d{2,4}X\d{2,4}(?:X\d{1,4})?(?:MM|CM|M)?\b/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      addSpecToken(tokens, match[0])
    }
  }

  return tokens
}

function sameCategory(left: DuplicateMaterial, right: DuplicateMaterial) {
  return Boolean(
    (left.category_id && left.category_id === right.category_id)
    || (left.cat_id && left.cat_id === right.cat_id)
    || (left.category?.id && left.category.id === right.category?.id)
    || (left.category?.cat_id && left.category.cat_id === right.category?.cat_id),
  )
}

function sameMaterialType(left: DuplicateMaterial, right: DuplicateMaterial) {
  return Boolean(left.material_type_id && left.material_type_id === right.material_type_id)
}

function sameCategoryType(left: DuplicateMaterial, right: DuplicateMaterial) {
  const leftCodeType = standardCategoryType(left.material_code)
  const rightCodeType = standardCategoryType(right.material_code)
  return (
    (sameCategory(left, right) && sameMaterialType(left, right))
    || Boolean(leftCodeType && leftCodeType === rightCodeType)
  )
}

function specDifferenceDetail(leftTokens: Set<string>, rightTokens: Set<string>) {
  const leftOnly = Array.from(leftTokens).filter((token) => !rightTokens.has(token))
  const rightOnly = Array.from(rightTokens).filter((token) => !leftTokens.has(token))
  if (leftOnly.length === 0 || rightOnly.length === 0) return undefined
  return `${leftOnly.slice(0, 3).join(', ')} vs ${rightOnly.slice(0, 3).join(', ')}`
}

function analyzeSpecRelationship(left: DuplicateMaterial, right: DuplicateMaterial, nameScore: number) {
  const leftCodeSpec = meaningfulSpecKey(standardCodeParts(left.material_code)?.spec)
  const rightCodeSpec = meaningfulSpecKey(standardCodeParts(right.material_code)?.spec)
  const leftFormSpec = meaningfulSpecKey(left.code_spec_key)
  const rightFormSpec = meaningfulSpecKey(right.code_spec_key)
  const leftTokens = extractSpecTokens(left)
  const rightTokens = extractSpecTokens(right)
  const hasSameCategoryType = sameCategoryType(left, right)
  const hasExactName = exactNameMatch(left, right)

  const codeSpecDiffers = Boolean(leftCodeSpec && rightCodeSpec && leftCodeSpec !== rightCodeSpec && hasSameCategoryType)
  const formSpecDiffers = Boolean(leftFormSpec && rightFormSpec && leftFormSpec !== rightFormSpec && hasSameCategoryType)
  const tokenSpecDiffers = (
    leftTokens.size > 0
    && rightTokens.size > 0
    && intersectValues(leftTokens, rightTokens).length === 0
    && (hasSameCategoryType || nameScore >= 16)
  )
  const clearDifference = codeSpecDiffers || formSpecDiffers || tokenSpecDiffers
  const hasComparableSpec = (
    Boolean(leftCodeSpec || leftFormSpec || leftTokens.size > 0)
    && Boolean(rightCodeSpec || rightFormSpec || rightTokens.size > 0)
  )

  return {
    clearDifference,
    hasSameCategoryType,
    hasExactName,
    missingOrAmbiguous: !clearDifference && !hasComparableSpec && (hasSameCategoryType || nameScore >= 16),
    detail: specDifferenceDetail(leftTokens, rightTokens)
      ?? (leftFormSpec && rightFormSpec && leftFormSpec !== rightFormSpec ? `${leftFormSpec} vs ${rightFormSpec}` : undefined)
      ?? (leftCodeSpec && rightCodeSpec && leftCodeSpec !== rightCodeSpec ? `${leftCodeSpec} vs ${rightCodeSpec}` : undefined),
  }
}

function intersectValues(left: Iterable<string>, right: Iterable<string>) {
  const rightSet = new Set(Array.from(right).filter(Boolean))
  return Array.from(left).filter((value) => rightSet.has(value))
}

function getAliases(material: DuplicateMaterial) {
  return new Set(
    material.aliases
      .flatMap((alias) => [alias.normalized_alias, alias.alias_name])
      .map(compactKey)
      .filter(Boolean),
  )
}

function getSupplierSkus(material: DuplicateMaterial) {
  return new Set(
    material.supplier_maps
      .map((row) => compactKey(`${row.supplier_id ?? ''}:${row.supplier_sku ?? ''}`))
      .filter((value) => value.includes(':') && !value.endsWith(':')),
  )
}

function confidenceFromScore(score: number): DuplicateConfidence {
  if (score >= 80) return 'HIGH'
  if (score >= 55) return 'MEDIUM'
  return 'LOW'
}

function recommendationFromConfidence(
  confidence: DuplicateConfidence,
  specRelationship?: ReturnType<typeof analyzeSpecRelationship>,
) {
  if (specRelationship?.clearDifference) {
    if (specRelationship.hasExactName) {
      return 'ชื่อเหมือนกันแต่สเปกต่างกัน ตรวจสอบก่อน'
    }
    if (specRelationship.hasSameCategoryType) {
      return 'อาจเป็นวัสดุคนละตัว'
    }
    return 'ตรวจสอบก่อน'
  }

  if (specRelationship?.missingOrAmbiguous) {
    return 'ข้อมูลไม่พอ ต้องตรวจสอบ'
  }

  if (confidence === 'HIGH') {
    return 'พร้อมรวมรายการ'
  }
  if (confidence === 'MEDIUM') {
    return 'ตรวจสอบก่อน'
  }
  return 'ข้อมูลไม่พอ ต้องตรวจสอบ'
}

function scorePair(left: DuplicateMaterial, right: DuplicateMaterial): DuplicateScanResult | null {
  const reasons: DuplicateReason[] = []
  let score = 0

  function add(points: number, key: string, label: string, detail?: string) {
    if (points === 0 && reasons.some((reason) => reason.key === key && reason.detail === detail)) return
    score += points
    reasons.push({ key, label, points, detail })
  }

  const leftCodeGroup = standardCodeGroup(left.material_code)
  const rightCodeGroup = standardCodeGroup(right.material_code)
  if (leftCodeGroup && leftCodeGroup === rightCodeGroup) {
    add(25, 'same_code_group', 'กลุ่มรหัส CATEGORY-TYPE-SPEC เดียวกัน', leftCodeGroup)
  }

  if (sameCategory(left, right)) {
    add(10, 'same_category', 'หมวดหมู่เดียวกัน', left.category?.cat_name_th ?? left.cat_id ?? undefined)
  }

  if (sameMaterialType(left, right)) {
    add(20, 'same_material_type', 'ชนิดวัสดุเดียวกัน', left.material_type?.name ?? undefined)
  }

  const leftSpecKey = meaningfulSpecKey(left.code_spec_key)
  const rightSpecKey = meaningfulSpecKey(right.code_spec_key)
  if (leftSpecKey && leftSpecKey === rightSpecKey) {
    add(20, 'same_spec_key', 'Spec key เดียวกัน', leftSpecKey)
  }

  const nameScore = namePoints(left, right)
  add(nameScore, 'similar_name', 'ชื่อวัสดุใกล้เคียงกัน', nameScore >= 16 ? 'ชื่อเหมือนหรือใกล้เคียงมาก' : 'ชื่อคล้ายบางส่วน')

  const sharedAliases = intersectValues(getAliases(left), getAliases(right))
  if (sharedAliases.length > 0) {
    add(20, 'shared_alias', 'Alias ตรงกัน', sharedAliases.slice(0, 3).join(', '))
  } else {
    let bestAliasSimilarity = 0
    for (const leftAlias of getAliases(left)) {
      for (const rightAlias of getAliases(right)) {
        bestAliasSimilarity = Math.max(bestAliasSimilarity, textSimilarity(leftAlias, rightAlias))
      }
    }
    if (bestAliasSimilarity >= 0.75) {
      add(12, 'similar_alias', 'Alias ใกล้เคียงกัน')
    }
  }

  const sharedSkus = intersectValues(getSupplierSkus(left), getSupplierSkus(right))
  if (sharedSkus.length > 0) {
    add(30, 'same_supplier_sku', 'Supplier SKU เดียวกัน', sharedSkus.slice(0, 3).join(', '))
  }

  if (sameNonEmpty(left.brand, right.brand)) {
    add(8, 'same_brand', 'ยี่ห้อเดียวกัน', left.brand ?? undefined)
  }
  if (sameNonEmpty(left.model, right.model)) {
    add(8, 'same_model', 'รุ่นเดียวกัน', left.model ?? undefined)
  }
  if (sameNonEmpty(left.spec, right.spec)) {
    add(9, 'same_spec', 'สเปกเดียวกัน', left.spec ?? undefined)
  } else {
    const specScore = textSimilarity(left.spec, right.spec)
    if (specScore >= 0.65) add(6, 'similar_spec', 'สเปกใกล้เคียงกัน')
  }

  if ((left.base_uom_id && left.base_uom_id === right.base_uom_id) || sameNonEmpty(left.base_uom, right.base_uom)) {
    add(5, 'same_base_uom', 'หน่วยนับหลักเดียวกัน', left.base_uom ?? left.uom?.uom_code ?? undefined)
  }

  const sharedDimensions = intersectValues(extractDimensions(left), extractDimensions(right))
  if (sharedDimensions.length > 0) {
    add(10, 'same_dimensions', 'ขนาดสำคัญตรงกัน', sharedDimensions.slice(0, 4).join(', '))
  }

  const specRelationship = analyzeSpecRelationship(left, right, nameScore)
  if (specRelationship.clearDifference) {
    add(-30, 'different_spec', 'สเปกต่างกัน', specRelationship.detail)
    if (specRelationship.hasExactName) {
      add(-10, 'same_name_different_spec', 'ชื่อเหมือนกันแต่สเปกต่างกัน', specRelationship.detail)
    }
  } else if (specRelationship.missingOrAmbiguous) {
    add(0, 'ambiguous_spec', 'ข้อมูลสเปกไม่พอ', 'ต้องตรวจสอบก่อนรวมรายการ')
  }

  score = Math.min(100, Math.max(0, score))
  if (specRelationship.clearDifference) {
    score = Math.min(score, specRelationship.hasExactName ? 69 : 54)
  } else if (specRelationship.missingOrAmbiguous && sharedSkus.length === 0 && sharedAliases.length === 0) {
    score = Math.min(score, 69)
  }
  if (score < 35) return null

  const materialIds = [left.material_id, right.material_id].sort() as [string, string]
  const confidence = confidenceFromScore(score)
  return {
    group_key: materialIds.join('::'),
    material_ids: materialIds,
    score,
    confidence_level: confidence,
    matched_reasons: reasons,
    recommended_action: recommendationFromConfidence(confidence, specRelationship),
  }
}

function addBlock(blocks: Map<string, Set<string>>, key: string, materialId: string) {
  if (!key) return
  const values = blocks.get(key) ?? new Set<string>()
  values.add(materialId)
  blocks.set(key, values)
}

function buildBlockingPairs(materials: DuplicateMaterial[]) {
  const blocks = new Map<string, Set<string>>()

  for (const material of materials) {
    addBlock(blocks, `code:${standardCodeGroup(material.material_code)}`, material.material_id)

    if (material.category_id && material.material_type_id && material.code_spec_key) {
      addBlock(blocks, `cts:${material.category_id}:${material.material_type_id}:${upperCode(material.code_spec_key)}`, material.material_id)
    }

    const nameKey = compactKey(material.mat_name_th ?? material.mat_name_en)
    if (nameKey.length >= 4) addBlock(blocks, `name:${nameKey}`, material.material_id)

    const brandSpecKey = compactKey([material.brand, material.model, material.spec].filter(Boolean).join(' '))
    if (brandSpecKey.length >= 4) addBlock(blocks, `bms:${brandSpecKey}`, material.material_id)

    for (const alias of getAliases(material)) {
      if (alias.length >= 3) addBlock(blocks, `alias:${alias}`, material.material_id)
    }

    for (const sku of getSupplierSkus(material)) {
      addBlock(blocks, `sku:${sku}`, material.material_id)
    }

    for (const dimension of extractDimensions(material)) {
      addBlock(blocks, `dim:${dimension}`, material.material_id)
    }
  }

  const pairKeys = new Set<string>()
  for (const ids of blocks.values()) {
    const list = Array.from(ids).sort()
    if (list.length < 2 || list.length > 150) continue
    for (let leftIndex = 0; leftIndex < list.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < list.length; rightIndex += 1) {
        pairKeys.add(`${list[leftIndex]}::${list[rightIndex]}`)
      }
    }
  }

  return pairKeys
}

function countByMaterial(rows: { material_id: string | null }[] | null | undefined) {
  const map = new Map<string, number>()
  for (const row of rows ?? []) {
    if (!row.material_id) continue
    map.set(row.material_id, (map.get(row.material_id) ?? 0) + 1)
  }
  return map
}

function normalizeMaterialRow(row: any): DuplicateMaterial {
  return {
    ...row,
    category: firstRelation(row.category),
    material_type: firstRelation(row.material_type),
    uom: firstRelation(row.uom),
    aliases: [],
    supplier_maps: [],
    latest_price: null,
    bom_usage_count: 0,
    boq_usage_count: 0,
  }
}

async function fetchDuplicateMaterials(supabase: SupabaseLike, materialIds?: string[]): Promise<DuplicateMaterial[]> {
  const ids = Array.from(new Set((materialIds ?? []).filter(Boolean)))
  let query = supabase
    .from('mat_master')
    .select(`
      id, material_id, material_code, mat_name_th, mat_name_en, normalized_name,
      cat_id, category_id, material_type_id, code_spec_key, base_uom, base_uom_id,
      brand, model, spec, status,
      category:mat_category!mat_master_cat_id_fkey(id, cat_id, cat_code, cat_name_th, code_prefix),
      material_type:material_types!mat_master_material_type_id_v1_fkey(id, name, code_prefix),
      uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th)
    `)
    .eq('is_deleted', false)

  if (ids.length > 0) {
    query = query.in('material_id', ids)
  }

  const { data, error } = await query.limit(50000)
  if (error) throw new Error(error.message)

  const materials: DuplicateMaterial[] = (data ?? []).map((row: any) => normalizeMaterialRow(row))
  const materialIdList = materials.map((material) => material.material_id)

  if (materialIdList.length === 0) return []

  const [aliasRes, supplierMapRes, latestPrices, bomRes, boqRes] = await Promise.all([
    supabase
      .from('mat_alias')
      .select('material_id, alias_name, normalized_alias')
      .eq('is_deleted', false)
      .in('material_id', materialIdList)
      .limit(50000),
    supabase
      .from('mat_supplier_map')
      .select(`
        material_id, supplier_id, supplier_sku, supplier_material_name, is_preferred,
        supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_name_th, supplier_code)
      `)
      .eq('is_deleted', false)
      .in('material_id', materialIdList)
      .limit(50000),
    fetchLatestPriceMap(supabase, materialIdList),
    supabase
      .from('bom_item')
      .select('material_id')
      .eq('is_deleted', false)
      .in('material_id', materialIdList)
      .limit(50000),
    supabase
      .from('boq_item')
      .select('material_id')
      .eq('is_deleted', false)
      .in('material_id', materialIdList)
      .limit(50000),
  ])

  const aliasesByMaterial = new Map<string, DuplicateMaterial['aliases']>()
  for (const alias of aliasRes.data ?? []) {
    aliasesByMaterial.set(alias.material_id, [...(aliasesByMaterial.get(alias.material_id) ?? []), alias])
  }

  const supplierMapsByMaterial = new Map<string, DuplicateMaterial['supplier_maps']>()
  for (const row of supplierMapRes.data ?? []) {
    supplierMapsByMaterial.set(row.material_id, [
      ...(supplierMapsByMaterial.get(row.material_id) ?? []),
      {
        ...row,
        supplier: firstRelation(row.supplier),
      },
    ])
  }

  const bomCounts = countByMaterial(bomRes.data)
  const boqCounts = countByMaterial(boqRes.data)

  return materials.map((material) => ({
    ...material,
    aliases: aliasesByMaterial.get(material.material_id) ?? [],
    supplier_maps: supplierMapsByMaterial.get(material.material_id) ?? [],
    latest_price: latestPrices[material.material_id] ?? null,
    bom_usage_count: bomCounts.get(material.material_id) ?? 0,
    boq_usage_count: boqCounts.get(material.material_id) ?? 0,
  }))
}

export async function runMaterialDuplicateScan(supabase: SupabaseLike): Promise<DuplicateScanSummary> {
  const materials = await fetchDuplicateMaterials(supabase)
  const byId = new Map(materials.map((material) => [material.material_id, material]))
  const pairKeys = buildBlockingPairs(materials)
  const results: DuplicateScanResult[] = []

  for (const pairKey of pairKeys) {
    const [leftId, rightId] = pairKey.split('::')
    const left = byId.get(leftId)
    const right = byId.get(rightId)
    if (!left || !right) continue

    const result = scorePair(left, right)
    if (result) results.push(result)
  }

  const uniqueResults = Array.from(
    new Map(results.map((result) => [result.group_key, result])).values(),
  ).sort((left, right) => right.score - left.score)

  let groupsWritten = 0
  for (const result of uniqueResults) {
    const { data: existing, error: existingError } = await supabase
      .from('material_duplicate_groups')
      .select('id, status')
      .eq('group_key', result.group_key)
      .maybeSingle()

    if (existingError) throw new Error(existingError.message)

    let groupId = existing?.id as string | undefined
    if (groupId) {
      const { error: updateError } = await supabase
        .from('material_duplicate_groups')
        .update({
          confidence_level: result.confidence_level,
          max_score: result.score,
          recommended_action: result.recommended_action,
        })
        .eq('id', groupId)

      if (updateError) throw new Error(updateError.message)
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('material_duplicate_groups')
        .insert({
          group_key: result.group_key,
          status: 'UNRESOLVED',
          confidence_level: result.confidence_level,
          max_score: result.score,
          recommended_action: result.recommended_action,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)
      groupId = inserted.id
    }

    const { error: deleteCandidateError } = await supabase
      .from('material_duplicate_candidates')
      .delete()
      .eq('group_id', groupId)

    if (deleteCandidateError) throw new Error(deleteCandidateError.message)

    const { error: candidateError } = await supabase
      .from('material_duplicate_candidates')
      .insert(result.material_ids.map((materialId) => ({
        group_id: groupId,
        material_id: materialId,
        score: result.score,
        matched_reasons: result.matched_reasons,
      })))

    if (candidateError) throw new Error(candidateError.message)
    groupsWritten += 1
  }

  return {
    scanned_materials: materials.length,
    candidate_pairs: uniqueResults.length,
    groups_written: groupsWritten,
    high: uniqueResults.filter((result) => result.confidence_level === 'HIGH').length,
    medium: uniqueResults.filter((result) => result.confidence_level === 'MEDIUM').length,
    low: uniqueResults.filter((result) => result.confidence_level === 'LOW').length,
  }
}

export async function getMaterialDuplicateGroups(
  supabase: SupabaseLike,
  filters: {
    confidence?: DuplicateConfidence | ''
    status?: DuplicateStatus | ''
    category_id?: string
    material_type_id?: string
    unresolvedOnly?: boolean
    limit?: number
  } = {},
): Promise<MaterialDuplicateGroup[]> {
  let groupQuery = supabase
    .from('material_duplicate_groups')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(filters.limit ?? 300)

  if (filters.confidence) groupQuery = groupQuery.eq('confidence_level', filters.confidence)
  if (filters.status) groupQuery = groupQuery.eq('status', filters.status)
  if (filters.unresolvedOnly) groupQuery = groupQuery.eq('status', 'UNRESOLVED')

  const { data: groups, error: groupError } = await groupQuery
  if (groupError) throw new Error(groupError.message)
  if (!groups || groups.length === 0) return []

  const groupIds = groups.map((group: any) => group.id)
  const [candidateRes, decisionRes] = await Promise.all([
    supabase
      .from('material_duplicate_candidates')
      .select('*')
      .in('group_id', groupIds)
      .order('score', { ascending: false }),
    supabase
      .from('material_duplicate_decisions')
      .select('*')
      .in('group_id', groupIds)
      .order('decided_at', { ascending: false }),
  ])

  if (candidateRes.error) throw new Error(candidateRes.error.message)
  if (decisionRes.error) throw new Error(decisionRes.error.message)

  const materialIds = Array.from(new Set<string>((candidateRes.data ?? []).map((row: any) => row.material_id).filter(Boolean)))
  const materials = await fetchDuplicateMaterials(supabase, materialIds)
  const materialMap = new Map(materials.map((material) => [material.material_id, material]))

  const candidatesByGroup = new Map<string, MaterialDuplicateCandidate[]>()
  for (const row of candidateRes.data ?? []) {
    const material = materialMap.get(row.material_id) ?? null
    const list = candidatesByGroup.get(row.group_id) ?? []
    list.push({
      material_id: row.material_id,
      route_id: material ? getMaterialRouteId(material) : row.material_id,
      score: Number(row.score ?? 0),
      matched_reasons: Array.isArray(row.matched_reasons) ? row.matched_reasons : [],
      material,
    })
    candidatesByGroup.set(row.group_id, list)
  }

  const decisionsByGroup = new Map<string, DuplicateDecisionRow[]>()
  for (const row of decisionRes.data ?? []) {
    decisionsByGroup.set(row.group_id, [...(decisionsByGroup.get(row.group_id) ?? []), row])
  }

  return groups
    .map((group: any) => ({
      ...group,
      duplicate_group_id: group.id,
      max_score: Number(group.max_score ?? 0),
      candidates: candidatesByGroup.get(group.id) ?? [],
      decisions: decisionsByGroup.get(group.id) ?? [],
    }))
    .filter((group: MaterialDuplicateGroup) => {
      if (filters.category_id) {
        const matchesCategory = group.candidates.some((candidate) => (
          candidate.material?.category_id === filters.category_id
          || candidate.material?.cat_id === filters.category_id
          || candidate.material?.category?.id === filters.category_id
          || candidate.material?.category?.cat_id === filters.category_id
        ))
        if (!matchesCategory) return false
      }

      if (filters.material_type_id) {
        const matchesType = group.candidates.some((candidate) => candidate.material?.material_type_id === filters.material_type_id)
        if (!matchesType) return false
      }

      return true
    })
}

export async function saveMaterialDuplicateDecision(
  supabase: SupabaseLike,
  input: {
    groupId: string
    decision: DuplicateDecision
    note?: string | null
    decidedBy?: string | null
  },
) {
  const { data: before, error: beforeError } = await supabase
    .from('material_duplicate_groups')
    .select('*')
    .eq('id', input.groupId)
    .maybeSingle()

  if (beforeError) throw new Error(beforeError.message)
  if (!before) {
    const notFound = new Error('Duplicate group not found')
    notFound.name = 'NotFoundError'
    throw notFound
  }

  if (input.decision === 'MERGE_READY') {
    const { data: candidates, error: candidateError } = await supabase
      .from('material_duplicate_candidates')
      .select('matched_reasons')
      .eq('group_id', input.groupId)

    if (candidateError) throw new Error(candidateError.message)

    const hasSpecRisk = (candidates ?? []).some((candidate: any) => (
      Array.isArray(candidate.matched_reasons)
      && candidate.matched_reasons.some((reason: any) => SPEC_RISK_REASON_KEYS.has(reason?.key))
    ))

    if (hasSpecRisk) {
      const validation = new Error('Cannot mark as Merge Ready because specs differ or are ambiguous.')
      validation.name = 'ValidationError'
      throw validation
    }
  }

  const { data: decision, error: decisionError } = await supabase
    .from('material_duplicate_decisions')
    .insert({
      group_id: input.groupId,
      decision: input.decision,
      note: input.note?.trim() || null,
      decided_by: input.decidedBy ?? null,
    })
    .select('*')
    .single()

  if (decisionError) throw new Error(decisionError.message)

  const isFinal = input.decision !== 'REVIEW_LATER'
  const { data: group, error: updateError } = await supabase
    .from('material_duplicate_groups')
    .update({
      status: input.decision,
      resolved_at: isFinal ? new Date().toISOString() : null,
      resolved_by: input.decidedBy ?? null,
    })
    .eq('id', input.groupId)
    .select('*')
    .single()

  if (updateError) throw new Error(updateError.message)

  return { before, group, decision }
}
