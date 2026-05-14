import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()

  const [projectsRes, itemsRes, customersRes] = await Promise.all([
    supabase
      .from('boq_project')
      .select('project_id, project_name, client_name, customer_id, status, project_date, created_at')
      .eq('is_deleted', false),
    supabase
      .from('boq_item')
      .select('item_id, project_id, item_type, material_id, item_name, uom, qty, unit_price, total_price, currency_code'),
    supabase
      .from('customer')
      .select('customer_id, customer_name')
      .eq('is_deleted', false),
  ])

  if (projectsRes.error) return NextResponse.json({ error: projectsRes.error.message }, { status: 500 })
  if (itemsRes.error)    return NextResponse.json({ error: itemsRes.error.message },    { status: 500 })

  const projects   = projectsRes.data ?? []
  const items      = itemsRes.data ?? []
  const customers  = customersRes.data ?? []
  const customerMap = Object.fromEntries(customers.map((c) => [c.customer_id, c.customer_name]))

  // ── 1. Project summary ───────────────────────────────────────
  const projectSummary = projects.map((p) => {
    const projectItems = items.filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION')
    const total = projectItems.reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    return {
      project_id:   p.project_id,
      project_name: p.project_name,
      client_name:  p.customer_id ? customerMap[p.customer_id] ?? p.client_name : p.client_name,
      status:       p.status,
      project_date: p.project_date,
      item_count:   projectItems.length,
      total_value:  total,
    }
  }).sort((a, b) => b.total_value - a.total_value)

  // ── 2. Most used materials ───────────────────────────────────
  const matUsage: Record<string, { material_id: string; item_name: string; uom: string; count: number; total_qty: number; total_value: number }> = {}
  for (const item of items) {
    if (item.item_type !== 'MAT' || !item.material_id) continue
    if (!matUsage[item.material_id]) {
      matUsage[item.material_id] = {
        material_id: item.material_id,
        item_name:   item.item_name,
        uom:         item.uom,
        count:       0,
        total_qty:   0,
        total_value: 0,
      }
    }
    matUsage[item.material_id].count      += 1
    matUsage[item.material_id].total_qty  += Number(item.qty)
    matUsage[item.material_id].total_value += Number(item.total_price ?? 0)
  }
  const topMaterials = Object.values(matUsage)
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 20)

  // ── 3. Cost by type ──────────────────────────────────────────
  const byType: Record<string, number> = { MAT: 0, LABOR: 0, SERVICE: 0, MISC: 0 }
  for (const item of items) {
    if (item.item_type === 'SECTION') continue
    byType[item.item_type] = (byType[item.item_type] ?? 0) + Number(item.total_price ?? 0)
  }

  // ── 4. Customer summary ──────────────────────────────────────
  const customerSummary: Record<string, { name: string; project_count: number; total_value: number }> = {}
  for (const p of projects) {
    const key  = p.customer_id ?? `_anon_${p.client_name ?? 'ไม่ระบุ'}`
    const name = p.customer_id ? customerMap[p.customer_id] ?? p.client_name ?? 'ไม่ระบุ' : p.client_name ?? 'ไม่ระบุ'
    if (!customerSummary[key]) customerSummary[key] = { name, project_count: 0, total_value: 0 }
    customerSummary[key].project_count += 1
    const pTotal = items
      .filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION')
      .reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    customerSummary[key].total_value += pTotal
  }
  const topCustomers = Object.values(customerSummary)
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 10)

  // ── 5. Monthly revenue ───────────────────────────────────────
  const monthly: Record<string, number> = {}
  for (const p of projects) {
    const month = (p.project_date ?? p.created_at ?? '').slice(0, 7)
    if (!month) continue
    const pTotal = items
      .filter((i) => i.project_id === p.project_id && i.item_type !== 'SECTION')
      .reduce((s, i) => s + Number(i.total_price ?? 0), 0)
    monthly[month] = (monthly[month] ?? 0) + pTotal
  }
  const monthlyRevenue = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, total]) => ({ month, total }))

  return NextResponse.json({
    project_summary: projectSummary,
    top_materials:   topMaterials,
    by_type:         byType,
    top_customers:   topCustomers,
    monthly_revenue: monthlyRevenue,
    totals: {
      project_count: projects.length,
      total_value:   projectSummary.reduce((s, p) => s + p.total_value, 0),
      confirmed_value: projectSummary.filter((p) => p.status === 'CONFIRMED').reduce((s, p) => s + p.total_value, 0),
    },
  })
}
