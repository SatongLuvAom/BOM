import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateTemplateId, writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'

const createSchema = z.object({
  template_name: z.string().min(1, 'กรุณาระบุชื่อ Template'),
  description:   z.string().optional(),
  category:      z.string().optional(),
})

export async function GET(_req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boq_template')
    .select(`*, items:boq_template_item(*)`)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body   = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase     = await createClient()
  const template_id  = await generateTemplateId()

  const { data, error } = await supabase
    .from('boq_template')
    .insert({ template_id, ...parsed.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_template',
    entityKey: template_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
