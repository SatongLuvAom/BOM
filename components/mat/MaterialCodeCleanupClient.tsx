'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { MatCategory, MaterialType } from '@/types/mat'
import { sanitizeSpecKey } from '@/lib/material-code'

export type MaterialCodeCleanupStatus =
  | 'READY'
  | 'NEED_CATEGORY'
  | 'NEED_TYPE'
  | 'NEED_SPEC'
  | 'DUPLICATE_RISK'
  | 'INVALID_OLD_CODE'
  | 'ALREADY_STANDARD'
  | 'NEED_REVIEW'

export type MaterialCodeCleanupRow = {
  material_id: string
  route_id: string
  current_code: string | null
  material_name: string
  category_id: string | null
  material_type_id: string | null
  spec: string | null
  suggested_spec_key: string
  suggested_new_code: string | null
  status: MaterialCodeCleanupStatus
  warning: string
}

interface MaterialCodeCleanupClientProps {
  rows: MaterialCodeCleanupRow[]
  categories: MatCategory[]
  materialTypes: MaterialType[]
}

const statusColor: Record<MaterialCodeCleanupStatus, string> = {
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NEED_CATEGORY: 'bg-amber-50 text-amber-700 border-amber-200',
  NEED_TYPE: 'bg-amber-50 text-amber-700 border-amber-200',
  NEED_SPEC: 'bg-amber-50 text-amber-700 border-amber-200',
  DUPLICATE_RISK: 'bg-red-50 text-red-700 border-red-200',
  INVALID_OLD_CODE: 'bg-orange-50 text-orange-700 border-orange-200',
  ALREADY_STANDARD: 'bg-slate-50 text-slate-500 border-slate-200',
  NEED_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function MaterialCodeCleanupClient({
  rows,
  categories,
  materialTypes,
}: MaterialCodeCleanupClientProps) {
  const [cleanupRows, setCleanupRows] = useState(rows)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, { category_id: string; material_type_id: string; code_spec_key: string }>>(
    Object.fromEntries(rows.map((row) => [
      row.material_id,
      {
        category_id: row.category_id ?? '',
        material_type_id: row.material_type_id ?? '',
        code_spec_key: row.suggested_spec_key,
      },
    ])),
  )
  const [reason, setReason] = useState('Material Code Standard v1 cleanup')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedRows = cleanupRows.filter((row) => selected[row.material_id])

  function isDraftChanged(row: MaterialCodeCleanupRow) {
    const draft = drafts[row.material_id]
    return draft.category_id !== (row.category_id ?? '')
      || draft.material_type_id !== (row.material_type_id ?? '')
      || draft.code_spec_key !== row.suggested_spec_key
  }

  function updateDraft(materialId: string, patch: Partial<{ category_id: string; material_type_id: string; code_spec_key: string }>) {
    setDrafts((current) => ({
      ...current,
      [materialId]: {
        ...current[materialId],
        ...patch,
      },
    }))
  }

  async function applySelected() {
    setError('')
    setMessage('')
    if (selectedRows.length === 0) {
      setError('Select at least one material.')
      return
    }
    if (!reason.trim()) {
      setError('Change reason is required.')
      return
    }

    const invalid = selectedRows.find((row) => !drafts[row.material_id]?.material_type_id || !drafts[row.material_id]?.code_spec_key)
    if (invalid) {
      setError(`Material ${invalid.material_id} still needs type and spec key.`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/material-code/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_reason: reason,
          items: selectedRows.map((row) => ({
            material_id: row.material_id,
            material_type_id: drafts[row.material_id].material_type_id,
            code_spec_key: drafts[row.material_id].code_spec_key,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Cleanup failed')
        return
      }
      setMessage(`Applied ${selectedRows.length} material code changes.`)
      setCleanupRows((current) => current.filter((row) => !selected[row.material_id]))
      setSelected({})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {(error || message) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-500">Required reason for selected changes</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const next = Object.fromEntries(cleanupRows.filter((row) => row.status === 'READY').map((row) => [row.material_id, true]))
              setSelected(next)
            }}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-stone-50"
          >
            Select ready
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={saving || selectedRows.length === 0}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Applying...' : `Apply selected (${selectedRows.length})`}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-950">Material code cleanup review</h2>
            <p className="mt-1 text-sm text-slate-500">Review before applying. This updates material_code only and keeps material_id unchanged.</p>
          </div>
          <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {cleanupRows.length} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Apply</th>
                <th className="px-3 py-3">Current material</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Material type</th>
                <th className="px-3 py-3">Spec key</th>
                <th className="px-3 py-3">Suggested code</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {cleanupRows.map((row) => {
                const draft = drafts[row.material_id]
                const availableTypes = materialTypes.filter((type) => !draft.category_id || type.category_id === draft.category_id)
                const draftChanged = isDraftChanged(row)
                const preview = draftChanged ? null : row.suggested_new_code
                const canApply = Boolean(draft.material_type_id && draft.code_spec_key && row.status !== 'ALREADY_STANDARD' && row.status !== 'DUPLICATE_RISK')

                return (
                  <tr key={row.material_id} className={row.status === 'ALREADY_STANDARD' ? 'bg-slate-50/50' : ''}>
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[row.material_id])}
                        disabled={!canApply}
                        onChange={(e) => setSelected((current) => ({ ...current, [row.material_id]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/materials/${row.route_id}`} className="font-mono text-xs font-semibold text-cyan-700 hover:underline">
                        {row.current_code || '(missing)'}
                      </Link>
                      <p className="mt-1 max-w-[260px] truncate font-semibold text-slate-950">{row.material_name}</p>
                      {row.spec && <p className="max-w-[260px] truncate text-xs text-slate-400">{row.spec}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={draft.category_id}
                        onChange={(e) => updateDraft(row.material_id, { category_id: e.target.value, material_type_id: '' })}
                        className="min-w-[180px] rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            [{category.code_prefix ?? category.cat_code}] {category.cat_name_th}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={draft.material_type_id}
                        onChange={(e) => updateDraft(row.material_id, { material_type_id: e.target.value })}
                        className="min-w-[160px] rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Select type</option>
                        {availableTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            [{type.code_prefix}] {type.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={draft.code_spec_key}
                        onChange={(e) => updateDraft(row.material_id, { code_spec_key: sanitizeSpecKey(e.target.value) })}
                        className="w-28 rounded-lg border border-stone-300 px-2 py-1.5 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-800">
                      {preview ? (
                        <span className="font-mono font-semibold">{preview}</span>
                      ) : (
                        <span className="text-slate-400">Generated on apply</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusColor[row.status]}`}>
                        {row.status}
                      </span>
                      {row.warning && <p className="mt-1 max-w-[260px] text-xs text-slate-500">{row.warning}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/materials/${row.route_id}/edit`} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-stone-50">
                        Edit
                      </Link>
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
