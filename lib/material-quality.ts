import { isPriceStale, normalizeMaterialSearchText } from '@/lib/material-master'

export type MaterialQualityLabel =
  | 'Missing price'
  | 'Price expired'
  | 'Price stale'
  | 'Missing supplier'
  | 'Missing preferred supplier'
  | 'Missing UOM'
  | 'Incomplete'
  | 'Ready'

export type MaterialQualityIssueKind =
  | 'missing_price'
  | 'price_expired'
  | 'price_stale'
  | 'missing_supplier'
  | 'missing_preferred_supplier'
  | 'missing_uom'
  | 'missing_alias'
  | 'missing_spec'
  | 'missing_category'
  | 'missing_material_code'
  | 'missing_material_name'
  | 'missing_uom_conversion'

export type MaterialQualityWarningKind =
  | 'price_uom_without_conversion'
  | 'sheet_material_base_uom'
  | 'suspicious_meter_price'

export interface MaterialQualityItem {
  key: string
  label: string
  points: number
  earned: number
  ok: boolean
  reason?: string
  issueKind?: MaterialQualityIssueKind
}

export interface MaterialQualityWarning {
  kind: MaterialQualityWarningKind
  message: string
}

export interface MaterialQualityAnalysis {
  quality_score: number
  quality_label: MaterialQualityLabel
  breakdown: MaterialQualityItem[]
  issues: MaterialQualityItem[]
  warnings: MaterialQualityWarning[]
  is_price_expired: boolean
  is_price_stale: boolean
}

interface QualityMaterialInput {
  material_id?: string | null
  material_code?: string | null
  mat_name_th?: string | null
  mat_name_en?: string | null
  cat_id?: string | null
  category_id?: string | null
  base_uom?: string | null
  base_uom_id?: string | null
  spec?: string | null
  brand?: string | null
  model?: string | null
  supplier_maps?: QualitySupplierMapInput[] | null
  aliases?: unknown[] | null
  uom_conversions?: QualityUomConversionInput[] | null
}

interface QualitySupplierMapInput {
  is_preferred?: boolean | null
  is_deleted?: boolean | null
  is_active?: boolean | null
}

interface QualityUomConversionInput {
  from_uom?: string | null
  from_uom_id?: string | null
  to_uom?: string | null
  to_uom_id?: string | null
  is_deleted?: boolean | null
}

interface QualityLatestPriceInput {
  quote_date?: string | null
  effective_date?: string | null
  valid_until?: string | null
  created_at?: string | null
  price_uom?: string | null
  price_uom_id?: string | null
  unit_price?: number | string | null
}

export interface AnalyzeMaterialQualityInput {
  material: QualityMaterialInput
  latestPrice?: QualityLatestPriceInput | null
  now?: Date
}

function isPresent(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isExpired(validUntil: string | null | undefined, now: Date) {
  const date = parseDate(validUntil)
  if (!date) return false
  return dateOnly(date) < dateOnly(now)
}

function activeSupplierMaps(material: QualityMaterialInput) {
  return (material.supplier_maps ?? []).filter((map) => !map.is_deleted && map.is_active !== false)
}

function activeConversions(material: QualityMaterialInput) {
  return (material.uom_conversions ?? []).filter((conv) => !conv.is_deleted)
}

function normalizeUom(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase()
}

function hasConversionBetween(
  conversions: QualityUomConversionInput[],
  leftCode: string | null | undefined,
  leftId: string | null | undefined,
  rightCode: string | null | undefined,
  rightId: string | null | undefined,
) {
  const left = normalizeUom(leftCode)
  const right = normalizeUom(rightCode)

  return conversions.some((conv) => {
    const fromMatches =
      (leftId && conv.from_uom_id === leftId) ||
      (left && normalizeUom(conv.from_uom) === left)
    const toMatches =
      (rightId && conv.to_uom_id === rightId) ||
      (right && normalizeUom(conv.to_uom) === right)
    const reverseFromMatches =
      (rightId && conv.from_uom_id === rightId) ||
      (right && normalizeUom(conv.from_uom) === right)
    const reverseToMatches =
      (leftId && conv.to_uom_id === leftId) ||
      (left && normalizeUom(conv.to_uom) === left)

    return (fromMatches && toMatches) || (reverseFromMatches && reverseToMatches)
  })
}

function looksLikeSheetMaterial(material: QualityMaterialInput) {
  const text = normalizeMaterialSearchText(
    [
      material.material_code,
      material.mat_name_th,
      material.mat_name_en,
      material.spec,
      material.brand,
      material.model,
    ].filter(Boolean).join(' '),
  )

  return [
    'sheet',
    'แผ่น',
    'mdf',
    'plywood',
    'hpl',
    'acrylic',
    'laminate',
    'aluminium composite',
    'อลูมิเนียมคอมโพสิต',
  ].some((term) => text.includes(term))
}

function hasLongMeterSpec(material: QualityMaterialInput) {
  const text = `${material.spec ?? ''} ${material.mat_name_th ?? ''} ${material.mat_name_en ?? ''}`
  return /\b\d+(?:\.\d+)?\s*m\b/i.test(text)
}

function qualityLabel(input: {
  hasLatestPrice: boolean
  expired: boolean
  stale: boolean
  hasSupplier: boolean
  hasPreferredSupplier: boolean
  hasUom: boolean
  complete: boolean
}): MaterialQualityLabel {
  if (!input.hasLatestPrice) return 'Missing price'
  if (input.expired) return 'Price expired'
  if (input.stale) return 'Price stale'
  if (!input.hasSupplier) return 'Missing supplier'
  if (!input.hasPreferredSupplier) return 'Missing preferred supplier'
  if (!input.hasUom) return 'Missing UOM'
  if (!input.complete) return 'Incomplete'
  return 'Ready'
}

export function analyzeMaterialQuality({
  material,
  latestPrice,
  now = new Date(),
}: AnalyzeMaterialQualityInput): MaterialQualityAnalysis {
  const suppliers = activeSupplierMaps(material)
  const conversions = activeConversions(material)
  const hasLatestPrice = Boolean(latestPrice)
  const stale = hasLatestPrice
    ? isPriceStale(latestPrice?.quote_date ?? latestPrice?.effective_date ?? latestPrice?.created_at, now)
    : false
  const expired = hasLatestPrice ? isExpired(latestPrice?.valid_until, now) : false
  const hasSupplier = suppliers.length > 0
  const hasPreferredSupplier = suppliers.some((map) => map.is_preferred) || suppliers.length === 1
  const hasUom = Boolean(material.base_uom_id || material.base_uom)
  const hasAlias = Boolean(material.aliases?.length)
  const hasSpec = Boolean(isPresent(material.spec) || isPresent(material.brand) || isPresent(material.model))
  const priceIsCurrent = hasLatestPrice && !stale && !expired

  const breakdown: MaterialQualityItem[] = [
    {
      key: 'material_code',
      label: 'Material code exists',
      points: 10,
      earned: isPresent(material.material_code ?? material.material_id) ? 10 : 0,
      ok: isPresent(material.material_code ?? material.material_id),
      reason: 'No material code',
      issueKind: 'missing_material_code',
    },
    {
      key: 'mat_name_th',
      label: 'Thai material name exists',
      points: 10,
      earned: isPresent(material.mat_name_th) ? 10 : 0,
      ok: isPresent(material.mat_name_th),
      reason: 'No Thai material name',
      issueKind: 'missing_material_name',
    },
    {
      key: 'category',
      label: 'Category is set',
      points: 10,
      earned: material.category_id || material.cat_id ? 10 : 0,
      ok: Boolean(material.category_id || material.cat_id),
      reason: 'No category',
      issueKind: 'missing_category',
    },
    {
      key: 'base_uom',
      label: 'Base UOM is set',
      points: 10,
      earned: hasUom ? 10 : 0,
      ok: hasUom,
      reason: 'No base UOM',
      issueKind: 'missing_uom',
    },
    {
      key: 'supplier',
      label: 'Has supplier mapping',
      points: 10,
      earned: hasSupplier ? 10 : 0,
      ok: hasSupplier,
      reason: 'No supplier',
      issueKind: 'missing_supplier',
    },
    {
      key: 'preferred_supplier',
      label: 'Has preferred supplier',
      points: 5,
      earned: hasPreferredSupplier ? 5 : 0,
      ok: hasPreferredSupplier,
      reason: 'No preferred supplier',
      issueKind: 'missing_preferred_supplier',
    },
    {
      key: 'latest_price',
      label: 'Has latest price',
      points: 20,
      earned: hasLatestPrice ? 20 : 0,
      ok: hasLatestPrice,
      reason: 'No latest price',
      issueKind: 'missing_price',
    },
    {
      key: 'alias',
      label: 'Has alias',
      points: 10,
      earned: hasAlias ? 10 : 0,
      ok: hasAlias,
      reason: 'No alias',
      issueKind: 'missing_alias',
    },
    {
      key: 'spec',
      label: 'Has spec, brand, or model',
      points: 10,
      earned: hasSpec ? 10 : 0,
      ok: hasSpec,
      reason: 'No spec, brand, or model',
      issueKind: 'missing_spec',
    },
    {
      key: 'price_current',
      label: 'Latest price is current',
      points: 5,
      earned: priceIsCurrent ? 5 : 0,
      ok: priceIsCurrent,
      reason: !hasLatestPrice
        ? 'No latest price'
        : expired
          ? 'Price validity has expired'
          : 'Latest price older than 30 days',
      issueKind: !hasLatestPrice ? 'missing_price' : expired ? 'price_expired' : 'price_stale',
    },
  ]

  const warnings: MaterialQualityWarning[] = []
  const baseUom = normalizeUom(material.base_uom)
  const priceUom = normalizeUom(latestPrice?.price_uom)
  const uomDiffers = hasLatestPrice && (
    Boolean(material.base_uom_id && latestPrice?.price_uom_id && material.base_uom_id !== latestPrice.price_uom_id) ||
    Boolean(baseUom && priceUom && baseUom !== priceUom)
  )

  if (
    uomDiffers &&
    !hasConversionBetween(conversions, material.base_uom, material.base_uom_id, latestPrice?.price_uom, latestPrice?.price_uom_id)
  ) {
    warnings.push({
      kind: 'price_uom_without_conversion',
      message: `Price UOM ${latestPrice?.price_uom ?? '-'} differs from base UOM ${material.base_uom ?? '-'} and no UOM conversion exists.`,
    })
  }

  if (looksLikeSheetMaterial(material) && ['EA', 'EACH', 'PC', 'PCS'].includes(baseUom)) {
    warnings.push({
      kind: 'sheet_material_base_uom',
      message: 'Material looks like sheet material, but base UOM is EA/PCS instead of SHEET.',
    })
  }

  if (hasLongMeterSpec(material) && priceUom === 'M' && Number(latestPrice?.unit_price ?? 0) >= 10000) {
    warnings.push({
      kind: 'suspicious_meter_price',
      message: 'Spec looks like a long-meter item while price is per M and unusually high. Verify UOM and price basis.',
    })
  }

  const missingConversionWarning = warnings.find((warning) => warning.kind === 'price_uom_without_conversion')
  if (missingConversionWarning) {
    breakdown.push({
      key: 'uom_conversion_warning',
      label: 'UOM conversion check',
      points: 0,
      earned: 0,
      ok: false,
      reason: 'No UOM conversion for differing price/base UOM',
      issueKind: 'missing_uom_conversion',
    })
  }

  const score = breakdown.reduce((sum, item) => sum + item.earned, 0)
  const complete = breakdown.every((item) => item.points === 0 || item.ok) && warnings.length === 0

  return {
    quality_score: Math.min(100, Math.max(0, score)),
    quality_label: qualityLabel({
      hasLatestPrice,
      expired,
      stale,
      hasSupplier,
      hasPreferredSupplier,
      hasUom,
      complete,
    }),
    breakdown,
    issues: breakdown.filter((item) => !item.ok),
    warnings,
    is_price_expired: expired,
    is_price_stale: stale,
  }
}
