'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { getMaterialCode, getMaterialRouteId } from '@/lib/material-master'
import type { CleanupGroup, CleanupRow, MaterialCleanupReport } from '@/lib/server/material-cleanup'

const CACHE_KEY = 'boq.materialCleanup.latestReport.v1'

export function MaterialCleanupClient() {
  const [report, setReport] = useState<MaterialCleanupReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = window.sessionStorage.getItem(CACHE_KEY)
    if (!raw) return
    try {
      setReport(JSON.parse(raw) as MaterialCleanupReport)
    } catch {
      window.sessionStorage.removeItem(CACHE_KEY)
    }
  }, [])

  async function recalculate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/materials/cleanup')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not recalculate material cleanup report')
        return
      }
      setReport(json.data)
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(json.data))
    } catch {
      setError('Could not recalculate material cleanup report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 overflow-auto px-6 py-6">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">Cleanup report</h2>
            <p className="mt-1 text-sm text-slate-500">
              This page keeps the last computed result in this browser tab. Recalculate only when you need fresh QA groups.
            </p>
            {report && (
              <p className="mt-2 text-xs text-slate-400">
                Last computed {new Date(report.computedAt).toLocaleString('th-TH')} - {report.materialCount.toLocaleString()} materials
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={recalculate}
            disabled={loading}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Recalculating...' : report ? 'Refresh / Recalculate' : 'Calculate cleanup report'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {!report && !loading && (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No cleanup report loaded.</p>
          <p className="mt-1 text-xs text-slate-400">Click Calculate cleanup report to run the heavy QA grouping query.</p>
        </div>
      )}

      {loading && !report && <ReportSkeleton />}

      {report && (
        <>
          {loading && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-800">
              Recalculating in the background. Current report remains visible.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {(report.groups ?? []).slice(0, 4).map((group) => (
              <a
                key={group.key}
                href={`#${group.key}`}
                className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:bg-stone-50"
              >
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{group.title}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{group.rows.length}</p>
              </a>
            ))}
          </div>

          {(report.groups ?? []).map((group) => (
            <CleanupGroupTable key={group.key} group={group} />
          ))}
        </>
      )}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-stone-100" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-stone-100" />
    </div>
  )
}

function CleanupGroupTable({ group }: { group: CleanupGroup }) {
  return (
    <section id={group.key} className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">{group.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{group.description}</p>
        </div>
        <Badge label={`${group.rows.length} items`} color={group.rows.length > 0 ? 'orange' : 'green'} />
      </div>

      {group.rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400">No materials in this group.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Material</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Base UOM</th>
                <th className="px-3 py-3">Latest price</th>
                <th className="px-3 py-3">QA</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {group.rows.map(({ material, latestPrice, quality, reason }: CleanupRow) => {
                const routeId = getMaterialRouteId(material)
                return (
                  <tr key={`${group.key}-${material.material_id}`} className="hover:bg-cyan-50/40">
                    <td className="px-5 py-3">
                      <Link href={`/materials/${routeId}`} className="font-mono text-xs font-semibold text-slate-700 hover:underline">
                        {getMaterialCode(material)}
                      </Link>
                      <p className="mt-1 max-w-[260px] truncate font-semibold text-slate-950">{material.mat_name_th}</p>
                      {material.spec && <p className="max-w-[260px] truncate text-xs text-slate-400">{material.spec}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{material.category?.cat_name_th ?? material.cat_id ?? '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{material.uom?.uom_name_th ?? material.base_uom ?? '-'}</td>
                    <td className="px-3 py-3">
                      {latestPrice ? (
                        <div>
                          <p className="font-semibold text-slate-900">
                            {Number(latestPrice.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              {latestPrice.currency_code}/{latestPrice.price_uom ?? '-'}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">{latestPrice.quote_date ?? latestPrice.effective_date ?? '-'}</p>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-red-600">No price</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        label={`${quality.quality_score}/100 ${quality.quality_label}`}
                        color={quality.quality_label === 'Ready' ? 'green' : 'orange'}
                      />
                    </td>
                    <td className="max-w-[320px] px-3 py-3 text-sm text-slate-600">{reason}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/materials/${routeId}`} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
                          Detail
                        </Link>
                        <Link href={`/materials/${routeId}/edit`} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
