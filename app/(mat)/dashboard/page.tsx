import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { SummaryCards } from '@/components/mat/dashboard/SummaryCards'
import { RecentMaterials } from '@/components/mat/dashboard/RecentMaterials'
import { LatestPrices } from '@/components/mat/dashboard/LatestPrices'
import { QualityAlerts } from '@/components/mat/dashboard/QualityAlerts'

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
    <div className="flex h-full flex-col">
      <Header title="Dashboard" subtitle="ภาพรวมระบบ MAT" />
      <div className="flex-1 space-y-6 overflow-auto px-6 pb-8">
        <SummaryCards stats={stats} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <RecentMaterials materials={recent as any} />
          <LatestPrices prices={prices as any} />
        </div>
        <QualityAlerts stats={stats} />
      </div>
    </div>
  )
}
