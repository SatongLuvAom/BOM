import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { databaseError, validationError } from '@/lib/api/responses'
import { sanitizeSpecKey } from '@/lib/material-code'

const changeSchema = z.object({
  material_id: z.string().min(1),
  material_type_id: z.string().uuid(),
  code_spec_key: z.string().optional().default('GEN'),
  change_reason: z.string().trim().min(3, 'Change reason is required'),
})

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = changeSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const input = parsed.data
  const supabase = await createClient()
  const specKey = sanitizeSpecKey(input.code_spec_key)

  const { data, error } = await supabase.rpc('fn_apply_material_code_change_v1', {
    p_material_id: input.material_id,
    p_material_type_id: input.material_type_id,
    p_code_spec_key: specKey,
    p_change_reason: input.change_reason,
    p_changed_by: owner.id,
  })

  if (error) {
    const message = /function .*fn_apply_material_code_change_v1/i.test(error.message)
      ? 'ยังไม่ได้ติดตั้ง SQL สำหรับเปลี่ยนรหัสวัสดุ กรุณารัน phase2a10_material_code_standard_v1.sql และ phase2b7_material_code_rpc_rls_fix.sql'
      : 'เปลี่ยนรหัสวัสดุไม่สำเร็จ'
    return databaseError(message, { message: error.message })
  }

  const result = Array.isArray(data) ? data[0] : data

  if (!result?.new_code) {
    return databaseError('เปลี่ยนรหัสวัสดุไม่สำเร็จ: ระบบไม่ส่งรหัสใหม่กลับมา')
  }

  await writeAuditLog({
    entityType: 'mat_master',
    entityKey: input.material_id,
    action: 'UPDATE',
    payload: {
      before: { material_code: result?.old_code ?? null },
      after: { material_code: result?.new_code ?? null, code_spec_key: specKey, material_type_id: input.material_type_id },
      change_reason: input.change_reason,
    },
    createdBy: owner.id,
  })

  return NextResponse.json({ data: result })
}
