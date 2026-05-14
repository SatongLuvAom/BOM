import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { MaterialList } from '@/components/mat/MaterialList'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { getPaginationRange } from '@/lib/utils'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { resolveMaterialSearchMatches, sortRowsBySearchRank } from '@/lib/server/material-search'
import { buildQualityScoreMap, fetchLatestPriceMap, type LatestMaterialPrice } from '@/lib/server/material-quality-data'
import { getCachedActiveCategories, getCachedActiveSuppliers } from '@/lib/server/master-data-cache'
import type { MatQualityScore } from '@/types/mat'

type SortKey = 'material_code' | 'material_id' | 'mat_name_th' | 'brand' | 'status' | 'updated_at'

interface PageProps {
  searchParams: Promise<{
    search?: string
    cat_id?: string
    status?: string
    has_price?: string
    stale_price?: string
    supplier_id?: string
    page?: string
    sort_by?: string
    sort_dir?: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function MaterialsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const cat_id = sp.cat_id ?? ''
  const status = sp.status ?? ''
  const hasPrice = sp.has_price ?? ''
  const stalePrice = sp.stale_price ?? ''
  const supplierId = sp.supplier_id ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const validSortKeys: SortKey[] = ['material_code', 'material_id', 'mat_name_th', 'brand', 'status', 'updated_at']
  const sortBy: SortKey = validSortKeys.includes(sp.sort_by as SortKey) ? (sp.sort_by as SortKey) : 'updated_at'
  const sortAsc = sp.sort_dir === 'asc'
  const limit = 20
  const { from, to } = getPaginationRange(page, limit)

  const supabase = await createClient()

  const [categories, suppliers, materialsRes] = await Promise.all([
    getCachedActiveCategories(),
    getCachedActiveSuppliers(),
    (async () => {
      let rankedSearchIds: string[] = []
      let query = supabase
        .from('mat_master')
        .select(
          `id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en,
           normalized_name, spec, brand, model, base_uom, base_uom_id, status, updated_at,
           category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th)`,
          { count: 'exact' },
        )
        .eq('is_deleted', false)

      if (search) {
        rankedSearchIds = await resolveMaterialSearchMatches(supabase, search)
        query = query.in('material_id', rankedSearchIds.length > 0 ? rankedSearchIds : ['__none__'])
      }
      if (cat_id) query = query.eq('cat_id', cat_id)
      if (status) query = query.eq('status', status)

      if (supplierId) {
        const { data: supplierMaps } = await supabase
          .from('mat_supplier_map')
          .select('material_id')
          .eq('supplier_id', supplierId)
          .eq('is_deleted', false)
        query = query.in('material_id', supplierMaps?.map((row) => row.material_id) ?? ['__none__'])
      }

      if (hasPrice || stalePrice) {
        const { data: latestRows } = await supabase
          .from('material_latest_prices')
          .select('material_id, is_stale')

        const latestByMaterial = new Map((latestRows ?? []).map((row) => [row.material_id, row]))
        let ids = Array.from(latestByMaterial.keys())

        if (hasPrice === 'missing') {
          const { data: allRows } = await supabase
            .from('mat_master')
            .select('material_id')
            .eq('is_deleted', false)
          const priced = new Set(ids)
          ids = (allRows ?? []).map((row) => row.material_id).filter((id) => !priced.has(id))
        } else if (hasPrice === 'yes') {
          ids = Array.from(latestByMaterial.keys())
        }

        if (stalePrice === 'yes') {
          ids = Array.from(latestByMaterial.values()).filter((row) => row.is_stale).map((row) => row.material_id)
        }

        query = query.in('material_id', ids.length > 0 ? ids : ['__none__'])
      }

      if (search) {
        const result = await query.limit(1000)
        if (result.error || !result.data) return result

        const rankedRows = sortRowsBySearchRank(result.data, rankedSearchIds)
        return {
          ...result,
          data: rankedRows.slice(from, to + 1),
          count: rankedRows.length,
        }
      }

      return query.order(sortBy, { ascending: sortAsc }).range(from, to)
    })(),
  ])

  const materials  = assertSupabase(materialsRes,  'Failed to load materials')
  const total      = materialsRes.count ?? 0

  // Fetch latest prices for the current page of materials
  const matIds = (materials as any[]).map((m) => m.material_id)
  const latestPrices: Record<string, LatestMaterialPrice> = {}
  let qualityScores: Record<string, MatQualityScore> = {}
  if (matIds.length > 0) {
    const [priceMap, aliasRowsRes, supplierMapRowsRes, uomConvRowsRes] = await Promise.all([
      fetchLatestPriceMap(supabase, matIds),
      supabase
        .from('mat_alias')
        .select('material_id, alias_name')
        .eq('is_deleted', false)
        .in('material_id', matIds),
      supabase
        .from('mat_supplier_map')
        .select('material_id, is_preferred, is_active')
        .eq('is_deleted', false)
        .in('material_id', matIds),
      supabase
        .from('mat_uom_conv')
        .select('material_id, from_uom, from_uom_id, to_uom, to_uom_id')
        .eq('is_deleted', false)
        .in('material_id', matIds),
    ])

    Object.assign(latestPrices, priceMap)

    const aliasesByMaterial = new Map<string, any[]>()
    for (const row of aliasRowsRes.data ?? []) {
      aliasesByMaterial.set(row.material_id, [...(aliasesByMaterial.get(row.material_id) ?? []), row])
    }

    const supplierMapsByMaterial = new Map<string, any[]>()
    for (const row of supplierMapRowsRes.data ?? []) {
      supplierMapsByMaterial.set(row.material_id, [...(supplierMapsByMaterial.get(row.material_id) ?? []), row])
    }

    const conversionsByMaterial = new Map<string, any[]>()
    for (const row of uomConvRowsRes.data ?? []) {
      conversionsByMaterial.set(row.material_id, [...(conversionsByMaterial.get(row.material_id) ?? []), row])
    }

    const enrichedMaterials = (materials as any[]).map((material) => ({
      ...material,
      aliases: aliasesByMaterial.get(material.material_id) ?? [],
      supplier_maps: supplierMapsByMaterial.get(material.material_id) ?? [],
      uom_conversions: conversionsByMaterial.get(material.material_id) ?? [],
    }))

    qualityScores = buildQualityScoreMap(enrichedMaterials, latestPrices)
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        title="วัสดุทั้งหมด"
        subtitle={`${total.toLocaleString()} รายการ`}
        actions={
          <>
            <Link href="/materials/duplicates" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-stone-50">
              Duplicates
            </Link>
            <Link href="/materials/cleanup" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-stone-50">
              Cleanup
            </Link>
            <Link href="/materials/new" className="btn-primary shadow-indigo-500/20">
              + เพิ่มวัสดุ
            </Link>
          </>
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden px-6 pb-6 pt-4">
        <div className="card flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center border-b border-stone-200 px-5 py-3">
            <div className="w-full max-w-xl">
              <SearchInput
                placeholder="ค้นหา code, ชื่อ, alias, spec, supplier..."
                searchOn="enter"
                minSearchLength={2}
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {search && (
              <div className="border-b border-stone-200 bg-cyan-50/60 px-5 py-2 text-sm font-medium text-slate-700">
                ผลการค้นหา "{search}" พบ {total.toLocaleString('th-TH')} รายการ
                <Link href="/materials" className="ml-3 text-slate-500 underline hover:text-slate-950">
                  ล้างคำค้น
                </Link>
              </div>
            )}
            <MaterialList
              materials={materials as any}
              categories={(categories as any[]).map((category) => ({ cat_id: category.cat_id, cat_name_th: category.cat_name_th }))}
              suppliers={(suppliers as any[]).map((supplier) => ({ supplier_id: supplier.supplier_id, supplier_name_th: supplier.supplier_name_th }))}
              latestPrices={latestPrices}
              qualityScores={qualityScores}
            />
          </div>
          <Pagination total={total} page={page} limit={limit} />
        </div>
      </div>
    </div>
  )
}
