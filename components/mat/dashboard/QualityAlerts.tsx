import Link from 'next/link'
import type { DashboardStats } from '@/app/(mat)/dashboard/page'
import styles from './dashboard.module.css'

interface AlertCard {
  label: string
  count: number
  desc: string
  href: string
}

export function QualityAlerts({ stats }: { stats: DashboardStats }) {
  const alerts: AlertCard[] = [
    {
      label: 'ไม่มี Alias',
      count: stats.missing_alias,
      desc: 'วัสดุ ACTIVE ที่ไม่มีชื่อย่อ / ชื่อแบรนด์',
      href: '/materials?status=ACTIVE',
    },
    {
      label: 'ไม่มีการแปลงหน่วย',
      count: stats.missing_uom_conv,
      desc: 'วัสดุ ACTIVE ที่ไม่มี UOM Conversion',
      href: '/materials?status=ACTIVE',
    },
    {
      label: 'ไม่มีราคา',
      count: stats.missing_price,
      desc: 'วัสดุ ACTIVE ที่ไม่มีราคาฐาน',
      href: '/materials?status=ACTIVE',
    },
  ]

  const hasAlerts = alerts.some((a) => a.count > 0)

  return (
    <section className={styles.panel} aria-labelledby="quality-alerts-title">
      <div className={styles.panelHeader}>
        <div>
          <div className="flex items-center gap-2">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 id="quality-alerts-title" className={styles.panelTitle}>Data Quality Alerts</h2>
          </div>
          <p className={styles.meta}>วัสดุ ACTIVE ที่ข้อมูลไม่ครบถ้วน</p>
        </div>
      </div>

      <div className={styles.qualityBody}>
        {!hasAlerts ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <svg
              aria-hidden="true"
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
          <div className={styles.qualityGrid}>
            {alerts.map((a) => (
              <div
                key={a.label}
                className={styles.qualityCard}
              >
                <div className={styles.qualityTop}>
                  <div className="min-w-0">
                    <p className={styles.qualityLabel}>{a.label}</p>
                    <p className={styles.meta}>{a.desc}</p>
                  </div>
                  <span className={styles.qualityCount}>
                    {a.count}
                  </span>
                </div>
                {a.count > 0 && (
                  <Link
                    href={a.href}
                    className={styles.textLink}
                  >
                    ดูรายการ →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
