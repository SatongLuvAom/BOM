import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateBoqId, writeAuditLog } from '@/lib/server-utils'
import { createBoqProjectSchema } from '@/lib/validations/boq'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const sp     = req.nextUrl.searchParams
  const search = normalizeSearchTerm(sp.get('search'))
  const status = sp.get('status') ?? ''
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit  = Math.min(100, parseInt(sp.get('limit') ?? '20', 10))
  const { from, to } = getPaginationRange(page, limit)

  const supabase = await createClient()

  let query = supabase
    .from('boq_project')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(buildOrIlikeFilter(['project_name', 'client_name', 'project_id'], search))
  }
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body   = await req.json()
  const parsed = createBoqProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase   = await createClient()
  const project_id = await generateBoqId()

  const { data, error } = await supabase
    .from('boq_project')
    .insert({
      project_id,
      ...parsed.data,
      project_date: parsed.data.project_date ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'boq_project',
    entityKey: project_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
