import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { generateBoqId, writeAuditLog } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  // Fetch original project + items
  const { data: original, error: fetchErr } = await supabase
    .from('boq_project')
    .select(`*, items:boq_item(*)`)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (fetchErr || !original) {
    return NextResponse.json({ error: 'ไม่พบโปรเจกต์' }, { status: 404 })
  }

  const newId = await generateBoqId()

  // Insert new project
  const { data: newProject, error: projErr } = await supabase
    .from('boq_project')
    .insert({
      project_id:   newId,
      project_name: `${original.project_name} (สำเนา)`,
      client_name:  original.client_name,
      site_address: original.site_address,
      project_date: original.project_date,
      status:       'DRAFT',
      note:         original.note,
    })
    .select()
    .single()

  if (projErr || !newProject) {
    return NextResponse.json({ error: projErr?.message ?? 'สร้างสำเนาไม่สำเร็จ' }, { status: 500 })
  }

  // Insert cloned items
  const items: any[] = original.items ?? []
  if (items.length > 0) {
    const cloned = items.map(({
      id: _rowId,
      item_id,
      created_at,
      updated_at,
      created_by,
      updated_by,
      deleted_by,
      deleted_at,
      final_qty,
      total_price,
      is_deleted,
      ...rest
    }: any) => ({
      ...rest,
      project_id: newId,
    }))
    const { error: itemErr } = await supabase.from('boq_item').insert(cloned)
    if (itemErr) {
      return NextResponse.json({ error: itemErr.message }, { status: 500 })
    }
  }

  await writeAuditLog({
    entityType: 'boq_project',
    entityKey: newId,
    action: 'CLONE',
    payload: { cloned_from: id, project: newProject, items_count: items.length },
  })

  return NextResponse.json({ data: newProject }, { status: 201 })
}
