'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { MatUom } from '@/types/mat'
import { createUomSchema } from '@/lib/validations/category'

interface UomListProps {
  uoms: MatUom[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

export function UomList({ uoms, open, onOpenChange, onAdded }: UomListProps) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ uom_code: '', uom_name_th: '', uom_name_en: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function handleAdd() {
    setError(null)
    setFieldErrors({})
    const payload = { ...form, uom_code: form.uom_code.toUpperCase() }
    const parsed = createUomSchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.errors.forEach((e) => { errors[e.path[0] as string] = e.message })
      setFieldErrors(errors)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/uom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      onOpenChange(false)
      setForm({ uom_code: '', uom_name_th: '', uom_name_en: '' })
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(uomCode: string) {
    if (!confirm(`ลบหน่วย "${uomCode}" ?`)) return
    setDeleting(uomCode)
    setDeleteErrors((e) => ({ ...e, [uomCode]: '' }))
    try {
      const res = await fetch(`/api/uom/${uomCode}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDeleteErrors((e) => ({ ...e, [uomCode]: json.error }))
        return
      }
      onAdded()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <div className="app-surface overflow-x-auto"><table className="data-table">
        <thead>
          <tr className="border-y border-gray-100 bg-gray-50 text-left">
            <th className="px-6 py-3 font-medium text-gray-500">รหัส (Code)</th>
            <th className="px-4 py-3 font-medium text-gray-500">ชื่อไทย</th>
            <th className="px-4 py-3 font-medium text-gray-500">ชื่ออังกฤษ</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {uoms.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                No UOM records found
              </td>
            </tr>
          )}
          {uoms.map((u) => (
            <tr key={u.uom_code} className="hover:bg-gray-50">
              <td className="px-6 py-3 font-mono font-semibold text-gray-900">{u.uom_code}</td>
              <td className="px-4 py-3 text-gray-700">{u.uom_name_th}</td>
              <td className="px-4 py-3 text-gray-400">{u.uom_name_en ?? '—'}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => handleDelete(u.uom_code)}
                  disabled={deleting === u.uom_code}
                  className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-40"
                >
                  ลบ
                </button>
                {deleteErrors[u.uom_code] && (
                  <p className="mt-1 text-xs text-red-500">{deleteErrors[u.uom_code]}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <Modal open={open} onClose={() => onOpenChange(false)} title="เพิ่มหน่วยนับ">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">รหัสหน่วย *</label>
            <input
              type="text"
              value={form.uom_code}
              onChange={(e) => { setForm((f) => ({ ...f, uom_code: e.target.value.toUpperCase() })); setFieldErrors((fe) => ({ ...fe, uom_code: '' })) }}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${fieldErrors.uom_code ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
              placeholder="เช่น PCS, M, M2"
            />
            {fieldErrors.uom_code && <p className="mt-1 text-xs text-red-600">{fieldErrors.uom_code}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อไทย *</label>
            <input
              type="text"
              value={form.uom_name_th}
              onChange={(e) => { setForm((f) => ({ ...f, uom_name_th: e.target.value })); setFieldErrors((fe) => ({ ...fe, uom_name_th: '' })) }}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${fieldErrors.uom_name_th ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
              placeholder="เช่น ชิ้น, เมตร"
            />
            {fieldErrors.uom_name_th && <p className="mt-1 text-xs text-red-600">{fieldErrors.uom_name_th}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ชื่ออังกฤษ</label>
            <input
              type="text"
              value={form.uom_name_en}
              onChange={(e) => setForm((f) => ({ ...f, uom_name_en: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="e.g. Piece, Meter"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary">
              {saving ? 'กำลังบันทึก...' : 'เพิ่ม'}
            </button>
            <button onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">ยกเลิก</button>
          </div>
        </div>
      </Modal>

    </>
  )
}
