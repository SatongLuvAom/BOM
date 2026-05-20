import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  ReceiptImportError,
  deleteReceiptItem,
  isReceiptSchemaMissing,
  updateReceiptItem,
  updateReceiptItemSchema,
} from '@/lib/server/receipt-import'

type Ctx = { params: Promise<{ id: string; itemId: string }> }

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not load receipt import tables. Run sql/phase2b_receipt_import_v1.sql in Supabase first.', error)
  }

  return databaseError('Receipt import operation failed', {
    message: (error as Error).message,
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params
  const body = await req.json()
  const parsed = updateReceiptItemSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  try {
    const supabase = await createClient()
    const data = await updateReceiptItem(supabase, id, itemId, parsed.data, owner.id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id, itemId } = await params

  try {
    const supabase = await createClient()
    await deleteReceiptItem(supabase, id, itemId, owner.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return receiptError(error)
  }
}
