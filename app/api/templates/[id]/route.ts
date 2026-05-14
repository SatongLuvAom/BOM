import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_template')
    .select(`*, items:boq_template_item(*)`)
    .eq('template_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('boq_template')
    .select('*')
    .eq('template_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('boq_template')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('template_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_template',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ ok: true })
}
