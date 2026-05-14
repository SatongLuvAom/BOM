import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveBoqPriceSnapshot } from '@/lib/server/boq-pricing'
import { writeAuditLog } from '@/lib/server-utils'
import { updateBoqItemSchema } from '@/lib/validations/boq'
import { databaseError, notFoundError, validationError } from '@/lib/api/responses'

type Ctx = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params
  const body   = await req.json()
  const parsed = updateBoqItemSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten(), parsed.error.errors[0].message)
  }

  const supabase = await createClient()

  const { data: before } = await supabase
    .from('boq_item')
    .select('*')
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('BOQ item not found')
  }

  let updatePayload: Record<string, unknown> = { ...parsed.data }
  const touchesPrice =
    parsed.data.unit_price !== undefined ||
    parsed.data.final_unit_price !== undefined ||
    parsed.data.estimated_unit_price !== undefined ||
    parsed.data.supplier_id !== undefined ||
    parsed.data.material_id !== undefined ||
    parsed.data.price_source !== undefined

  if (touchesPrice) {
    const priceSnapshot = await resolveBoqPriceSnapshot(supabase, {
      item_type: before.item_type,
      material_id: parsed.data.material_id !== undefined ? parsed.data.material_id : before.material_id,
      unit_price: parsed.data.unit_price !== undefined ? parsed.data.unit_price : before.unit_price,
      estimated_unit_price: parsed.data.estimated_unit_price !== undefined
        ? parsed.data.estimated_unit_price
        : before.estimated_unit_price,
      final_unit_price: parsed.data.final_unit_price !== undefined
        ? parsed.data.final_unit_price
        : parsed.data.unit_price !== undefined
          ? parsed.data.unit_price
          : before.final_unit_price,
      supplier_id: parsed.data.supplier_id !== undefined ? parsed.data.supplier_id : before.supplier_id,
      currency_code: parsed.data.currency_code !== undefined ? parsed.data.currency_code : before.currency_code,
      price_source: parsed.data.price_source,
    })

    updatePayload = {
      ...updatePayload,
      ...priceSnapshot,
    }
  }

  const { data, error } = await supabase
    .from('boq_item')
    .update(updatePayload)
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) return databaseError('Could not update BOQ item', { message: error.message })

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: itemId,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('boq_item')
    .select('*')
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('BOQ item not found')
  }

  const { error } = await supabase
    .from('boq_item')
    .delete()
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)

  if (error) return databaseError('Could not delete BOQ item', { message: error.message })

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: itemId,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'deleted' })
}
