'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatCategory } from '@/types/mat'
import { createCategorySchema } from '@/lib/validations/category'

interface CategoryFormProps {
  category?: MatCategory
  categories: MatCategory[]
  mode: 'create' | 'edit'
}

export function CategoryForm({ category, categories, mode }: CategoryFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    cat_code:      category?.cat_code      ?? '',
    cat_name_th:   category?.cat_name_th   ?? '',
    cat_name_en:   category?.cat_name_en   ?? '',
    parent_cat_id: category?.parent_cat_id ?? '',
    is_active:     category?.is_active     ?? true,
    sort_order:    category?.sort_order    ?? 0,
  })

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((e) => ({ ...e, [key]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const payload = {
      ...form,
      cat_code: form.cat_code.toUpperCase(),
      parent_cat_id: form.parent_cat_id || undefined,
    }

    const parsed = createCategorySchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.errors.forEach((err) => {
        errors[err.path[0] as string] = err.message
      })
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    try {
      const url = mode === 'create'
        ? '/api/categories'
        : `/api/categories/${category!.cat_id}`

      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }

      router.push('/categories')
    } finally {
      setSaving(false)
    }
  }

  const parentOptions = categories.filter((c) => c.cat_id !== category?.cat_id)

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="รหัสหมวดหมู่ (Code) *" error={fieldErrors.cat_code}>
          <input
            type="text"
            value={form.cat_code}
            onChange={(e) => set('cat_code', e.target.value.toUpperCase())}
            placeholder="เช่น STL, ELC"
            className={inputCls(!!fieldErrors.cat_code)}
          />
        </Field>

        <Field label="Parent หมวดหมู่" error={fieldErrors.parent_cat_id}>
          <select
            value={form.parent_cat_id}
            onChange={(e) => set('parent_cat_id', e.target.value)}
            className={inputCls(false)}
          >
            <option value="">— ไม่มี (top-level) —</option>
            {parentOptions.map((c) => (
              <option key={c.cat_id} value={c.cat_id}>
                [{c.cat_code}] {c.cat_name_th}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="ชื่อหมวดหมู่ (ไทย) *" error={fieldErrors.cat_name_th}>
        <input
          type="text"
          value={form.cat_name_th}
          onChange={(e) => set('cat_name_th', e.target.value)}
          placeholder="เช่น เหล็กและโลหะ"
          className={inputCls(!!fieldErrors.cat_name_th)}
        />
      </Field>

      <Field label="ชื่อหมวดหมู่ (อังกฤษ)" error={fieldErrors.cat_name_en}>
        <input
          type="text"
          value={form.cat_name_en}
          onChange={(e) => set('cat_name_en', e.target.value)}
          placeholder="e.g. Steel & Metal"
          className={inputCls(false)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-5">
        <Field label="ลำดับ (Sort Order)" error={fieldErrors.sort_order}>
          <input
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => set('sort_order', parseInt(e.target.value, 10) || 0)}
            className={inputCls(false)}
          />
        </Field>

        <Field label="สถานะ" error={''}>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">เปิดใช้งาน</span>
          </label>
        </Field>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : mode === 'create' ? 'สร้างหมวดหมู่' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
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
