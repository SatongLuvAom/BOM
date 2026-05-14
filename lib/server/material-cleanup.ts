import { analyzeMaterialQuality, type MaterialQualityAnalysis } from '@/lib/material-quality'
import { fetchLatestPriceMap, type LatestMaterialPrice } from '@/lib/server/material-quality-data'

export type CleanupMaterial = {
  id: string
  material_id: string
  material_code: string | null
  mat_name_th: string
  mat_name_en: string | null
  cat_id: string | null
  category_id: string | null
  base_uom: string | null
  base_uom_id: string | null
  spec: string | null
  brand: string | null
  model: string | null
  status: string
  category?: { cat_code: string; cat_name_th: string } | null
  uom?: { uom_code: string; uom_name_th: string } | null
  aliases?: unknown[]
  supplier_maps?: { is_preferred?: boolean | null; is_deleted?: boolean | null }[]
  uom_conversions?: {
    from_uom?: string | null
    from_uom_id?: string | null
    to_uom?: string | null
    to_uom_id?: string | null
    is_deleted?: boolean | null
  }[]
}

export type CleanupRow = {
  material: CleanupMaterial
  latestPrice: LatestMaterialPrice | null
  quality: MaterialQualityAnalysis
  reason: string
}

export type CleanupGroup = {
  key: string
  title: string
  description: string
  rows: CleanupRow[]
}

export type MaterialCleanupReport = {
  computedAt: string
  materialCount: number
  totalIssues: number
  groups: CleanupGroup[]
}

function issueReason(quality: MaterialQualityAnalysis, issueKind: string, fallback: string) {
  return quality.issues.find((issue) => issue.issueKind === issueKind)?.reason ?? fallback
}

export function buildMaterialCleanupGroups(
  materials: CleanupMaterial[],
  latestPrices: Record<string, LatestMaterialPrice>,
): CleanupGroup[] {
  const rows = materials.map((material) => {
    const latestPrice = latestPrices[material.material_id] ?? null
    return {
      material,
      latestPrice,
      quality: analyzeMaterialQuality({ material, latestPrice }),
    }
  })

  const group = (
    key: string,
    title: string,
    description: string,
    predicate: (row: Omit<CleanupRow, 'reason'>) => boolean,
    reason: (row: Omit<CleanupRow, 'reason'>) => string,
  ): CleanupGroup => ({
    key,
    title,
    description,
    rows: rows
      .filter(predicate)
      .map((row) => ({ ...row, reason: reason(row) }))
      .sort((left, right) => left.quality.quality_score - right.quality.quality_score),
  })

  return [
    group(
      'missing-price',
      'Missing price',
      'Materials with no latest price record.',
      (row) => row.quality.issues.some((issue) => issue.issueKind === 'missing_price'),
      (row) => issueReason(row.quality, 'missing_price', 'No latest price'),
    ),
    group(
      'price-stale',
      'Price stale',
      'Latest price is older than 30 days.',
      (row) => row.quality.is_price_stale && !row.quality.is_price_expired,
      (row) => issueReason(row.quality, 'price_stale', 'Latest price older than 30 days'),
    ),
    group(
      'price-expired',
      'Price expired',
      'Latest price has valid_until before today.',
      (row) => row.quality.is_price_expired,
      (row) => issueReason(row.quality, 'price_expired', 'Price validity has expired'),
    ),
    group(
      'missing-supplier',
      'Missing supplier',
      'Materials without supplier mapping.',
      (row) => row.quality.issues.some((issue) => issue.issueKind === 'missing_supplier'),
      (row) => issueReason(row.quality, 'missing_supplier', 'No supplier'),
    ),
    group(
      'missing-preferred-supplier',
      'Missing preferred supplier',
      'Materials with suppliers but no preferred supplier.',
      (row) => row.quality.issues.some((issue) => issue.issueKind === 'missing_preferred_supplier'),
      (row) => issueReason(row.quality, 'missing_preferred_supplier', 'No preferred supplier'),
    ),
    group(
      'missing-alias',
      'Missing alias',
      'Materials without any alias.',
      (row) => row.quality.issues.some((issue) => issue.issueKind === 'missing_alias'),
      (row) => issueReason(row.quality, 'missing_alias', 'No alias'),
    ),
    group(
      'missing-uom-conversion',
      'Missing UOM conversion',
      'Materials that need conversion between base UOM and price UOM.',
      (row) => row.quality.issues.some((issue) => issue.issueKind === 'missing_uom_conversion'),
      (row) => issueReason(row.quality, 'missing_uom_conversion', 'No UOM conversion for differing UOM'),
    ),
    group(
      'unit-mismatch-warning',
      'Unit mismatch warning',
      'Non-blocking warnings that should be reviewed before quoting or purchasing.',
      (row) => row.quality.warnings.length > 0,
      (row) => row.quality.warnings.map((warning) => warning.message).join(' '),
    ),
  ]
}

export async function fetchMaterialCleanupReport(supabase: any): Promise<MaterialCleanupReport> {
  const [materialsRes, latestPrices] = await Promise.all([
    supabase
      .from('mat_master')
      .select(`
        id, material_id, material_code, mat_name_th, mat_name_en, cat_id, category_id,
        base_uom, base_uom_id, spec, brand, model, status,
        category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th),
        uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th),
        aliases:mat_alias!mat_alias_material_id_fkey(alias_name, is_deleted),
        supplier_maps:mat_supplier_map!mat_supplier_map_material_id_fkey(is_preferred, is_deleted),
        uom_conversions:mat_uom_conv!mat_uom_conv_material_id_fkey(from_uom, from_uom_id, to_uom, to_uom_id, is_deleted)
      `)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(10000),
    fetchLatestPriceMap(supabase),
  ])

  if (materialsRes.error) {
    throw new Error(materialsRes.error.message)
  }

  const materials = ((materialsRes.data ?? []) as any[]).map((row) => ({
    ...row,
    category: Array.isArray(row.category) ? row.category[0] ?? null : row.category ?? null,
    uom: Array.isArray(row.uom) ? row.uom[0] ?? null : row.uom ?? null,
  })) as CleanupMaterial[]

  const groups = buildMaterialCleanupGroups(materials, latestPrices)
  const totalIssues = groups.reduce((sum, group) => sum + group.rows.length, 0)

  return {
    computedAt: new Date().toISOString(),
    materialCount: materials.length,
    totalIssues,
    groups,
  }
}
