export type MaterialPriceStatus = 'OK' | 'MISSING' | 'STALE'

export interface MaterialQualityInput {
  material_code?: string | null
  material_id?: string | null
  mat_name_th?: string | null
  cat_id?: string | null
  category_id?: string | null
  base_uom?: string | null
  base_uom_id?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
  hasSupplier?: boolean
  hasPreferredSupplier?: boolean
  hasLatestPrice?: boolean
  hasAlias?: boolean
  isPriceStale?: boolean
  isPriceExpired?: boolean
}

export interface MaterialQualityResult {
  score: number
  label: 'Missing price' | 'Price expired' | 'Price stale' | 'Missing supplier' | 'Missing preferred supplier' | 'Missing UOM' | 'Incomplete' | 'Ready'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const UNIT_NORMALIZERS: Array<[RegExp, string]> = [
  [/\b(sq\.?\s*m\.?|sqm|m2)\b/g, 'sqm'],
  [/\b(pcs?|piece|pieces)\b/g, 'pcs'],
  [/\b(mm\.?|millimeter|millimetre)\b/g, 'mm'],
  [/\b(cm\.?|centimeter|centimetre)\b/g, 'cm'],
  [/\b(m\.?|meter|metre)\b/g, 'm'],
  [/\b(kg\.?|kilogram)\b/g, 'kg'],
  [/\b(l\.?|ltr|liter|litre)\b/g, 'l'],
]

export function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_RE.test(value))
}

export function normalizeMaterialSearchText(value: string | null | undefined) {
  let normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

  for (const [pattern, replacement] of UNIT_NORMALIZERS) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
}

export function buildNormalizedMaterialName(input: {
  material_code?: string | null
  material_id?: string | null
  mat_name_th?: string | null
  mat_name_en?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
}) {
  return normalizeMaterialSearchText(
    [
      input.material_code ?? input.material_id,
      input.mat_name_th,
      input.mat_name_en,
      input.brand,
      input.model,
      input.spec,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function getMaterialCode(material: { material_code?: string | null; material_id?: string | null }) {
  return material.material_code ?? material.material_id ?? ''
}

export function getMaterialRouteId(material: { id?: string | null; material_id?: string | null }) {
  return material.id ?? material.material_id ?? ''
}

export function isPriceStale(dateValue: string | null | undefined, now = new Date()) {
  if (!dateValue) return false

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return false

  const staleBefore = new Date(now)
  staleBefore.setDate(staleBefore.getDate() - 30)
  return date < staleBefore
}

export function getMaterialPriceStatus(latestPrice: { quote_date?: string | null; effective_date?: string | null; created_at?: string | null } | null | undefined): MaterialPriceStatus {
  if (!latestPrice) return 'MISSING'
  return isPriceStale(latestPrice.quote_date ?? latestPrice.effective_date ?? latestPrice.created_at) ? 'STALE' : 'OK'
}

export function getMaterialPriceWarning(latestPrice: { quote_date?: string | null; effective_date?: string | null; created_at?: string | null } | null | undefined) {
  const status = getMaterialPriceStatus(latestPrice)
  if (status === 'MISSING') return 'ยังไม่มีราคา'
  if (status === 'STALE') return 'ราคาล่าสุดเกิน 30 วัน'
  return null
}

export function calculateMaterialQuality(input: MaterialQualityInput): MaterialQualityResult {
  const hasUom = Boolean(input.base_uom_id || input.base_uom)
  const hasSupplier = Boolean(input.hasSupplier)
  const hasPreferredSupplier = Boolean(input.hasPreferredSupplier)
  const hasLatestPrice = Boolean(input.hasLatestPrice)
  const isStale = Boolean(input.isPriceStale)
  const isExpired = Boolean(input.isPriceExpired)

  const score =
    (input.material_code || input.material_id ? 10 : 0) +
    (input.mat_name_th ? 10 : 0) +
    (input.category_id || input.cat_id ? 10 : 0) +
    (hasUom ? 10 : 0) +
    (hasSupplier ? 10 : 0) +
    (hasPreferredSupplier ? 5 : 0) +
    (hasLatestPrice ? 20 : 0) +
    (input.hasAlias ? 10 : 0) +
    (input.spec || input.brand || input.model ? 10 : 0) +
    (hasLatestPrice && !isStale && !isExpired ? 5 : 0)

  if (!hasLatestPrice) return { score, label: 'Missing price' }
  if (isExpired) return { score, label: 'Price expired' }
  if (isStale) return { score, label: 'Price stale' }
  if (!hasSupplier) return { score, label: 'Missing supplier' }
  if (!hasPreferredSupplier) return { score, label: 'Missing preferred supplier' }
  if (!hasUom) return { score, label: 'Missing UOM' }
  if (score >= 85) return { score, label: 'Ready' }
  return { score, label: 'Incomplete' }
}
