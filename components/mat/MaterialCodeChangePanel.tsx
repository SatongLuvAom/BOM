'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatMaster, MaterialType } from '@/types/mat'
import { inferSpecKeyFromText, sanitizeSpecKey } from '@/lib/material-code'

interface MaterialCodeChangePanelProps {
  material: MatMaster
  materialTypes: MaterialType[]
}

export function MaterialCodeChangePanel({ material, materialTypes }: MaterialCodeChangePanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [materialTypeId, setMaterialTypeId] = useState(material.material_type_id ?? '')
  const [specKey, setSpecKey] = useState(material.code_spec_key ?? inferSpecKeyFromText(material.spec))
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const availableTypes = useMemo(() => {
    const sameCategoryTypes = material.category_id
      ? materialTypes.filter((type) => type.category_id === material.category_id)
      : materialTypes

    return sameCategoryTypes.length > 0 ? sameCategoryTypes : materialTypes
  }, [material.category_id, materialTypes])

  const currentType = materialTypes.find((type) => type.id === material.material_type_id) ?? null
  const selectedType = materialTypes.find((type) => type.id === materialTypeId) ?? null

  async function loadPreview(nextTypeId = materialTypeId, nextSpecKey = specKey) {
    if (!nextTypeId) {
      setPreview('')
      return
    }

    setPreviewLoading(true)
    setPreviewError('')
    try {
      const res = await fetch('/api/material-code/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cat_id: material.cat_id,
          category_id: material.category_id ?? undefined,
          material_type_id: nextTypeId,
          spec_key: nextSpecKey,
          mat_name_th: material.mat_name_th,
          mat_name_en: material.mat_name_en,
          spec: material.spec,
          brand: material.brand,
          model: material.model,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPreview('')
        setPreviewError(json.error ?? 'ดูตัวอย่างรหัสไม่ได้')
        return
      }
      setPreview(json.data.preview)
    } catch {
      setPreview('')
      setPreviewError('ดูตัวอย่างรหัสไม่ได้')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function submit() {
    setError('')
    setSuccess('')
    if (!materialTypeId) {
      setError('กรุณาเลือกชนิดวัสดุก่อน')
      return
    }
    if (!reason.trim()) {
      setError('กรุณาใส่เหตุผลในการเปลี่ยนรหัส')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/material-code/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: material.material_id,
          material_type_id: materialTypeId,
          code_spec_key: specKey,
          change_reason: reason,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'เปลี่ยนรหัสวัสดุไม่สำเร็จ')
        return
      }
      const nextCode = json.data?.new_code ?? json.data?.newCode ?? ''
      setSuccess(nextCode ? `สร้างรหัสใหม่สำเร็จ: ${nextCode}` : 'สร้างรหัสใหม่สำเร็จ')
      setOpen(false)
      setReason('')
      // Intentional full refresh: code changes affect the page header, route target,
      // code history, old-code alias search, and audit summary returned by server components.
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Material Code</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{material.material_code ?? material.material_id}</p>
          <p className="mt-1 text-xs text-slate-500">
            {material.code_locked ? 'ล็อกแล้ว' : 'ยังไม่ล็อก'} / {material.code_rule_version ?? 'legacy'} / Spec key {material.code_spec_key ?? 'GEN'}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            ใช้ปุ่มนี้เมื่อรหัสวัสดุผิดหมวด/ผิดชนิด/ผิดสเปกเท่านั้น ระบบจะสร้างรหัสใหม่ เก็บประวัติ และเพิ่มรหัสเดิมเป็น Alias ให้ค้นหาเจอ
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value)
            if (!open) void loadPreview()
          }}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-50"
        >
          เปลี่ยนรหัส
        </button>
      </div>

      {success && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {success}
        </div>
      )}

      {material.code_generated_at && (
        <p className="mt-2 text-xs text-slate-400">
          สร้างล่าสุด {new Date(material.code_generated_at).toLocaleString('th-TH')}
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            <p className="font-bold">ก่อนเปลี่ยนรหัส</p>
            <p>รหัสนี้ใช้เชื่อมกับ BOM / BOQ และประวัติราคา ต้องใส่เหตุผลทุกครั้ง ระบบจะไม่ให้แก้รหัสแบบพิมพ์เองโดยตรง</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">ชนิดวัสดุ</span>
            <select
              value={materialTypeId}
              onChange={(e) => {
                setMaterialTypeId(e.target.value)
                void loadPreview(e.target.value, specKey)
              }}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">เลือกชนิดวัสดุ</option>
              {availableTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  [{type.code_prefix}] {type.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              ปัจจุบัน: {currentType ? `[${currentType.code_prefix}] ${currentType.name}` : 'ยังไม่ระบุ'} / เลือกได้เฉพาะชนิดในหมวดเดิมเพื่อกันรหัสผิดหมวด
            </p>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Spec key ของรหัส</span>
            <div className="flex gap-2">
              <input
                value={specKey}
                onChange={(e) => {
                  const next = sanitizeSpecKey(e.target.value)
                  setSpecKey(next)
                  void loadPreview(materialTypeId, next)
                }}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const next = inferSpecKeyFromText([material.spec, material.mat_name_en, material.mat_name_th, material.brand, material.model].filter(Boolean).join(' '))
                  setSpecKey(next)
                  void loadPreview(materialTypeId, next)
                }}
                className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-50"
              >
                เดาจากสเปก
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              ตัวอย่าง: 006, 030W, R2060, 40X40X2 หากไม่แน่ใจให้กดเดาจากสเปกแล้วตรวจอีกครั้ง
            </p>
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ตัวอย่างรหัสใหม่</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-900">
              {previewLoading ? 'กำลังดูตัวอย่าง...' : preview || '-'}
            </p>
            {selectedType && (
              <p className="mt-1 text-[11px] text-slate-400">
                Type {selectedType.code_prefix} / Spec {specKey || 'GEN'}
              </p>
            )}
            {previewError && <p className="mt-1 text-xs font-medium text-amber-700">{previewError}</p>}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">เหตุผลที่ต้องเปลี่ยน</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="เช่น รหัสเดิมใช้ชนิดวัสดุผิด / ต้องแยกสี R2060 ออกจากสีอื่น"
            />
          </label>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-stone-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || previewLoading}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'กำลังเปลี่ยนรหัส...' : 'ยืนยันเปลี่ยนรหัส'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
