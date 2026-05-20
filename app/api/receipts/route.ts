import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'
import {
  RECEIPT_SELECT,
  ReceiptImportError,
  createReceiptDraft,
  createReceiptDraftSchema,
  isReceiptSchemaMissing,
} from '@/lib/server/receipt-import'

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

function getReceiptRedirectPath(receiptId: string) {
  return `/receipts/${encodeURIComponent(receiptId)}`
}

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const search = normalizeSearchTerm(searchParams.get('search'))
  const status = searchParams.get('status') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const { from, to } = getPaginationRange(page, limit)

  try {
    let query = supabase
      .from('purchase_receipts')
      .select(RECEIPT_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (search) {
      query = query.or(buildOrIlikeFilter(['receipt_no', 'supplier_name_raw', 'supplier_tax_id_raw', 'notes'], search))
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    return receiptError(error)
  }
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = createReceiptDraftSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  try {
    const supabase = await createClient()
    const data = await createReceiptDraft(supabase, parsed.data, owner.id)
    return NextResponse.json({
      ok: true,
      receiptId: data.id,
      redirectTo: getReceiptRedirectPath(data.id),
      data,
    }, { status: 201 })
  } catch (error) {
    return receiptError(error)
  }
}
