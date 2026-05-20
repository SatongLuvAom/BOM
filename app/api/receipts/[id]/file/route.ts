import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  attachReceiptFile,
  createReceiptFileSignedUrl,
} from '@/lib/server/receipt-ai'
import { ReceiptImportError, isReceiptSchemaMissing } from '@/lib/server/receipt-import'

type Ctx = { params: Promise<{ id: string }> }

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not manage receipt file. Run sql/phase2b2_receipt_ai_gemini.sql in Supabase first.', error)
  }

  return databaseError('Receipt file operation failed', {
    message: (error as Error).message,
  })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  try {
    const supabase = await createClient()
    const signedUrl = await createReceiptFileSignedUrl(supabase, id)
    return NextResponse.redirect(signedUrl)
  } catch (error) {
    return receiptError(error)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return apiError('VALIDATION_ERROR', 'ไม่พบไฟล์สลิป', 400)
  }

  try {
    const supabase = await createClient()
    const data = await attachReceiptFile(supabase, id, file, owner.id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}
