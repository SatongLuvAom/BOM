import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { applyExtractionToReceiptDraft } from '@/lib/server/receipt-ai'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'

type Ctx = { params: Promise<{ id: string }> }

const extractSchema = z.object({
  replaceItems: z.boolean().optional().default(false),
})

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not run receipt AI extraction. Run sql/phase2b2_receipt_ai_gemini.sql in Supabase first.', error)
  }

  return databaseError('Receipt AI extraction failed', {
    message: (error as Error).message,
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json().catch(() => ({}))
  const parsed = extractSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const { id } = await params

  try {
    const supabase = await createClient()
    const data = await applyExtractionToReceiptDraft(supabase, id, {
      replaceItems: parsed.data.replaceItems,
      userId: owner.id,
    })
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}
