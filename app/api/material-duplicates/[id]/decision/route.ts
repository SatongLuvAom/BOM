import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { databaseError, notFoundError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { saveMaterialDuplicateDecision } from '@/lib/server/material-duplicates'

type Params = { params: Promise<{ id: string }> }

const decisionSchema = z.object({
  decision: z.enum(['CONFIRMED_DUPLICATE', 'NOT_DUPLICATE', 'REVIEW_LATER', 'MERGE_READY']),
  note: z.string().trim().max(1000).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = decisionSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const { id } = await params
  const supabase = await createClient()

  try {
    const result = await saveMaterialDuplicateDecision(supabase, {
      groupId: id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      decidedBy: owner.id,
    })

    await writeAuditLog({
      entityType: 'material_duplicate_groups',
      entityKey: id,
      action: 'UPDATE',
      payload: {
        before: result.before,
        after: result.group,
        decision: result.decision,
      },
      createdBy: owner.id,
    })

    return NextResponse.json({ data: result.group, decision: result.decision })
  } catch (error) {
    if ((error as Error).name === 'NotFoundError') {
      return notFoundError('Duplicate group not found')
    }
    if ((error as Error).name === 'ValidationError') {
      return validationError({ decision: [(error as Error).message] }, (error as Error).message)
    }

    return databaseError('Could not save duplicate decision', {
      message: (error as Error).message,
    })
  }
}
