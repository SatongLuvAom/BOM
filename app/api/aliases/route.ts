import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createAliasSchema } from '@/lib/validations/material'
import { generateAliasId, writeAuditLog } from '@/lib/server-utils'
import { isUuid, normalizeMaterialSearchText } from '@/lib/material-master'

// POST /api/aliases
export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()

  const parsed = createAliasSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const input = parsed.data
  const { data: material } = await (isUuid(input.material_id)
    ? supabase
      .from('mat_master')
      .select('id, material_id')
      .eq('id', input.material_id)
      .eq('is_deleted', false)
      .single()
    : supabase
      .from('mat_master')
      .select('id, material_id')
      .or(`material_id.eq.${input.material_id},material_code.eq.${input.material_id}`)
      .eq('is_deleted', false)
      .single())

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 400 })
  }

  const normalizedAlias = normalizeMaterialSearchText(input.alias_name)

  // Duplicate: same alias_name for same material
  const { data: existing } = await supabase
    .from('mat_alias')
    .select('alias_id')
    .eq('material_id', material.material_id)
    .eq('is_deleted', false)
    .eq('normalized_alias', normalizedAlias)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'ชื่อนี้มีอยู่แล้วสำหรับวัสดุนี้' },
      { status: 409 },
    )
  }

  const alias_id = await generateAliasId()

  const { data, error } = await supabase
    .from('mat_alias')
    .insert({
      ...input,
      material_id: material.material_id,
      material_uuid: material.id,
      normalized_alias: normalizedAlias,
      alias_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    entityType: 'mat_alias',
    entityKey: alias_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
