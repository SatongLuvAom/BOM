'use client'

import { useEffect, useState } from 'react'
import { formatThaiDateShort } from '@/lib/utils'

interface PriceRow {
  material_id:    string
  supplier_id:    string
  effective_date: string
  quote_date:     string | null
  valid_until:    string | null
  unit_price:     number
  currency_code:  string
  price_uom:      string
  min_order_qty:  number
  lead_time_days: number
  is_tax_included: boolean
  vat_included: boolean
  delivery_included: boolean
  source_type: string | null
  source_note:    string | null
  supplier: { supplier_id: string; supplier_name_th: string; supplier_code: string } | null
  uom:      { uom_code: string; uom_name_th: string } | null
}

interface Props {
  materialId:  string
  baseUom:     string
  suppliers:   { supplier_id: string; supplier_name_th: string; supplier_code: string }[]
  uoms:        { uom_code: string; uom_name_th: string }[]
}

const EMPTY_FORM = {
  supplier_id:    '',
  effective_date: new Date().toISOString().slice(0, 10),
  quote_date:     new Date().toISOString().slice(0, 10),
  valid_until:    '',
  price_uom:      '',
  unit_price:     '',
  currency_code:  'THB',
  min_order_qty:  '0',
  lead_time_days: '0',
  is_tax_included: false,
  delivery_included: false,
  source_type:    'manual',
  source_note:    '',
}

const SOURCE_TYPES = [
  { value: 'phone', label: 'Phone' },
  { value: 'line_chat', label: 'Chat' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'website', label: 'Website' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' },
]

export function MaterialPriceManager({ materialId, baseUom, suppliers, uoms }: Props) {
  const [prices,   setPrices]   = useState<PriceRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ ...EMPTY_FORM, price_uom: baseUom })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [loadError, setLoadError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editRow,  setEditRow]  = useState<PriceRow | null>(null)

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/material-prices?material_id=${materialId}&limit=100`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(json.error ?? 'Could not load material prices')
        return
      }
      setPrices(json.data ?? [])
    } catch {
      setLoadError('Could not load material prices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [materialId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  function openAdd() {
    setEditRow(null)
    setForm({ ...EMPTY_FORM, price_uom: baseUom })
    setShowForm(true)
    setError('')
  }

  function openEdit(p: PriceRow) {
    setEditRow(p)
    setForm({
      supplier_id:     p.supplier_id,
      effective_date:  p.effective_date,
      quote_date:      p.quote_date ?? p.effective_date,
      valid_until:     p.valid_until ?? '',
      price_uom:       p.price_uom,
      unit_price:      String(p.unit_price),
      currency_code:   p.currency_code,
      min_order_qty:   String(p.min_order_qty),
      lead_time_days:  String(p.lead_time_days),
      is_tax_included: p.vat_included ?? p.is_tax_included,
      delivery_included: p.delivery_included ?? false,
      source_type:     p.source_type ?? 'manual',
      source_note:     p.source_note ?? '',
    })
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.supplier_id) { setError('กรุณาเลือก Supplier'); return }
    if (!form.price_uom)   { setError('กรุณาเลือกหน่วย'); return }
    if (!form.unit_price)  { setError('กรุณาระบุราคา'); return }

    setSaving(true)
    setError('')
    try {
      const isEdit = !!editRow
      const url = isEdit
        ? `/api/material-prices/${materialId}/${editRow.supplier_id}/${editRow.effective_date}`
        : '/api/material-prices'
      const payload = {
        ...(!isEdit && { material_id: materialId }),
        supplier_id:     form.supplier_id,
        effective_date:  form.effective_date,
        quote_date:      form.quote_date || form.effective_date,
        valid_until:     form.valid_until || null,
        price_uom:       form.price_uom,
        unit_price:      Number(form.unit_price),
        currency_code:   form.currency_code.trim().toUpperCase(),
        min_order_qty:   Number(form.min_order_qty),
        lead_time_days:  Number(form.lead_time_days),
        is_tax_included: form.is_tax_included,
        vat_included:    form.is_tax_included,
        delivery_included: form.delivery_included,
        source_type:     form.source_type || 'manual',
        source_note:     form.source_note.trim() || null,
      }
      const res  = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.details?.fieldErrors ? JSON.stringify(json.details.fieldErrors) : (json.error ?? 'เกิดข้อผิดพลาด'))
        return
      }
      setShowForm(false)
      setEditRow(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: PriceRow) {
    const supplierName = p.supplier?.supplier_name_th ?? p.supplier_id
    if (!confirm(`ลบราคาของ ${supplierName} วันที่ ${p.effective_date} ?`)) return
    const key = `${p.supplier_id}:${p.effective_date}`
    setDeleting(key)
    setError('')
    try {
      const res = await fetch(`/api/material-prices/${materialId}/${p.supplier_id}/${p.effective_date}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not delete material price')
        return
      }
      await load()
    } finally {
      setDeleting(null)
    }
  }

  // Group: latest per supplier (first row sorted by effective_date desc)
  const latestPerSupplier = new Set<string>()
  const sorted = [...prices].sort((a, b) => b.effective_date.localeCompare(a.effective_date))
  sorted.forEach((p) => {
    if (!latestPerSupplier.has(p.supplier_id)) latestPerSupplier.add(p.supplier_id)
  })
  const latestSet = new Set(
    Object.entries(
      prices.reduce<Record<string, PriceRow>>((acc, p) => {
        if (!acc[p.supplier_id] || p.effective_date > acc[p.supplier_id].effective_date) {
          acc[p.supplier_id] = p
        }
        return acc
      }, {})
    ).map(([, p]) => `${p.supplier_id}:${p.effective_date}`)
  )

  const field = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
  const label = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          ราคา ({prices.length} รายการ)
        </h3>
        <button
          onClick={openAdd}
          disabled={loading || saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
        >
          + เพิ่มราคา
        </button>
      </div>

      {loadError && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>
      )}
      {loading && prices.length > 0 && (
        <p className="mb-3 text-xs font-medium text-cyan-700">Refreshing prices...</p>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-800">
            {editRow ? 'แก้ไขราคา' : 'เพิ่มราคาใหม่'}
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Supplier <span className="text-red-500">*</span></label>
              <select name="supplier_id" value={form.supplier_id} onChange={handleChange} className={field} disabled={!!editRow}>
                <option value="">— เลือก Supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name_th}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>วันที่มีผล <span className="text-red-500">*</span></label>
              <input name="effective_date" type="date" value={form.effective_date} onChange={handleChange} className={field} disabled={!!editRow} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Quote date</label>
              <input name="quote_date" type="date" value={form.quote_date} onChange={handleChange} className={field} />
            </div>
            <div>
              <label className={label}>Valid until</label>
              <input name="valid_until" type="date" value={form.valid_until} onChange={handleChange} className={field} />
            </div>
            <div>
              <label className={label}>Source</label>
              <select name="source_type" value={form.source_type} onChange={handleChange} className={field}>
                {SOURCE_TYPES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>ราคา <span className="text-red-500">*</span></label>
              <input name="unit_price" type="number" min="0" step="0.01" value={form.unit_price} onChange={handleChange} className={field} placeholder="0.00" />
            </div>
            <div>
              <label className={label}>สกุลเงิน</label>
              <input name="currency_code" value={form.currency_code} onChange={handleChange} className={field} maxLength={3} />
            </div>
            <div>
              <label className={label}>หน่วย <span className="text-red-500">*</span></label>
              <select name="price_uom" value={form.price_uom} onChange={handleChange} className={field}>
                <option value="">— เลือกหน่วย —</option>
                {uoms.map((u) => (
                  <option key={u.uom_code} value={u.uom_code}>
                    {u.uom_code} — {u.uom_name_th}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>MOQ</label>
              <input name="min_order_qty" type="number" min="0" step="0.01" value={form.min_order_qty} onChange={handleChange} className={field} />
            </div>
            <div>
              <label className={label}>Lead Time (วัน)</label>
              <input name="lead_time_days" type="number" min="0" value={form.lead_time_days} onChange={handleChange} className={field} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input name="is_tax_included" type="checkbox" checked={form.is_tax_included} onChange={handleChange} />
              รวมภาษีแล้ว
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input name="delivery_included" type="checkbox" checked={form.delivery_included} onChange={handleChange} />
              รวมส่งแล้ว
            </label>
          </div>

          <div>
            <label className={label}>หมายเหตุแหล่งที่มา</label>
            <input name="source_note" value={form.source_note} onChange={handleChange} className={field} placeholder="เช่น จากใบเสนอราคา, เว็บไซต์..." />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : editRow ? 'บันทึก' : 'เพิ่มราคา'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditRow(null) }}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {/* Price table */}
      {loading && prices.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">กำลังโหลด...</p>
      ) : prices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
          <p className="text-sm text-gray-400">ยังไม่มีราคา</p>
          <p className="text-xs text-gray-300 mt-1">กด "+ เพิ่มราคา" เพื่อบันทึกราคาจาก Supplier</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left border-b border-gray-200">
                <th className="px-3 py-2 text-xs font-medium text-gray-500">Supplier</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">วันที่มีผล</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">ราคา</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">หน่วย</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">MOQ</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">Lead (วัน)</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">หมายเหตุ</th>
                <th className="px-3 py-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((p) => {
                const key       = `${p.supplier_id}:${p.effective_date}`
                const isLatest  = latestSet.has(key)
                const isDel     = deleting === key

                return (
                  <tr key={key} className={`transition-colors hover:bg-gray-50 ${isLatest ? 'bg-emerald-50/40' : ''}`}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900">{p.supplier?.supplier_name_th ?? p.supplier_id}</p>
                      <p className="text-[10px] text-gray-400">{p.supplier?.supplier_code}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700">
                          {formatThaiDateShort(p.effective_date)}
                        </span>
                        {isLatest && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            ล่าสุด
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-semibold ${isLatest ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {Number(p.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="ml-1 text-xs text-gray-400">{p.currency_code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{p.uom?.uom_name_th ?? p.price_uom}</td>
                    <td className="px-3 py-2.5 text-gray-500">{Number(p.min_order_qty) || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{Number(p.lead_time_days) || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[120px]">
                      <p className="truncate">{p.source_note || '—'}</p>
                      {(p.vat_included ?? p.is_tax_included) && <span className="text-blue-500">incl. VAT</span>}
                      {p.delivery_included && <span className="ml-1 text-emerald-600">incl. delivery</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          disabled={saving || loading || Boolean(deleting)}
                          className="text-xs text-blue-600 hover:text-blue-800 disabled:cursor-wait disabled:opacity-40"
                        >
                          แก้
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={saving || loading || isDel}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          {isDel ? '...' : 'ลบ'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
