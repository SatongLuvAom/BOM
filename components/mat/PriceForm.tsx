'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatMaster, MatPriceBase, MatUom, Supplier } from '@/types/mat'
import { createMatPriceBaseSchema } from '@/lib/validations/supplier'

interface PriceFormProps {
  mode: 'create' | 'edit'
  price?: MatPriceBase
  materials: Pick<MatMaster, 'material_id' | 'mat_name_th' | 'base_uom'>[]
  suppliers: Pick<Supplier, 'supplier_id' | 'supplier_name_th' | 'supplier_code'>[]
  uoms: MatUom[]
  initialMaterialId?: string
  initialSupplierId?: string
}

export function PriceForm({
  mode,
  price,
  materials,
  suppliers,
  uoms,
  initialMaterialId,
  initialSupplierId,
}: PriceFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    material_id: price?.material_id ?? initialMaterialId ?? '',
    supplier_id: price?.supplier_id ?? initialSupplierId ?? '',
    effective_date: price?.effective_date ?? new Date().toISOString().slice(0, 10),
    quote_date: price?.quote_date ?? price?.effective_date ?? new Date().toISOString().slice(0, 10),
    valid_until: price?.valid_until ?? '',
    price_uom: price?.price_uom ?? '',
    unit_price: price?.unit_price ?? 0,
    currency_code: price?.currency_code ?? 'THB',
    min_order_qty: price?.min_order_qty ?? 0,
    lead_time_days: price?.lead_time_days ?? 0,
    is_tax_included: price?.vat_included ?? price?.is_tax_included ?? false,
    delivery_included: price?.delivery_included ?? false,
    source_type: price?.source_type ?? 'manual',
    source_note: price?.source_note ?? '',
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const payload = {
      ...form,
      currency_code: form.currency_code.trim().toUpperCase(),
      unit_price: Number(form.unit_price),
      min_order_qty: Number(form.min_order_qty),
      lead_time_days: Number(form.lead_time_days),
      valid_until: form.valid_until || '',
      vat_included: form.is_tax_included,
    }

    const parsed = createMatPriceBaseSchema.safeParse(payload)
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
      const url = mode === 'create'
        ? '/api/material-prices'
        : `/api/material-prices/${price!.material_id}/${price!.supplier_id}/${price!.effective_date}`

      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Unexpected error')
        return
      }

      const materialId = mode === 'create' ? json.data.material_id : price!.material_id
      const supplierId = mode === 'create' ? json.data.supplier_id : price!.supplier_id
      const effectiveDate = mode === 'create' ? json.data.effective_date : price!.effective_date

      router.push(`/prices/${materialId}/${supplierId}/${effectiveDate}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Material *" error={fieldErrors.material_id}>
          <select
            value={form.material_id}
            onChange={(e) => set('material_id', e.target.value)}
            className={inputCls(!!fieldErrors.material_id)}
            disabled={mode === 'edit'}
          >
            <option value="">Select material</option>
            {materials.map((material) => (
              <option key={material.material_id} value={material.material_id}>
                {material.material_id} - {material.mat_name_th}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Supplier *" error={fieldErrors.supplier_id}>
          <select
            value={form.supplier_id}
            onChange={(e) => set('supplier_id', e.target.value)}
            className={inputCls(!!fieldErrors.supplier_id)}
            disabled={mode === 'edit'}
          >
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplier_id} value={supplier.supplier_id}>
                {supplier.supplier_name_th} ({supplier.supplier_code})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Effective Date *" error={fieldErrors.effective_date}>
          <input
            type="date"
            value={form.effective_date}
            onChange={(e) => set('effective_date', e.target.value)}
            className={inputCls(!!fieldErrors.effective_date)}
            disabled={mode === 'edit'}
          />
        </Field>

        <Field label="Quote Date" error={fieldErrors.quote_date}>
          <input
            type="date"
            value={form.quote_date}
            onChange={(e) => set('quote_date', e.target.value)}
            className={inputCls(!!fieldErrors.quote_date)}
          />
        </Field>

        <Field label="Valid Until" error={fieldErrors.valid_until}>
          <input
            type="date"
            value={form.valid_until}
            onChange={(e) => set('valid_until', e.target.value)}
            className={inputCls(!!fieldErrors.valid_until)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

        <Field label="Price UOM *" error={fieldErrors.price_uom}>
          <select
            value={form.price_uom}
            onChange={(e) => set('price_uom', e.target.value)}
            className={inputCls(!!fieldErrors.price_uom)}
          >
            <option value="">Select UOM</option>
            {uoms.map((uom) => (
              <option key={uom.uom_code} value={uom.uom_code}>
                {uom.uom_code} - {uom.uom_name_th}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Currency *" error={fieldErrors.currency_code}>
          <input
            type="text"
            value={form.currency_code}
            onChange={(e) => set('currency_code', e.target.value.toUpperCase())}
            className={inputCls(!!fieldErrors.currency_code)}
            maxLength={3}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field label="Unit Price *" error={fieldErrors.unit_price}>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={form.unit_price}
            onChange={(e) => set('unit_price', Number(e.target.value))}
            className={inputCls(!!fieldErrors.unit_price)}
          />
        </Field>

        <Field label="MOQ" error={fieldErrors.min_order_qty}>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={form.min_order_qty}
            onChange={(e) => set('min_order_qty', Number(e.target.value))}
            className={inputCls(false)}
          />
        </Field>

        <Field label="Lead Time (days)" error={fieldErrors.lead_time_days}>
          <input
            type="number"
            min={0}
            value={form.lead_time_days}
            onChange={(e) => set('lead_time_days', Number(e.target.value))}
            className={inputCls(false)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.is_tax_included}
          onChange={(e) => set('is_tax_included', e.target.checked)}
        />
        Tax included
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.delivery_included}
          onChange={(e) => set('delivery_included', e.target.checked)}
        />
        Delivery included
      </label>

      <Field label="Source Type" error={fieldErrors.source_type}>
        <select
          value={form.source_type}
          onChange={(e) => set('source_type', e.target.value)}
          className={inputCls(!!fieldErrors.source_type)}
        >
          <option value="phone">Phone</option>
          <option value="line_chat">Chat</option>
          <option value="quotation">Quotation</option>
          <option value="receipt">Receipt</option>
          <option value="website">Website</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
      </Field>

      <Field label="Source Note" error={fieldErrors.source_note}>
        <textarea
          value={form.source_note}
          onChange={(e) => set('source_note', e.target.value)}
          rows={3}
          className={inputCls(false)}
        />
      </Field>

      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create price' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
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
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
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
