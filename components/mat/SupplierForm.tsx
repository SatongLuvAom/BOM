'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Supplier } from '@/types/mat'
import { createReceiptSupplierSchema, createSupplierSchema } from '@/lib/validations/supplier'
import { routes } from '@/lib/routes'
import type { ReceiptSupplier } from '@/types/receipt'

interface SupplierFormProps {
  supplier?: Supplier
  mode: 'create' | 'edit'
  receiptContext?: {
    receiptId: string
    initialValues: Partial<Supplier>
    onCreated: (supplier: ReceiptSupplier) => void
    onUseExisting: (supplier: ReceiptSupplier) => void
    onCancel: () => void
  }
}

export function SupplierForm({ supplier, mode, receiptContext }: SupplierFormProps) {
  const router = useRouter()
  const initial = mode === 'create' && receiptContext ? receiptContext.initialValues : supplier
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [existingSuppliers, setExistingSuppliers] = useState<ReceiptSupplier[]>([])
  const [error, setError] = useState<string | null>(null)
  const errorPanel = useRef<HTMLDivElement>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    supplier_code: initial?.supplier_code ?? '',
    supplier_name_th: initial?.supplier_name_th ?? '',
    supplier_name_en: initial?.supplier_name_en ?? '',
    tax_id: initial?.tax_id ?? '',
    contact_name: initial?.contact_name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    line_id: initial?.line_id ?? '',
    address: initial?.address ?? '',
    payment_terms: initial?.payment_terms ?? '',
    status: initial?.status ?? 'ACTIVE',
    note: initial?.note ?? '',
  })

  useEffect(() => {
    if (error && receiptContext) errorPanel.current?.focus()
  }, [error, receiptContext])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
    setConfirmed(false)
    setExistingSuppliers([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    setFieldErrors({})

    const payload = {
      ...form,
      supplier_code: form.supplier_code.trim().toUpperCase(),
      supplier_name_th: form.supplier_name_th.trim(),
      ...(receiptContext ? { source_receipt_id: receiptContext.receiptId, confirm_supplier: confirmed } : {}),
    }

    const parsed = (receiptContext ? createReceiptSupplierSchema : createSupplierSchema).safeParse(payload)
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      parsed.error.errors.forEach((issue) => {
        nextErrors[issue.path[0] as string] = issue.message
      })
      setFieldErrors(nextErrors)
      if (receiptContext) setError('กรุณาตรวจช่องที่แจ้งเตือนก่อนสร้างร้าน')
      return
    }

    setSaving(true)
    try {
      const url = mode === 'create' ? '/api/suppliers' : `/api/suppliers/${supplier!.supplier_id}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Unexpected error')
        if (receiptContext) setExistingSuppliers(json.existing_suppliers ?? [])
        return
      }

      if (receiptContext) {
        if (!json.data?.id) throw new Error('สร้างร้านแล้วแต่ไม่พบ UUID กรุณาตรวจรายการร้านก่อนลองสร้างใหม่')
        receiptContext.onCreated(json.data)
        return
      }

      const nextId = mode === 'create' ? json.data?.supplier_id : supplier!.supplier_id
      const target = routes.suppliers.detail(nextId)

      if (!target) {
        setError('ไม่สามารถเปิดหน้าถัดไปได้ เนื่องจากไม่พบรหัสรายการ')
        return
      }

      router.push(target)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึกร้านไม่สำเร็จ กรุณาตรวจรายการร้านก่อนลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6" onKeyDown={(event) => {
      if (receiptContext && event.key === 'Escape') {
        event.preventDefault()
        if (!saving) receiptContext.onCancel()
      }
    }}>
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-5 border-0 p-0">
      {receiptContext && <p className="text-sm text-slate-600">ข้อมูลนี้มาจากสลิป กรุณาเทียบกับผู้ขายในเอกสาร แก้ไขได้ทุกช่อง และเว้นข้อมูลที่ไม่ทราบ รหัสร้านให้กำหนดเอง ไม่ใช่รหัสวัสดุ</p>}
      {error && (
        <div ref={errorPanel} role="alert" tabIndex={-1} className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {receiptContext && existingSuppliers.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          {existingSuppliers.map((existing) => (
            <div key={existing.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{existing.supplier_name_th} ({existing.supplier_code || existing.supplier_id}) / เลขผู้เสียภาษี: {existing.tax_id || '-'}</span>
              {existing.status === 'ACTIVE' ? (
                <button type="button" className="btn-secondary" onClick={() => receiptContext.onUseExisting(existing)}>ใช้ร้านเดิม {existing.supplier_code || existing.supplier_id}</button>
              ) : <span className="text-amber-800">ร้านนี้ปิดใช้งาน กรุณาตรวจในเมนูซัพพลายเออร์ก่อน ไม่ควรสร้างซ้ำ</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Supplier Code *" error={fieldErrors.supplier_code}>
          <input
            type="text"
            value={form.supplier_code}
            onChange={(e) => set('supplier_code', e.target.value.toUpperCase())}
            placeholder="e.g. SCG"
            className={inputCls(!!fieldErrors.supplier_code)}
          />
        </Field>

        <Field label="Status" error={fieldErrors.status}>
          <select
            disabled={Boolean(receiptContext)}
            value={form.status}
            onChange={(e) => set('status', e.target.value as typeof form.status)}
            className={inputCls(false)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Supplier Name (TH) *" error={fieldErrors.supplier_name_th}>
          <input
            type="text"
            value={form.supplier_name_th}
            onChange={(e) => set('supplier_name_th', e.target.value)}
            className={inputCls(!!fieldErrors.supplier_name_th)}
          />
        </Field>

        <Field label="Supplier Name (EN)" error={fieldErrors.supplier_name_en}>
          <input
            type="text"
            value={form.supplier_name_en}
            onChange={(e) => set('supplier_name_en', e.target.value)}
            className={inputCls(false)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Tax ID" error={fieldErrors.tax_id}>
          <input
            type="text"
            value={form.tax_id}
            onChange={(e) => set('tax_id', e.target.value)}
            className={inputCls(false)}
          />
        </Field>

        <Field label="Contact Name" error={fieldErrors.contact_name}>
          <input
            type="text"
            value={form.contact_name}
            onChange={(e) => set('contact_name', e.target.value)}
            className={inputCls(false)}
          />
        </Field>

        <Field label="Phone" error={fieldErrors.phone}>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className={inputCls(false)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Email" error={fieldErrors.email}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className={inputCls(!!fieldErrors.email)}
          />
        </Field>

        <Field label="LINE ID" error={fieldErrors.line_id}>
          <input
            type="text"
            value={form.line_id}
            onChange={(e) => set('line_id', e.target.value)}
            className={inputCls(false)}
          />
        </Field>
      </div>

      <Field label="Payment Terms" error={fieldErrors.payment_terms}>
        <input
          type="text"
          value={form.payment_terms}
          onChange={(e) => set('payment_terms', e.target.value)}
          placeholder="e.g. 30 days"
          className={inputCls(false)}
        />
      </Field>

      <Field label="Address" error={fieldErrors.address}>
        <textarea
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          rows={3}
          className={inputCls(false)}
        />
      </Field>

      <Field label="Note" error={fieldErrors.note}>
        <textarea
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          rows={3}
          className={inputCls(false)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        {receiptContext && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            ตรวจข้อมูลผู้ขายแล้ว ยืนยันสร้างร้านใหม่
          </label>
        )}
        <button
          type="submit"
          disabled={saving || (Boolean(receiptContext) && !confirmed)}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (receiptContext ? 'กำลังบันทึก...' : 'Saving...') : receiptContext ? 'ยืนยันสร้างร้านใหม่' : mode === 'create' ? 'Create supplier' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (receiptContext) { receiptContext.onCancel(); return }
            const target = mode === 'create' ? routes.suppliers.list() : routes.suppliers.detail(supplier?.supplier_id)
            router.push(target ?? routes.suppliers.list())
          }}
          className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          {receiptContext ? 'ยกเลิก' : 'Cancel'}
        </button>
      </div>
      {fieldErrors.confirm_supplier && <p className="text-sm text-red-600">{fieldErrors.confirm_supplier}</p>}
      </fieldset>
    </form>
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
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
  }`
}
