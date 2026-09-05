import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MaterialList } from '@/components/mat/MaterialList'
import { Pagination } from '@/components/ui/Pagination'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { buildQualityScoreMap, type LatestMaterialPrice } from '@/lib/server/material-quality-data'
import { getCachedActiveCategories, getCachedActiveSuppliers } from '@/lib/server/master-data-cache'
import { getDictionary } from '@/lib/i18n/getDictionary'
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
  unit,
  tone,
}: {
  label: string
  value: number
  hint: string
  unit: string
  tone: StatTone
}) {
  const toneClass = statToneClass[tone]

  return (
    <div className="app-surface app-lift p-5">
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClass.icon} ${toneClass.iconText}`}>
          <StatIcon tone={tone} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-3xl font-semibold leading-tight tracking-tight text-slate-950">
              {value.toLocaleString('th-TH')}
            </p>
            <span className="pb-1 text-xs font-semibold text-slate-400">{unit}</span>
          </div>
          <p className={`mt-2 text-xs font-medium ${toneClass.hint}`}>{hint}</p>
        </div>
      </div>
    </div>
  )
}

function buildMaterialPageDetails(materials: any[]) {
  const latestPrices: Record<string, LatestMaterialPrice> = {}

  const enrichedMaterials = materials.map((material) => ({
    ...material,
    aliases: Number(material.quality_context?.alias_count ?? 0) > 0 ? [{}] : [],
    supplier_maps: material.quality_context?.supplier_maps ?? [],
    uom_conversions: material.quality_context?.uom_conversions ?? [],
  }))

  for (const material of materials) {
    if (material.material_id && material.latest_price) {
      latestPrices[material.material_id] = {
        ...material.latest_price,
        unit_price: Number(material.latest_price.unit_price ?? 0),
      }
    }
  }

  const qualityScores = buildQualityScoreMap(enrichedMaterials, latestPrices) as Record<string, MatQualityScore>

  return { latestPrices, qualityScores }
}

export default async function MaterialsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { t } = await getDictionary()
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
  const offset = (page - 1) * limit

  const supabase = await createClient()

  const [categories, suppliers, materialsRes] = await Promise.all([
    getCachedActiveCategories(),
    getCachedActiveSuppliers(),
    supabase.rpc('list_materials_page', {
      p_search: search ? normalizeMaterialSearchText(search) : null,
      p_cat_id: cat_id || null,
      p_status: status || null,
      p_has_price: hasPrice || null,
      p_stale_price: stalePrice || null,
      p_supplier_id: supplierId || null,
      p_sort_by: explicitSort ? sortBy : null,
      p_sort_dir: sortAsc ? 'asc' : 'desc',
      p_limit: limit,
      p_offset: offset,
    }),
  ])

  if (materialsRes.error) {
    throw new Error(`Failed to load materials: ${materialsRes.error.message}`)
  }

  const payload = materialsRes.data as { materials?: unknown; total?: number | string } | null
  const materials = Array.isArray(payload?.materials) ? payload.materials : []
  const total = Number(payload?.total ?? 0)

  const matIds = materials.map((m: any) => m.material_id)
  const { latestPrices, qualityScores } = buildMaterialPageDetails(materials)

  const pageMissingPrice = matIds.filter((id) => !latestPrices[id]).length
  const pageStalePrice = matIds.filter((id) => latestPrices[id]?.is_stale).length
  const pageReady = matIds.filter((id) => {
    const score = qualityScores[id]?.quality_score ?? 0
    return score >= 85 && Boolean(latestPrices[id]) && !latestPrices[id]?.is_stale
  }).length
  const filteredText = search || cat_id || status || hasPrice || stalePrice || supplierId
    ? t('materialsPage.filtered')
    : t('materialsPage.allSystem')
  const recordUnit = t('materialsPage.records')
  const formattedTotal = total.toLocaleString('th-TH')

  return (
    <div data-i18n-managed="true" className="flex min-h-full flex-col bg-[var(--app-shell)]">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-5 py-3 backdrop-blur-xl sm:px-8">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <span>{t('materialsPage.breadcrumb')}</span>
            <span className="text-slate-300">/</span>
            <span className="text-blue-950">{t('materialsPage.title')}</span>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 md:inline-flex">
            {t('materialsPage.badge')}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-6 p-5 sm:p-8">
        <section className="app-enter flex flex-wrap items-end justify-between gap-5 pb-2">
          <div>
            <h1 className="app-heading">{t('materialsPage.title')}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {t('materialsPage.totalSummary', { count: formattedTotal })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/materials/duplicates" className="btn-secondary">
              {t('materialsPage.duplicates')}
            </Link>
            <Link href="/materials/cleanup" className="btn-secondary">
              {t('materialsPage.cleanup')}
            </Link>
            <Link href="/materials/create" className="btn-primary">
              {t('materialsPage.addMaterial')}
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <StatCard label={t('materialsPage.totalMaterials')} value={total} hint={filteredText} unit={recordUnit} tone="blue" />
          <StatCard label={t('materialsPage.missingPrice')} value={pageMissingPrice} hint={t('materialsPage.currentPageCount')} unit={recordUnit} tone="orange" />
          <StatCard label={t('materialsPage.stalePrice')} value={pageStalePrice} hint={t('materialsPage.stalePriceHint')} unit={recordUnit} tone="amber" />
          <StatCard label={t('materialsPage.ready')} value={pageReady} hint={t('materialsPage.readyHint')} unit={recordUnit} tone="green" />
        </section>

        {search && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-950">
            {t('materialsPage.searchResults', { search, count: formattedTotal })}
            <Link href="/materials" className="ml-3 text-blue-700 underline hover:text-blue-950">
              {t('materialsPage.clearSearch')}
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
