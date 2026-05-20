import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'
import {
  receiptMaterialCandidateUpdateSchema,
  updateReceiptMaterialCandidate,
} from '@/lib/server/receipt-material-candidates'

type Ctx = { params: Promise<{ id: string; candidateId: string }> }

function receiptCandidateError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not update material candidate. Run sql/phase2b5_receipt_material_candidates.sql in Supabase first.', error)
  }

  return databaseError('Receipt material candidate operation failed', {
    message: (error as Error).message,
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json().catch(() => ({}))
  const parsed = receiptMaterialCandidateUpdateSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const { id, candidateId } = await params

  try {
    const supabase = await createClient()
    const data = await updateReceiptMaterialCandidate(supabase, id, candidateId, parsed.data, owner.id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptCandidateError(error)
  }
}
