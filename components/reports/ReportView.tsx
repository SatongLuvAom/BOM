'use client'

import Link from 'next/link'
import { formatThaiDateShort } from '@/lib/utils'

interface ProjectRow {
  project_id:   string
  project_name: string
  client_name:  string | null
  status:       string
  project_date: string
  item_count:   number
  total_value:  number
}

interface MaterialRow {
  material_id: string
  item_name:   string
  uom:         string
  count:       number
  total_qty:   number
  total_value: number
}

interface CustomerRow {
  name:          string
  project_count: number
  total_value:   number
}

interface MonthlyRow {
  month: string
  total: number
}

interface Props {
  projectSummary: ProjectRow[]
  topMaterials:   MaterialRow[]
  byType:         Record<string, number>
  topCustomers:   CustomerRow[]
  monthlyRevenue: MonthlyRow[]
  totals: {
    project_count:   number
    total_value:     number
    confirmed_value: number
  }
}

const TYPE_LABEL: Record<string, string> = {
  MAT: 'วัสดุ', LABOR: 'แรงงาน', SERVICE: 'บริการ', MISC: 'อื่นๆ',
}
const TYPE_COLOR: Record<string, string> = {
  MAT: 'bg-blue-500', LABOR: 'bg-amber-500', SERVICE: 'bg-violet-500', MISC: 'bg-gray-400',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'text-blue-600 bg-blue-50', CONFIRMED: 'text-emerald-700 bg-emerald-50', CANCELLED: 'text-red-600 bg-red-50',
}

function thb(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function MonthlyBar({ data }: { data: MonthlyRow[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">ยังไม่มีข้อมูล</p>
  const max = Math.max(...data.map((d) => d.total), 1)
  return (
    <div className="flex items-end gap-1.5 h-32 mt-2">
      {data.map((d) => {
        const pct = (d.total / max) * 100
        const label = d.month.slice(0, 7)
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="w-full relative">
              <div
                className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-600"
                style={{ height: `${Math.max(pct * 1.2, 4)}px` }}
                title={`${thb(d.total)} บาท`}
              />
            </div>
            <p className="text-[9px] text-gray-400 rotate-45 origin-top-left ml-1 whitespace-nowrap">
              {label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function ReportView({ projectSummary, topMaterials, byType, topCustomers, monthlyRevenue, totals }: Props) {
  const typeTotal = Object.values(byType).reduce((s, v) => s + v, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">โปรเจกต์ทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totals.project_count}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">มูลค่ารวมทั้งหมด</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{thb(totals.total_value)}</p>
          <p className="text-xs text-gray-400">THB</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs text-emerald-600">ยืนยันแล้ว</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{thb(totals.confirmed_value)}</p>
          <p className="text-xs text-emerald-500">THB</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">อัตราปิด</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {totals.total_value > 0 ? ((totals.confirmed_value / totals.total_value) * 100).toFixed(0) : 0}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">มูลค่า BOQ รายเดือน (12 เดือนล่าสุด)</h3>
          <MonthlyBar data={monthlyRevenue} />
        </div>

        {/* Cost by type */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">สัดส่วนต้นทุน</h3>
          <div className="space-y-2.5">
            {Object.entries(byType).map(([type, val]) => {
              const pct = typeTotal > 0 ? (val / typeTotal) * 100 : 0
              return (
                <div key={type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700">{TYPE_LABEL[type]}</span>
                    <span className="font-mono text-gray-500">{thb(val)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-2 rounded-full ${TYPE_COLOR[type]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">{pct.toFixed(1)}%</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-800">ลูกค้า (มูลค่าสูงสุด)</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-2 font-medium text-gray-500">ลูกค้า</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">โปรเจกต์</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">มูลค่า (THB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topCustomers.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-xs">ยังไม่มีข้อมูล</td></tr>
              ) : topCustomers.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{c.project_count}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{thb(c.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top materials */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-800">วัสดุที่ใช้บ่อย (มูลค่าสูงสุด)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-3 py-2 font-medium text-gray-500">วัสดุ</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">ครั้ง</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">มูลค่า (THB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topMaterials.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-xs">ยังไม่มีข้อมูล</td></tr>
                ) : topMaterials.slice(0, 10).map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 max-w-[180px]">
                      <p className="font-medium text-gray-900 truncate">{m.item_name}</p>
                      <p className="text-[10px] font-mono text-gray-400">{m.material_id}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.count}</td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-700">{thb(m.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Project ranking table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">โปรเจกต์ทั้งหมด (เรียงตามมูลค่า)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-2 font-medium text-gray-500">#</th>
                <th className="px-4 py-2 font-medium text-gray-500">โปรเจกต์</th>
                <th className="px-4 py-2 font-medium text-gray-500">ลูกค้า</th>
                <th className="px-4 py-2 font-medium text-gray-500">วันที่</th>
                <th className="px-4 py-2 font-medium text-gray-500">สถานะ</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">รายการ</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">มูลค่า (THB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projectSummary.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">ยังไม่มีโปรเจกต์</td></tr>
              ) : projectSummary.map((p, i) => (
                <tr key={p.project_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/boq/${p.project_id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                      {p.project_name}
                    </Link>
                    <p className="text-xs font-mono text-gray-400">{p.project_id}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{p.client_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {formatThaiDateShort(p.project_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? 'text-gray-500 bg-gray-100'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{p.item_count}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{thb(p.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
