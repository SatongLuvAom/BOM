import { normalizeMaterialSearchText } from '@/lib/material-master'
import { buildOrIlikeFilter } from '@/lib/supabase/filters'

type MaterialMatchRow = {
  material_id: string
  material_code?: string | null
  mat_name_th?: string | null
  mat_name_en?: string | null
  normalized_name?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
}

function includesTerm(value: string | null | undefined, term: string) {
  return normalizeMaterialSearchText(value).includes(term)
}

function startsWithTerm(value: string | null | undefined, term: string) {
  return normalizeMaterialSearchText(value).startsWith(term)
}

function isExact(value: string | null | undefined, term: string) {
  return normalizeMaterialSearchText(value) === term
}

function setRank(ranks: Map<string, number>, materialId: string | null | undefined, rank: number) {
  if (!materialId) return
  ranks.set(materialId, Math.max(ranks.get(materialId) ?? 0, rank))
}

function rankMaterialRow(row: MaterialMatchRow, term: string) {
  if (isExact(row.material_code, term) || isExact(row.material_id, term)) return 120
  if (startsWithTerm(row.material_code, term) || startsWithTerm(row.material_id, term)) return 110
  if (startsWithTerm(row.mat_name_th, term) || startsWithTerm(row.mat_name_en, term)) return 100
  if (includesTerm(row.mat_name_th, term) || includesTerm(row.mat_name_en, term)) return 90
  if (includesTerm(row.normalized_name, term)) return 85
  if (includesTerm(row.brand, term) || includesTerm(row.model, term)) return 75
  if (includesTerm(row.spec, term)) return 70
  return 50
}

export async function resolveMaterialSearchMatches(supabase: any, search: string) {
  const term = normalizeMaterialSearchText(search)
  if (!term) return []

  const [materialRes, aliasRes, categoryRes, supplierRes] = await Promise.all([
    supabase
      .from('mat_master')
      .select('material_id, material_code, mat_name_th, mat_name_en, normalized_name, brand, model, spec')
      .eq('is_deleted', false)
      .or(buildOrIlikeFilter(['material_id', 'material_code', 'mat_name_th', 'mat_name_en', 'normalized_name', 'brand', 'model', 'spec'], term))
      .limit(1000),
    supabase
      .from('mat_alias')
      .select('material_id, alias_name, normalized_alias')
      .eq('is_deleted', false)
      .or(buildOrIlikeFilter(['alias_name', 'normalized_alias'], term))
      .limit(1000),
    supabase
      .from('mat_category')
      .select('cat_id')
      .eq('is_deleted', false)
      .or(buildOrIlikeFilter(['cat_code', 'cat_name_th', 'cat_name_en'], search))
      .limit(100),
    supabase
      .from('mat_supplier_map')
      .select('material_id, supplier:supplier!mat_supplier_map_supplier_id_fkey!inner(supplier_code, supplier_name_th, supplier_name_en)')
      .eq('is_deleted', false)
      .eq('supplier.is_deleted', false)
      .or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en'], search), { referencedTable: 'supplier' })
      .limit(1000),
  ])

  const errors = [materialRes.error, aliasRes.error, categoryRes.error, supplierRes.error].filter(Boolean)
  if (errors.length > 0) {
    throw new Error(errors.map((error: any) => error.message).join(', '))
  }

  const ranks = new Map<string, number>()

  for (const row of materialRes.data ?? []) {
    setRank(ranks, row.material_id, rankMaterialRow(row, term))
  }

  for (const row of aliasRes.data ?? []) {
    setRank(ranks, row.material_id, 95)
  }

  for (const row of supplierRes.data ?? []) {
    if (row.supplier) {
      setRank(ranks, row.material_id, 65)
    }
  }

  const catIds = (categoryRes.data ?? []).map((row: { cat_id: string }) => row.cat_id)
  if (catIds.length > 0) {
    const { data, error } = await supabase
      .from('mat_master')
      .select('material_id')
      .eq('is_deleted', false)
      .in('cat_id', catIds)
      .limit(1000)

    if (error) throw new Error(error.message)

    for (const row of data ?? []) {
      setRank(ranks, row.material_id, 60)
    }
  }

  return Array.from(ranks.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([materialId]) => materialId)
}

export function sortRowsBySearchRank<T extends { material_id?: string | null; updated_at?: string | null }>(
  rows: T[],
  rankedMaterialIds: string[],
) {
  const rank = new Map(rankedMaterialIds.map((materialId, index) => [materialId, index]))

  return [...rows].sort((left, right) => {
    const leftRank = rank.get(left.material_id ?? '') ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(right.material_id ?? '') ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''))
  })
}
