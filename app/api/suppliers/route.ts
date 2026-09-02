import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { getPaginationRange } from '@/lib/utils'
import { createSupplierSchema } from '@/lib/validations/supplier'
import { generateSupplierId, writeAuditLog } from '@/lib/server-utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'
import { invalidateActiveSuppliersCache } from '@/lib/server/master-data-cache'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const search = normalizeSearchTerm(searchParams.get('search'))
  const status = searchParams.get('status') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
  const { from, to } = getPaginationRange(page, limit)

  let query = supabase
    .from('supplier')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    query = query.or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id'], search))
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
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
  const payload = {
    ...body,
    supplier_code: typeof body.supplier_code === 'string' ? body.supplier_code.trim().toUpperCase() : body.supplier_code,
    supplier_name_th: typeof body.supplier_name_th === 'string' ? body.supplier_name_th.trim() : body.supplier_name_th,
    supplier_name_en: typeof body.supplier_name_en === 'string' ? body.supplier_name_en.trim() : body.supplier_name_en,
    tax_id: typeof body.tax_id === 'string' ? body.tax_id.trim() : body.tax_id,
  }

  const parsed = createSupplierSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const input = parsed.data

  const { data: codeExisting } = await supabase
    .from('supplier')
    .select('supplier_id')
    .eq('supplier_code', input.supplier_code)
    .eq('is_deleted', false)
    .limit(1)

  if (codeExisting && codeExisting.length > 0) {
    return NextResponse.json(
      { error: `Supplier code "${input.supplier_code}" already exists` },
      { status: 409 },
    )
  }

  if (input.tax_id) {
    const { data: taxExisting } = await supabase
      .from('supplier')
      .select('supplier_id')
      .eq('tax_id', input.tax_id)
      .eq('is_deleted', false)
      .limit(1)

    if (taxExisting && taxExisting.length > 0) {
      return NextResponse.json(
        { error: `Tax ID "${input.tax_id}" already exists` },
        { status: 409 },
      )
    }
  }

  const supplier_id = await generateSupplierId()
  const { data, error } = await supabase
    .from('supplier')
    .insert({ ...input, supplier_id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  invalidateActiveSuppliersCache()

  await writeAuditLog({
    entityType: 'supplier',
    entityKey: supplier_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
