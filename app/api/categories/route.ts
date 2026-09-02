import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createCategorySchema } from '@/lib/validations/category'
import { generateCategoryId, writeAuditLog } from '@/lib/server-utils'
import { invalidateActiveCategoriesCache } from '@/lib/server/master-data-cache'

// GET /api/categories
export async function GET(_req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mat_category')
    .select('*')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('cat_id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Self-join for parent in JS to avoid PostgREST self-reference issues
  const withParent = (data ?? []).map((c) => ({
    ...c,
    parent: c.parent_cat_id
      ? data?.find((p) => p.cat_id === c.parent_cat_id) ?? null
      : null,
  }))

  return NextResponse.json({ data: withParent })
}

// POST /api/categories
export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()

  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Duplicate check: cat_code
  const { data: existing } = await supabase
    .from('mat_category')
    .select('cat_id')
    .eq('cat_code', parsed.data.cat_code)
    .eq('is_deleted', false)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `รหัสหมวดหมู่ "${parsed.data.cat_code}" มีอยู่แล้ว` },
      { status: 409 },
    )
  }

  const cat_id = await generateCategoryId()

  const { data, error } = await supabase
    .from('mat_category')
    .insert({ ...parsed.data, cat_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateActiveCategoriesCache()

  await writeAuditLog({
    entityType: 'mat_category',
    entityKey: cat_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
