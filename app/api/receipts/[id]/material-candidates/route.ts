import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'
import { getReceiptMaterialCandidates } from '@/lib/server/receipt-material-candidates'

type Ctx = { params: Promise<{ id: string }> }

function receiptCandidateError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not load material candidates. Run sql/phase2b5_receipt_material_candidates.sql in Supabase first.', error)
  }

  return databaseError('Receipt material candidate operation failed', {
    message: (error as Error).message,
  })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  try {
    const supabase = await createClient()
    const data = await getReceiptMaterialCandidates(supabase, id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptCandidateError(error)
  }
}
