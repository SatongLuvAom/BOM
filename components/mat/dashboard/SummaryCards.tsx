import type { DashboardStats } from '@/app/(mat)/dashboard/page'

interface CardProps {
  label:       string
  value:       number | string
  sub?:        string
  icon:        React.ReactNode
  iconBg:      string
  valueClass:  string
  accentColor: string
}

function Card({ label, value, sub, icon, iconBg, valueClass, accentColor }: CardProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)]">
      {/* Top accent bar */}
      <div className={`absolute inset-x-5 top-0 h-[3px] rounded-full ${accentColor}`} />
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-5 text-4xl font-bold tracking-tight tabular-nums ${valueClass}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="mt-1 text-sm font-semibold text-neutral-700">{label}</p>
      {sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}
    </div>
  )
}

export function SummaryCards({ stats }: { stats: DashboardStats }) {
  const activePct =
    stats.total_materials > 0
      ? Math.round((stats.active_materials / stats.total_materials) * 100)
      : 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="วัสดุทั้งหมด"
        value={stats.total_materials}
        sub="รายการในระบบ"
        valueClass="text-blue-600"
        iconBg="bg-blue-50"
        accentColor="bg-blue-500"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        }
      />
      <Card
        label="วัสดุที่ใช้งาน"
        value={stats.active_materials}
        sub={`${activePct}% ของทั้งหมด`}
        valueClass="text-emerald-600"
        iconBg="bg-emerald-50"
        accentColor="bg-emerald-500"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      />
      <Card
        label="Suppliers"
        value={stats.total_suppliers}
        sub="ซัพพลายเออร์ทั้งหมด"
        valueClass="text-violet-600"
        iconBg="bg-violet-50"
        accentColor="bg-violet-500"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6M23 11h-6" />
          </svg>
        }
      />
      <Card
        label="รายการราคา"
        value={stats.total_prices}
        sub="ข้อมูลราคาฐาน"
        valueClass="text-orange-600"
        iconBg="bg-orange-50"
        accentColor="bg-orange-500"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2">
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
    </div>
  )
}
