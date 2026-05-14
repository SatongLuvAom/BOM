import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { updateMatSupplierMapSchema } from '@/lib/validations/supplier'
import { writeAuditLog } from '@/lib/server-utils'

type Params = { params: Promise<{ materialId: string; supplierId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId } = await params

  const { data, error } = await supabase
    .from('mat_supplier_map')
    .select(`
      *,
      material:mat_master!mat_supplier_map_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
    `)
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId } = await params
  const body = await req.json()
  const parsed = updateMatSupplierMapSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { data: before } = await supabase
    .from('mat_supplier_map')
    .select('*')
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
  }

  if (parsed.data.is_preferred) {
    await supabase
      .from('mat_supplier_map')
      .update({ is_preferred: false })
      .eq('material_id', materialId)
      .eq('is_deleted', false)
  }

  const { data, error } = await supabase
    .from('mat_supplier_map')
    .update(parsed.data)
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .select(`
      *,
      material:mat_master!mat_supplier_map_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_supplier_map',
    entityKey: `${materialId}:${supplierId}`,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId } = await params

  const { data: before } = await supabase
    .from('mat_supplier_map')
    .select('*')
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('mat_supplier_map')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('is_deleted', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_supplier_map',
    entityKey: `${materialId}:${supplierId}`,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'Mapping deleted' })
}
