'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Supplier } from '@/types/mat'
import { createSupplierSchema } from '@/lib/validations/supplier'

interface SupplierFormProps {
  supplier?: Supplier
  mode: 'create' | 'edit'
}

export function SupplierForm({ supplier, mode }: SupplierFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    supplier_code: supplier?.supplier_code ?? '',
    supplier_name_th: supplier?.supplier_name_th ?? '',
    supplier_name_en: supplier?.supplier_name_en ?? '',
    tax_id: supplier?.tax_id ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    line_id: supplier?.line_id ?? '',
    address: supplier?.address ?? '',
    payment_terms: supplier?.payment_terms ?? '',
    status: supplier?.status ?? 'ACTIVE',
    note: supplier?.note ?? '',
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
      supplier_code: form.supplier_code.trim().toUpperCase(),
    }

    const parsed = createSupplierSchema.safeParse(payload)
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
      const url = mode === 'create' ? '/api/suppliers' : `/api/suppliers/${supplier!.supplier_id}`
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

      const nextId = mode === 'create' ? json.data.supplier_id : supplier!.supplier_id
      router.push(`/suppliers/${nextId}`)
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

      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create supplier' : 'Save changes'}
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
