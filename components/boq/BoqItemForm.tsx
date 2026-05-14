'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { MaterialPicker, type PickedMaterial } from '@/components/boq/MaterialPicker'
import type { BoqItem, BoqItemType, CreateBoqItemPayload } from '@/types/boq'

const TYPE_OPTIONS: { value: BoqItemType; label: string }[] = [
  { value: 'MAT',     label: '📦 วัสดุ (MAT)' },
  { value: 'LABOR',   label: '👷 แรงงาน (LABOR)' },
  { value: 'SERVICE', label: '🔧 บริการ (SERVICE)' },
  { value: 'MISC',    label: '📌 อื่นๆ (MISC)' },
  { value: 'SECTION', label: '📁 หัวข้อกลุ่ม (SECTION)' },
]

interface Props {
  projectId: string
  item?:     BoqItem        // if editing
  open:      boolean
  onClose:   () => void
  onSaved:   () => void
}

const EMPTY = {
  item_type:     'MAT' as BoqItemType,
  material_id:   '' as string,
  item_name:     '',
  spec:          '',
  uom:           '',
  qty:           1,
  waste_pct:     0,
  unit_price:    0,
  currency_code: 'THB',
  note:          '',
}

export function BoqItemForm({ projectId, item, open, onClose, onSaved }: Props) {
  const isEdit = !!item

  const [form, setForm] = useState({ ...EMPTY })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return
    if (item) {
      setForm({
        item_type:     item.item_type,
        material_id:   item.material_id ?? '',
        item_name:     item.item_name,
        spec:          item.spec ?? '',
        uom:           item.uom,
        qty:           item.qty,
        waste_pct:     item.waste_pct,
        unit_price:    item.unit_price,
        currency_code: item.currency_code,
        note:          item.note ?? '',
      })
    } else {
      setForm({ ...EMPTY })
    }
    setError('')
  }, [open, item])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target
    setForm((f) => ({
      ...f,
      [name]: type === 'number' ? (value === '' ? 0 : parseFloat(value)) : value,
    }))
  }

  function handlePick(picked: PickedMaterial) {
    setForm((f) => ({
      ...f,
      material_id:   picked.material_id,
      item_name:     picked.item_name,
      uom:           picked.uom,
      unit_price:    picked.unit_price,
      currency_code: picked.currency_code,
    }))
  }

  // Client-side preview
  const finalQty   = form.qty * (1 + form.waste_pct / 100)
  const totalPrice = finalQty * form.unit_price

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const isSection = form.item_type === 'SECTION'
    const payload: CreateBoqItemPayload = {
      item_type:     form.item_type,
      material_id:   form.item_type === 'MAT' ? (form.material_id || null) : null,
      item_name:     form.item_name.trim(),
      spec:          form.spec.trim() || undefined,
      uom:           isSection ? '—' : form.uom.trim(),
      qty:           isSection ? 0 : form.qty,
      waste_pct:     isSection ? 0 : form.waste_pct,
      unit_price:    isSection ? 0 : form.unit_price,
      currency_code: form.currency_code,
      note:          form.note.trim() || undefined,
    }

    try {
      const url    = isEdit
        ? `/api/boq/${projectId}/items/${item!.item_id}`
        : `/api/boq/${projectId}/items`
      const method = isEdit ? 'PATCH' : 'POST'

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      onSaved()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const field = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
  const lbl   = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'แก้ไขรายการ' : 'เพิ่มรายการ BOQ'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Item Type */}
        {!isEdit && (
          <div>
            <label className={lbl}>ประเภทรายการ</label>
            <select
              name="item_type"
              value={form.item_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  item_type: e.target.value as BoqItemType,
                  material_id: '',
                  item_name: '',
                  uom: '',
                  unit_price: 0,
                }))
              }
              className={field}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Material Picker (MAT only) */}
        {form.item_type === 'MAT' && (
          <div>
            <label className={lbl}>เลือกวัสดุ</label>
            <MaterialPicker onPick={handlePick} />
            {form.material_id && (
              <p className="mt-1 text-xs text-gray-400 font-mono">{form.material_id}</p>
            )}
          </div>
        )}

        {/* Item Name */}
        <div>
          <label className={lbl}>
            {form.item_type === 'SECTION' ? 'ชื่อหัวข้อ' : 'ชื่อรายการ'}{' '}
            <span className="text-red-500">*</span>
          </label>
          <input
            name="item_name"
            value={form.item_name}
            onChange={handleChange}
            required
            className={field}
            placeholder={form.item_type === 'SECTION' ? 'เช่น งานโครงสร้าง, งานไฟฟ้า' : 'ชื่อรายการ'}
          />
        </div>

        {/* Spec */}
        <div>
          <label className={lbl}>สเปก / รายละเอียด</label>
          <input name="spec" value={form.spec} onChange={handleChange} className={field} placeholder="รายละเอียดเพิ่มเติม" />
        </div>

        {/* Fields hidden for SECTION */}
        {form.item_type !== 'SECTION' && (
          <>
            {/* UOM + Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>หน่วย <span className="text-red-500">*</span></label>
                <input name="uom" value={form.uom} onChange={handleChange} required className={field} placeholder="ชิ้น / ม. / กก." />
              </div>
              <div>
                <label className={lbl}>สกุลเงิน</label>
                <select name="currency_code" value={form.currency_code} onChange={handleChange} className={field}>
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Qty + Waste + Price */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>จำนวน <span className="text-red-500">*</span></label>
                <input name="qty" type="number" min="0" step="any" value={form.qty} onChange={handleChange} required className={field} />
              </div>
              <div>
                <label className={lbl}>Waste %</label>
                <input name="waste_pct" type="number" min="0" max="100" step="any" value={form.waste_pct} onChange={handleChange} className={field} />
              </div>
              <div>
                <label className={lbl}>ราคา/หน่วย <span className="text-red-500">*</span></label>
                <input name="unit_price" type="number" min="0" step="any" value={form.unit_price} onChange={handleChange} required className={field} />
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>จำนวนสุทธิ:</span>
                <span className="font-medium">{finalQty.toLocaleString('th-TH', { maximumFractionDigits: 4 })} {form.uom}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">รวมทั้งสิ้น:</span>
                <span className="font-bold text-blue-700 text-base">
                  {totalPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {form.currency_code}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Note */}
        <div>
          <label className={lbl}>หมายเหตุ</label>
          <input name="note" value={form.note} onChange={handleChange} className={field} placeholder="หมายเหตุ (ถ้ามี)" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'เพิ่มรายการ'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </Modal>
  )
}
