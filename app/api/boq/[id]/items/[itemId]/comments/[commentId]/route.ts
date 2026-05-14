import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string; itemId: string; commentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId, commentId } = await params
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('boq_comment')
    .select('*')
    .eq('comment_id', commentId)
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('boq_comment')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('comment_id', commentId)
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_comment',
    entityKey: commentId,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ ok: true })
}
