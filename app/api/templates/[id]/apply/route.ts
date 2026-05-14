import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveBoqPriceSnapshot } from '@/lib/server/boq-pricing'
import { generateBoqId, writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data: tpl, error: tplErr } = await supabase
    .from('boq_template')
    .select('*, items:boq_template_item(*)')
    .eq('template_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (tplErr || !tpl) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const projectName = body.project_name?.trim() || `${tpl.template_name} (from template)`
  const customerId = body.customer_id ?? null
  const clientName = body.client_name?.trim() || null
  const siteAddress = body.site_address?.trim() || null

  const project_id = await generateBoqId()

  const { data: project, error: projErr } = await supabase
    .from('boq_project')
    .insert({
      project_id,
      project_name: projectName,
      customer_id: customerId,
      client_name: clientName,
      site_address: siteAddress,
      project_date: new Date().toISOString().slice(0, 10),
      status: 'DRAFT',
    })
    .select()
    .single()

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 })
  }

  const items = (tpl.items ?? []) as any[]
  const rows = []

  for (const item of items) {
    const priceSnapshot = await resolveBoqPriceSnapshot(supabase, {
      item_type: item.item_type,
      material_id: item.material_id ?? null,
      unit_price: item.unit_price,
      currency_code: item.currency_code,
      preferred_source: 'TEMPLATE',
    })

    rows.push({
      project_id,
      seq: item.seq,
      item_type: item.item_type,
      material_id: item.material_id ?? null,
      item_name: item.item_name,
      spec: item.spec ?? null,
      uom: item.uom,
      qty: item.qty,
      waste_pct: item.waste_pct,
      unit_price: priceSnapshot.unit_price,
      estimated_unit_price: priceSnapshot.estimated_unit_price,
      final_unit_price: priceSnapshot.final_unit_price,
      price_source: priceSnapshot.price_source,
      price_snapshot_at: priceSnapshot.price_snapshot_at,
      supplier_id: priceSnapshot.supplier_id,
      currency_code: priceSnapshot.currency_code,
      note: item.note ?? null,
    })
  }

  if (rows.length > 0) {
    const { error: itemErr } = await supabase.from('boq_item').insert(rows)
    if (itemErr) {
      return NextResponse.json({ error: itemErr.message }, { status: 500 })
    }
  }

  await writeAuditLog({
    entityType: 'boq_project',
    entityKey: project_id,
    action: 'CREATE',
    payload: { template_id: id, project, items_count: rows.length },
  })

  return NextResponse.json({ data: project }, { status: 201 })
}
