import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string; attachId: string }> }

const BUCKET = 'boq-attachments'

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, attachId } = await params
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('boq_attachment')
    .select('*')
    .eq('attachment_id', attachId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !row) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  // Create signed URL (60 min)
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 3600)

  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, ...row })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, attachId } = await params
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('boq_attachment')
    .select('*')
    .eq('attachment_id', attachId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !row) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  await supabase.storage.from(BUCKET).remove([row.storage_path])

  const { error: dbErr } = await supabase
    .from('boq_attachment')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('attachment_id', attachId)
    .eq('is_deleted', false)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_attachment',
    entityKey: attachId,
    action: 'DELETE',
    payload: row,
  })

  return NextResponse.json({ ok: true })
}
