'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatCategory, MatMaster, MatUom, MaterialType } from '@/types/mat'
import type { CreateMaterialInput } from '@/lib/validations/material'
import { createMaterialSchema } from '@/lib/validations/material'
import { getMaterialCode, getMaterialRouteId } from '@/lib/material-master'
import { inferSpecKeyFromText, sanitizeSpecKey } from '@/lib/material-code'

interface MaterialFormProps {
  material?: MatMaster
  categories: MatCategory[]
  uoms: MatUom[]
  materialTypes: MaterialType[]
  mode: 'create' | 'edit'
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',       label: 'ใช้งาน' },
  { value: 'INACTIVE',     label: 'ปิดใช้งาน' },
  { value: 'DISCONTINUED', label: 'ยกเลิก' },
]

export function MaterialForm({ material, categories, uoms, materialTypes, mode }: MaterialFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [codePreview, setCodePreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const [form, setForm] = useState<CreateMaterialInput>({
    material_code: material ? getMaterialCode(material) : '',
    cat_id:      material?.cat_id      ?? '',
    category_id: material?.category_id ?? '',
    material_type_id: material?.material_type_id ?? '',
    code_spec_key: material?.code_spec_key ?? '',
    mat_name_th: material?.mat_name_th ?? '',
    mat_name_en: material?.mat_name_en ?? '',
    normalized_name: material?.normalized_name ?? '',
    spec:        material?.spec        ?? '',
    brand:       material?.brand       ?? '',
    model:       material?.model       ?? '',
    base_uom:    material?.base_uom    ?? '',
    base_uom_id: material?.base_uom_id ?? '',
    status:      material?.status      ?? 'ACTIVE',
    note:        material?.note        ?? '',
  })

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((e) => ({ ...e, [key]: '' }))
  }

  const selectedCategory = useMemo(
    () => categories.find((category) => category.cat_id === form.cat_id) ?? null,
    [categories, form.cat_id],
  )

  const availableTypes = useMemo(
    () => materialTypes.filter((type) => !selectedCategory || type.category_id === selectedCategory.id),
    [materialTypes, selectedCategory],
  )

  const selectedType = useMemo(
    () => materialTypes.find((type) => type.id === form.material_type_id) ?? null,
    [materialTypes, form.material_type_id],
  )

  useEffect(() => {
    if (mode !== 'create' || !form.material_type_id) {
      setCodePreview('')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/material-code/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cat_id: form.cat_id,
            material_type_id: form.material_type_id,
            spec_key: form.code_spec_key || form.spec || 'GEN',
          }),
          signal: controller.signal,
        })
        const json = await res.json()
        if (res.ok) {
          setCodePreview(json.data.preview)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setCodePreview('')
      } finally {
        setPreviewLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [form.cat_id, form.material_type_id, form.code_spec_key, form.spec, mode])

  function handleCategoryChange(catId: string) {
    const category = categories.find((item) => item.cat_id === catId)
    setForm((current) => ({
      ...current,
      cat_id: catId,
      category_id: category?.id ?? '',
      material_type_id: '',
    }))
    setFieldErrors((e) => ({ ...e, cat_id: '', category_id: '', material_type_id: '' }))
  }

  function handleSpecChange(value: string) {
    setForm((current) => ({
      ...current,
      spec: value,
      code_spec_key: current.code_spec_key || inferSpecKeyFromText(value),
    }))
    setFieldErrors((e) => ({ ...e, spec: '', code_spec_key: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const parsed = createMaterialSchema.safeParse(form)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      parsed.error.errors.forEach((err) => {
        const key = err.path[0] as string
        errors[key] = err.message
      })
      setFieldErrors(errors)
      return
    }

    setSaving(true)
    try {
      const url = mode === 'create'
        ? '/api/materials'
        : `/api/materials/${getMaterialRouteId(material!)}`

      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'เกิดข้อผิดพลาด')
        return
      }

      const id = mode === 'create'
        ? (json.data.id ?? json.data.material_id)
        : getMaterialRouteId(material!)

      router.push(`/materials/${id}`)
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
        <Field label="Material code" error={fieldErrors.material_code}>
          <input
            type="text"
            value={mode === 'create' ? codePreview : form.material_code ?? ''}
            placeholder="เช่น STR-260410-0001"
            readOnly
            className={`${inputCls(!!fieldErrors.material_code)} bg-slate-50 font-mono text-slate-600`}
          />
          <p className="mt-1 text-xs text-slate-400">
            {mode === 'create'
              ? 'Preview only. Final sequence is generated on save.'
              : 'Locked. Use Change Code / Regenerate Code on the detail page.'}
          </p>
        </Field>

        {/* Category */}
        <Field label="หมวดหมู่ *" error={fieldErrors.cat_id}>
          <select
            value={form.cat_id}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={inputCls(!!fieldErrors.cat_id)}
          >
            <option value="">— เลือกหมวดหมู่ —</option>
            {categories.filter((c) => c.is_active).map((c) => (
              <option key={c.cat_id} value={c.cat_id}>
                [{c.cat_code}] {c.cat_name_th}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Material type *" error={fieldErrors.material_type_id}>
          <select
            value={form.material_type_id ?? ''}
            onChange={(e) => set('material_type_id', e.target.value)}
            className={inputCls(!!fieldErrors.material_type_id)}
            disabled={!form.cat_id}
          >
            <option value="">- Select material type -</option>
            {availableTypes.map((type) => (
              <option key={type.id} value={type.id}>
                [{type.code_prefix}] {type.name}
              </option>
            ))}
          </select>
          {selectedCategory && availableTypes.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No material types configured for {selectedCategory.cat_code}. Add them in Material Code Settings.
            </p>
          )}
        </Field>

        <Field label="Code spec key *" error={fieldErrors.code_spec_key}>
          <input
            type="text"
            value={form.code_spec_key ?? ''}
            onChange={(e) => set('code_spec_key', sanitizeSpecKey(e.target.value))}
            placeholder="006, 030W, W1000, GEN"
            className={`${inputCls(!!fieldErrors.code_spec_key)} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-400">
            Category {selectedCategory?.code_prefix ?? selectedCategory?.cat_code ?? '-'} / Type {selectedType?.code_prefix ?? '-'}
          </p>
        </Field>

        {/* Base UOM */}
        <Field label="หน่วยนับหลัก *" error={fieldErrors.base_uom}>
          <select
            value={form.base_uom}
            onChange={(e) => set('base_uom', e.target.value)}
            className={inputCls(!!fieldErrors.base_uom)}
          >
            <option value="">— เลือกหน่วย —</option>
            {uoms.map((u) => (
              <option key={u.uom_code} value={u.uom_code}>
                {u.uom_code} — {u.uom_name_th}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Name TH */}
      <Field label="ชื่อวัสดุ (ไทย) *" error={fieldErrors.mat_name_th}>
        <input
          type="text"
          value={form.mat_name_th}
          onChange={(e) => set('mat_name_th', e.target.value)}
          placeholder="เช่น เหล็กกล่องสี่เหลี่ยม"
          className={inputCls(!!fieldErrors.mat_name_th)}
        />
      </Field>

      {/* Name EN */}
      <Field label="ชื่อวัสดุ (อังกฤษ)" error={fieldErrors.mat_name_en}>
        <input
          type="text"
          value={form.mat_name_en}
          onChange={(e) => set('mat_name_en', e.target.value)}
          placeholder="e.g. Square Steel Tube"
          className={inputCls(false)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Spec */}
        <Field label="สเปก / ขนาด" error={fieldErrors.spec}>
          <input
            type="text"
            value={form.spec}
            onChange={(e) => handleSpecChange(e.target.value)}
            placeholder="เช่น 40×40×2mm"
            className={inputCls(false)}
          />
        </Field>

        {/* Brand */}
        <Field label="แบรนด์" error={fieldErrors.brand}>
          <input
            type="text"
            value={form.brand}
            onChange={(e) => set('brand', e.target.value)}
            placeholder="เช่น TOA, Philips"
            className={inputCls(false)}
          />
        </Field>

        <Field label="รุ่น" error={fieldErrors.model}>
          <input
            type="text"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="เช่น T-45"
            className={inputCls(false)}
          />
        </Field>
      </div>

      {/* Status */}
      <Field label="สถานะ" error={fieldErrors.status}>
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value as typeof form.status)}
          className={inputCls(false)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Note */}
      <Field label="หมายเหตุ" error={fieldErrors.note}>
        <textarea
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          rows={3}
          className={inputCls(false)}
        />
      </Field>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white
                     hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? 'กำลังบันทึก...' : mode === 'create' ? 'สร้างวัสดุ' : 'บันทึกการเปลี่ยนแปลง'}
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
