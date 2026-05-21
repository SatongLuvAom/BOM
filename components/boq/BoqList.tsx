'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { formatThaiDateShort } from '@/lib/utils'
import type { BoqProject, BoqStatus } from '@/types/boq'

const STATUS_OPTIONS: { value: BoqStatus | ''; label: string }[] = [
  { value: '',            label: 'ทุกสถานะ' },
  { value: 'DRAFT',      label: 'Draft' },
  { value: 'CONFIRMED',  label: 'ยืนยันแล้ว' },
  { value: 'CANCELLED',  label: 'ยกเลิก' },
]

function statusBadge(status: BoqStatus) {
  const map: Record<BoqStatus, { label: string; color: 'blue' | 'green' | 'red' | 'gray' }> = {
    DRAFT:     { label: 'Draft',      color: 'blue' },
    CONFIRMED: { label: 'ยืนยันแล้ว', color: 'green' },
    CANCELLED: { label: 'ยกเลิก',    color: 'red' },
  }
  return map[status] ?? { label: status, color: 'gray' }
}

export function BoqList({ projects }: { projects: BoqProject[] }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [deleting, setDeleting] = useState<string | null>(null)

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleDelete(p: BoqProject) {
    if (!confirm(`ลบโปรเจกต์ "${p.project_name}" ?\nรายการ BOQ ทั้งหมดจะถูกลบด้วย`)) return
    setDeleting(p.project_id)
    try {
      const res = await fetch(`/api/boq/${p.project_id}`, { method: 'DELETE' })
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

  return (
    <div>
      {/* Filter */}
      <div className="ops-toolbar">
        <select
          value={searchParams.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
          className="ops-select"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Project ID</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ชื่อโปรเจกต์</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ลูกค้า</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">สถานที่</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">วันที่</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">สถานะ</th>
              <th className="px-3 py-3 w-28" />
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center">
                  <p className="text-gray-400 text-sm">ยังไม่มีโปรเจกต์ BOQ</p>
                  <p className="mt-1 text-gray-300 text-xs">กด "+ สร้าง BOQ" เพื่อเริ่มต้น</p>
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const { label, color } = statusBadge(p.status)
              return (
                <tr key={p.project_id} className="group">
                  <td className="px-3 py-3">
                    <Link
                      href={`/boq/${p.project_id}`}
                      className="font-mono text-xs font-semibold text-cyan-700 hover:underline"
                    >
                      {p.project_id}
                    </Link>
                  </td>
                  <td className="max-w-[240px] font-semibold text-slate-950">
                    <p className="truncate">{p.project_name}</p>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500">{p.client_name ?? <span className="text-gray-300">—</span>}</td>
                  <td className="max-w-[170px] text-sm text-slate-500">
                    <p className="truncate">{p.site_address ?? <span className="text-gray-300">—</span>}</p>
                  </td>
                  <td className="whitespace-nowrap text-sm text-slate-500">
                    {formatThaiDateShort(p.project_date)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge label={label} color={color} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* View */}
                      <Link href={`/boq/${p.project_id}`} title="ดูรายละเอียด"
                        className="ops-icon-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </Link>
                      {/* Edit */}
                      <Link href={`/boq/${p.project_id}/edit`} title="แก้ไข"
                        className="ops-icon-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </Link>
                      {/* Print */}
                      <Link href={`/boq/${p.project_id}/print`} target="_blank" title="พิมพ์"
                        className="ops-icon-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                      </Link>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        disabled={deleting === p.project_id}
                        title="ลบ"
                        className="ops-icon-btn hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        {deleting === p.project_id ? <span className="text-xs">...</span> : (
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
