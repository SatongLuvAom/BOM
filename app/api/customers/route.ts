import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateCustomerId, writeAuditLog } from '@/lib/server-utils'
import { createCustomerSchema } from '@/lib/validations/customer'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const sp     = req.nextUrl.searchParams
  const search = normalizeSearchTerm(sp.get('search'))
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit  = Math.min(500, parseInt(sp.get('limit') ?? '50', 10))
  const { from, to } = getPaginationRange(page, limit)

  const supabase = await createClient()

  let query = supabase
    .from('customer')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('customer_name', { ascending: true })
    .range(from, to)

  if (search) {
    query = query.or(buildOrIlikeFilter(['customer_name', 'contact_name', 'phone', 'customer_id'], search))
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body   = await req.json()
  const parsed = createCustomerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase    = await createClient()
  const customer_id = await generateCustomerId()

  // Clean empty email
  const payload = { ...parsed.data }
  if (payload.email === '') delete payload.email

  const { data, error } = await supabase
    .from('customer')
    .insert({ customer_id, ...payload })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'customer',
    entityKey: customer_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
