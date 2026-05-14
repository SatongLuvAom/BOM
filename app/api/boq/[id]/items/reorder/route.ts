import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { z } from 'zod'

const schema = z.object({
  order: z.array(z.object({ item_id: z.string(), seq: z.number().int() })).min(1),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const supabase = await createClient()

  // Bulk update seq values
  const updates = parsed.data.order.map(({ item_id, seq }) =>
    supabase
      .from('boq_item')
      .update({ seq })
      .eq('item_id', item_id)
      .eq('project_id', id)
      .eq('is_deleted', false),
  )

  const results = await Promise.all(updates)
  const failed  = results.find((r) => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  await writeAuditLog({
    entityType: 'boq_item',
    entityKey: id,
    action: 'UPDATE',
    payload: { order: parsed.data.order },
  })

  return NextResponse.json({ message: 'reordered' })
}
