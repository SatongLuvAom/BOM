import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveBoqPriceSnapshot } from '@/lib/server/boq-pricing'
import { writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'
import { databaseError, notFoundError, validationError } from '@/lib/api/responses'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  bom_id: z.string().min(1),
  qty: z.number().positive(),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id: projectId } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten(), parsed.error.errors[0].message)
  }

  const { bom_id, qty } = parsed.data
  const supabase = await createClient()

  const { data: bom, error: bomErr } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('bom_id', bom_id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (bomErr || !bom) {
    return notFoundError('BOM not found')
  }

  const items = (bom.items ?? []) as any[]
  if (items.length === 0) {
    return NextResponse.json({ error: 'BOM has no items' }, { status: 400 })
  }

  const { data: seqData } = await supabase
    .from('boq_item')
    .select('seq')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('seq', { ascending: false })
    .limit(1)

  let nextSeq = seqData && seqData.length > 0 ? (seqData[0].seq ?? 0) + 10 : 10
  const rows = []

  for (const item of items.sort((a, b) => a.seq - b.seq)) {
    const calculatedQty = Number(item.qty_per_unit) * qty
    const priceSnapshot = await resolveBoqPriceSnapshot(supabase, {
      item_type: item.item_type,
      material_id: item.material_id || null,
      unit_price: 0,
      currency_code: 'THB',
      preferred_source: 'BOM',
    })

    rows.push({
      project_id: projectId,
      seq: nextSeq,
      item_type: item.item_type,
      material_id: item.material_id || null,
      item_name: item.item_name,
      uom: item.uom,
      qty: calculatedQty,
      waste_pct: Number(item.waste_pct),
      unit_price: priceSnapshot.unit_price,
      estimated_unit_price: priceSnapshot.estimated_unit_price,
      final_unit_price: priceSnapshot.final_unit_price,
      price_source: priceSnapshot.price_source,
      price_snapshot_at: priceSnapshot.price_snapshot_at,
      supplier_id: priceSnapshot.supplier_id,
      currency_code: priceSnapshot.currency_code,
      note: item.note || null,
    })
    nextSeq += 10
  }

  const { data, error: insertErr } = await supabase.from('boq_item').insert(rows).select()
  if (insertErr) {
    return databaseError('Could not import BOM into BOQ', { message: insertErr.message })
  }

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: projectId,
    action: 'IMPORT_FROM_BOM',
    payload: { bom_id, qty, inserted: data?.length ?? rows.length },
  })

  return NextResponse.json({ data: { inserted: data?.length ?? rows.length } }, { status: 201 })
}
