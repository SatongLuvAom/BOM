import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { MaterialList } from '@/components/mat/MaterialList'
import { Pagination } from '@/components/ui/Pagination'
import { getPaginationRange } from '@/lib/utils'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { resolveMaterialSearchMatches, sortRowsBySearchRank } from '@/lib/server/material-search'
import { buildQualityScoreMap, fetchLatestPriceMap, type LatestMaterialPrice } from '@/lib/server/material-quality-data'
import { getCachedActiveCategories, getCachedActiveSuppliers } from '@/lib/server/master-data-cache'
import type { MatQualityScore } from '@/types/mat'

type SortKey =
  | 'material_code'
  | 'mat_name_th'
  | 'brand'
  | 'spec'
  | 'category'
  | 'base_uom'
  | 'latest_price'
  | 'supplier'
  | 'price_status'
  | 'quality_score'
  | 'status'
  | 'updated_at'
type StatTone = 'blue' | 'orange' | 'amber' | 'green'

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

const SORT_KEYS: SortKey[] = [
  'material_code',
  'mat_name_th',
  'brand',
  'spec',
  'category',
  'base_uom',
  'latest_price',
  'supplier',
  'price_status',
  'quality_score',
  'status',
  'updated_at',
]

const DIRECT_SORT_COLUMNS: Partial<Record<SortKey, string>> = {
  material_code: 'material_code',
  mat_name_th: 'mat_name_th',
  brand: 'brand',
  spec: 'spec',
  category: 'cat_id',
  base_uom: 'base_uom',
  status: 'status',
  updated_at: 'updated_at',
}

const IN_MEMORY_SORT_LIMIT = 50000

const statToneClass: Record<StatTone, { icon: string; iconText: string; hint: string }> = {
  blue: { icon: 'bg-blue-50', iconText: 'text-blue-700', hint: 'text-blue-700' },
  orange: { icon: 'bg-orange-50', iconText: 'text-orange-600', hint: 'text-orange-600' },
  amber: { icon: 'bg-amber-50', iconText: 'text-amber-600', hint: 'text-amber-600' },
  green: { icon: 'bg-emerald-50', iconText: 'text-emerald-600', hint: 'text-emerald-600' },
}

function StatIcon({ tone }: { tone: StatTone }) {
  const iconProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (tone === 'orange') {
    return (
      <svg {...iconProps}>
        <path d="m7 7 10 10" />
        <path d="M11 3H5a2 2 0 0 0-2 2v6l10 10a2 2 0 0 0 3 0l5-5a2 2 0 0 0 0-3Z" />
        <path d="M7.5 7.5h.01" />
      </svg>
    )
  }

  if (tone === 'amber') {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    )
  }

  if (tone === 'green') {
    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    )
  }

  return (
    <svg {...iconProps}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint: string
  tone: StatTone
}) {
  const toneClass = statToneClass[tone]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneClass.icon} ${toneClass.iconText}`}>
          <StatIcon tone={tone} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700">{label}</p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-3xl font-bold leading-none tracking-tight text-blue-950">
              {value.toLocaleString('th-TH')}
            </p>
            <span className="pb-1 text-xs font-semibold text-slate-400">รายการ</span>
          </div>
          <p className={`mt-2 text-xs font-medium ${toneClass.hint}`}>{hint}</p>
        </div>
      </div>
    </div>
  )
}

function compareSortValues(left: string | number | null | undefined, right: string | number | null | undefined, ascending: boolean) {
  const leftMissing = left === null || left === undefined || left === ''
  const rightMissing = right === null || right === undefined || right === ''
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1

  if (typeof left === 'number' && typeof right === 'number') {
    const diff = left - right
    return ascending ? diff : -diff
  }

  const diff = String(left).localeCompare(String(right), 'th', { numeric: true, sensitivity: 'base' })
  return ascending ? diff : -diff
}

function priceStatusSortValue(price: LatestMaterialPrice | undefined) {
  if (!price) return 0
  if (price.is_stale || price.price_status === 'STALE') return 1
  return 2
}

function sortMaterialRows(
  rows: any[],
  sortBy: SortKey,
  ascending: boolean,
  latestPrices: Record<string, LatestMaterialPrice>,
  qualityScores: Record<string, MatQualityScore>,
) {
  return [...rows].sort((left, right) => {
    let leftValue: string | number | null | undefined
    let rightValue: string | number | null | undefined

    switch (sortBy) {
      case 'category':
        leftValue = left.category?.cat_code ?? left.cat_id
        rightValue = right.category?.cat_code ?? right.cat_id
        break
      case 'base_uom':
        leftValue = left.uom?.uom_name_th ?? left.base_uom
        rightValue = right.uom?.uom_name_th ?? right.base_uom
        break
      case 'latest_price':
        leftValue = latestPrices[left.material_id]?.unit_price
        rightValue = latestPrices[right.material_id]?.unit_price
        break
      case 'supplier':
        leftValue = latestPrices[left.material_id]?.supplier_name
        rightValue = latestPrices[right.material_id]?.supplier_name
        break
      case 'price_status':
        leftValue = priceStatusSortValue(latestPrices[left.material_id])
        rightValue = priceStatusSortValue(latestPrices[right.material_id])
        break
      case 'quality_score':
        leftValue = qualityScores[left.material_id]?.quality_score
        rightValue = qualityScores[right.material_id]?.quality_score
        break
      default:
        leftValue = left[sortBy]
        rightValue = right[sortBy]
    }

    const primary = compareSortValues(leftValue, rightValue, ascending)
    if (primary !== 0) return primary

    return compareSortValues(left.material_code ?? left.material_id, right.material_code ?? right.material_id, true)
  })
}

async function loadMaterialPageDetails(supabase: any, materials: any[]) {
  const matIds = materials.map((m) => m.material_id).filter(Boolean)
  const latestPrices: Record<string, LatestMaterialPrice> = {}
  let qualityScores: Record<string, MatQualityScore> = {}

  if (matIds.length === 0) {
    return { latestPrices, qualityScores }
  }

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

  const enrichedMaterials = materials.map((material) => ({
    ...material,
    aliases: aliasesByMaterial.get(material.material_id) ?? [],
    supplier_maps: supplierMapsByMaterial.get(material.material_id) ?? [],
    uom_conversions: conversionsByMaterial.get(material.material_id) ?? [],
  }))

  qualityScores = buildQualityScoreMap(enrichedMaterials, latestPrices) as Record<string, MatQualityScore>

  return { latestPrices, qualityScores }
}

export default async function MaterialsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const cat_id = sp.cat_id ?? ''
  const status = sp.status ?? ''
  const hasPrice = sp.has_price ?? ''
  const stalePrice = sp.stale_price ?? ''
  const supplierId = sp.supplier_id ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const explicitSort = SORT_KEYS.includes(sp.sort_by as SortKey)
  const sortBy: SortKey = explicitSort ? (sp.sort_by as SortKey) : 'updated_at'
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

      const directSortColumn = DIRECT_SORT_COLUMNS[sortBy]
      if (!search && directSortColumn) {
        return query.order(directSortColumn, { ascending: sortAsc }).range(from, to)
      }

      const result = await query.range(0, IN_MEMORY_SORT_LIMIT - 1)
      if (result.error || !result.data) return result

      let sortedRows = result.data
      if (search && !explicitSort) {
        sortedRows = sortRowsBySearchRank(result.data, rankedSearchIds)
      } else {
        const needsDerivedData = ['latest_price', 'supplier', 'price_status', 'quality_score'].includes(sortBy)
        const sortDetails = needsDerivedData
          ? await loadMaterialPageDetails(supabase, result.data)
          : { latestPrices: {}, qualityScores: {} }

        sortedRows = sortMaterialRows(
          result.data,
          sortBy,
          sortAsc,
          sortDetails.latestPrices,
          sortDetails.qualityScores,
        )
      }

      return {
        ...result,
        data: sortedRows.slice(from, to + 1),
        count: result.count ?? sortedRows.length,
      }
    })(),
  ])

  const materials = assertSupabase(materialsRes, 'Failed to load materials')
  const total = materialsRes.count ?? 0

  const matIds = (materials as any[]).map((m) => m.material_id)
  const { latestPrices, qualityScores } = await loadMaterialPageDetails(supabase, materials as any[])

  const pageMissingPrice = matIds.filter((id) => !latestPrices[id]).length
  const pageStalePrice = matIds.filter((id) => latestPrices[id]?.is_stale).length
  const pageReady = matIds.filter((id) => {
    const score = qualityScores[id]?.quality_score ?? 0
    return score >= 85 && Boolean(latestPrices[id]) && !latestPrices[id]?.is_stale
  }).length
  const filteredText = search || cat_id || status || hasPrice || stalePrice || supplierId
    ? 'ตามตัวกรองปัจจุบัน'
    : 'ทั้งหมดในระบบ'

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span>คลังวัสดุ</span>
            <span className="text-slate-300">/</span>
            <span className="text-blue-950">วัสดุ</span>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 md:inline-flex">
            Material Master
          </span>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <StatCard label="วัสดุทั้งหมด" value={total} hint={filteredText} tone="blue" />
          <StatCard label="ยังไม่มีราคา" value={pageMissingPrice} hint="นับจากรายการในหน้านี้" tone="orange" />
          <StatCard label="ราคาต้องอัปเดต" value={pageStalePrice} hint="ราคาล่าสุดเกิน 30 วันในหน้านี้" tone="amber" />
          <StatCard label="พร้อมใช้งาน" value={pageReady} hint="ข้อมูลพร้อมและราคายังไม่เก่าในหน้านี้" tone="green" />
        </section>

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-blue-950">วัสดุ</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              ทั้งหมด {total.toLocaleString('th-TH')} รายการ
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/materials/duplicates" className="btn-secondary">
              ตรวจวัสดุซ้ำ
            </Link>
            <Link href="/materials/cleanup" className="btn-secondary">
              ตรวจข้อมูลที่ไม่ครบ
            </Link>
            <Link href="/materials/create" className="btn-primary">
              + เพิ่มวัสดุ
            </Link>
          </div>
        </section>

        {search && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-950">
            ผลการค้นหา "{search}" พบ {total.toLocaleString('th-TH')} รายการ
            <Link href="/materials" className="ml-3 text-blue-700 underline hover:text-blue-950">
              ล้างคำค้น
            </Link>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <MaterialList
            materials={materials as any}
            categories={(categories as any[]).map((category) => ({ cat_id: category.cat_id, cat_name_th: category.cat_name_th }))}
            suppliers={(suppliers as any[]).map((supplier) => ({ supplier_id: supplier.supplier_id, supplier_name_th: supplier.supplier_name_th }))}
            latestPrices={latestPrices}
            qualityScores={qualityScores}
            total={total}
          />
          <Pagination total={total} page={page} limit={limit} />
        </div>
      </div>
    </div>
  )
}
