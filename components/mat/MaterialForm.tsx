'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MatCategory, MatMaster, MatUom, MaterialType } from '@/types/mat'
import type { CreateMaterialInput } from '@/lib/validations/material'
import { createMaterialSchema, updateMaterialSchema } from '@/lib/validations/material'
import { getMaterialCode, getMaterialRouteId } from '@/lib/material-master'
import { inferExplicitSpecKeyFromText, inferSpecKeyFromText, inferTypePrefixFromText } from '@/lib/material-code'
import { routes } from '@/lib/routes'

interface MaterialFormProps {
  material?: MatMaster
  categories: MatCategory[]
  uoms: MatUom[]
  materialTypes: MaterialType[]
  mode: 'create' | 'edit'
}

type DuplicateWarning = {
  material_id: string
  route_id: string
  material_code: string | null
  mat_name_th: string | null
  mat_name_en: string | null
  category_name: string | null
  material_type_label: string | null
  code_spec_key: string | null
  spec: string | null
  brand: string | null
  model: string | null
  score: number
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW'
  recommended_action: string
  matched_reasons: { key: string; label: string; points: number; detail?: string }[]
}

type MaterialFormState = CreateMaterialInput & {
  code_change_reason?: string
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',       label: 'ใช้งาน' },
  { value: 'INACTIVE',     label: 'ปิดใช้งาน' },
  { value: 'DISCONTINUED', label: 'ยกเลิก' },
]

export function MaterialForm({ material, categories, uoms, materialTypes, mode }: MaterialFormProps) {
  const router = useRouter()
  const isCreate = mode === 'create'
  const materialRouteId = material ? getMaterialRouteId(material) : ''
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [codePreview, setCodePreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [specKeyTouched, setSpecKeyTouched] = useState(!isCreate && Boolean(material?.code_spec_key))
  const [typeTouched, setTypeTouched] = useState(!isCreate && Boolean(material?.material_type_id))
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateWarning[]>([])
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false)
  const [duplicateCheckError, setDuplicateCheckError] = useState('')

  const [form, setForm] = useState<MaterialFormState>({
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
    code_change_reason: '',
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

  const inferredTypePrefix = useMemo(
    () => inferTypePrefixFromText({
      matNameEn: form.mat_name_en,
      matNameTh: form.mat_name_th,
      spec: form.spec,
      brand: form.brand,
      model: form.model,
    }),
    [form.mat_name_en, form.mat_name_th, form.spec, form.brand, form.model],
  )

  const suggestedType = useMemo(() => {
    if (!selectedCategory || inferredTypePrefix === 'GEN') return null

    return availableTypes.find((type) => (
      type.code_prefix.toUpperCase() === inferredTypePrefix
    )) ?? null
  }, [availableTypes, inferredTypePrefix, selectedCategory])

  const specKeySuggestion = useMemo(() => {
    const explicitSpec = String(form.spec ?? '').trim()
    if (explicitSpec) {
      const inferred = inferSpecKeyFromText(explicitSpec)
      return inferred === 'GEN' ? '' : inferred
    }

    return inferExplicitSpecKeyFromText([
      form.mat_name_en,
      form.mat_name_th,
      form.brand,
      form.model,
    ].filter(Boolean).join(' '))
  }, [form.spec, form.mat_name_en, form.mat_name_th, form.brand, form.model])

  const codeAffectingChanged = useMemo(() => {
    if (isCreate || !material) return false

    return (
      (form.cat_id || '') !== (material.cat_id || '')
      || (form.material_type_id || '') !== (material.material_type_id || '')
      || (form.code_spec_key || '') !== (material.code_spec_key || '')
    )
  }, [form.cat_id, form.material_type_id, form.code_spec_key, isCreate, material])

  useEffect(() => {
    if (!isCreate || specKeyTouched || form.code_spec_key || !specKeySuggestion) return

    setForm((current) => (
      current.code_spec_key
        ? current
        : { ...current, code_spec_key: specKeySuggestion }
    ))
  }, [form.code_spec_key, isCreate, specKeySuggestion, specKeyTouched])

  useEffect(() => {
    if (!isCreate || typeTouched || form.material_type_id || !suggestedType) return

    setForm((current) => (
      current.material_type_id
        ? current
        : { ...current, material_type_id: suggestedType.id }
    ))
    setFieldErrors((e) => ({ ...e, material_type_id: '' }))
  }, [form.material_type_id, isCreate, suggestedType, typeTouched])

  useEffect(() => {
    if ((!isCreate && !codeAffectingChanged) || !form.cat_id) {
      setCodePreview('')
      return
    }

    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/material-code/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cat_id: form.cat_id,
            material_type_id: form.material_type_id || undefined,
            spec_key: form.code_spec_key && form.code_spec_key.length >= 2 && form.code_spec_key !== 'GEN'
              ? form.code_spec_key
              : undefined,
            mat_name_en: form.mat_name_en,
            mat_name_th: form.mat_name_th,
            spec: form.spec,
            brand: form.brand,
            model: form.model,
          }),
          signal: controller.signal,
        })
        const json = await res.json()
        if (active && res.ok) {
          setCodePreview(json.data.preview)
        }
      } catch (err) {
        if (active && (err as Error).name !== 'AbortError') setCodePreview('')
      } finally {
        if (active) setPreviewLoading(false)
      }
    }, 250)

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [codeAffectingChanged, form.cat_id, form.material_type_id, form.code_spec_key, form.mat_name_en, form.mat_name_th, form.spec, form.brand, form.model, isCreate])

  useEffect(() => {
    const hasName = form.mat_name_th.trim().length >= 2 || form.mat_name_en.trim().length >= 2
    if (!isCreate || !form.cat_id || !hasName) {
      setDuplicateWarnings([])
      setDuplicateCheckError('')
      setDuplicateCheckLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(async () => {
      setDuplicateCheckLoading(true)
      setDuplicateCheckError('')
      try {
        const res = await fetch('/api/materials/duplicate-candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cat_id: form.cat_id,
            category_id: form.category_id,
            material_type_id: form.material_type_id || undefined,
            code_spec_key: form.code_spec_key || undefined,
            mat_name_th: form.mat_name_th,
            mat_name_en: form.mat_name_en,
            spec: form.spec,
            brand: form.brand,
            model: form.model,
            base_uom: form.base_uom,
            base_uom_id: form.base_uom_id,
            limit: 5,
          }),
          signal: controller.signal,
        })
        const json = await res.json()
        if (!res.ok) {
          if (active) setDuplicateCheckError(json.error ?? 'ตรวจวัสดุซ้ำไม่สำเร็จ')
          return
        }
        if (active) setDuplicateWarnings(json.data ?? [])
      } catch (err) {
        if (active && (err as Error).name !== 'AbortError') {
          setDuplicateCheckError((err as Error).message)
        }
      } finally {
        if (active) setDuplicateCheckLoading(false)
      }
    }, 600)

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    form.base_uom,
    form.base_uom_id,
    form.brand,
    form.cat_id,
    form.category_id,
    form.code_spec_key,
    form.material_type_id,
    form.mat_name_en,
    form.mat_name_th,
    form.model,
    form.spec,
    isCreate,
  ])

  function handleCategoryChange(catId: string) {
    const category = categories.find((item) => item.cat_id === catId)
    setTypeTouched(false)
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
    }))
    setFieldErrors((e) => ({ ...e, spec: '' }))
  }

  function handleMaterialTypeChange(value: string) {
    setTypeTouched(true)
    set('material_type_id', value)
  }

  function applyMaterialTypeSuggestion() {
    if (!suggestedType) return

    setTypeTouched(true)
    set('material_type_id', suggestedType.id)
  }

  function handleSpecKeyChange(value: string) {
    setSpecKeyTouched(true)
    set('code_spec_key', sanitizeOptionalCodePart(value, 12))
  }

  function applySpecKeySuggestion() {
    setSpecKeyTouched(true)
    set('code_spec_key', specKeySuggestion || 'GEN')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (codeAffectingChanged && !form.material_type_id) {
      setFieldErrors({ material_type_id: 'กรุณาเลือกชนิดวัสดุก่อนสร้างรหัสใหม่' })
      return
    }
    if (codeAffectingChanged && !String(form.code_change_reason ?? '').trim()) {
      setFieldErrors({ code_change_reason: 'กรุณาใส่เหตุผลเพื่อสร้างรหัสใหม่' })
      return
    }

    const parsed = (isCreate ? createMaterialSchema : updateMaterialSchema).safeParse(form)
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
      const url = isCreate
        ? '/api/materials'
        : `/api/materials/${getMaterialRouteId(material!)}`

      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'เกิดข้อผิดพลาด')
        return
      }

      const id = isCreate
        ? (json.data?.material_id ?? json.data?.id)
        : getMaterialRouteId(material!)
      const target = routes.materials.detail(id)

      if (!target) {
        setError('ไม่สามารถเปิดหน้าถัดไปได้ เนื่องจากไม่พบรหัสรายการ')
        return
      }

      router.push(target)
    } catch (err) {
      setError((err as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="app-form space-y-6 p-5 sm:p-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label={isCreate || codeAffectingChanged ? 'ตัวอย่างรหัสวัสดุ' : 'รหัสวัสดุ'} error={fieldErrors.material_code}>
          <input
            type="text"
            value={isCreate || codeAffectingChanged ? codePreview : form.material_code ?? ''}
            placeholder="เช่น STR-260410-0001"
            readOnly
            className={`${inputCls(!!fieldErrors.material_code)} bg-slate-50 font-mono text-slate-600`}
          />
          <p className="mt-1 text-xs text-slate-400">
            {isCreate
              ? 'ตัวอย่างเท่านั้น รหัสจริงจะถูกสร้างตอนบันทึก และจะถูกล็อกหลังสร้าง'
              : codeAffectingChanged
              ? 'ตัวอย่างเท่านั้น รหัสจริงจะถูกสร้างใหม่ตอนบันทึกพร้อมเหตุผล'
              : 'รหัสวัสดุอ่านอย่างเดียวในหน้าแก้ไขปกติ'}
          </p>
          {!isCreate && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
              <p className="font-semibold">รหัสวัสดุถูกล็อกหลังจากสร้างแล้ว</p>
              <p className="mt-1">
                รหัสนี้ใช้เชื่อมข้อมูลกับ BOM / BOQ การเปลี่ยนรหัสต้องมีเหตุผล
                ระบบต้องเก็บประวัติรหัสเดิม และรหัสเดิมต้องค้นหาเจอผ่าน Alias ตาม workflow เดิม
              </p>
              <p className="mt-2 text-[11px] text-amber-800">
                ถ้าต้องแก้หมวดหมู่ / ชนิดวัสดุ / Spec key ให้แก้ในฟอร์มนี้ แล้วใส่เหตุผลด้านล่าง ระบบจะสร้างรหัสใหม่ตอนกดบันทึก
              </p>
            </div>
          )}
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

        <Field label="ชนิดวัสดุ" error={fieldErrors.material_type_id}>
          <select
            value={form.material_type_id ?? ''}
            onChange={(e) => handleMaterialTypeChange(e.target.value)}
            className={inputCls(!!fieldErrors.material_type_id)}
            disabled={!form.cat_id}
          >
            <option value="">
              {form.cat_id ? 'GEN — ทั่วไป / ไม่ระบุชนิด' : '- เลือกหมวดหมู่ก่อน -'}
            </option>
            {availableTypes.map((type) => (
              <option key={type.id} value={type.id}>
                [{type.code_prefix}] {type.name}
              </option>
            ))}
          </select>
          {selectedCategory && availableTypes.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              ยังไม่มีชนิดวัสดุในหมวดนี้ ระบบจะเดา Type จากชื่ออังกฤษ ถ้าเดาไม่ได้จะใช้ GEN
            </p>
          )}
          {selectedCategory && availableTypes.length > 0 && !form.material_type_id && (
            <p className="mt-1 text-xs text-slate-400">
              ไม่เลือกได้ ระบบจะเดา Type จากชื่ออังกฤษ เช่น Thinner = THN
            </p>
          )}
          {isCreate && suggestedType && form.material_type_id === suggestedType.id && !typeTouched && (
            <p className="mt-1 text-xs text-emerald-600">
              ระบบเลือกชนิดวัสดุ [{suggestedType.code_prefix}] {suggestedType.name} ให้อัตโนมัติจากชื่อ/สเปก
            </p>
          )}
          {isCreate && suggestedType && form.material_type_id !== suggestedType.id && (
            <p className="mt-1 text-xs text-blue-600">
              ระบบแนะนำ [{suggestedType.code_prefix}] {suggestedType.name}{' '}
              <button type="button" onClick={applyMaterialTypeSuggestion} className="font-semibold underline">
                ใช้ชนิดนี้
              </button>
            </p>
          )}
        </Field>

        <Field label="Spec key ของรหัส" error={fieldErrors.code_spec_key}>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.code_spec_key ?? ''}
              onChange={(e) => handleSpecKeyChange(e.target.value)}
              placeholder="ปล่อยว่างได้ เช่น 006, 030W, W1000"
              className={`${inputCls(!!fieldErrors.code_spec_key)} font-mono`}
            />
            <button
              type="button"
              onClick={applySpecKeySuggestion}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              เดาจากสเปก
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {form.code_spec_key
              ? `ใช้ Spec key ${form.code_spec_key}`
              : 'ถ้าไม่ใส่ ระบบจะเดาจากสเปก/ชื่อสินค้า และถ้าเดาไม่ได้จะใช้ GEN ตอนบันทึก'}
            {' '}หมวดหมู่ {selectedCategory?.code_prefix ?? selectedCategory?.cat_code ?? '-'} / Type {selectedType?.code_prefix ?? inferredTypePrefix}
          </p>
          {specKeySuggestion && form.code_spec_key !== specKeySuggestion && (
            <p className="mt-1 text-xs text-blue-600">
              ระบบแนะนำ: <button type="button" onClick={applySpecKeySuggestion} className="font-mono font-semibold underline">{specKeySuggestion}</button>
            </p>
          )}
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

      {isCreate && (
        <DuplicateWarningPanel
          warnings={duplicateWarnings}
          loading={duplicateCheckLoading}
          error={duplicateCheckError}
        />
      )}

      {!isCreate && codeAffectingChanged && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-blue-950">บันทึกพร้อมสร้างรหัสใหม่</h3>
              <p className="mt-1 text-xs leading-5 text-blue-800">
                คุณเปลี่ยนหมวดหมู่ / ชนิดวัสดุ / Spec key ซึ่งเป็นส่วนของรหัสวัสดุ ระบบจะสร้างรหัสใหม่ เก็บประวัติ และเก็บรหัสเดิมเป็น Alias ให้ค้นหาเจอ
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-800">
              {codePreview || 'กำลังดูตัวอย่างรหัส'}
            </span>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-blue-950">เหตุผลที่ต้องเปลี่ยนรหัส *</span>
            <textarea
              value={form.code_change_reason ?? ''}
              onChange={(e) => set('code_change_reason', e.target.value)}
              rows={2}
              className={inputCls(!!fieldErrors.code_change_reason)}
              placeholder="เช่น แก้ชนิดจาก GEN เป็น PAINT เพราะเป็นสีน้ำกึ่งเงา R2060"
            />
            {fieldErrors.code_change_reason && <p className="mt-1 text-xs text-red-600">{fieldErrors.code_change_reason}</p>}
          </label>
        </section>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white
                     hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? 'กำลังบันทึก...' : isCreate ? 'สร้างวัสดุ' : codeAffectingChanged ? 'บันทึกและสร้างรหัสใหม่' : 'บันทึกการเปลี่ยนแปลง'}
        </button>
        <button
          type="button"
          onClick={() => {
            const target = isCreate ? routes.materials.list() : routes.materials.detail(materialRouteId)
            router.push(target ?? routes.materials.list())
          }}
          className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}

function DuplicateWarningPanel({
  warnings,
  loading,
  error,
}: {
  warnings: DuplicateWarning[]
  loading: boolean
  error: string
}) {
  if (loading && warnings.length === 0) {
    return (
      <section className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-500">
        กำลังตรวจวัสดุใกล้เคียง...
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ตรวจวัสดุซ้ำไม่สำเร็จ: {error}
      </section>
    )
  }

  if (warnings.length === 0) return null

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-amber-950">พบวัสดุที่อาจใกล้เคียงกัน</h3>
          <p className="mt-1 text-xs text-amber-800">
            ตรวจรายการเดิมก่อนบันทึก วัสดุชื่อเหมือนแต่สเปกต่างกันอาจไม่ใช่ตัวซ้ำ
          </p>
        </div>
        {loading && <span className="text-xs font-semibold text-amber-700">กำลังอัปเดต...</span>}
      </div>
      <div className="mt-3 grid gap-2">
        {warnings.map((warning) => {
          const hasSpecRisk = warning.matched_reasons.some((reason) => (
            reason.key === 'different_spec' || reason.key === 'same_name_different_spec' || reason.key === 'ambiguous_spec'
          ))

          return (
            <div key={warning.material_id} className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/materials/${warning.route_id}`} className="font-mono text-xs font-bold text-cyan-700 hover:underline">
                    {warning.material_code ?? warning.material_id}
                  </Link>
                  <p className="mt-1 font-bold text-slate-900">{warning.mat_name_th}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[
                      warning.material_type_label,
                      warning.code_spec_key ? `Spec key ${warning.code_spec_key}` : null,
                      warning.spec,
                    ].filter(Boolean).join(' / ') || '-'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                    {warning.score}/100
                  </span>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                    hasSpecRisk ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
                  }`}>
                    {hasSpecRisk ? 'ชื่อ/หมวดใกล้ แต่สเปกต่าง' : warning.confidence_level === 'HIGH' ? 'น่าจะซ้ำจริง' : 'ตรวจสอบก่อน'}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-600">{warning.recommended_action}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {warning.matched_reasons.slice(0, 4).map((reason) => (
                  <span
                    key={`${warning.material_id}-${reason.key}-${reason.detail ?? ''}`}
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      reason.points < 0
                        ? 'bg-red-50 text-red-700'
                        : reason.points === 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {reason.label}{reason.detail ? `: ${reason.detail}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
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

function sanitizeOptionalCodePart(value: string, maxLength: number) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength)
}
