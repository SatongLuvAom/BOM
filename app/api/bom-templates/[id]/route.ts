import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'
import { databaseError, notFoundError, validationError } from '@/lib/api/responses'

type Ctx = { params: Promise<{ id: string }> }

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

const updateSchema = z.object({
  bom_name:     z.string().min(1).optional(),
  bom_category: z.string().optional(),
  unit:         z.string().min(1).optional(),
  description:  z.string().optional(),
  items:        z.array(itemSchema).optional(),
})

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('bom_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (error) return notFoundError('BOM not found')
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten(), parsed.error.errors[0].message)
  }

  const supabase = await createClient()
  const { items, ...header } = parsed.data
  const { data: before } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('bom_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('BOM not found')
  }

  if (Object.keys(header).length > 0) {
    const update: Record<string, unknown> = {}
    if (header.bom_name     !== undefined) update.bom_name     = header.bom_name
    if (header.bom_category !== undefined) update.bom_category = header.bom_category || null
    if (header.unit         !== undefined) update.unit         = header.unit
    if (header.description  !== undefined) update.description  = header.description || null

    const { error } = await supabase.from('bom_template').update(update).eq('bom_id', id)
    if (error) return databaseError('Could not update BOM template', { message: error.message })
  }

  if (items !== undefined) {
    await supabase
      .from('bom_item')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('bom_id', id)
      .eq('is_deleted', false)

    if (items.length > 0) {
      const rows = items.map((it, idx) => ({
        bom_id:       id,
        seq:          it.seq ?? idx,
        item_type:    it.item_type,
        material_id:  it.material_id || null,
        item_name:    it.item_name,
        uom:          it.uom,
        qty_per_unit: it.qty_per_unit,
        waste_pct:    it.waste_pct,
        note:         it.note || null,
      }))
      const { error } = await supabase.from('bom_item').insert(rows)
      if (error) return databaseError('Could not update BOM items', { message: error.message })
    }
  }

  await writeAuditLog({
    entityType: 'bom_template',
    entityKey: id,
    action: 'UPDATE',
    payload: { before, after: parsed.data },
  })

  return NextResponse.json({ data: { bom_id: id } })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('bom_template')
    .select('*')
    .eq('bom_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('BOM not found')
  }

  const { error } = await supabase
    .from('bom_template')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('bom_id', id)

  if (error) return databaseError('Could not archive BOM template', { message: error.message })

  await writeAuditLog({
    entityType: 'bom_template',
    entityKey: id,
    action: 'ARCHIVE',
    payload: before,
  })

  return NextResponse.json({ data: { bom_id: id, archived: true } })
}
