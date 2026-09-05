'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import type { BomTemplate } from '@/types/bom'

const CATEGORY_COLORS: Record<string, 'blue' | 'green' | 'yellow' | 'orange' | 'gray'> = {
  ผนัง:              'blue',
  พื้น:              'green',
  เพดาน:             'yellow',
  'เคาน์เตอร์/เฟอร์นิเจอร์': 'orange',
  แสงไฟ:             'yellow',
  งานระบบ:           'gray',
}

export function BomList({ boms }: { boms: BomTemplate[] }) {
  const router   = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(bom: BomTemplate) {
    if (!confirm(`ลบ BOM "${bom.bom_name}" ?\nรายการย่อยทั้งหมดจะถูกลบด้วย`)) return
    setDeleting(bom.bom_id)
    try {
      const res = await fetch(`/api/bom-templates/${bom.bom_id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error ?? 'Delete failed')
        return
      }
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  if (boms.length === 0) {
    return (
      <div className="app-surface px-6 py-16 text-center">
        <p className="text-gray-400 text-sm">ยังไม่มี BOM</p>
        <p className="mt-1 text-gray-300 text-xs">กด "+ สร้าง BOM" เพื่อเพิ่มสูตรงาน</p>
      </div>
    )
  }

  // Group by category
  const grouped = boms.reduce<Record<string, BomTemplate[]>>((acc, b) => {
    const key = b.bom_category ?? 'อื่นๆ'
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-3 px-1 text-sm font-semibold text-slate-600">{category}</h3>
          <div className="app-surface overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">BOM ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">ชื่องาน</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">หน่วย</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">รายการ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">หมายเหตุ</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((bom) => (
                  <tr key={bom.bom_id} className="group hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{bom.bom_id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{bom.bom_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={bom.unit} color={CATEGORY_COLORS[bom.bom_category ?? ''] ?? 'gray'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(bom.items?.length ?? 0)} รายการ
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px]">
                      <p className="truncate">{bom.description ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/bom/${bom.bom_id}`}
                          title="ดูรายละเอียด"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Link>
                        <Link
                          href={`/bom/${bom.bom_id}/edit`}
                          title="แก้ไข"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(bom)}
                          disabled={deleting === bom.bom_id}
                          title="ลบ"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        >
                          {deleting === bom.bom_id ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
