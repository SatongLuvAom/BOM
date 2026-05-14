import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { createUomSchema } from '@/lib/validations/category'

// GET /api/uom
export async function GET(_req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mat_uom')
    .select('*')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('uom_code', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

// POST /api/uom
export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()

  const parsed = createUomSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { data: existing } = await supabase
    .from('mat_uom')
    .select('uom_code')
    .eq('uom_code', parsed.data.uom_code)
    .eq('is_deleted', false)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `รหัสหน่วย "${parsed.data.uom_code}" มีอยู่แล้ว` },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('mat_uom')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'mat_uom',
    entityKey: parsed.data.uom_code,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
