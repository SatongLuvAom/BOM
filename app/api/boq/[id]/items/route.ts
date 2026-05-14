import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveBoqPriceSnapshot } from '@/lib/server/boq-pricing'
import { writeAuditLog } from '@/lib/server-utils'
import { createBoqItemSchema } from '@/lib/validations/boq'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_item')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .order('seq', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body   = await req.json()
  const parsed = createBoqItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()

  // Auto-assign seq = max + 1 if not provided
  let seq = parsed.data.seq
  if (seq === undefined) {
    const { data: maxRow } = await supabase
      .from('boq_item')
      .select('seq')
      .eq('project_id', id)
      .eq('is_deleted', false)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle()
    seq = (maxRow?.seq ?? 0) + 1
  }

  const { item_type, material_id, item_name, spec, uom, qty, unit_price, currency_code, note } = parsed.data
  const waste_pct = parsed.data.waste_pct ?? 0
  const priceSnapshot = await resolveBoqPriceSnapshot(supabase, {
    item_type,
    material_id,
    unit_price,
    estimated_unit_price: parsed.data.estimated_unit_price,
    final_unit_price: parsed.data.final_unit_price,
    supplier_id: parsed.data.supplier_id,
    currency_code,
    price_source: parsed.data.price_source,
  })

  const { data, error } = await supabase
    .from('boq_item')
    .insert({
      project_id: id,
      seq,
      item_type,
      material_id: material_id ?? null,
      item_name,
      spec: spec ?? null,
      uom,
      qty,
      waste_pct,
      unit_price: priceSnapshot.unit_price,
      estimated_unit_price: priceSnapshot.estimated_unit_price,
      final_unit_price: priceSnapshot.final_unit_price,
      price_source: priceSnapshot.price_source,
      price_snapshot_at: priceSnapshot.price_snapshot_at,
      supplier_id: priceSnapshot.supplier_id,
      currency_code: priceSnapshot.currency_code,
      note: note ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: data.item_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
