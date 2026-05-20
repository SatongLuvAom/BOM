import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'
import {
  generateReceiptMaterialCandidates,
  generateReceiptMaterialCandidatesSchema,
} from '@/lib/server/receipt-material-candidates'

type Ctx = { params: Promise<{ id: string }> }

function receiptCandidateError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not create material candidates. Run sql/phase2b5_receipt_material_candidates.sql in Supabase first.', error)
  }

  return databaseError('Receipt material candidate operation failed', {
    message: (error as Error).message,
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json().catch(() => ({}))
  const parsed = generateReceiptMaterialCandidatesSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const { id } = await params

  try {
    const supabase = await createClient()
    const data = await generateReceiptMaterialCandidates(supabase, id, owner.id, parsed.data)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptCandidateError(error)
  }
}
