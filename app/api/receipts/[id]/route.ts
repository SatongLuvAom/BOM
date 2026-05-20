import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  ReceiptImportError,
  deleteReceiptDraft,
  getReceiptById,
  isReceiptSchemaMissing,
  listReceiptItems,
  updateReceiptDraft,
  updateReceiptDraftSchema,
} from '@/lib/server/receipt-import'

type Ctx = { params: Promise<{ id: string }> }

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

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  try {
    const receipt = await getReceiptById(supabase, id)
    if (!receipt) return apiError('NOT_FOUND', 'Receipt not found', 404)
    const items = await listReceiptItems(supabase, id)
    return NextResponse.json({ data: { receipt, items } })
  } catch (error) {
    return receiptError(error)
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body = await req.json()
  const parsed = updateReceiptDraftSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  try {
    const supabase = await createClient()
    const data = await updateReceiptDraft(supabase, id, parsed.data, owner.id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  try {
    const supabase = await createClient()
    await deleteReceiptDraft(supabase, id, owner.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return receiptError(error)
  }
}
