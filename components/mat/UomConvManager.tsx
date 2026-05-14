'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { MatUom, MatUomConv } from '@/types/mat'

interface UomConvManagerProps {
  materialId: string
  convs: MatUomConv[]
  uoms: MatUom[]
}

export function UomConvManager({ materialId, convs, uoms }: UomConvManagerProps) {
  const [convRows, setConvRows] = useState(convs)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<MatUomConv | null>(null)
  const [form, setForm] = useState({ from_uom: '', to_uom: '', factor: '', formula_note: '' })

  useEffect(() => {
    setConvRows(convs)
  }, [convs])

  function openAdd() {
    setEditing(null)
    setForm({ from_uom: '', to_uom: '', factor: '', formula_note: '' })
    setError(null)
    setMessage('')
    setOpen(true)
  }

  function openEdit(conv: MatUomConv) {
    setEditing(conv)
    setForm({
      from_uom: conv.from_uom,
      to_uom: conv.to_uom,
      factor: String(conv.factor),
      formula_note: conv.formula_note ?? '',
    })
    setError(null)
    setMessage('')
    setOpen(true)
  }

  async function handleAdd() {
    setError(null)
    const factor = parseFloat(form.factor)
    if (!form.from_uom || !form.to_uom || isNaN(factor) || factor <= 0) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน')
      return
    }
    if (form.from_uom === form.to_uom) {
      setError('หน่วยต้นทางและปลายทางต้องไม่เหมือนกัน')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        editing
          ? `/api/uom-conv?material_id=${materialId}&from_uom=${editing.from_uom}&to_uom=${editing.to_uom}`
          : '/api/uom-conv',
        {
          method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: materialId,
          from_uom: form.from_uom,
          to_uom: form.to_uom,
          factor,
          formula_note: form.formula_note.trim() || null,
        }),
        },
      )
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      const saved = json.data as MatUomConv
      setConvRows((current) => (
        editing
          ? current.map((conv) => conv.from_uom === editing.from_uom && conv.to_uom === editing.to_uom ? saved : conv)
          : [saved, ...current]
      ))
      setOpen(false)
      setEditing(null)
      setForm({ from_uom: '', to_uom: '', factor: '', formula_note: '' })
      setMessage(editing ? 'UOM conversion updated.' : 'UOM conversion added.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(from_uom: string, to_uom: string) {
    if (!confirm('ยืนยันลบ?')) return
    const key = `${from_uom}:${to_uom}`
    setDeleting(key)
    setError(null)
    setMessage('')
    try {
      const res = await fetch(
        `/api/uom-conv?material_id=${materialId}&from_uom=${from_uom}&to_uom=${to_uom}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Delete failed')
        return
      }
      setConvRows((current) => current.filter((conv) => !(conv.from_uom === from_uom && conv.to_uom === to_uom)))
      setMessage('UOM conversion deleted.')
    } finally {
      setDeleting(null)
    }
  }

  function uomLabel(code: string) {
    const u = uoms.find((u) => u.uom_code === code)
    return u ? `${code} (${u.uom_name_th})` : code
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">การแปลงหน่วย (UOM Conversion)</h3>
        <button
          onClick={openAdd}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
        >
          + เพิ่ม
        </button>
      </div>

      {(error || message) && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {convRows.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีการแปลงหน่วย</p>
      ) : (
        <div className="space-y-2">
          {convRows.map((c) => (
            <div
              key={`${c.from_uom}-${c.to_uom}`}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div>
                <span className="text-sm text-gray-800 font-mono">
                  1 {c.from_uom} = {c.factor} {c.to_uom}
                </span>
                {c.formula_note && <p className="text-xs text-gray-400">{c.formula_note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(c)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  แก้
                </button>
                <button
                  onClick={() => handleDelete(c.from_uom, c.to_uom)}
                  disabled={deleting === `${c.from_uom}:${c.to_uom}`}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขการแปลงหน่วย' : 'เพิ่มการแปลงหน่วย'}>
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">หน่วยต้นทาง</label>
              <select
                value={form.from_uom}
                onChange={(e) => setForm((f) => ({ ...f, from_uom: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                disabled={!!editing}
              >
                <option value="">— เลือก —</option>
                {uoms.map((u) => (
                  <option key={u.uom_code} value={u.uom_code}>
                    {u.uom_code} — {u.uom_name_th}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">หน่วยปลายทาง</label>
              <select
                value={form.to_uom}
                onChange={(e) => setForm((f) => ({ ...f, to_uom: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                disabled={!!editing}
              >
                <option value="">— เลือก —</option>
                {uoms.map((u) => (
                  <option key={u.uom_code} value={u.uom_code}>
                    {u.uom_code} — {u.uom_name_th}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Factor (1 {form.from_uom || '?'} = ? {form.to_uom || '?'})
            </label>
            <input
              type="number"
              step="any"
              min="0.000001"
              value={form.factor}
              onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="เช่น 12"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Formula note</label>
            <input
              type="text"
              value={form.formula_note}
              onChange={(e) => setForm((f) => ({ ...f, formula_note: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="เช่น 1 SHEET = 3.0135 SQM"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'กำลังบันทึก...' : editing ? 'บันทึก' : 'เพิ่ม'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
