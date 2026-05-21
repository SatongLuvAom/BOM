import { NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'
import { repairReceiptState } from '@/lib/server/receipt-material-candidates'

type Ctx = { params: Promise<{ id: string }> }

function repairStateError(error: unknown) {
  console.error('[receipt-repair-state-route] failed', {
    message: error instanceof Error ? error.message : String(error),
    code: error instanceof ReceiptImportError ? error.code : undefined,
    status: error instanceof ReceiptImportError ? error.status : undefined,
  })

  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not repair receipt state. Run sql/phase2b8_receipt_candidate_atomic_approval_and_repair.sql in Supabase first.', error)
  }

  return databaseError('Receipt state repair failed', {
    message: (error as Error).message,
  })
}

export async function POST(_req: Request, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  try {
    const supabase = await createClient()
    const data = await repairReceiptState(supabase, id, owner.id)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return repairStateError(error)
  }
}
