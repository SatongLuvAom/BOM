'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReceiptSupplier } from '@/types/receipt'

type FormState = {
  supplier_id: string
  supplier_name_raw: string
  supplier_tax_id_raw: string
  receipt_date: string
  receipt_no: string
  subtotal: string
  vat: string
  discount: string
  grand_total: string
  notes: string
}

const initialForm: FormState = {
  supplier_id: '',
  supplier_name_raw: '',
  supplier_tax_id_raw: '',
  receipt_date: new Date().toISOString().slice(0, 10),
  receipt_no: '',
  subtotal: '',
  vat: '',
  discount: '',
  grand_total: '',
  notes: '',
}

export function ReceiptCreateDraftForm({ suppliers }: { suppliers: ReceiptSupplier[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  function toNumber(value: string) {
    return value.trim() ? Number(value) : null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          subtotal: toNumber(form.subtotal),
          vat: toNumber(form.vat),
          discount: toNumber(form.discount),
          grand_total: toNumber(form.grand_total),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'สร้าง Draft ไม่สำเร็จ')
        return
      }
      router.push(`/receipts/${json.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="Supplier">
          <select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} className={inputClass}>
            <option value="">- เลือกซัพพลายเออร์ -</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.supplier_name_th} ({supplier.supplier_code || supplier.supplier_id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="ชื่อ Supplier จากสลิป">
          <input value={form.supplier_name_raw} onChange={(e) => set('supplier_name_raw', e.target.value)} className={inputClass} />
        </Field>
        <Field label="วันที่สลิป">
          <input type="date" value={form.receipt_date} onChange={(e) => set('receipt_date', e.target.value)} className={inputClass} />
        </Field>
        <Field label="เลขที่เอกสาร">
          <input value={form.receipt_no} onChange={(e) => set('receipt_no', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Tax ID จากสลิป">
          <input value={form.supplier_tax_id_raw} onChange={(e) => set('supplier_tax_id_raw', e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Subtotal">
          <input type="number" step="0.01" value={form.subtotal} onChange={(e) => set('subtotal', e.target.value)} className={inputClass} />
        </Field>
        <Field label="VAT">
          <input type="number" step="0.01" value={form.vat} onChange={(e) => set('vat', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Discount">
          <input type="number" step="0.01" value={form.discount} onChange={(e) => set('discount', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Grand total">
          <input type="number" step="0.01" value={form.grand_total} onChange={(e) => set('grand_total', e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="หมายเหตุ">
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={inputClass} />
      </Field>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        AI/OCR จะเพิ่มในรอบถัดไป รอบนี้ให้สร้าง Draft และกรอกรายการด้วยตัวเองก่อน
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={() => router.push('/receipts')} className="btn-secondary">
          ยกเลิก
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'กำลังสร้าง...' : 'สร้าง Draft'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-950/10'
