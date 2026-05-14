import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { createUomConvSchema } from '@/lib/validations/material'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()

  const parsed = createUomConvSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const material = await resolveMaterialReference<{ id: string; material_id: string }>(supabase, parsed.data.material_id, 'id, material_id')
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  const [{ data: fromUom }, { data: toUom }] = await Promise.all([
    supabase.from('mat_uom').select('id').eq('uom_code', parsed.data.from_uom).eq('is_deleted', false).single(),
    supabase.from('mat_uom').select('id').eq('uom_code', parsed.data.to_uom).eq('is_deleted', false).single(),
  ])

  if (!fromUom || !toUom) {
    return NextResponse.json({ error: 'UOM not found' }, { status: 400 })
  }

  const input = {
    ...parsed.data,
    material_id: material.material_id,
    material_uuid: material.id,
    from_uom_id: fromUom.id,
    to_uom_id: toUom.id,
  }

  const { data: existing } = await supabase
    .from('mat_uom_conv')
    .select('is_deleted')
    .eq('material_id', input.material_id)
    .eq('from_uom', input.from_uom)
    .eq('to_uom', input.to_uom)
    .limit(1)

  if (existing && existing.length > 0) {
    if (!existing[0].is_deleted) {
      return NextResponse.json({ error: 'UOM conversion already exists' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('mat_uom_conv')
      .update({
        factor: input.factor,
        formula_note: input.formula_note,
        material_uuid: input.material_uuid,
        from_uom_id: input.from_uom_id,
        to_uom_id: input.to_uom_id,
        is_deleted: false,
        deleted_at: null,
      })
      .eq('material_id', input.material_id)
      .eq('from_uom', input.from_uom)
      .eq('to_uom', input.to_uom)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await writeAuditLog({
      entityType: 'mat_uom_conv',
      entityKey: `${input.material_id}:${input.from_uom}:${input.to_uom}`,
      action: 'RESTORE',
      payload: data,
    })

    return NextResponse.json({ data }, { status: 201 })
  }

  const { data, error } = await supabase
    .from('mat_uom_conv')
    .insert(input)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'UOM conversion already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_uom_conv',
    entityKey: `${input.material_id}:${input.from_uom}:${input.to_uom}`,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const material_id = searchParams.get('material_id')
  const from_uom = searchParams.get('from_uom')
  const to_uom = searchParams.get('to_uom')

  if (!material_id || !from_uom || !to_uom) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const body = await req.json()
  const factor = Number(body.factor)
  if (!Number.isFinite(factor) || factor <= 0) {
    return NextResponse.json({ error: 'Factor must be greater than 0' }, { status: 400 })
  }

  const material = await resolveMaterialReference<{ id: string; material_id: string }>(supabase, material_id, 'id, material_id')
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  const { data: before } = await supabase
    .from('mat_uom_conv')
    .select('*')
    .eq('material_id', material.material_id)
    .eq('from_uom', from_uom)
    .eq('to_uom', to_uom)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'UOM conversion not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('mat_uom_conv')
    .update({
      factor,
      formula_note: typeof body.formula_note === 'string' ? body.formula_note : null,
    })
    .eq('material_id', material.material_id)
    .eq('from_uom', from_uom)
    .eq('to_uom', to_uom)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_uom_conv',
    entityKey: `${material.material_id}:${from_uom}:${to_uom}`,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const material_id = searchParams.get('material_id')
  const from_uom = searchParams.get('from_uom')
  const to_uom = searchParams.get('to_uom')

  if (!material_id || !from_uom || !to_uom) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const material = await resolveMaterialReference<{ id: string; material_id: string }>(supabase, material_id, 'id, material_id')
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  const { data: before } = await supabase
    .from('mat_uom_conv')
    .select('*')
    .eq('material_id', material.material_id)
    .eq('from_uom', from_uom)
    .eq('to_uom', to_uom)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'UOM conversion not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('mat_uom_conv')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('material_id', material.material_id)
    .eq('from_uom', from_uom)
    .eq('to_uom', to_uom)
    .eq('is_deleted', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_uom_conv',
    entityKey: `${material.material_id}:${from_uom}:${to_uom}`,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'UOM conversion deleted' })
}
