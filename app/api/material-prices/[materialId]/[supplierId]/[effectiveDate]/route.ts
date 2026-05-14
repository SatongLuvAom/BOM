import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { updateMatPriceBaseSchema } from '@/lib/validations/supplier'
import { writeAuditLog } from '@/lib/server-utils'

type Params = {
  params: Promise<{ materialId: string; supplierId: string; effectiveDate: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId, effectiveDate } = await params

  const { data, error } = await supabase
    .from('mat_price_base')
    .select(`
      *,
      material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `)
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Price not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId, effectiveDate } = await params
  const body = await req.json()
  const payload = {
    ...body,
    currency_code: typeof body.currency_code === 'string' ? body.currency_code.trim().toUpperCase() : body.currency_code,
  }

  const parsed = updateMatPriceBaseSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { data: before } = await supabase
    .from('mat_price_base')
    .select('*')
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Price not found' }, { status: 404 })
  }

  let priceUomId: string | null | undefined
  if (parsed.data.price_uom) {
    const { data: uom } = await supabase
      .from('mat_uom')
      .select('id')
      .eq('uom_code', parsed.data.price_uom)
      .eq('is_deleted', false)
      .single()

    if (!uom) {
      return NextResponse.json({ error: 'Price UOM not found' }, { status: 400 })
    }
    priceUomId = uom.id
  }

  const patch: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.price_uom) {
    patch.price_uom_id = priceUomId ?? null
  }
  if (parsed.data.quote_date === '') patch.quote_date = null
  if (parsed.data.valid_until === '') patch.valid_until = null
  if (parsed.data.source_type === '') patch.source_type = null
  if (parsed.data.attachment_url === '') patch.attachment_url = null
  if (typeof parsed.data.vat_included === 'boolean') {
    patch.is_tax_included = parsed.data.vat_included
  }

  const { data, error } = await supabase
    .from('mat_price_base')
    .update(patch)
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)
    .select(`
      *,
      material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_price_base',
    entityKey: `${materialId}:${supplierId}:${effectiveDate}`,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { materialId, supplierId, effectiveDate } = await params

  const { data: before } = await supabase
    .from('mat_price_base')
    .select('*')
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Price not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('mat_price_base')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_price_base',
    entityKey: `${materialId}:${supplierId}:${effectiveDate}`,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'Price deleted' })
}
