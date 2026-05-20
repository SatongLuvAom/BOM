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

function getReceiptRedirectPath(receiptId: string) {
  return `/receipts/${encodeURIComponent(receiptId)}`
}

function importResponse(input: {
  receipt: any
  items: any[]
  aiStatus: 'success' | 'missing_config' | 'failed' | 'skipped'
  message: string
  extraction?: unknown
  status?: number
}) {
  const receiptId = input.receipt?.id ?? null
  return NextResponse.json({
    ok: true,
    receiptId,
    redirectTo: receiptId ? getReceiptRedirectPath(receiptId) : null,
    status: input.receipt?.status ?? 'draft',
    aiStatus: input.aiStatus,
    message: input.message,
    data: {
      receipt: input.receipt,
      items: input.items,
      extraction: input.extraction ?? null,
      warning: input.aiStatus === 'success' || input.aiStatus === 'skipped' ? null : input.message,
    },
  }, { status: input.status ?? 201 })
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
      return importResponse({
        receipt: attachedReceipt,
        items,
        aiStatus: 'skipped',
        message: 'สร้าง Draft สำเร็จ',
      })
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
      const items = await listReceiptItems(supabase, draft.id)
      return importResponse({
        receipt: attachedReceipt,
        items,
        aiStatus: 'missing_config',
        message: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณากรอกข้อมูลเอง',
      })
    }

    try {
      const data = await applyExtractionToReceiptDraft(supabase, draft.id, {
        replaceItems: true,
        userId: owner.id,
      })
      return importResponse({
        receipt: data.receipt,
        items: data.items,
        extraction: data.extraction,
        aiStatus: 'success',
        message: data.extraction?.warnings?.length
          ? 'ระบบอ่านข้อมูลได้บางส่วน กรุณาตรวจสอบอีกครั้ง'
          : 'อ่านสลิปสำเร็จ กรุณาตรวจสอบข้อมูลก่อนบันทึก',
      })
    } catch (error) {
      if (!(error instanceof ReceiptImportError)) throw error

      const items = await listReceiptItems(supabase, draft.id)
      const receipt = await getReceiptById(supabase, draft.id)
      return importResponse({
        receipt,
        items,
        aiStatus: 'failed',
        message: error.message || 'ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือสร้าง Draft เปล่า',
      })
    }
  } catch (error) {
    return receiptError(error)
  }
}
