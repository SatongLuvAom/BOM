import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { createAliasSchema } from '@/lib/validations/material'
import { normalizeMaterialSearchText } from '@/lib/material-master'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()
  const parsed = createAliasSchema.omit({ material_id: true }).partial().safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { data: before } = await supabase
    .from('mat_alias')
    .select('*')
    .eq('alias_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = { ...parsed.data }
  if (typeof parsed.data.alias_name === 'string') {
    patch.normalized_alias = normalizeMaterialSearchText(parsed.data.alias_name)

    const { data: existing } = await supabase
      .from('mat_alias')
      .select('alias_id')
      .eq('material_id', before.material_id)
      .eq('normalized_alias', patch.normalized_alias as string)
      .eq('is_deleted', false)
      .neq('alias_id', id)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'This alias already exists for the material' },
        { status: 409 },
      )
    }
  }

  const { data, error } = await supabase
    .from('mat_alias')
    .update(patch)
    .eq('alias_id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_alias',
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
    .from('mat_alias')
    .select('*')
    .eq('alias_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('mat_alias')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('alias_id', id)
    .eq('is_deleted', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'mat_alias',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'Alias deleted' })
}
