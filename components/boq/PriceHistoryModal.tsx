'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'

interface PriceRecord {
  effective_date: string
  unit_price:     number
  currency_code:  string
  price_uom:      string
  supplier: { supplier_code: string; supplier_name_th: string } | null
  uom:      { uom_code: string; uom_name_th: string } | null
}

interface Props {
  materialId:   string
  materialName: string
  open:         boolean
  onClose:      () => void
}

export function PriceHistoryModal({ materialId, materialName, open, onClose }: Props) {
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !materialId) return
    setLoading(true)
    fetch(`/api/materials/${materialId}/price-history`)
      .then((r) => r.json())
      .then((j) => setRecords(j.data ?? []))
      .finally(() => setLoading(false))
  }, [open, materialId])

  return (
    <Modal open={open} onClose={onClose} title={`ประวัติราคา — ${materialName}`}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">ไม่มีประวัติราคา</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-3 py-2 font-medium text-gray-500">วันที่มีผล</th>
                <th className="px-3 py-2 font-medium text-gray-500">Supplier</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">ราคา</th>
                <th className="px-3 py-2 font-medium text-gray-500">หน่วย</th>
                <th className="px-3 py-2 font-medium text-gray-500">สกุลเงิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r, i) => {
                const isLatest  = i === 0
                const prevPrice = i < records.length - 1 ? records[i + 1].unit_price : null
                const diff      = prevPrice !== null ? r.unit_price - prevPrice : null
                const diffPct   = prevPrice ? ((diff! / prevPrice) * 100).toFixed(1) : null
                return (
                  <tr key={i} className={isLatest ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.effective_date}
                      {isLatest && (
                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                          ล่าสุด
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {r.supplier ? (
                        <span>
                          <span className="font-mono text-xs text-gray-400">{r.supplier.supplier_code} </span>
                          {r.supplier.supplier_name_th}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-semibold text-gray-900">
                        {r.unit_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                      {diff !== null && (
                        <span className={`ml-1.5 text-xs ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {diff > 0 ? `+${diffPct}%` : diff < 0 ? `${diffPct}%` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {r.uom?.uom_name_th ?? r.price_uom}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{r.currency_code}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
