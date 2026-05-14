import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

const BUCKET = 'boq-attachments'

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_attachment')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const form = await req.formData()
  const file = form.get('file') as File | null
  const note = (form.get('note') as string | null) ?? ''

  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  // Limit: 20 MB
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 20 MB' }, { status: 400 })
  }

  const ext  = file.name.split('.').pop() ?? 'bin'
  const path = `${id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error: dbErr } = await supabase
    .from('boq_attachment')
    .insert({
      project_id:   id,
      file_name:    file.name,
      file_size:    file.size,
      mime_type:    file.type || `application/${ext}`,
      storage_path: path,
      note:         note.trim() || null,
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_attachment',
    entityKey: data.attachment_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
