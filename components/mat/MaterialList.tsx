'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { FilterChips } from '@/components/mat/FilterChips'
import { InlineStatusSelect } from '@/components/mat/InlineStatusSelect'
import { formatThaiDateShort } from '@/lib/utils'
import { calculateMaterialQuality, getMaterialCode, getMaterialPriceWarning, getMaterialRouteId } from '@/lib/material-master'
import type { MatLatestPrice, MatMaster, MatQualityScore, MatStatus } from '@/types/mat'

interface MaterialListProps {
  materials:    MatMaster[]
  categories:   { cat_id: string; cat_name_th: string }[]
  suppliers?:    { supplier_id: string; supplier_name_th: string }[]
  latestPrices?: Record<string, MatLatestPrice>
  qualityScores?: Record<string, MatQualityScore>
}

const STATUS_OPTIONS: { value: MatStatus | ''; label: string }[] = [
  { value: '',              label: 'ทุกสถานะ' },
  { value: 'ACTIVE',       label: 'ใช้งาน' },
  { value: 'INACTIVE',     label: 'ปิดใช้' },
  { value: 'DISCONTINUED', label: 'ยกเลิก' },
]

type SortKey = 'material_code' | 'material_id' | 'mat_name_th' | 'brand' | 'status' | 'updated_at'

const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: 'material_code', label: 'Material Code' },
  { key: 'mat_name_th', label: 'ชื่อวัสดุ' },
  { key: 'brand',       label: 'ยี่ห้อ' },
]

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updated_at',  label: 'Updated latest' },
  { key: 'material_code', label: 'Material code' },
  { key: 'mat_name_th', label: 'Material name' },
  { key: 'brand',       label: 'Brand' },
  { key: 'status',      label: 'Status' },
]

const SORT_KEYS = SORT_OPTIONS.map((option) => option.key)

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return <span className="ml-1 text-[10px] text-neutral-300">↕</span>
  return <span className="ml-1 text-[10px] text-neutral-950">{dir === 'asc' ? '↑' : '↓'}</span>
}

// Icon buttons
function IconBtn({ href, title, icon, danger }: { href?: string; title: string; icon: React.ReactNode; danger?: boolean }) {
  const cls = `relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
    danger
      ? 'text-neutral-400 hover:bg-red-50 hover:text-red-500'
      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950'
  }`
  if (href) return (
    <Link href={href} title={title} className={cls}>{icon}</Link>
  )
  return <span title={title} className={cls}>{icon}</span>
}

export function MaterialList({
  materials,
  categories,
  suppliers = [],
  latestPrices = {},
  qualityScores = {},
}: MaterialListProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [materialRows, setMaterialRows] = useState(materials)
  const [deleting,    setDeleting]    = useState<string | null>(null)
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
    const catId  = searchParams.get('cat_id') ?? ''
    const status = searchParams.get('status') ?? ''
    const hasPrice = searchParams.get('has_price') ?? ''
    const stalePrice = searchParams.get('stale_price') ?? ''
    const supplierId = searchParams.get('supplier_id') ?? ''
    if (search) p.set('search', search)
    if (catId)  p.set('cat_id', catId)
    if (status) p.set('status', status)
    if (hasPrice) p.set('has_price', hasPrice)
    if (stalePrice) p.set('stale_price', stalePrice)
    if (supplierId) p.set('supplier_id', supplierId)
    return `/api/materials/export${p.toString() ? `?${p}` : ''}`
  }

  async function handleDelete(m: MatMaster) {
    if (!confirm(`ลบวัสดุ "${m.mat_name_th}" ?\nไม่สามารถย้อนกลับได้`)) return
    setDeleting(m.material_id)
    setDeleteError((e) => ({ ...e, [m.material_id]: '' }))
    try {
      const res  = await fetch(`/api/materials/${m.material_id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError((e) => ({ ...e, [m.material_id]: json.error ?? 'ลบไม่สำเร็จ' }))
        return
      }
      setMaterialRows((current) => current.filter((row) => row.material_id !== m.material_id))
    } finally {
      setDeleting(null)
    }
  }

  function SortTh({ col, className = '' }: { col: { key: SortKey; label: string }; className?: string }) {
    return (
      <th
        aria-sort={sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 ${className}`}
      >
        <button
          type="button"
          onClick={() => handleSort(col.key)}
          className="inline-flex items-center rounded-lg px-2 py-1 transition-colors hover:bg-stone-200/70 hover:text-slate-950"
        >
          {col.label}<SortIcon dir={colDir(col.key)} />
        </button>
      </th>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="ops-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={searchParams.get('cat_id') ?? ''}
            onChange={(e) => setParam('cat_id', e.target.value)}
            className="ops-select"
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c.cat_id} value={c.cat_id}>{c.cat_name_th}</option>
            ))}
          </select>

          <select
            value={searchParams.get('status') ?? ''}
            onChange={(e) => setParam('status', e.target.value)}
            className="ops-select"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={searchParams.get('has_price') ?? ''}
            onChange={(e) => setParam('has_price', e.target.value)}
            className="ops-select"
          >
            <option value="">ราคาทั้งหมด</option>
            <option value="yes">มีราคา</option>
            <option value="missing">ยังไม่มีราคา</option>
          </select>

          <select
            value={searchParams.get('stale_price') ?? ''}
            onChange={(e) => setParam('stale_price', e.target.value)}
            className="ops-select"
          >
            <option value="">อายุราคาทั้งหมด</option>
            <option value="yes">ราคาเกิน 30 วัน</option>
          </select>

          <select
            value={searchParams.get('supplier_id') ?? ''}
            onChange={(e) => setParam('supplier_id', e.target.value)}
            className="ops-select"
          >
            <option value="">Supplier ทั้งหมด</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplier_id} value={supplier.supplier_id}>
                {supplier.supplier_name_th}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-2 py-1 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-md border-0 bg-transparent py-1 pl-1 pr-7 text-sm font-medium text-slate-700 focus:outline-none focus:ring-0"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleSortDir}
              className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-stone-200"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? 'ASC' : 'DESC'}
            </button>
          </div>
        </div>

        {/* Export */}
        <a
          href={getExportUrl()}
          download
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-stone-50 hover:text-slate-950"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </a>
      </div>

      {isPending && (
        <div className="border-b border-cyan-100 bg-cyan-50 px-5 py-2 text-xs font-semibold text-cyan-800">
          Updating material list...
        </div>
      )}

      {/* Active filter chips */}
      <FilterChips categories={categories} />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {SORT_COLS.map((col) => (
                <SortTh key={col.key} col={col} />
              ))}
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">สเปก</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">หมวด</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">หน่วย</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">ราคาล่าสุด</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Supplier</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Price status</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Quality</th>
              <th
                className="cursor-pointer select-none px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide hover:text-neutral-950"
                onClick={() => handleSort('status')}
              >
                สถานะ<SortIcon dir={colDir('status')} />
              </th>
              <th
                className="cursor-pointer select-none px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide hover:text-neutral-950"
                onClick={() => handleSort('updated_at')}
              >
                อัปเดต<SortIcon dir={colDir('updated_at')} />
              </th>
              <th className="sticky right-0 z-10 w-28 bg-stone-100/95 text-right backdrop-blur">
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody>
            {materialRows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-6 py-16 text-center">
                  <p className="text-sm text-neutral-400">ไม่พบข้อมูลวัสดุ</p>
                </td>
              </tr>
            )}
            {materialRows.map((m) => {
              const price = latestPrices[m.material_id]
              const code = getMaterialCode(m)
              const routeId = getMaterialRouteId(m)
              const warning = getMaterialPriceWarning(price)
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
                hasPreferredSupplier: Boolean(m.supplier_maps?.some((map) => map.is_preferred)),
                hasAlias: Boolean(m.aliases?.length),
              })
              const qualityScore = computedQuality.quality_score ?? computedQuality.score ?? 0
              const qualityLabel = computedQuality.quality_label ?? computedQuality.label ?? 'Incomplete'
              return (
                <tr key={m.material_id} className="group">
                  {/* ID */}
                  <td className="px-3 py-3">
                    <Link
                      href={`/materials/${routeId}`}
                      className="font-mono text-xs text-neutral-600 hover:text-neutral-950 hover:underline"
                    >
                      {code}
                    </Link>
                    {m.id && <p className="mt-0.5 max-w-[120px] truncate text-[10px] text-neutral-300">{m.id}</p>}
                  </td>

                  {/* Name */}
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className="truncate font-semibold leading-snug text-neutral-950">{m.mat_name_th}</p>
                    {m.mat_name_en && (
                      <p className="truncate text-xs leading-snug text-neutral-400">{m.mat_name_en}</p>
                    )}
                  </td>

                  {/* Brand */}
                  <td className="px-3 py-3 text-sm text-neutral-500">{m.brand ?? <span className="text-neutral-300">—</span>}</td>

                  {/* Spec */}
                  <td className="max-w-[120px] px-3 py-3 text-xs text-neutral-500">
                    <p className="truncate">{m.spec ?? <span className="text-neutral-300">—</span>}</p>
                  </td>

                  {/* Category */}
                  <td className="px-3 py-3">
                    {m.category && <Badge label={m.category.cat_code} color="blue" />}
                  </td>

                  {/* UOM */}
                  <td className="px-3 py-3 text-sm text-neutral-500">
                    {m.uom?.uom_name_th ?? m.base_uom}
                  </td>

                  {/* Price */}
                  <td className="px-3 py-3 text-right">
                    {price ? (
                      <span className="text-sm font-semibold text-neutral-950">
                          {Number(price.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          <span className="ml-1 text-xs font-normal text-neutral-400">
                          {price.currency_code}/{price.price_uom ?? '-'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>

                  {/* Supplier */}
                  <td className="px-3 py-3 max-w-[130px]">
                    {price ? (
                      <div>
                        <p className="truncate text-xs text-neutral-600">{price.supplier_name}</p>
                        <p className="text-[10px] text-neutral-400">
                          {formatThaiDateShort(price.effective_date)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-red-300">ยังไม่มีราคา</span>
                    )}
                  </td>

                  {/* Price status */}
                  <td className="px-3 py-3">
                    {warning ? (
                      <Badge label={warning} color={price ? 'orange' : 'red'} />
                    ) : (
                      <Badge label="พร้อมใช้" color="green" />
                    )}
                  </td>

                  {/* Quality */}
                  <td className="px-3 py-3">
                    <div className="min-w-[92px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-700">
                          {qualityScore}/100
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {qualityLabel}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-stone-200">
                        <div
                          className={`h-1.5 rounded-full ${
                            qualityScore >= 85
                              ? 'bg-emerald-500'
                              : qualityScore >= 60
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, qualityScore)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <InlineStatusSelect materialId={m.material_id} currentStatus={m.status} />
                  </td>

                  {/* Updated */}
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-400">
                    {formatThaiDateShort(m.updated_at)}
                  </td>

                  {/* Actions */}
                  <td className="sticky right-0 z-10 bg-[var(--app-surface)]/95 backdrop-blur transition-colors group-hover:bg-cyan-50/95">
                    <div className="flex items-center justify-end gap-1">
                      {/* View */}
                      <IconBtn
                        href={`/materials/${routeId}`}
                        title="ดูรายละเอียด"
                        icon={
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        }
                      />
                      {/* Edit */}
                      <IconBtn
                        href={`/materials/${routeId}/edit`}
                        title="แก้ไข"
                        icon={
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        }
                      />
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(m)}
                        disabled={deleting === m.material_id}
                        title="ลบ"
                        className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
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
                    {deleteError[m.material_id] && (
                      <p className="text-xs text-red-500 mt-0.5">{deleteError[m.material_id]}</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
