import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateTemplateId, writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  template_name: z.string().min(1, 'กรุณาระบุชื่อ Template'),
  description:   z.string().optional(),
  category:      z.string().optional(),
})

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()

  // Load project items
  const { data: items, error: itemErr } = await supabase
    .from('boq_item')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .order('seq', { ascending: true })

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })

  const template_id = await generateTemplateId()

  // Create template record
  const { data: tpl, error: tplErr } = await supabase
    .from('boq_template')
    .insert({ template_id, ...parsed.data })
    .select()
    .single()

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 })

  // Copy items to template (strip generated columns)
  if (items && items.length > 0) {
    const rows = items.map((item: any) => ({
      template_id,
      seq:           item.seq,
      item_type:     item.item_type,
      material_id:   item.material_id ?? null,
      item_name:     item.item_name,
      spec:          item.spec ?? null,
      uom:           item.uom,
      qty:           item.qty,
      waste_pct:     item.waste_pct,
      unit_price:    item.unit_price,
      currency_code: item.currency_code,
      note:          item.note ?? null,
    }))
    const { error: insertErr } = await supabase.from('boq_template_item').insert(rows)
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'boq_template',
    entityKey: template_id,
    action: 'SAVE_AS_TEMPLATE',
    payload: { source_project_id: id, template: tpl, items_count: items?.length ?? 0 },
  })

  return NextResponse.json({ data: tpl, items_count: items?.length ?? 0 }, { status: 201 })
}
