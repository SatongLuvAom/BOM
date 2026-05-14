'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatMaster, MaterialType } from '@/types/mat'
import { inferSpecKeyFromText, sanitizeSpecKey } from '@/lib/material-code'

interface MaterialCodeChangePanelProps {
  material: MatMaster
  materialTypes: MaterialType[]
}

export function MaterialCodeChangePanel({ material, materialTypes }: MaterialCodeChangePanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [materialTypeId, setMaterialTypeId] = useState(material.material_type_id ?? '')
  const [specKey, setSpecKey] = useState(material.code_spec_key ?? inferSpecKeyFromText(material.spec))
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const availableTypes = useMemo(
    () => materialTypes,
    [materialTypes],
  )

  async function loadPreview(nextTypeId = materialTypeId, nextSpecKey = specKey) {
    if (!nextTypeId) {
      setPreview('')
      return
    }

    setPreviewLoading(true)
    setPreviewError('')
    try {
      const res = await fetch('/api/material-code/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_type_id: nextTypeId,
          spec_key: nextSpecKey,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPreview('')
        setPreviewError(json.error ?? 'Preview unavailable')
        return
      }
      setPreview(json.data.preview)
    } catch {
      setPreview('')
      setPreviewError('Preview unavailable')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function submit() {
    setError('')
    if (!materialTypeId) {
      setError('Select material type.')
      return
    }
    if (!reason.trim()) {
      setError('Change reason is required.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/material-code/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: material.material_id,
          material_type_id: materialTypeId,
          code_spec_key: specKey,
          change_reason: reason,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not change material code')
        return
      }
      setOpen(false)
      // Intentional full refresh: code changes affect the page header, route target,
      // code history, old-code alias search, and audit summary returned by server components.
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Code governance</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{material.material_code ?? material.material_id}</p>
          <p className="mt-1 text-xs text-slate-500">
            {material.code_locked ? 'Locked' : 'Unlocked'} · {material.code_rule_version ?? 'legacy'} · {material.code_spec_key ?? 'GEN'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value)
            if (!open) void loadPreview()
          }}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-50"
        >
          Change code
        </button>
      </div>

      {material.code_generated_at && (
        <p className="mt-2 text-xs text-slate-400">
          Generated {new Date(material.code_generated_at).toLocaleString('th-TH')}
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Material type</span>
            <select
              value={materialTypeId}
              onChange={(e) => {
                setMaterialTypeId(e.target.value)
                void loadPreview(e.target.value, specKey)
              }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">Select type</option>
              {availableTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  [{type.code_prefix}] {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Spec key</span>
            <input
              value={specKey}
              onChange={(e) => {
                const next = sanitizeSpecKey(e.target.value)
                setSpecKey(next)
                void loadPreview(materialTypeId, next)
              }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next code preview</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">
              {previewLoading ? 'Loading...' : preview || '-'}
            </p>
            {previewError && <p className="mt-1 text-xs font-medium text-amber-700">{previewError}</p>}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Required reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="Why this code needs to change"
            />
          </label>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Apply change'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
