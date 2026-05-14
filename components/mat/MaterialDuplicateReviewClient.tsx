'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { MatCategory, MaterialType } from '@/types/mat'
import type { DuplicateDecision, DuplicateConfidence, DuplicateStatus, MaterialDuplicateGroup } from '@/lib/server/material-duplicates'

interface MaterialDuplicateReviewClientProps {
  groups: MaterialDuplicateGroup[]
  categories: MatCategory[]
  materialTypes: MaterialType[]
  initialError?: string
}

const confidenceColor: Record<DuplicateConfidence, 'green' | 'yellow' | 'orange'> = {
  HIGH: 'green',
  MEDIUM: 'yellow',
  LOW: 'orange',
}

const statusColor: Record<DuplicateStatus, 'blue' | 'green' | 'red' | 'yellow' | 'orange'> = {
  UNRESOLVED: 'blue',
  CONFIRMED_DUPLICATE: 'green',
  NOT_DUPLICATE: 'red',
  REVIEW_LATER: 'yellow',
  MERGE_READY: 'orange',
}

const decisionLabels: Record<DuplicateDecision, string> = {
  CONFIRMED_DUPLICATE: 'ยืนยันว่าเป็นวัสดุซ้ำ',
  NOT_DUPLICATE: 'ไม่ใช่วัสดุซ้ำ',
  REVIEW_LATER: 'ตรวจสอบภายหลัง',
  MERGE_READY: 'พร้อมรวมรายการ',
}

const specRiskReasonKeys = new Set(['different_spec', 'same_name_different_spec', 'ambiguous_spec'])

function materialCategoryId(group: MaterialDuplicateGroup) {
  return group.candidates.map((candidate) => candidate.material?.category_id ?? candidate.material?.category?.id ?? '').filter(Boolean)
}

function materialTypeId(group: MaterialDuplicateGroup) {
  return group.candidates.map((candidate) => candidate.material?.material_type_id ?? '').filter(Boolean)
}

function money(value: number | null | undefined) {
  if (value == null) return '-'
  return Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function joined(values: Array<string | null | undefined>, fallback = '-') {
  const clean = values.map((value) => String(value ?? '').trim()).filter(Boolean)
  return clean.length > 0 ? clean.join(', ') : fallback
}

function candidateName(group: MaterialDuplicateGroup) {
  return group.candidates
    .map((candidate) => candidate.material?.mat_name_th || candidate.material_id)
    .filter(Boolean)
    .join(' / ')
}

function hasSpecRisk(group: MaterialDuplicateGroup | null) {
  return Boolean(group?.candidates.some((candidate) => (
    candidate.matched_reasons.some((reason) => specRiskReasonKeys.has(reason.key))
  )))
}

function reasonPointsLabel(points: number) {
  if (points > 0) return `+${points}`
  if (points < 0) return String(points)
  return 'ตรวจสอบ'
}

export function MaterialDuplicateReviewClient({
  groups,
  categories,
  materialTypes,
  initialError = '',
}: MaterialDuplicateReviewClientProps) {
  const [groupRows, setGroupRows] = useState(groups)
  const [confidence, setConfidence] = useState<DuplicateConfidence | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [selectedId, setSelectedId] = useState(groups[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState('')
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)

  const filteredTypes = useMemo(
    () => materialTypes.filter((type) => !categoryId || type.category_id === categoryId),
    [materialTypes, categoryId],
  )

  const filteredGroups = useMemo(() => {
    return groupRows.filter((group) => {
      if (confidence && group.confidence_level !== confidence) return false
      if (unresolvedOnly && group.status !== 'UNRESOLVED') return false
      if (categoryId && !materialCategoryId(group).includes(categoryId)) return false
      if (typeId && !materialTypeId(group).includes(typeId)) return false
      return true
    })
  }, [groupRows, confidence, categoryId, typeId, unresolvedOnly])

  const selected = filteredGroups.find((group) => group.id === selectedId)
    ?? filteredGroups[0]
    ?? groupRows.find((group) => group.id === selectedId)
    ?? groupRows[0]
    ?? null
  const selectedHasSpecRisk = hasSpecRisk(selected)

  async function loadGroups() {
    const res = await fetch('/api/material-duplicates?limit=300')
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error ?? 'Could not load duplicate groups')
    }
    setGroupRows(json.data ?? [])
    if ((json.data ?? []).length > 0 && !selectedId) {
      setSelectedId(json.data[0].id)
    }
  }

  async function runScan() {
    setError('')
    setMessage('')
    setScanning(true)
    try {
      const res = await fetch('/api/material-duplicates/scan', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Duplicate scan failed')
        return
      }
      const summary = json.data
      setMessage(`Scan completed: ${summary.candidate_pairs} candidate pairs from ${summary.scanned_materials} materials.`)
      await loadGroups()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanning(false)
    }
  }

  async function saveDecision(decision: DuplicateDecision) {
    if (!selected) return

    setError('')
    setMessage('')
    setSaving(decision)
    try {
      const res = await fetch(`/api/material-duplicates/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not save duplicate decision')
        return
      }
      setGroupRows((current) => current.map((group) => (
        group.id === selected.id
          ? {
            ...group,
            status: json.data.status,
            resolved_at: json.data.resolved_at,
            resolved_by: json.data.resolved_by,
            decisions: [json.decision, ...group.decisions],
          }
          : group
      )))
      setMessage(`Saved decision: ${decisionLabels[decision]}`)
      setNote('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving('')
    }
  }

  return (
    <div className="space-y-5">
      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[150px_1fr_1fr_auto_auto] lg:items-end">
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Confidence</span>
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value as DuplicateConfidence | '')}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Category</span>
            <select
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value)
                setTypeId('')
              }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  [{category.code_prefix ?? category.cat_code}] {category.cat_name_th}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Material type</span>
            <select
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">All material types</option>
              {filteredTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  [{type.code_prefix}] {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={unresolvedOnly}
              onChange={(event) => setUnresolvedOnly(event.target.checked)}
            />
            Unresolved only
          </label>
          <button
            type="button"
            onClick={runScan}
            disabled={scanning}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {scanning ? 'Scanning...' : 'Run duplicate scan'}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Duplicate groups</h2>
              <p className="mt-1 text-sm text-slate-500">{filteredGroups.length.toLocaleString()} groups shown</p>
            </div>
            <Badge label={`${groupRows.length} total`} color="gray" />
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="px-5 py-10 text-sm text-slate-400">
                No duplicate groups match the current filters. Run a scan or clear filters.
              </div>
            ) : filteredGroups.map((group) => (
              <button
                type="button"
                key={group.id}
                onClick={() => setSelectedId(group.id)}
                className={`block w-full border-b border-stone-100 px-5 py-4 text-left transition-colors hover:bg-stone-50 ${
                  selected?.id === group.id ? 'bg-cyan-50/60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-1 text-sm font-bold text-slate-950">{candidateName(group)}</p>
                  <span className="shrink-0 font-mono text-sm font-bold text-slate-800">{group.max_score}/100</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge label={group.confidence_level} color={confidenceColor[group.confidence_level]} />
                  <Badge label={group.status} color={statusColor[group.status]} />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Updated {new Date(group.updated_at).toLocaleString('th-TH')}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          {!selected ? (
            <div className="px-6 py-12 text-sm text-slate-400">
              No duplicate group selected.
            </div>
          ) : (
            <>
              <div className="border-b border-stone-200 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label={selected.confidence_level} color={confidenceColor[selected.confidence_level]} />
                      <Badge label={selected.status} color={statusColor[selected.status]} />
                      <span className="font-mono text-sm font-bold text-slate-800">{selected.max_score}/100</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{selected.recommended_action}</p>
                    {selectedHasSpecRisk && (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        พบความเสี่ยงเรื่องสเปกต่างกัน จึงไม่ควรทำเครื่องหมายว่า “พร้อมรวมรายการ”
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Group {selected.id}</p>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                  <h3 className="text-sm font-bold text-slate-900">Matched reasons</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(() => {
                      const reasons = selected.candidates[0]?.matched_reasons ?? []
                      if (reasons.length === 0) {
                        return <span className="text-sm text-slate-400">No reasons recorded.</span>
                      }

                      return reasons.map((reason) => (
                        <span
                          key={`${reason.key}-${reason.detail ?? ''}`}
                          className={`inline-flex rounded-lg border px-3 py-2 text-xs font-semibold ${
                            reason.points < 0
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : reason.points === 0
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-stone-200 bg-white text-slate-700'
                          }`}
                        >
                          {reasonPointsLabel(reason.points)} {reason.label}{reason.detail ? `: ${reason.detail}` : ''}
                        </span>
                      ))
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {selected.candidates.map((candidate) => (
                    <MaterialCompareCard key={candidate.material_id} candidate={candidate} />
                  ))}
                </div>

                <div className="rounded-xl border border-stone-200 p-4">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Decision note</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                      placeholder="Optional review note"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(decisionLabels) as DuplicateDecision[]).map((decision) => {
                      const disabledBySpecRisk = decision === 'MERGE_READY' && selectedHasSpecRisk
                      return (
                        <button
                          key={decision}
                          type="button"
                          onClick={() => saveDecision(decision)}
                          disabled={Boolean(saving) || disabledBySpecRisk}
                          title={disabledBySpecRisk ? 'สเปกต่างกันหรือข้อมูลสเปกไม่พอ ต้องตรวจสอบก่อน' : undefined}
                          className={`rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-60 ${
                            decision === 'NOT_DUPLICATE'
                              ? 'bg-red-600 hover:bg-red-700'
                              : decision === 'REVIEW_LATER'
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : decision === 'MERGE_READY'
                              ? 'bg-orange-600 hover:bg-orange-700'
                              : 'bg-emerald-700 hover:bg-emerald-800'
                          }`}
                        >
                          {saving === decision ? 'กำลังบันทึก...' : decisionLabels[decision]}
                        </button>
                      )
                    })}
                  </div>
                  {selected.decisions.length > 0 && (
                    <div className="mt-4 border-t border-stone-100 pt-3">
                      <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Decision history</h4>
                      <div className="mt-2 space-y-2">
                        {selected.decisions.slice(0, 5).map((decision) => (
                          <div key={decision.id} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-800">{decisionLabels[decision.decision]}</p>
                            {decision.note && <p className="mt-1 text-slate-500">{decision.note}</p>}
                            <p className="mt-1 text-xs text-slate-400">{new Date(decision.decided_at).toLocaleString('th-TH')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function MaterialCompareCard({ candidate }: { candidate: MaterialDuplicateGroup['candidates'][number] }) {
  const material = candidate.material

  if (!material) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Material {candidate.material_id} was not found.
      </div>
    )
  }

  const suppliers = material.supplier_maps.map((map) => (
    `${map.supplier?.supplier_name_th ?? map.supplier_id ?? 'Supplier'}${map.supplier_sku ? ` (${map.supplier_sku})` : ''}`
  ))
  const aliases = material.aliases.map((alias) => alias.alias_name ?? alias.normalized_alias)
  const latestPrice = material.latest_price

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/materials/${candidate.route_id}`} className="font-mono text-xs font-bold text-cyan-700 hover:underline">
            {material.material_code ?? material.material_id}
          </Link>
          <h3 className="mt-1 line-clamp-2 text-base font-bold text-slate-950">{material.mat_name_th}</h3>
          {material.mat_name_en && <p className="line-clamp-1 text-sm text-slate-500">{material.mat_name_en}</p>}
        </div>
        <Badge label={`${candidate.score}/100`} color="blue" />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <CompareRow label="Category" value={joined([material.category?.cat_name_th, material.category?.cat_code])} />
        <CompareRow label="Material type" value={material.material_type ? `[${material.material_type.code_prefix}] ${material.material_type.name}` : '-'} />
        <CompareRow label="Spec key" value={material.code_spec_key ?? '-'} />
        <CompareRow label="Base UOM" value={joined([material.uom?.uom_name_th, material.base_uom])} />
        <CompareRow label="Brand" value={material.brand ?? '-'} />
        <CompareRow label="Model" value={material.model ?? '-'} />
        <CompareRow label="Spec" value={material.spec ?? '-'} />
        <CompareRow label="Suppliers" value={suppliers.length > 0 ? suppliers.join(', ') : '-'} />
        <CompareRow label="Aliases" value={aliases.length > 0 ? aliases.join(', ') : '-'} />
        <CompareRow
          label="Latest price"
          value={latestPrice ? `${money(latestPrice.unit_price)} ${latestPrice.currency_code}/${latestPrice.price_uom ?? '-'}` : 'ยังไม่มีราคา'}
        />
        <CompareRow label="BOM usage" value={`${material.bom_usage_count} rows`} />
        <CompareRow label="BOQ usage" value={`${material.boq_usage_count} rows`} />
      </dl>
    </div>
  )
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-stone-100 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs font-bold uppercase tracking-[0.06em] text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-700">{value}</dd>
    </div>
  )
}
