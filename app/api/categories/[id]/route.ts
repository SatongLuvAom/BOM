import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { updateCategorySchema } from '@/lib/validations/category'
import { databaseError, duplicateError, notFoundError, relationInUseError, validationError } from '@/lib/api/responses'
import { invalidateActiveCategoriesCache } from '@/lib/server/master-data-cache'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('mat_category')
    .select('*')
    .eq('cat_id', id)
    .eq('is_active', true)
    .single()

  if (error) {
    return notFoundError('Category not found')
  }

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()

  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten())
  }

  const { data: before } = await supabase
    .from('mat_category')
    .select('*')
    .eq('cat_id', id)
    .eq('is_active', true)
    .single()

  if (!before) {
    return notFoundError('Category not found')
  }

  if (parsed.data.cat_code) {
    const { data: existing } = await supabase
      .from('mat_category')
      .select('cat_id')
      .eq('cat_code', parsed.data.cat_code)
      .eq('is_active', true)
      .neq('cat_id', id)
      .limit(1)

    if (existing && existing.length > 0) {
      return duplicateError(`Category code "${parsed.data.cat_code}" already exists`)
    }
  }

  const { data, error } = await supabase
    .from('mat_category')
    .update(parsed.data)
    .eq('cat_id', id)
    .eq('is_active', true)
    .select()
    .single()

  if (error) {
    return databaseError('Could not update category', { message: error.message })
  }

  invalidateActiveCategoriesCache()

  await writeAuditLog({
    entityType: 'mat_category',
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
    .from('mat_category')
    .select('*')
    .eq('cat_id', id)
    .eq('is_active', true)
    .single()

  if (!before) {
    return notFoundError('Category not found')
  }

  const { count } = await supabase
    .from('mat_master')
    .select('material_id', { count: 'exact', head: true })
    .or(`cat_id.eq.${id},category_id.eq.${before.id}`)
    .eq('is_deleted', false)

  if (count && count > 0) {
    return relationInUseError(
      `Cannot delete category because ${count} materials are still using it`,
      { materials: count },
    )
  }

  const { error } = await supabase
    .from('mat_category')
    .delete()
    .eq('cat_id', id)
    .eq('is_active', true)

  if (error) {
    return databaseError('Could not delete category', { message: error.message })
  }

  invalidateActiveCategoriesCache()

  await writeAuditLog({
    entityType: 'mat_category',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'Category deleted' })
}
