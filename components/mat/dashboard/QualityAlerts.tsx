import Link from 'next/link'
import type { DashboardStats } from '@/app/(mat)/dashboard/page'

interface AlertCard {
  label: string
  count: number
  desc: string
  href: string
  bg: string
  border: string
  numColor: string
}

export function QualityAlerts({ stats }: { stats: DashboardStats }) {
  const alerts: AlertCard[] = [
    {
      label: 'ไม่มี Alias',
      count: stats.missing_alias,
      desc: 'วัสดุ ACTIVE ที่ไม่มีชื่อย่อ / ชื่อแบรนด์',
      href: '/materials?status=ACTIVE',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      numColor: 'text-yellow-700',
    },
    {
      label: 'ไม่มีการแปลงหน่วย',
      count: stats.missing_uom_conv,
      desc: 'วัสดุ ACTIVE ที่ไม่มี UOM Conversion',
      href: '/materials?status=ACTIVE',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      numColor: 'text-orange-700',
    },
    {
      label: 'ไม่มีราคา',
      count: stats.missing_price,
      desc: 'วัสดุ ACTIVE ที่ไม่มีราคาฐาน',
      href: '/materials?status=ACTIVE',
      bg: 'bg-red-50',
      border: 'border-red-200',
      numColor: 'text-red-700',
    },
  ]

  const hasAlerts = alerts.some((a) => a.count > 0)

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="border-b border-neutral-100 px-6 py-5">
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h3 className="font-bold text-neutral-950">Data Quality Alerts</h3>
        </div>
        <p className="ml-[23px] mt-0.5 text-xs text-neutral-400">วัสดุ ACTIVE ที่ข้อมูลไม่ครบถ้วน</p>
      </div>

      <div className="p-6">
        {!hasAlerts ? (
          <div className="flex items-center gap-2 text-emerald-600">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm font-medium">ข้อมูลครบถ้วนทุกรายการ</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {alerts.map((a) => (
              <div
                key={a.label}
                className={`rounded-2xl border p-4 ${a.bg} ${a.border}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{a.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{a.desc}</p>
                  </div>
                  <span className={`shrink-0 text-2xl font-bold ${a.numColor}`}>
                    {a.count}
                  </span>
                </div>
                {a.count > 0 && (
                  <Link
                    href={a.href}
                    className="mt-2 block text-xs font-semibold text-neutral-800 hover:underline"
                  >
                    ดูรายการ →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
