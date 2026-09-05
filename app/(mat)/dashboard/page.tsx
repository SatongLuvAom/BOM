import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { SummaryCards } from '@/components/mat/dashboard/SummaryCards'
import { RecentMaterials } from '@/components/mat/dashboard/RecentMaterials'
import { LatestPrices } from '@/components/mat/dashboard/LatestPrices'
import { QualityAlerts } from '@/components/mat/dashboard/QualityAlerts'
import Link from 'next/link'
import styles from '@/components/mat/dashboard/dashboard.module.css'

export const dynamic = 'force-dynamic'

export interface DashboardStats {
  total_materials: number
  active_materials: number
  total_suppliers: number
  total_prices: number
  missing_alias: number
  missing_uom_conv: number
  missing_price: number
  by_category: { cat_id: string; cat_code: string; cat_name_th: string; count: number }[]
}

const EMPTY_STATS: DashboardStats = {
  total_materials: 0,
  active_materials: 0,
  total_suppliers: 0,
  total_prices: 0,
  missing_alias: 0,
  missing_uom_conv: 0,
  missing_price: 0,
  by_category: [],
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [statsRes, recentRes, pricesRes] = await Promise.all([
    supabase.rpc('get_dashboard_stats'),
    supabase
      .from('mat_master')
      .select(
        `material_id, mat_name_th, brand, status, updated_at,
         category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th)`,
      )
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(8),
    supabase
      .from('mat_price_base')
      .select(
        `material_id, supplier_id, effective_date, price_uom,
         unit_price, currency_code,
         material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th),
         supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_name_th),
         uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)`,
      )
      .eq('is_deleted', false)
      .order('effective_date', { ascending: false })
      .limit(8),
  ])

  const stats: DashboardStats = statsRes.data ?? EMPTY_STATS
  const recent = recentRes.data ?? []
  const prices = pricesRes.data ?? []

  return (
    <div className={styles.page}>
      <Header title="Dashboard" subtitle="ภาพรวมระบบ MAT" />
      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="dashboard-hero-title">
          <div>
            <p className={styles.eyebrow}>MATERIAL MASTER</p>
            <h2 id="dashboard-hero-title" className={styles.heroTitle}>ภาพรวมระบบ MAT</h2>
            <p className={styles.heroCopy}>
              <span>วัสดุที่ใช้งาน</span> · {stats.active_materials.toLocaleString()} / {stats.total_materials.toLocaleString()}
            </p>
            <div className={styles.actions}>
              <Link href="/materials" className={styles.primaryAction}>ดูวัสดุทั้งหมด →</Link>
              <Link href="/materials?status=ACTIVE" className={styles.textLink}><span>วัสดุที่ใช้งาน</span><span aria-hidden="true">&nbsp;→</span></Link>
            </div>
          </div>
          <div className={styles.heroDetail}>
            <p className={styles.heroDetailLabel}>Data Quality Alerts</p>
            <p className={styles.heroNumber}>{stats.missing_price.toLocaleString()}</p>
            <p className={styles.heroDetailLabel}>วัสดุ ACTIVE ที่ไม่มีราคาฐาน</p>
            {stats.missing_price > 0 && (
              <Link href="/materials?status=ACTIVE" className={styles.textLink}>ดูรายการ →</Link>
            )}
          </div>
        </section>
        <SummaryCards stats={stats} />
        <div className={styles.lists}>
          <RecentMaterials materials={recent as any} />
          <LatestPrices prices={prices as any} />
        </div>
        <QualityAlerts stats={stats} />
      </div>
    </div>
  )
}
