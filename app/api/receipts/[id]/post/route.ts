import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  ReceiptImportError,
  getReceiptById,
  isReceiptSchemaMissing,
  listReceiptItems,
  postReceiptToPriceHistory,
} from '@/lib/server/receipt-import'

type Ctx = { params: Promise<{ id: string }> }

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  if (isReceiptSchemaMissing(error)) {
    return databaseError('Could not post receipt. Run sql/phase2b_receipt_import_v1.sql in Supabase first.', error)
  }

  return databaseError('Receipt post operation failed', {
    message: (error as Error).message,
  })
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  try {
    const supabase = await createClient()
    const result = await postReceiptToPriceHistory(supabase, id, owner.id)
    const [receipt, items] = await Promise.all([
      getReceiptById(supabase, id),
      listReceiptItems(supabase, id),
    ])
    return NextResponse.json({ data: { result, receipt, items } })
  } catch (error) {
    return receiptError(error)
  }
}
