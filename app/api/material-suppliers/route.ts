import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createMatSupplierMapSchema } from '@/lib/validations/supplier'
import { writeAuditLog } from '@/lib/server-utils'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const material_id = searchParams.get('material_id') ?? ''
  const supplier_id = searchParams.get('supplier_id') ?? ''

  let query = supabase
    .from('mat_supplier_map')
    .select(`
      *,
      material:mat_master!mat_supplier_map_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
    `)
    .eq('is_deleted', false)

  if (material_id) {
    query = query.eq('material_id', material_id)
  }

  if (supplier_id) {
    query = query.eq('supplier_id', supplier_id)
  }

  const { data, error } = await query
    .order('is_preferred', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()
  const parsed = createMatSupplierMapSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const input = parsed.data

  const [{ data: supplier }, material] = await Promise.all([
    supabase
      .from('supplier')
      .select('id, supplier_id')
      .eq('supplier_id', input.supplier_id)
      .eq('is_deleted', false)
      .single(),
    resolveMaterialReference<{ id: string; material_id: string }>(supabase, input.material_id, 'id, material_id'),
  ])

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 400 })
  }

  const payload = {
    ...input,
    material_id: material.material_id,
    material_uuid: material.id,
    supplier_uuid: supplier.id,
  }

  if (payload.is_preferred) {
    await supabase
      .from('mat_supplier_map')
      .update({ is_preferred: false })
      .eq('material_id', payload.material_id)
      .eq('is_deleted', false)
  }

  const { data: existing } = await supabase
    .from('mat_supplier_map')
    .select('is_deleted')
    .eq('material_id', payload.material_id)
    .eq('supplier_id', payload.supplier_id)
    .limit(1)

  if (existing && existing.length > 0) {
    const row = existing[0]

    if (!row.is_deleted) {
      return NextResponse.json(
        { error: 'This material is already linked to the supplier' },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('mat_supplier_map')
      .update({
        ...payload,
        is_deleted: false,
        deleted_at: null,
      })
      .eq('material_id', payload.material_id)
      .eq('supplier_id', payload.supplier_id)
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
      entityKey: `${payload.material_id}:${payload.supplier_id}`,
      action: 'RESTORE',
      payload: data,
    })

    return NextResponse.json({ data }, { status: 201 })
  }

  const { data, error } = await supabase
    .from('mat_supplier_map')
    .insert(payload)
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
    entityKey: `${payload.material_id}:${payload.supplier_id}`,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
