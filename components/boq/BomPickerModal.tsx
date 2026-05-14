'use client'

import { useState, useEffect } from 'react'
import type { BomTemplate } from '@/types/bom'

interface Props {
  projectId: string
  onClose:   () => void
  onAdded:   () => void
}

const CATEGORIES = ['ผนัง', 'พื้น', 'เพดาน', 'เคาน์เตอร์/เฟอร์นิเจอร์', 'แสงไฟ', 'งานระบบ', 'อื่นๆ']

export function BomPickerModal({ projectId, onClose, onAdded }: Props) {
  const [boms,     setBoms]     = useState<BomTemplate[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<BomTemplate | null>(null)
  const [qty,      setQty]      = useState('1')
  const [catFilter,setCatFilter]= useState('')
  const [adding,   setAdding]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    fetch('/api/bom-templates')
      .then((r) => r.json())
      .then((j) => setBoms(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = catFilter ? boms.filter((b) => b.bom_category === catFilter) : boms

  async function handleAdd() {
    if (!selected) return
    const qtyNum = parseFloat(qty)
    if (!qtyNum || qtyNum <= 0) { setError('กรุณาระบุจำนวนที่ถูกต้อง'); return }

    setAdding(true)
    setError('')
    try {
      const res  = await fetch(`/api/boq/${projectId}/items/from-bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bom_id: selected.bom_id, qty: qtyNum }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      onAdded()
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const explodedItems = selected?.items?.sort((a, b) => a.seq - b.seq).map((it) => ({
    ...it,
    calculated_qty: (Number(it.qty_per_unit) * (parseFloat(qty) || 0) * (1 + Number(it.waste_pct) / 100)),
  })) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">🧩 เพิ่มจาก BOM</h2>
            <p className="text-xs text-gray-400 mt-0.5">เลือกสูตรงาน → ระบุจำนวน → ระบบเพิ่มรายการให้อัตโนมัติ</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left — BOM list */}
          <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
              >
                <option value="">ทุกหมวด</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <p className="px-4 py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>}
              {!loading && filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-400">ไม่มี BOM</p>
              )}
              {filtered.map((bom) => (
                <button
                  key={bom.bom_id}
                  onClick={() => { setSelected(bom); setError('') }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                    selected?.bom_id === bom.bom_id
                      ? 'bg-blue-50 border-l-2 border-l-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{bom.bom_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {bom.bom_category && <span className="mr-1">{bom.bom_category} ·</span>}
                    ต่อ 1 {bom.unit} · {bom.items?.length ?? 0} รายการ
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right — Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-gray-300">
                <p className="text-sm">← เลือก BOM จากรายการ</p>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Qty input */}
                <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-3 shrink-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selected.bom_name}</p>
                    {selected.description && <p className="text-xs text-gray-400">{selected.description}</p>}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">จำนวน ({selected.unit})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-right focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Exploded preview */}
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-gray-50/95">
                      <tr className="border-b border-gray-100">
                        <th className="px-4 py-2 text-left text-xs text-gray-400">รายการ</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">ประเภท</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">qty/หน่วย</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400 font-semibold text-blue-500">รวม qty</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {explodedItems.map((it, i) => (
                        <tr key={i} className="hover:bg-blue-50/20">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{it.item_name}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">
                            {{ MAT: 'วัสดุ', LABOR: 'แรงงาน', SERVICE: 'บริการ', MISC: 'อื่นๆ' }[it.item_type]}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500 font-mono text-xs">{Number(it.qty_per_unit).toLocaleString('th-TH', { maximumFractionDigits: 4 })}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-blue-700 font-mono">
                            {it.calculated_qty.toLocaleString('th-TH', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{it.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 shrink-0">
          {error ? <p className="text-sm text-red-500">{error}</p> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button
              onClick={handleAdd}
              disabled={!selected || adding}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? 'กำลังเพิ่ม...' : `เพิ่ม ${explodedItems.length} รายการ`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
