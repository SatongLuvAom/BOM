'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { createMatSupplierMapSchema } from '@/lib/validations/supplier'
import type { MatMaster, MatSupplierMap } from '@/types/mat'

interface SupplierMaterialMapManagerProps {
  supplierId: string
  maps: MatSupplierMap[]
  materials: Pick<MatMaster, 'material_id' | 'mat_name_th' | 'spec'>[]
}

export function SupplierMaterialMapManager({
  supplierId,
  maps,
  materials,
}: SupplierMaterialMapManagerProps) {
  const [mapRows, setMapRows] = useState(maps)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    material_id: '',
    supplier_id: supplierId,
    supplier_material_name: '',
    supplier_sku: '',
    is_preferred: false,
    lead_time_days: 0,
    min_order_qty: 0,
    is_active: true,
    note: '',
  })

  useEffect(() => {
    setMapRows(maps)
  }, [maps])

  async function handleAdd() {
    setError(null)
    setFieldErrors({})

    const parsed = createMatSupplierMapSchema.safeParse(form)
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      parsed.error.errors.forEach((issue) => {
        nextErrors[issue.path[0] as string] = issue.message
      })
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/material-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Unexpected error')
        return
      }

      setOpen(false)
      setMapRows((current) => [json.data, ...current])
      setForm({
        material_id: '',
        supplier_id: supplierId,
        supplier_material_name: '',
        supplier_sku: '',
        is_preferred: false,
        lead_time_days: 0,
        min_order_qty: 0,
        is_active: true,
        note: '',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(materialId: string) {
    if (!confirm('Remove this material-supplier link?')) return

    setDeleting(materialId)
    try {
      const res = await fetch(`/api/material-suppliers/${materialId}/${supplierId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Unexpected error')
        return
      }
      setMapRows((current) => current.filter((map) => map.material_id !== materialId))
    } finally {
      setDeleting(null)
    }
  }

  const linkedMaterialIds = useMemo(() => new Set(mapRows.map((map) => map.material_id)), [mapRows])
  const availableMaterials = useMemo(
    () => materials.filter((material) => !linkedMaterialIds.has(material.material_id)),
    [materials, linkedMaterialIds],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Linked Materials</h3>
          <p className="text-sm text-gray-500">{mapRows.length} active links</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Link material
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-100 bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Material</th>
              <th className="px-4 py-3 font-medium text-gray-500">Supplier SKU</th>
              <th className="px-4 py-3 font-medium text-gray-500">Lead Time</th>
              <th className="px-4 py-3 font-medium text-gray-500">MOQ</th>
              <th className="px-4 py-3 font-medium text-gray-500">Flags</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mapRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No linked materials yet
                </td>
              </tr>
            )}
            {mapRows.map((map) => (
              <tr key={`${map.material_id}-${map.supplier_id}`} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/materials/${map.material_id}`} className="font-medium text-blue-600 hover:underline">
                    {map.material?.mat_name_th ?? map.material_id}
                  </Link>
                  <p className="text-xs text-gray-400">{map.material_id}</p>
                </td>
                <td className="px-4 py-3 text-gray-500">{map.supplier_sku ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{map.lead_time_days} days</td>
                <td className="px-4 py-3 text-gray-500">{map.min_order_qty}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {map.is_preferred && <Badge label="Preferred" color="green" />}
                    <Badge label={map.is_active ? 'Active' : 'Inactive'} color={map.is_active ? 'blue' : 'gray'} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/prices/new?material_id=${encodeURIComponent(map.material_id)}&supplier_id=${encodeURIComponent(supplierId)}`}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Add price
                    </Link>
                    <button
                      onClick={() => handleDelete(map.material_id)}
                      disabled={deleting === map.material_id}
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Link Material to Supplier">
        <div className="space-y-4">
          {availableMaterials.length === 0 ? (
            <p className="text-sm text-gray-500">All materials are already linked to this supplier.</p>
          ) : (
            <>
              <Field label="Material *" error={fieldErrors.material_id}>
                <select
                  value={form.material_id}
                  onChange={(e) => {
                    setForm((current) => ({ ...current, material_id: e.target.value }))
                    setFieldErrors((current) => ({ ...current, material_id: '' }))
                  }}
                  className={inputCls(!!fieldErrors.material_id)}
                >
                  <option value="">Select material</option>
                  {availableMaterials.map((material) => (
                    <option key={material.material_id} value={material.material_id}>
                      {material.material_id} - {material.mat_name_th}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Supplier Material Name" error={fieldErrors.supplier_material_name}>
                  <input
                    type="text"
                    value={form.supplier_material_name}
                    onChange={(e) => setForm((current) => ({ ...current, supplier_material_name: e.target.value }))}
                    className={inputCls(false)}
                  />
                </Field>

                <Field label="Supplier SKU" error={fieldErrors.supplier_sku}>
                  <input
                    type="text"
                    value={form.supplier_sku}
                    onChange={(e) => setForm((current) => ({ ...current, supplier_sku: e.target.value }))}
                    className={inputCls(false)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Lead Time (days)" error={fieldErrors.lead_time_days}>
                  <input
                    type="number"
                    min={0}
                    value={form.lead_time_days}
                    onChange={(e) => setForm((current) => ({ ...current, lead_time_days: Number(e.target.value) || 0 }))}
                    className={inputCls(false)}
                  />
                </Field>

                <Field label="MOQ" error={fieldErrors.min_order_qty}>
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={form.min_order_qty}
                    onChange={(e) => setForm((current) => ({ ...current, min_order_qty: Number(e.target.value) || 0 }))}
                    className={inputCls(false)}
                  />
                </Field>
              </div>

              <Field label="Note" error={fieldErrors.note}>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
                  rows={3}
                  className={inputCls(false)}
                />
              </Field>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_preferred}
                    onChange={(e) => setForm((current) => ({ ...current, is_preferred: e.target.checked }))}
                  />
                  Preferred supplier
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))}
                  />
                  Active link
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? 'Saving...' : 'Link material'}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
  }`
}
