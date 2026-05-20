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
import {
  generateReceiptMaterialCandidates,
  listReceiptReviewItems,
} from '@/lib/server/receipt-material-candidates'

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
    const updated = await updateReceiptItem(supabase, id, itemId, parsed.data, owner.id)

    if (updated.action === 'create_material_needed' && !updated.material_id && !updated.material_candidate_id) {
      const generated = await generateReceiptMaterialCandidates(supabase, id, owner.id, { itemIds: [itemId] })
      const generatedItem = generated.items.find((item: any) => item.id === itemId)
      return NextResponse.json({ data: generatedItem ?? updated })
    }

    const items = await listReceiptReviewItems(supabase, id)
    const data = items.find((item: any) => item.id === itemId) ?? updated
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
