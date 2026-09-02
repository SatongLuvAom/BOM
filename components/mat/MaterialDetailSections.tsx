'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/Badge'
import { getMaterialRouteId } from '@/lib/material-master'
import type { MatAlias, MatMaster, MatQualityScore, MatSupplierMap, MatUom, MatUomConv, MaterialCodeHistory, MaterialType } from '@/types/mat'

const AliasManager = dynamic(() => import('@/components/mat/AliasManager').then((mod) => mod.AliasManager), {
  loading: () => <SectionSkeleton />,
})
const MaterialCodeChangePanel = dynamic(() => import('@/components/mat/MaterialCodeChangePanel').then((mod) => mod.MaterialCodeChangePanel), {
  loading: () => <SectionSkeleton />,
})
const MaterialPriceManager = dynamic(() => import('@/components/mat/MaterialPriceManager').then((mod) => mod.MaterialPriceManager), {
  loading: () => <SectionSkeleton />,
})
const UomConvManager = dynamic(() => import('@/components/mat/UomConvManager').then((mod) => mod.UomConvManager), {
  loading: () => <SectionSkeleton />,
})

type SectionKey =
  | 'qa'
  | 'price-history'
  | 'suppliers'
  | 'aliases'
  | 'uom-conversions'
  | 'usage'
  | 'audit'
  | 'code-history'

type SectionState = {
  loading: boolean
  error: string
  data: SectionData | null
}

type SupplierSummary = {
  supplier_id: string
  supplier_name_th: string
  supplier_code: string
}

type UsageRow = {
  bom_id?: string
  item_name: string | null
  uom: string | null
  qty_per_unit?: number | null
  bom_template?: { bom_name: string | null } | null
}

type AuditRow = {
  action: string
  created_at: string
  created_by: string | null
}

type SectionData =
  | { suppliers: SupplierSummary[]; uoms: MatUom[] }
  | { supplier_maps: MatSupplierMap[] }
  | { aliases: MatAlias[] }
  | { uom_conversions: MatUomConv[]; uoms: MatUom[] }
  | { bomUsage: { count: number; rows: UsageRow[] } }
  | { auditRows: AuditRow[] }
  | { quality: MatQualityScore }
  | { codeHistory: MaterialCodeHistory[]; materialTypes: MaterialType[] }

const SECTIONS: { key: SectionKey; label: string; description: string }[] = [
  { key: 'qa', label: 'QA breakdown', description: 'Score details and warning reasons.' },
  { key: 'price-history', label: 'Price history', description: 'Supplier price records and add/edit actions.' },
  { key: 'suppliers', label: 'Suppliers', description: 'Material supplier mappings.' },
  { key: 'aliases', label: 'Aliases', description: 'Searchable old names and alternative names.' },
  { key: 'uom-conversions', label: 'UOM conversions', description: 'Material-specific unit conversion rules.' },
  { key: 'usage', label: 'BOM usage', description: 'Where this material is referenced in BOMs.' },
  { key: 'audit', label: 'Audit', description: 'Recent material master audit rows.' },
  { key: 'code-history', label: 'Code history', description: 'Code governance and change history.' },
]

function isSectionKey(value: string): value is SectionKey {
  return SECTIONS.some((section) => section.key === value)
}

export function MaterialDetailSections({ material }: { material: MatMaster }) {
  const routeId = useMemo(() => getMaterialRouteId(material), [material])
  const [active, setActive] = useState<SectionKey | null>(null)
  const [sections, setSections] = useState<Partial<Record<SectionKey, SectionState>>>({})

  useEffect(() => {
    function openHashSection() {
      const key = window.location.hash.replace('#', '')
      if (isSectionKey(key)) void loadSection(key)
    }

    openHashSection()
    window.addEventListener('hashchange', openHashSection)
    return () => window.removeEventListener('hashchange', openHashSection)
    // loadSection can safely refetch the same section if the hash is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSection(key: SectionKey) {
    const current = sections[key]
    if (current?.data || current?.loading) {
      setActive(key)
      return
    }

    setActive(key)
    setSections((value) => ({
      ...value,
      [key]: { loading: true, error: '', data: null },
    }))

    try {
      const res = await fetch(`/api/materials/${encodeURIComponent(routeId)}/sections?section=${key}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSections((value) => ({
          ...value,
          [key]: { loading: false, error: json.error ?? 'Could not load section', data: null },
        }))
        return
      }
      setSections((value) => ({
        ...value,
        [key]: { loading: false, error: '', data: json.data ?? {} },
      }))
    } catch {
      setSections((value) => ({
        ...value,
        [key]: { loading: false, error: 'Could not load section', data: null },
      }))
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4">
        <h3 className="text-sm font-bold text-slate-950">Detail sections</h3>
        <p className="mt-1 text-xs text-slate-500">
          Heavy material data loads only when a section is opened, then stays cached while you stay on this page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-b border-stone-200 p-3 md:border-b-0 md:border-r">
          <div className="space-y-1">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                id={section.key}
                type="button"
                onClick={() => void loadSection(section.key)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  active === section.key
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-700 hover:bg-stone-100'
                }`}
              >
                <span className="block text-sm font-semibold">{section.label}</span>
                <span className={`block text-xs ${active === section.key ? 'text-slate-300' : 'text-slate-400'}`}>
                  {section.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[260px] p-5">
          {!active && (
            <div className="rounded-lg border border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">Open a section to load detailed data.</p>
              <p className="mt-1 text-xs text-slate-400">The initial material page now keeps this data out of the first payload.</p>
            </div>
          )}

          {SECTIONS.map((section) => {
            const state = sections[section.key]
            if (!state) return null

            return (
              <div key={section.key} hidden={active !== section.key}>
                {state.loading && <SectionSkeleton />}
                {state.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {state.error}
                  </div>
                )}
                {state.data && renderSection(section.key, state.data, material)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-40 animate-pulse rounded bg-stone-200" />
      <div className="h-20 animate-pulse rounded-lg bg-stone-100" />
      <div className="h-20 animate-pulse rounded-lg bg-stone-100" />
    </div>
  )
}

function renderSection(key: SectionKey, data: SectionData, material: MatMaster) {
  if (key === 'price-history') {
    const sectionData = data as { suppliers: SupplierSummary[]; uoms: MatUom[] }
    return (
      <MaterialPriceManager
        materialId={material.material_id}
        baseUom={material.base_uom}
        suppliers={sectionData.suppliers ?? []}
        uoms={sectionData.uoms ?? []}
      />
    )
  }

  if (key === 'suppliers') {
    const sectionData = data as { supplier_maps: MatSupplierMap[] }
    return <SupplierMapsTable rows={sectionData.supplier_maps ?? []} />
  }

  if (key === 'aliases') {
    const sectionData = data as { aliases: MatAlias[] }
    return <AliasManager materialId={material.material_id} aliases={sectionData.aliases ?? []} />
  }

  if (key === 'uom-conversions') {
    const sectionData = data as { uom_conversions: MatUomConv[]; uoms: MatUom[] }
    return (
      <UomConvManager
        materialId={material.material_id}
        convs={sectionData.uom_conversions ?? []}
        uoms={sectionData.uoms ?? []}
      />
    )
  }

  if (key === 'usage') {
    const sectionData = data as { bomUsage: { count: number; rows: UsageRow[] } }
    return <UsagePanel title="Usage in BOM" count={sectionData.bomUsage?.count ?? 0} rows={sectionData.bomUsage?.rows ?? []} />
  }

  if (key === 'audit') {
    const sectionData = data as { auditRows: AuditRow[] }
    return <AuditRows rows={sectionData.auditRows ?? []} />
  }

  if (key === 'qa') {
    const sectionData = data as { quality: MatQualityScore }
    return <QaBreakdown quality={sectionData.quality} />
  }

  if (key === 'code-history') {
    const sectionData = data as { codeHistory: MaterialCodeHistory[]; materialTypes: MaterialType[] }
    return (
      <div className="space-y-4">
        <MaterialCodeChangePanel material={material} materialTypes={sectionData.materialTypes ?? []} />
        <CodeHistory rows={sectionData.codeHistory ?? []} />
      </div>
    )
  }

  return null
}

function SupplierMapsTable({ rows }: { rows: MatSupplierMap[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No supplier mappings.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Lead</th>
            <th className="px-3 py-2">MOQ</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((map) => (
            <tr key={`${map.material_id}-${map.supplier_id}`}>
              <td className="px-3 py-2">
                <p className="font-medium text-slate-900">{map.supplier?.supplier_name_th ?? map.supplier_id}</p>
                {map.is_preferred && <Badge label="Preferred" color="green" />}
              </td>
              <td className="px-3 py-2 text-slate-500">{map.supplier_sku || '-'}</td>
              <td className="px-3 py-2 text-slate-500">{map.lead_time_days ?? 0} days</td>
              <td className="px-3 py-2 text-slate-500">{map.min_order_qty ?? 0}</td>
              <td className="px-3 py-2">
                <Badge label={map.is_active ? 'Active' : 'Inactive'} color={map.is_active ? 'blue' : 'gray'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QaBreakdown({ quality }: { quality: MatQualityScore | null | undefined }) {
  if (!quality) {
    return <p className="text-sm text-slate-400">No QA data.</p>
  }

  const warnings = quality.warnings ?? []
  const breakdown = quality.breakdown ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-950">Material QA breakdown</p>
          <p className="mt-1 text-xs text-slate-400">Computed only. This does not change BOM or BOQ snapshots.</p>
        </div>
        <Badge
          label={`${quality.quality_score ?? 0}/100 ${quality.quality_label ?? 'Incomplete'}`}
          color={(quality.quality_label ?? '') === 'Ready' ? 'green' : 'orange'}
        />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div key={`${warning.kind}-${warning.message}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {breakdown.map((item) => (
          <div
            key={item.key}
            className={`rounded-lg border px-3 py-2 ${item.ok ? 'border-emerald-100 bg-emerald-50/60' : 'border-stone-200 bg-stone-50'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <span className={`text-xs font-bold ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                {item.earned}/{item.points}
              </span>
            </div>
            {!item.ok && item.reason && <p className="mt-1 text-xs text-slate-500">{item.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function UsagePanel({ title, count, rows }: { title: string; count: number; rows: UsageRow[] }) {
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className="text-xs text-slate-400">{count} records</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No usage found.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`bom-${index}`} className="rounded-lg bg-stone-50 px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-800">
                {row.bom_template?.bom_name ?? row.bom_id}
              </p>
              <p className="text-xs text-slate-500">
                {row.item_name} - {row.qty_per_unit} {row.uom}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditRows({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No audit log rows.</p>
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`${row.action}-${row.created_at}-${index}`} className="rounded-lg bg-stone-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-800">{row.action}</p>
          <p className="text-[11px] text-slate-400">{new Date(row.created_at).toLocaleString('th-TH')}</p>
        </div>
      ))}
    </div>
  )
}

function CodeHistory({ rows }: { rows: MaterialCodeHistory[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No material code changes recorded.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Old code</th>
            <th className="px-3 py-2">New code</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Changed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.old_code ?? '-'}</td>
              <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900">{row.new_code}</td>
              <td className="px-3 py-2 text-slate-600">{row.change_reason}</td>
              <td className="px-3 py-2 text-xs text-slate-400">{new Date(row.changed_at).toLocaleString('th-TH')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
