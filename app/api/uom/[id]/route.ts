import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { createUomSchema } from '@/lib/validations/category'
import { databaseError, notFoundError, relationInUseError, validationError } from '@/lib/api/responses'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()

  const parsed = createUomSchema.partial().safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten())
  }

  const { data: before } = await supabase
    .from('mat_uom')
    .select('*')
    .eq('uom_code', id)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('UOM not found')
  }

  const { data, error } = await supabase
    .from('mat_uom')
    .update(parsed.data)
    .eq('uom_code', id)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) {
    return databaseError('Could not update UOM', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'mat_uom',
    entityKey: id,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params

  const { data: before } = await supabase
    .from('mat_uom')
    .select('*')
    .eq('uom_code', id)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('UOM not found')
  }

  const [
    { count: materialCount },
    { count: priceCount },
    { count: bomCount },
    { count: boqCount },
    { count: fromConvCount },
    { count: toConvCount },
  ] = await Promise.all([
    supabase
      .from('mat_master')
      .select('material_id', { count: 'exact', head: true })
      .or(`base_uom.eq.${id},base_uom_id.eq.${before.id}`)
      .eq('is_deleted', false),
    supabase
      .from('mat_price_base')
      .select('price_uom', { count: 'exact', head: true })
      .or(`price_uom.eq.${id},price_uom_id.eq.${before.id}`)
      .eq('is_deleted', false),
    supabase
      .from('bom_item')
      .select('uom', { count: 'exact', head: true })
      .eq('uom', id)
      .eq('is_deleted', false),
    supabase
      .from('boq_item')
      .select('uom', { count: 'exact', head: true })
      .eq('uom', id)
      .eq('is_deleted', false),
    supabase
      .from('mat_uom_conv')
      .select('from_uom', { count: 'exact', head: true })
      .or(`from_uom.eq.${id},from_uom_id.eq.${before.id}`)
      .eq('is_deleted', false),
    supabase
      .from('mat_uom_conv')
      .select('to_uom', { count: 'exact', head: true })
      .or(`to_uom.eq.${id},to_uom_id.eq.${before.id}`)
      .eq('is_deleted', false),
  ])

  const totalUsage = (materialCount ?? 0) + (priceCount ?? 0) + (bomCount ?? 0) + (boqCount ?? 0) + (fromConvCount ?? 0) + (toConvCount ?? 0)

  if (totalUsage > 0) {
    return relationInUseError(
      'Cannot delete UOM because it is used by materials, prices, BOM, BOQ, or conversions.',
      {
        materials: materialCount ?? 0,
        price_history: priceCount ?? 0,
        bom_items: bomCount ?? 0,
        boq_items: boqCount ?? 0,
        from_conversions: fromConvCount ?? 0,
        to_conversions: toConvCount ?? 0,
      },
    )
  }

  const { error } = await supabase
    .from('mat_uom')
    .delete()
    .eq('uom_code', id)
    .eq('is_active', true)
    .eq('is_deleted', false)

  if (error) {
    return databaseError('Could not delete UOM', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'mat_uom',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'UOM deleted' })
}
