import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { getPaginationRange } from '@/lib/utils'
import { createMatPriceBaseSchema } from '@/lib/validations/supplier'
import { writeAuditLog } from '@/lib/server-utils'
import { buildOrIlikeFilter, buildPostgrestInFilter, normalizeSearchTerm } from '@/lib/supabase/filters'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const search = normalizeSearchTerm(searchParams.get('search'))
  const material_id = searchParams.get('material_id') ?? ''
  const supplier_id = searchParams.get('supplier_id') ?? ''
  const effective_from = searchParams.get('effective_from') ?? ''
  const effective_to = searchParams.get('effective_to') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
  const { from, to } = getPaginationRange(page, limit)

  let query = supabase
    .from('mat_price_base')
    .select(`
      *,
      material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `, { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    const normalized = normalizeMaterialSearchText(search)
    const [matIdsRes, supplierIdsRes] = await Promise.all([
      supabase
        .from('mat_master')
        .select('material_id')
        .eq('is_deleted', false)
        .or(buildOrIlikeFilter(['material_id', 'material_code', 'mat_name_th', 'mat_name_en', 'normalized_name', 'brand', 'model', 'spec'], normalized || search)),
      supabase
        .from('supplier')
        .select('supplier_id')
        .eq('is_deleted', false)
        .or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en'], search)),
    ])

    const materialIds = matIdsRes.data?.map((row) => row.material_id) ?? []
    const supplierIds = supplierIdsRes.data?.map((row) => row.supplier_id) ?? []
    const filters: string[] = []

    if (materialIds.length > 0) {
      filters.push(buildPostgrestInFilter('material_id', materialIds))
    }

    if (supplierIds.length > 0) {
      filters.push(buildPostgrestInFilter('supplier_id', supplierIds))
    }

    const safeFilters = filters.filter(Boolean)

    if (safeFilters.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        limit,
      })
    }

    query = query.or(safeFilters.join(','))
  }

  if (material_id) {
    query = query.eq('material_id', material_id)
  }

  if (supplier_id) {
    query = query.eq('supplier_id', supplier_id)
  }

  if (effective_from) {
    query = query.gte('effective_date', effective_from)
  }

  if (effective_to) {
    query = query.lte('effective_date', effective_to)
  }

  const { data, error, count } = await query
    .order('effective_date', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    limit,
  })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()
  const normalizedBody = {
    ...body,
    currency_code: typeof body.currency_code === 'string' ? body.currency_code.trim().toUpperCase() : body.currency_code,
  }

  const parsed = createMatPriceBaseSchema.safeParse(normalizedBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const input = parsed.data

  const [material, { data: supplier }, { data: uom }] = await Promise.all([
    resolveMaterialReference<{ id: string; material_id: string }>(supabase, input.material_id, 'id, material_id'),
    supabase
      .from('supplier')
      .select('id, supplier_id')
      .eq('supplier_id', input.supplier_id)
      .eq('is_deleted', false)
      .single(),
    supabase
      .from('mat_uom')
      .select('id, uom_code')
      .eq('uom_code', input.price_uom)
      .eq('is_deleted', false)
      .single(),
  ])

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 400 })
  }

  if (!uom) {
    return NextResponse.json({ error: 'Price UOM not found' }, { status: 400 })
  }

  const inputPayload = {
    ...input,
    material_id: material.material_id,
    material_uuid: material.id,
    supplier_uuid: supplier.id,
    price_uom_id: uom.id,
    quote_date: input.quote_date || input.effective_date,
    valid_until: input.valid_until || null,
    vat_included: input.vat_included ?? input.is_tax_included ?? false,
    is_tax_included: input.vat_included ?? input.is_tax_included ?? false,
    source_type: input.source_type || null,
    attachment_url: input.attachment_url || null,
  }

  const { data: mapping } = await supabase
    .from('mat_supplier_map')
    .select('is_deleted')
    .eq('material_id', inputPayload.material_id)
    .eq('supplier_id', inputPayload.supplier_id)
    .limit(1)

  if (!mapping || mapping.length === 0) {
    const { error: mapInsertError } = await supabase
      .from('mat_supplier_map')
      .insert({
        material_id: inputPayload.material_id,
        material_uuid: inputPayload.material_uuid,
        supplier_id: inputPayload.supplier_id,
        supplier_uuid: inputPayload.supplier_uuid,
        is_active: true,
        is_preferred: false,
        lead_time_days: inputPayload.lead_time_days,
        min_order_qty: inputPayload.min_order_qty,
      })

    if (mapInsertError) {
      return NextResponse.json({ error: mapInsertError.message }, { status: 500 })
    }
  } else if (mapping[0].is_deleted) {
    const { error: mapRestoreError } = await supabase
      .from('mat_supplier_map')
      .update({
        is_deleted: false,
        deleted_at: null,
        is_active: true,
      })
      .eq('material_id', inputPayload.material_id)
      .eq('supplier_id', inputPayload.supplier_id)

    if (mapRestoreError) {
      return NextResponse.json({ error: mapRestoreError.message }, { status: 500 })
    }
  }

  const { data: existing } = await supabase
    .from('mat_price_base')
    .select('is_deleted')
    .eq('material_id', inputPayload.material_id)
    .eq('supplier_id', inputPayload.supplier_id)
    .eq('effective_date', inputPayload.effective_date)
    .limit(1)

  if (existing && existing.length > 0) {
    const row = existing[0]

    if (!row.is_deleted) {
      return NextResponse.json(
        { error: 'A price already exists for the same material, supplier, and effective date' },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('mat_price_base')
      .update({
        ...inputPayload,
        is_deleted: false,
        deleted_at: null,
      })
      .eq('material_id', inputPayload.material_id)
      .eq('supplier_id', inputPayload.supplier_id)
      .eq('effective_date', inputPayload.effective_date)
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
      entityKey: `${inputPayload.material_id}:${inputPayload.supplier_id}:${inputPayload.effective_date}`,
      action: 'RESTORE',
      payload: data,
    })

    return NextResponse.json({ data }, { status: 201 })
  }

  const { data, error } = await supabase
    .from('mat_price_base')
    .insert(inputPayload)
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
    entityKey: `${inputPayload.material_id}:${inputPayload.supplier_id}:${inputPayload.effective_date}`,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
