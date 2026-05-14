import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ReportView } from '@/components/reports/ReportView'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = await createClient()

  const [projectsRes, itemsRes, customersRes] = await Promise.all([
    supabase
      .from('boq_project')
      .select('project_id, project_name, client_name, customer_id, status, project_date, created_at')
      .eq('is_deleted', false),
    supabase
      .from('boq_item')
      .select('item_id, project_id, item_type, material_id, item_name, uom, qty, unit_price, total_price, currency_code')
      .eq('is_deleted', false),
    supabase
      .from('customer')
      .select('customer_id, customer_name')
      .eq('is_deleted', false),
  ])

  const projects  = projectsRes.data ?? []
  const items     = itemsRes.data ?? []
  const customers = customersRes.data ?? []
  const customerMap = Object.fromEntries(customers.map((c) => [c.customer_id, c.customer_name]))

  // ── Aggregations ────────────────────────────────────────────

  // Project summary with totals
  const projectSummary = projects.map((p) => {
    const projectItems = items.filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION')
    const total = projectItems.reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    return {
      project_id:   p.project_id,
      project_name: p.project_name,
      client_name:  p.customer_id ? (customerMap[p.customer_id] ?? p.client_name) : p.client_name,
      status:       p.status,
      project_date: p.project_date,
      item_count:   projectItems.length,
      total_value:  total,
    }
  }).sort((a, b) => b.total_value - a.total_value)

  // Most used materials by total value
  const matUsageMap: Record<string, { material_id: string; item_name: string; uom: string; count: number; total_qty: number; total_value: number }> = {}
  for (const item of items) {
    if (item.item_type !== 'MAT' || !item.material_id) continue
    if (!matUsageMap[item.material_id]) {
      matUsageMap[item.material_id] = { material_id: item.material_id, item_name: item.item_name, uom: item.uom, count: 0, total_qty: 0, total_value: 0 }
    }
    matUsageMap[item.material_id].count      += 1
    matUsageMap[item.material_id].total_qty  += Number(item.qty)
    matUsageMap[item.material_id].total_value += Number(item.total_price ?? 0)
  }
  const topMaterials = Object.values(matUsageMap).sort((a, b) => b.total_value - a.total_value).slice(0, 20)

  // Cost by type
  const byType: Record<string, number> = { MAT: 0, LABOR: 0, SERVICE: 0, MISC: 0 }
  for (const item of items) {
    if (item.item_type === 'SECTION') continue
    byType[item.item_type] = (byType[item.item_type] ?? 0) + Number(item.total_price ?? 0)
  }

  // Customer totals
  const customerTotalsMap: Record<string, { name: string; project_count: number; total_value: number }> = {}
  for (const p of projects) {
    const key  = p.customer_id ?? `_${p.client_name ?? 'ไม่ระบุ'}`
    const name = p.customer_id ? (customerMap[p.customer_id] ?? p.client_name ?? 'ไม่ระบุ') : (p.client_name ?? 'ไม่ระบุ')
    if (!customerTotalsMap[key]) customerTotalsMap[key] = { name, project_count: 0, total_value: 0 }
    customerTotalsMap[key].project_count += 1
    const pTotal = items.filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION').reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    customerTotalsMap[key].total_value += pTotal
  }
  const topCustomers = Object.values(customerTotalsMap).sort((a, b) => b.total_value - a.total_value).slice(0, 10)

  // Monthly (last 12 months)
  const monthlyMap: Record<string, number> = {}
  for (const p of projects) {
    const month = (p.project_date ?? p.created_at ?? '').slice(0, 7)
    if (!month) continue
    const pTotal = items.filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION').reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    monthlyMap[month] = (monthlyMap[month] ?? 0) + pTotal
  }
  const monthlyRevenue = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, total]) => ({ month, total }))

  const totalValue     = projectSummary.reduce((s, p) => s + p.total_value, 0)
  const confirmedValue = projectSummary.filter((p) => p.status === 'CONFIRMED').reduce((s, p) => s + p.total_value, 0)

  return (
    <div className="flex flex-col h-full">
      <Header title="รายงาน" subtitle="สรุปต้นทุนและวิเคราะห์ BOQ" />
      <div className="flex-1 overflow-auto">
        <ReportView
          projectSummary={projectSummary}
          topMaterials={topMaterials}
          byType={byType}
          topCustomers={topCustomers}
          monthlyRevenue={monthlyRevenue}
          totals={{
            project_count:   projects.length,
            total_value:     totalValue,
            confirmed_value: confirmedValue,
          }}
        />
      </div>
    </div>
  )
}
