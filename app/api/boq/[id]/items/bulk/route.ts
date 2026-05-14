import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveBoqPriceSnapshot } from '@/lib/server/boq-pricing'
import { writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string }> }

const bulkItemSchema = z.object({
  item_type: z.enum(['MAT', 'LABOR', 'SERVICE', 'MISC', 'SECTION']).default('MAT'),
  material_id: z.string().nullable().optional(),
  item_name: z.string().min(1),
  spec: z.string().optional().nullable(),
  uom: z.string().optional(),
  qty: z.number().default(0),
  waste_pct: z.number().min(0).max(100).default(0),
  unit_price: z.number().min(0).default(0),
  currency_code: z.string().optional(),
  note: z.string().optional().nullable(),
})

const bulkSchema = z.object({
  items: z.array(bulkItemSchema).min(1, 'At least one item is required'),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body = await req.json()
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: project, error: projErr } = await supabase
    .from('boq_project')
    .select('project_id')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('boq_item')
    .select('seq')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .order('seq', { ascending: false })
    .limit(1)

  let nextSeq = (existing?.[0]?.seq ?? 0) + 1
  const rows = []

  for (const item of parsed.data.items) {
    const isSection = item.item_type === 'SECTION'
    const materialId = item.item_type === 'MAT' ? (item.material_id || null) : null
    const priceSnapshot = await resolveBoqPriceSnapshot(supabase, {
      item_type: item.item_type,
      material_id: materialId,
      unit_price: isSection ? 0 : item.unit_price,
      currency_code: item.currency_code ?? 'THB',
      preferred_source: 'IMPORT',
    })

    rows.push({
      project_id: id,
      seq: nextSeq++,
      item_type: item.item_type,
      material_id: materialId,
      item_name: item.item_name.trim(),
      spec: item.spec?.trim() || null,
      uom: isSection ? '-' : (item.uom?.trim() || 'PCS'),
      qty: isSection ? 0 : item.qty,
      waste_pct: isSection ? 0 : item.waste_pct,
      unit_price: priceSnapshot.unit_price,
      estimated_unit_price: priceSnapshot.estimated_unit_price,
      final_unit_price: priceSnapshot.final_unit_price,
      price_source: priceSnapshot.price_source,
      price_snapshot_at: priceSnapshot.price_snapshot_at,
      supplier_id: priceSnapshot.supplier_id,
      currency_code: priceSnapshot.currency_code,
      note: item.note?.trim() || null,
    })
  }

  const { data, error } = await supabase.from('boq_item').insert(rows).select()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: id,
    action: 'IMPORT',
    payload: { inserted: data?.length ?? 0, items: data ?? [] },
  })

  return NextResponse.json({ data, inserted: data?.length ?? 0 }, { status: 201 })
}
