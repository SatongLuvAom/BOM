import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { updateSupplierSchema } from '@/lib/validations/supplier'
import { writeAuditLog } from '@/lib/server-utils'
import { databaseError, duplicateError, notFoundError, relationInUseError, validationError } from '@/lib/api/responses'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('supplier')
    .select('*')
    .eq('supplier_id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !data) {
    return notFoundError('Supplier not found')
  }

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()
  const payload = {
    ...body,
    supplier_code: typeof body.supplier_code === 'string' ? body.supplier_code.trim().toUpperCase() : body.supplier_code,
    supplier_name_th: typeof body.supplier_name_th === 'string' ? body.supplier_name_th.trim() : body.supplier_name_th,
    supplier_name_en: typeof body.supplier_name_en === 'string' ? body.supplier_name_en.trim() : body.supplier_name_en,
    tax_id: typeof body.tax_id === 'string' ? body.tax_id.trim() : body.tax_id,
  }

  const parsed = updateSupplierSchema.safeParse(payload)
  if (!parsed.success) {
    return validationError(parsed.error.flatten())
  }

  const { data: before } = await supabase
    .from('supplier')
    .select('*')
    .eq('supplier_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('Supplier not found')
  }

  if (parsed.data.supplier_code) {
    const { data: codeExisting } = await supabase
      .from('supplier')
      .select('supplier_id')
      .eq('supplier_code', parsed.data.supplier_code)
      .eq('is_deleted', false)
      .neq('supplier_id', id)
      .limit(1)

    if (codeExisting && codeExisting.length > 0) {
      return duplicateError(`Supplier code "${parsed.data.supplier_code}" already exists`)
    }
  }

  if (parsed.data.tax_id) {
    const { data: taxExisting } = await supabase
      .from('supplier')
      .select('supplier_id')
      .eq('tax_id', parsed.data.tax_id)
      .eq('is_deleted', false)
      .neq('supplier_id', id)
      .limit(1)

    if (taxExisting && taxExisting.length > 0) {
      return duplicateError(`Tax ID "${parsed.data.tax_id}" already exists`)
    }
  }

  const { data, error } = await supabase
    .from('supplier')
    .update(parsed.data)
    .eq('supplier_id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) {
    return databaseError('Could not update supplier', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'supplier',
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
    .from('supplier')
    .select('*')
    .eq('supplier_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('Supplier not found')
  }

  const [{ count: mapCount }, { count: priceCount }] = await Promise.all([
    supabase
      .from('mat_supplier_map')
      .select('supplier_id', { count: 'exact', head: true })
      .eq('supplier_id', id)
      .eq('is_deleted', false),
    supabase
      .from('mat_price_base')
      .select('supplier_id', { count: 'exact', head: true })
      .eq('supplier_id', id)
      .eq('is_deleted', false),
  ])

  if ((mapCount ?? 0) > 0 || (priceCount ?? 0) > 0) {
    return relationInUseError(
      'Cannot delete supplier because it is used in price history or material supplier mappings.',
      { material_supplier_mappings: mapCount ?? 0, price_history: priceCount ?? 0 },
    )
  }

  const { error } = await supabase
    .from('supplier')
    .delete()
    .eq('supplier_id', id)
    .eq('is_deleted', false)

  if (error) {
    return databaseError('Could not delete supplier', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'supplier',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'Supplier deleted' })
}
