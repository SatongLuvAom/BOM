import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { databaseError, validationError } from '@/lib/api/responses'
import { sanitizeSpecKey } from '@/lib/material-code'

const cleanupItemSchema = z.object({
  material_id: z.string().min(1),
  material_type_id: z.string().uuid(),
  code_spec_key: z.string().optional().default('GEN'),
  change_reason: z.string().trim().min(3).optional(),
})

const cleanupSchema = z.object({
  items: z.array(cleanupItemSchema).min(1).max(100),
  change_reason: z.string().trim().min(3, 'Change reason is required'),
})

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = cleanupSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const input = parsed.data
  const items = input.items.map((item) => ({
    material_id: item.material_id,
    material_type_id: item.material_type_id,
    code_spec_key: sanitizeSpecKey(item.code_spec_key),
    change_reason: item.change_reason?.trim() || input.change_reason,
  }))

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_apply_material_code_cleanup_v1', {
    p_items: items,
    p_changed_by: owner.id,
  })

  if (error) {
    return databaseError('Could not apply material code cleanup', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'mat_master',
    entityKey: 'material-code-cleanup',
    action: 'UPDATE',
    payload: {
      after: data,
      change_reason: input.change_reason,
    },
    createdBy: owner.id,
  })

  return NextResponse.json({ data })
}
