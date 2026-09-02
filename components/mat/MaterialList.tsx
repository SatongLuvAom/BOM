'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterChips } from '@/components/mat/FilterChips'
import { InlineStatusSelect } from '@/components/mat/InlineStatusSelect'
import { formatThaiDateShort } from '@/lib/utils'
import { calculateMaterialQuality, getMaterialCode, getMaterialPriceWarning, getMaterialRouteId } from '@/lib/material-master'
import { routes } from '@/lib/routes'
import { useI18n } from '@/lib/i18n/client'
import type { MatLatestPrice, MatMaster, MatQualityScore, MatStatus } from '@/types/mat'

interface MaterialListProps {
  materials: MatMaster[]
  categories: { cat_id: string; cat_name_th: string }[]
  suppliers?: { supplier_id: string; supplier_name_th: string }[]
  latestPrices?: Record<string, MatLatestPrice>
  qualityScores?: Record<string, MatQualityScore>
  total?: number
}

const STATUS_OPTIONS: { value: MatStatus | ''; labelKey: string }[] = [
  { value: '', labelKey: 'materialsPage.list.allStatuses' },
  { value: 'ACTIVE', labelKey: 'status.active' },
  { value: 'INACTIVE', labelKey: 'status.inactive' },
  { value: 'DISCONTINUED', labelKey: 'materialsPage.list.discontinued' },
]

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

const SORT_COLS: { key: SortKey; labelKey: string; className?: string }[] = [
  { key: 'material_code', labelKey: 'terms.materialCode' },
  { key: 'mat_name_th', labelKey: 'terms.materialName' },
  { key: 'brand', labelKey: 'terms.brand' },
  { key: 'spec', labelKey: 'terms.spec' },
  { key: 'category', labelKey: 'terms.category' },
  { key: 'base_uom', labelKey: 'terms.uom' },
  { key: 'latest_price', labelKey: 'terms.latestPrice', className: 'text-right' },
  { key: 'supplier', labelKey: 'terms.supplier' },
  { key: 'price_status', labelKey: 'materialsPage.list.priceStatus' },
  { key: 'quality_score', labelKey: 'terms.qualityScore' },
  { key: 'status', labelKey: 'common.status' },
  { key: 'updated_at', labelKey: 'materialsPage.list.updated' },
]

const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: 'updated_at', labelKey: 'materialsPage.list.updated' },
  { key: 'material_code', labelKey: 'terms.materialCode' },
  { key: 'mat_name_th', labelKey: 'terms.materialName' },
  { key: 'brand', labelKey: 'terms.brand' },
  { key: 'spec', labelKey: 'terms.spec' },
  { key: 'category', labelKey: 'terms.category' },
  { key: 'base_uom', labelKey: 'terms.uom' },
  { key: 'latest_price', labelKey: 'terms.latestPrice' },
  { key: 'supplier', labelKey: 'terms.supplier' },
  { key: 'price_status', labelKey: 'materialsPage.list.priceStatus' },
  { key: 'quality_score', labelKey: 'terms.qualityScore' },
  { key: 'status', labelKey: 'common.status' },
]

const SORT_KEYS = SORT_OPTIONS.map((option) => option.key)

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return <span className="ml-1 text-[10px] text-slate-300">↕</span>
  return <span className="ml-1 text-[10px] text-blue-950">{dir === 'asc' ? '↑' : '↓'}</span>
}

function IconBtn({ href, title, icon, danger }: { href?: string; title: string; icon: React.ReactNode; danger?: boolean }) {
  const cls = `relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition-colors ${
    danger
      ? 'text-slate-400 hover:border-red-100 hover:bg-red-50 hover:text-red-600'
      : 'text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-blue-950'
  }`
  if (href) return <Link href={href} prefetch={false} title={title} className={cls}>{icon}</Link>
  return <span title={title} className={cls}>{icon}</span>
}

function translatableQualityLabel(label: string) {
  const normalized = String(label || '').toLowerCase()
  if (normalized.includes('ready')) return 'Ready'
  if (normalized.includes('missing price')) return 'Missing price'
  if (normalized.includes('missing preferred supplier')) return 'Missing preferred supplier'
  if (normalized.includes('missing supplier')) return 'Missing supplier'
  if (normalized.includes('missing uom')) return 'Missing UOM'
  if (normalized.includes('stale')) return 'Price stale'
  if (normalized.includes('expired')) return 'Price expired'
  if (normalized.includes('incomplete')) return 'Incomplete'
  return label || 'Incomplete'
}

function qualityColor(score: number) {
  if (score >= 85) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function priceStatus(price: MatLatestPrice | undefined, warning: string | null | undefined) {
  if (!price) return { label: 'Missing price', color: 'red' as const }
  if (warning) return { label: warning, color: 'orange' as const }
  return { label: 'Ready', color: 'green' as const }
}

export function MaterialList({
  materials,
  categories,
  suppliers = [],
  latestPrices = {},
  qualityScores = {},
  total = materials.length,
}: MaterialListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t, text } = useI18n()
  const [isPending, startTransition] = useTransition()

  const [materialRows, setMaterialRows] = useState(materials)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<Record<string, string>>({})

  useEffect(() => {
    setMaterialRows(materials)
  }, [materials])

  const rawSortBy = searchParams.get('sort_by') as SortKey | null
  const sortBy: SortKey = rawSortBy && SORT_KEYS.includes(rawSortBy) ? rawSortBy : 'updated_at'
  const sortDir = searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc'

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function handleSort(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (sortBy === key) {
      params.set('sort_dir', sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      params.set('sort_by', key)
      params.set('sort_dir', 'asc')
    }
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function setSortKey(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort_by', key)
    params.set('sort_dir', key === 'updated_at' ? 'desc' : 'asc')
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function toggleSortDir() {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort_by', sortBy)
    params.set('sort_dir', sortDir === 'asc' ? 'desc' : 'asc')
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function colDir(key: string): 'asc' | 'desc' | null {
    return sortBy === key ? sortDir : null
  }

  function getExportUrl() {
    const p = new URLSearchParams()
    const search = searchParams.get('search') ?? ''
    const catId = searchParams.get('cat_id') ?? ''
    const status = searchParams.get('status') ?? ''
    const hasPrice = searchParams.get('has_price') ?? ''
    const stalePrice = searchParams.get('stale_price') ?? ''
    const supplierId = searchParams.get('supplier_id') ?? ''
    if (search) p.set('search', search)
    if (catId) p.set('cat_id', catId)
    if (status) p.set('status', status)
    if (hasPrice) p.set('has_price', hasPrice)
    if (stalePrice) p.set('stale_price', stalePrice)
    if (supplierId) p.set('supplier_id', supplierId)
    return `/api/materials/export${p.toString() ? `?${p}` : ''}`
  }

  async function handleDelete(m: MatMaster) {
    if (!confirm(t('materialsPage.list.deleteConfirm', { name: m.mat_name_th }))) return
    setDeleting(m.material_id)
    setDeleteError((e) => ({ ...e, [m.material_id]: '' }))
    try {
      const res = await fetch(`/api/materials/${m.material_id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError((e) => ({ ...e, [m.material_id]: json.error ?? t('materialsPage.list.deleteFailed') }))
        return
      }
      setMaterialRows((current) => current.filter((row) => row.material_id !== m.material_id))
    } finally {
      setDeleting(null)
    }
  }

  function SortTh({ col, className = '' }: { col: { key: SortKey; labelKey: string }; className?: string }) {
    return (
      <th aria-sort={sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
        <button
          type="button"
          onClick={() => handleSort(col.key)}
          className="inline-flex items-center rounded-lg px-2 py-1 transition-colors hover:bg-slate-200/70 hover:text-blue-950"
        >
          {t(col.labelKey)}<SortIcon dir={colDir(col.key)} />
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
          <div className="min-w-[280px] flex-1">
            <SearchInput
              placeholder={t('materialsPage.list.searchPlaceholder')}
              searchOn="enter"
              minSearchLength={2}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center 2xl:justify-end">
            <div className="flex min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
              <span className="shrink-0 text-xs font-bold text-slate-400">{t('materialsPage.list.sort')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="min-w-0 flex-1 rounded-md border-0 bg-transparent py-1 pl-1 pr-7 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-0"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{t(option.labelKey)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={toggleSortDir}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
                title={t('materialsPage.list.toggleSort')}
              >
                {sortDir === 'asc' ? 'ASC' : 'DESC'}
              </button>
            </div>

            <a href={getExportUrl()} download className="btn-secondary whitespace-nowrap">
              {text('ส่งออก CSV')}
            </a>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select value={searchParams.get('cat_id') ?? ''} onChange={(e) => setParam('cat_id', e.target.value)} className="ops-select">
            <option value="">{t('materialsPage.list.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.cat_id} value={c.cat_id}>{c.cat_name_th}</option>
            ))}
          </select>

          <select value={searchParams.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)} className="ops-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>

          <select value={searchParams.get('has_price') ?? ''} onChange={(e) => setParam('has_price', e.target.value)} className="ops-select">
            <option value="">{t('materialsPage.list.allPrices')}</option>
            <option value="yes">{t('materialsPage.list.hasPrice')}</option>
            <option value="missing">{t('materialsPage.missingPrice')}</option>
          </select>

          <select value={searchParams.get('stale_price') ?? ''} onChange={(e) => setParam('stale_price', e.target.value)} className="ops-select">
            <option value="">{t('materialsPage.list.allPriceAges')}</option>
            <option value="yes">{t('materialsPage.list.priceOlderThan30Days')}</option>
          </select>

          <select value={searchParams.get('supplier_id') ?? ''} onChange={(e) => setParam('supplier_id', e.target.value)} className="ops-select">
            <option value="">{t('materialsPage.list.allSuppliers')}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplier_id} value={supplier.supplier_id}>
                {supplier.supplier_name_th}
              </option>
            ))}
          </select>

        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <FilterChips categories={categories} suppliers={suppliers} />
        </div>
      </section>

      {isPending && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-2 text-xs font-semibold text-blue-800">
          {t('materialsPage.list.updating')}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-blue-950">{t('materialsPage.list.title')}</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {t('materialsPage.list.summary', {
                shown: materialRows.length.toLocaleString('th-TH'),
                total: total.toLocaleString('th-TH'),
              })}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
            Material Code Standard v1
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[1180px]">
            <thead>
              <tr>
                {SORT_COLS.map((col) => (
                  <SortTh key={col.key} col={col} className={col.className ?? ''} />
                ))}
                <th className="sticky right-0 z-10 bg-slate-50/95 text-right backdrop-blur">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-16 text-center">
                    <p className="text-sm text-slate-400">{t('materialsPage.list.noMaterials')}</p>
                  </td>
                </tr>
              )}
              {materialRows.map((m) => {
                const price = latestPrices[m.material_id]
                const code = getMaterialCode(m)
                const routeId = getMaterialRouteId(m)
                const detailHref = routes.materials.detail(routeId)
                const editHref = routes.materials.edit(routeId)
                const warning = getMaterialPriceWarning(price)
                const currentPriceStatus = priceStatus(price, warning)
                const computedQuality: {
                  quality_score?: number
                  quality_label?: string
                  score?: number
                  label?: string
                } = qualityScores[m.material_id] ?? calculateMaterialQuality({
                  ...m,
                  hasLatestPrice: Boolean(price),
                  isPriceStale: Boolean(price?.is_stale),
                  isPriceExpired: false,
                  hasSupplier: Boolean(m.supplier_maps?.length || price?.supplier_name),
                  hasPreferredSupplier: Boolean(m.supplier_maps?.some((map) => map.is_preferred) || m.supplier_maps?.length === 1 || price?.supplier_name),
                  hasAlias: Boolean(m.aliases?.length),
                })
                const qualityScore = computedQuality.quality_score ?? computedQuality.score ?? 0
                const qualityLabel = translatableQualityLabel(computedQuality.quality_label ?? computedQuality.label ?? 'Incomplete')

                return (
                  <tr key={m.material_id} className="group">
                    <td>
                      <Link href={detailHref ?? routes.materials.list()} prefetch={false} className="font-mono text-xs font-semibold text-blue-900 hover:underline">
                        {code}
                      </Link>
                      {m.id && <p className="mt-0.5 max-w-[120px] truncate text-[10px] text-slate-300">{m.id}</p>}
                    </td>
                    <td className="max-w-[220px]">
                      <p className="truncate font-bold leading-snug text-slate-950">{m.mat_name_th}</p>
                      {m.mat_name_en && <p className="truncate text-xs leading-snug text-slate-400">{m.mat_name_en}</p>}
                    </td>
                    <td className="text-sm text-slate-600">{m.brand || <span className="text-slate-300">-</span>}</td>
                    <td className="max-w-[140px] text-xs text-slate-600">
                      <p className="truncate">{m.spec || <span className="text-slate-300">-</span>}</p>
                    </td>
                    <td>{m.category && <Badge label={m.category.cat_code} color="blue" />}</td>
                    <td className="text-sm font-medium text-slate-600">{m.uom?.uom_name_th ?? m.base_uom}</td>
                    <td className="text-right">
                      {price ? (
                        <span className="text-sm font-bold text-slate-950">
                          {Number(price.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          <span className="ml-1 block text-[11px] font-semibold text-slate-400">
                            {price.currency_code}/{price.price_uom ?? '-'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-300">-</span>
                      )}
                    </td>
                    <td className="max-w-[150px]">
                      {price ? (
                        <div>
                          <p className="truncate text-xs font-semibold text-slate-600">{price.supplier_name}</p>
                          <p className="text-[10px] text-slate-400">{formatThaiDateShort(price.effective_date)}</p>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-red-400">{text('ยังไม่มีราคา')}</span>
                      )}
                    </td>
                    <td>
                      <Badge label={currentPriceStatus.label} color={currentPriceStatus.color} />
                    </td>
                    <td>
                      <div className="min-w-[104px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">{qualityScore}/100</span>
                          <span className="max-w-[72px] truncate text-[10px] font-medium text-slate-400">{text(qualityLabel)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200">
                          <div className={`h-1.5 rounded-full ${qualityColor(qualityScore)}`} style={{ width: `${Math.min(100, qualityScore)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <InlineStatusSelect materialId={m.material_id} currentStatus={m.status} />
                    </td>
                    <td className="whitespace-nowrap text-xs font-medium text-slate-400">
                      {formatThaiDateShort(m.updated_at)}
                    </td>
                    <td className="sticky right-0 z-10 bg-white/95 backdrop-blur transition-colors group-hover:bg-blue-50/95">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          href={detailHref ?? undefined}
                          title={t('common.view')}
                          icon={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          }
                        />
                        <IconBtn
                          href={editHref ?? undefined}
                          title={t('common.edit')}
                          icon={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          }
                        />
                        <button
                          onClick={() => handleDelete(m)}
                          disabled={deleting === m.material_id}
                          title={t('common.delete')}
                          className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          {deleting === m.material_id ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {deleteError[m.material_id] && <p className="mt-0.5 text-xs text-red-500">{deleteError[m.material_id]}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
