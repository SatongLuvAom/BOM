import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { updateBoqProjectSchema } from '@/lib/validations/boq'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_project')
    .select(`*, items:boq_item(*)`)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('seq', { referencedTable: 'items', ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })

  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body   = await req.json()
  const parsed = updateBoqProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('boq_project')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('boq_project')
    .update(parsed.data)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_project',
    entityKey: id,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('boq_project')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('boq_project')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_project',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ message: 'deleted' })
}
