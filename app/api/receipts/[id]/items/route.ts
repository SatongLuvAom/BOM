import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import {
  ReceiptImportError,
  addReceiptItem,
  createReceiptItemSchema,
  isReceiptSchemaMissing,
  listReceiptItems,
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

  try {
    const supabase = await createClient()
    const data = await listReceiptItems(supabase, id)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const body = await req.json()
  const parsed = createReceiptItemSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  try {
    const supabase = await createClient()
    const data = await addReceiptItem(supabase, id, parsed.data, owner.id)
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    return receiptError(error)
  }
}
