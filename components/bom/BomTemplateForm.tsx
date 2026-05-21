'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BomTemplate, BomItemType } from '@/types/bom'
import { routes } from '@/lib/routes'

const CATEGORIES = ['ผนัง', 'พื้น', 'เพดาน', 'เคาน์เตอร์/เฟอร์นิเจอร์', 'แสงไฟ', 'งานระบบ', 'อื่นๆ']
const UNITS      = ['ตรม.', 'ตัว', 'เมตร', 'ชุด', 'จุด', 'ชิ้น', 'ม.']
const TYPE_LABELS: Record<BomItemType, string> = {
  MAT: 'วัสดุ', LABOR: 'แรงงาน', SERVICE: 'บริการ', MISC: 'อื่นๆ',
}

interface ItemRow {
  _key:         string
  seq:          number
  item_type:    BomItemType
  material_id:  string
  item_name:    string
  uom:          string
  qty_per_unit: string
  waste_pct:    string
  note:         string
}

function emptyRow(seq: number): ItemRow {
  return {
    _key: `row-${seq}`,
    seq,
    item_type:    'MAT',
    material_id:  '',
    item_name:    '',
    uom:          'ตรม.',
    qty_per_unit: '1',
    waste_pct:    '0',
    note:         '',
  }
}

interface Props {
  mode:  'create' | 'edit'
  bom?:  BomTemplate
}

export function BomTemplateForm({ mode, bom }: Props) {
  const router  = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [name,     setName]     = useState(bom?.bom_name     ?? '')
  const [category, setCategory] = useState(bom?.bom_category ?? '')
  const [unit,     setUnit]     = useState(bom?.unit         ?? 'ตรม.')
  const [desc,     setDesc]     = useState(bom?.description  ?? '')

  const [rows, setRows] = useState<ItemRow[]>(() => {
    if (bom?.items && bom.items.length > 0) {
      return bom.items
        .sort((a, b) => a.seq - b.seq)
        .map((it, i) => ({
          _key:         `init-${i}`,
          seq:          it.seq,
          item_type:    it.item_type,
          material_id:  it.material_id ?? '',
          item_name:    it.item_name,
          uom:          it.uom,
          qty_per_unit: String(it.qty_per_unit),
          waste_pct:    String(it.waste_pct),
          note:         it.note ?? '',
        }))
    }
    return [emptyRow(0)]
  })

  function updateRow<K extends keyof ItemRow>(idx: number, key: K, val: ItemRow[K]) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('กรุณาระบุชื่อ BOM'); return }
    if (!unit.trim()) { setError('กรุณาระบุหน่วย'); return }

    const validRows = rows.filter((r) => r.item_name.trim())
    if (validRows.length === 0) { setError('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ'); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        bom_name:     name.trim(),
        bom_category: category || null,
        unit:         unit.trim(),
        description:  desc.trim() || null,
        items: validRows.map((r, i) => ({
          seq:          i,
          item_type:    r.item_type,
          material_id:  r.material_id || null,
          item_name:    r.item_name.trim(),
          uom:          r.uom.trim(),
          qty_per_unit: parseFloat(r.qty_per_unit) || 1,
          waste_pct:    parseFloat(r.waste_pct) || 0,
          note:         r.note.trim() || null,
        })),
      }

      const url    = mode === 'create' ? '/api/bom-templates' : `/api/bom-templates/${bom!.bom_id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }

      const target = routes.bom.detail(mode === 'create' ? json.data?.bom_id : bom!.bom_id)
      if (!target) {
        setError('ไม่สามารถเปิดหน้าถัดไปได้ เนื่องจากไม่พบรหัสรายการ')
        return
      }
      router.push(target)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">ข้อมูล BOM</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">ชื่องาน / Work Package *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ผนัง MDF, เคาน์เตอร์รับแขก" className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">หมวดหมู่</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              <option value="">— ไม่ระบุ —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">หน่วยของ BOM *</label>
            <div className="flex gap-2">
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="หน่วย" className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">หมายเหตุ</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียดเพิ่มเติม" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700">รายการวัสดุ / แรงงาน <span className="text-xs text-gray-400 font-normal">(ต่อ 1 {unit || 'หน่วย'})</span></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-3 py-2 text-left text-xs text-gray-400 w-24">ประเภท</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400">ชื่อรายการ *</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400 w-20">หน่วย</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400 w-24">จำนวน/หน่วย *</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400 w-20">Waste%</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400">หมายเหตุ</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, idx) => (
                <tr key={row._key} className="hover:bg-gray-50/50">
                  <td className="px-2 py-2">
                    <select
                      value={row.item_type}
                      onChange={(e) => updateRow(idx, 'item_type', e.target.value as BomItemType)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    >
                      {(Object.keys(TYPE_LABELS) as BomItemType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.item_name}
                      onChange={(e) => updateRow(idx, 'item_name', e.target.value)}
                      placeholder="ชื่อวัสดุหรืองาน"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.uom}
                      onChange={(e) => updateRow(idx, 'uom', e.target.value)}
                      placeholder="ตรม."
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.qty_per_unit}
                      onChange={(e) => updateRow(idx, 'qty_per_unit', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-right focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={row.waste_pct}
                      onChange={(e) => updateRow(idx, 'waste_pct', e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-right focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.note}
                      onChange={(e) => updateRow(idx, 'note', e.target.value)}
                      placeholder="หมายเหตุ"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                      title="ลบแถว"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            + เพิ่มรายการ
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : mode === 'create' ? 'สร้าง BOM' : 'บันทึกการแก้ไข'}
        </button>
        <button
          type="button"
          onClick={() => {
            const target = mode === 'create' ? routes.bom.list() : routes.bom.detail(bom?.bom_id)
            router.push(target ?? routes.bom.list())
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}
