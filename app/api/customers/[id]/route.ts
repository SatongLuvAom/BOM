import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { updateCustomerSchema } from '@/lib/validations/customer'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer')
    .select('*')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Fetch related BOQ projects
  const { data: projects } = await supabase
    .from('boq_project')
    .select('project_id, project_name, project_date, status, created_at')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  return NextResponse.json({ data: { ...data, projects: projects ?? [] } })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body   = await req.json()
  const parsed = updateCustomerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const payload = { ...parsed.data }
  if (payload.email === '') delete payload.email

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('customer')
    .select('*')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('customer')
    .update(payload)
    .eq('customer_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'customer',
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
    .from('customer')
    .select('*')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('customer')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('customer_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'customer',
    entityKey: id,
    action: 'DELETE',
    payload: before,
  })

  return NextResponse.json({ ok: true })
}
