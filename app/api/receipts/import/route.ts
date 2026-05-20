import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  attachReceiptFile,
  applyExtractionToReceiptDraft,
} from '@/lib/server/receipt-ai'
import {
  ReceiptImportError,
  createReceiptDraft,
  createReceiptDraftSchema,
  getReceiptById,
  isReceiptSchemaMissing,
  listReceiptItems,
} from '@/lib/server/receipt-import'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
])

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not import receipt. Run receipt import SQL migrations in Supabase first.', error)
  }

  return databaseError('Receipt import operation failed', {
    message: (error as Error).message,
  })
}

function validateImportFile(file: File) {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return 'รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF'
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'ไฟล์ใหญ่เกิน 10 MB'
  }

  return null
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const form = await req.formData()
  const file = form.get('file')
  const readAi = form.get('readAi') !== 'false'

  if (!(file instanceof File)) {
    return apiError('VALIDATION_ERROR', 'ไม่พบไฟล์สลิป', 400)
  }

  const fileError = validateImportFile(file)
  if (fileError) {
    return apiError('VALIDATION_ERROR', fileError, 400)
  }

  try {
    const supabase = await createClient()
    const draft = await createReceiptDraft(supabase, createReceiptDraftSchema.parse({}), owner.id)
    const attachedReceipt = await attachReceiptFile(supabase, draft.id, file, owner.id)

    if (!readAi) {
      const items = await listReceiptItems(supabase, draft.id)
      return NextResponse.json({
        data: {
          receipt: attachedReceipt,
          items,
          extraction: null,
          warning: null,
        },
      }, { status: 201 })
    }

    try {
      const data = await applyExtractionToReceiptDraft(supabase, draft.id, {
        replaceItems: true,
        userId: owner.id,
      })
      return NextResponse.json({ data }, { status: 201 })
    } catch (error) {
      if (!(error instanceof ReceiptImportError)) throw error

      const items = await listReceiptItems(supabase, draft.id)
      const receipt = await getReceiptById(supabase, draft.id)
      return NextResponse.json({
        data: {
          receipt,
          items,
          extraction: null,
          warning: error.message,
        },
      }, { status: 201 })
    }
  } catch (error) {
    return receiptError(error)
  }
}
