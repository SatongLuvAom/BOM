import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateBomId, writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'
import { databaseError, validationError } from '@/lib/api/responses'

const itemSchema = z.object({
  seq:          z.number().int().min(0).default(0),
  item_type:    z.enum(['MAT', 'LABOR', 'SERVICE', 'MISC']).default('MAT'),
  material_id:  z.string().optional().default(''),
  item_name:    z.string().min(1),
  uom:          z.string().min(1),
  qty_per_unit: z.number().positive(),
  waste_pct:    z.number().min(0).max(100).default(0),
  note:         z.string().optional().default(''),
})

const createSchema = z.object({
  bom_name:     z.string().min(1, 'กรุณาระบุชื่อ BOM'),
  bom_category: z.string().optional().default(''),
  unit:         z.string().min(1, 'กรุณาระบุหน่วย'),
  description:  z.string().optional().default(''),
  items:        z.array(itemSchema).default([]),
})

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? ''

  let query = supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('bom_category')
    .order('bom_name')

  if (category) query = query.eq('bom_category', category)

  const { data, error } = await query
  if (error) return databaseError('Could not load BOM templates', { message: error.message })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten(), parsed.error.errors[0].message)
  }

  const supabase = await createClient()
  const bom_id  = await generateBomId()
  const { items, ...header } = parsed.data

  const { error: tplErr } = await supabase.from('bom_template').insert({
    bom_id,
    bom_name:     header.bom_name,
    bom_category: header.bom_category || null,
    unit:         header.unit,
    description:  header.description || null,
  })
  if (tplErr) return databaseError('Could not create BOM template', { message: tplErr.message })

  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      bom_id,
      seq:          it.seq ?? idx,
      item_type:    it.item_type,
      material_id:  it.material_id || null,
      item_name:    it.item_name,
      uom:          it.uom,
      qty_per_unit: it.qty_per_unit,
      waste_pct:    it.waste_pct,
      note:         it.note || null,
    }))
    const { error: itemErr } = await supabase.from('bom_item').insert(rows)
    if (itemErr) return databaseError('Could not create BOM items', { message: itemErr.message })
  }

  await writeAuditLog({
    entityType: 'bom_template',
    entityKey: bom_id,
    action: 'CREATE',
    payload: { bom_id, ...header, items_count: items.length },
  })

  return NextResponse.json({ data: { bom_id } }, { status: 201 })
}
