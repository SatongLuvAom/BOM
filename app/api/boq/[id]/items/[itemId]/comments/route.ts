import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string; itemId: string }> }

const createCommentSchema = z.object({
  body:   z.string().min(1, 'กรุณากรอกข้อความ'),
  author: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_comment')
    .select('*')
    .eq('item_id', itemId)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params
  const body   = await req.json()
  const parsed = createCommentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boq_comment')
    .insert({
      item_id:    itemId,
      project_id: id,
      body:       parsed.data.body.trim(),
      author:     parsed.data.author?.trim() || 'ผู้ใช้',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_comment',
    entityKey: data.comment_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
