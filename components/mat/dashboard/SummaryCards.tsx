import type { DashboardStats } from '@/app/(mat)/dashboard/page'
import styles from './dashboard.module.css'

interface CardProps {
  label:       string
  value:       number | string
  sub?:        string
  icon:        React.ReactNode
}

function Card({ label, value, sub, icon }: CardProps) {
  return (
    <div className={styles.stat}>
      <div className={styles.statTop}>
        <p>{label}</p>
        <span className={styles.statIcon} aria-hidden="true">{icon}</span>
      </div>
      <p className={styles.statValue}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className={styles.statSub}>{sub}</p>}
    </div>
  )
}

export function SummaryCards({ stats }: { stats: DashboardStats }) {
  const activePct =
    stats.total_materials > 0
      ? Math.round((stats.active_materials / stats.total_materials) * 100)
      : 0

  return (
    <div className={styles.summary}>
      <Card
        label="วัสดุทั้งหมด"
        value={stats.total_materials}
        sub="รายการในระบบ"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        }
      />
      <Card
        label="วัสดุที่ใช้งาน"
        value={stats.active_materials}
        sub={`${activePct}% ของทั้งหมด`}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      />
      <Card
        label="Suppliers"
        value={stats.total_suppliers}
        sub="ซัพพลายเออร์ทั้งหมด"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
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
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 1v22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
    </div>
  )
}
