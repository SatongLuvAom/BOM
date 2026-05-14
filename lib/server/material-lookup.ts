import { createAdminClient } from '@/lib/supabase/admin'
import type { LineMaterialLookupPrice, LineMaterialLookupResult } from '@/types/line'

type SearchSource = 'material_id' | 'mat_name_th' | 'mat_name_en' | 'spec' | 'brand' | 'alias'

const SOURCE_SCORE: Record<SearchSource, number> = {
  material_id: 120,
  mat_name_th: 100,
  alias: 90,
  mat_name_en: 80,
  spec: 60,
  brand: 50,
}

interface MaterialSearchRank {
  material_id: string
  match_score: number
  match_sources: Set<string>
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}

function sortByRank(
  ranks: Map<string, MaterialSearchRank>,
  updatedAtById: Map<string, string>,
): string[] {
  return Array.from(ranks.values())
    .sort((left, right) => {
      if (right.match_score !== left.match_score) {
        return right.match_score - left.match_score
      }

      const leftUpdatedAt = updatedAtById.get(left.material_id) ?? ''
      const rightUpdatedAt = updatedAtById.get(right.material_id) ?? ''
      return rightUpdatedAt.localeCompare(leftUpdatedAt)
    })
    .map((item) => item.material_id)
}

function pushRank(
  ranks: Map<string, MaterialSearchRank>,
  materialId: string,
  source: SearchSource,
) {
  const existing = ranks.get(materialId)

  if (existing) {
    existing.match_score = Math.max(existing.match_score, SOURCE_SCORE[source])
    existing.match_sources.add(source)
    return
  }

  ranks.set(materialId, {
    material_id: materialId,
    match_score: SOURCE_SCORE[source],
    match_sources: new Set([source]),
  })
}

export async function searchMaterialsForLine(
  keyword: string,
  limit = 5,
): Promise<LineMaterialLookupResult[]> {
  const normalizedKeyword = normalizeKeyword(keyword)
  if (!normalizedKeyword) {
    return []
  }

  const supabase = createAdminClient()
  const pattern = `%${normalizedKeyword}%`

  const [
    materialIdRes,
    matNameThRes,
    matNameEnRes,
    specRes,
    brandRes,
    aliasRes,
  ] = await Promise.all([
    supabase
      .from('mat_master')
      .select('material_id, updated_at')
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false)
      .ilike('material_id', pattern)
      .limit(limit * 2),
    supabase
      .from('mat_master')
      .select('material_id, updated_at')
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false)
      .ilike('mat_name_th', pattern)
      .limit(limit * 2),
    supabase
      .from('mat_master')
      .select('material_id, updated_at')
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false)
      .ilike('mat_name_en', pattern)
      .limit(limit * 2),
    supabase
      .from('mat_master')
      .select('material_id, updated_at')
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false)
      .ilike('spec', pattern)
      .limit(limit * 2),
    supabase
      .from('mat_master')
      .select('material_id, updated_at')
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false)
      .ilike('brand', pattern)
      .limit(limit * 2),
    supabase
      .from('mat_alias')
      .select('material_id, alias_name')
      .eq('is_deleted', false)
      .ilike('alias_name', pattern)
      .limit(limit * 4),
  ])

  const errors = [
    materialIdRes.error,
    matNameThRes.error,
    matNameEnRes.error,
    specRes.error,
    brandRes.error,
    aliasRes.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error?.message).join(', '))
  }

  const ranks = new Map<string, MaterialSearchRank>()
  const updatedAtById = new Map<string, string>()

  for (const row of materialIdRes.data ?? []) {
    pushRank(ranks, row.material_id, 'material_id')
    updatedAtById.set(row.material_id, row.updated_at)
  }

  for (const row of matNameThRes.data ?? []) {
    pushRank(ranks, row.material_id, 'mat_name_th')
    updatedAtById.set(row.material_id, row.updated_at)
  }

  for (const row of matNameEnRes.data ?? []) {
    pushRank(ranks, row.material_id, 'mat_name_en')
    updatedAtById.set(row.material_id, row.updated_at)
  }

  for (const row of specRes.data ?? []) {
    pushRank(ranks, row.material_id, 'spec')
    updatedAtById.set(row.material_id, row.updated_at)
  }

  for (const row of brandRes.data ?? []) {
    pushRank(ranks, row.material_id, 'brand')
    updatedAtById.set(row.material_id, row.updated_at)
  }

  for (const row of aliasRes.data ?? []) {
    pushRank(ranks, row.material_id, 'alias')
  }

  const topMaterialIds = sortByRank(ranks, updatedAtById).slice(0, limit)

  if (topMaterialIds.length === 0) {
    return []
  }

  const today = new Date().toISOString().slice(0, 10)

  const [materialsRes, aliasesRes, pricesRes] = await Promise.all([
    supabase
      .from('mat_master')
      .select(`
        material_id,
        mat_name_th,
        mat_name_en,
        spec,
        brand,
        base_uom,
        category:mat_category(cat_name_th)
      `)
      .in('material_id', topMaterialIds)
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false),
    supabase
      .from('mat_alias')
      .select('material_id, alias_name')
      .eq('is_deleted', false)
      .in('material_id', topMaterialIds),
    supabase
      .from('mat_price_base')
      .select(`
        material_id,
        supplier_id,
        effective_date,
        price_uom,
        unit_price,
        currency_code,
        supplier:supplier!supplier_id(supplier_name_th),
        uom:mat_uom!price_uom(uom_name_th)
      `)
      .in('material_id', topMaterialIds)
      .eq('is_deleted', false)
      .lte('effective_date', today)
      .order('effective_date', { ascending: false }),
  ])

  const detailErrors = [materialsRes.error, aliasesRes.error, pricesRes.error].filter(Boolean)
  if (detailErrors.length > 0) {
    throw new Error(detailErrors.map((error) => error?.message).join(', '))
  }

  const aliasMap = new Map<string, string[]>()
  for (const row of aliasesRes.data ?? []) {
    const existing = aliasMap.get(row.material_id) ?? []
    existing.push(row.alias_name)
    aliasMap.set(row.material_id, existing)
  }

  const latestPriceByMaterialId = new Map<string, LineMaterialLookupPrice>()
  for (const row of pricesRes.data ?? []) {
    if (latestPriceByMaterialId.has(row.material_id)) {
      continue
    }

    const supplier = firstRelation(row.supplier)
    const uom = firstRelation(row.uom)

    latestPriceByMaterialId.set(row.material_id, {
      material_id: row.material_id,
      supplier_id: row.supplier_id,
      supplier_name_th: supplier?.supplier_name_th ?? null,
      effective_date: row.effective_date,
      price_uom: row.price_uom,
      price_uom_name_th: uom?.uom_name_th ?? null,
      unit_price: row.unit_price,
      currency_code: row.currency_code,
    })
  }

  const materialMap = new Map(
    (materialsRes.data ?? []).map((row) => [
      row.material_id,
      (() => {
        const category = firstRelation(row.category)

        return {
          material_id: row.material_id,
          mat_name_th: row.mat_name_th,
          mat_name_en: row.mat_name_en,
          spec: row.spec,
          brand: row.brand,
          base_uom: row.base_uom,
          category_name_th: category?.cat_name_th ?? null,
          aliases: aliasMap.get(row.material_id) ?? [],
          latest_price: latestPriceByMaterialId.get(row.material_id) ?? null,
          match_score: ranks.get(row.material_id)?.match_score ?? 0,
          match_sources: Array.from(ranks.get(row.material_id)?.match_sources ?? []),
        } satisfies LineMaterialLookupResult
      })(),
    ]),
  )

  return topMaterialIds
    .map((materialId) => materialMap.get(materialId))
    .filter((item): item is LineMaterialLookupResult => Boolean(item))
}
