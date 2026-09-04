import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { ReceiptImportError, getReceiptById, searchMaterialCandidates } from '@/lib/server/receipt-import'
import { searchSupplierMaterialCandidates } from '@/lib/server/receipt-material-match'

function receiptError(error: unknown) {
  if (error instanceof ReceiptImportError) {
    return apiError(error.code as any, error.message, error.status, error.details)
  }

  return databaseError('Could not search material candidates', {
    message: (error as Error).message,
  })
}

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const search = req.nextUrl.searchParams.get('search') ?? ''
  const parsed = z.object({
    receipt_id: z.string().uuid(),
    scope: z.enum(['supplier', 'all']).default('supplier'),
    limit: z.coerce.number().int().min(1).max(10).default(8),
  }).safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return apiError('VALIDATION_ERROR', 'กรุณาระบุสลิปและขอบเขตค้นหาที่ถูกต้อง', 400)

  try {
    const supabase = await createClient()
    const receipt = await getReceiptById(supabase, parsed.data.receipt_id)
    if (!receipt) return apiError('NOT_FOUND', 'Receipt not found', 404)
    if (!receipt.supplier_id) return apiError('VALIDATION_ERROR', 'กรุณายืนยันร้านค้าก่อนค้นหาวัสดุ', 400)
    const data = parsed.data.scope === 'all'
      ? await searchMaterialCandidates(supabase, search, parsed.data.limit)
      : await searchSupplierMaterialCandidates(supabase, receipt.supplier_id, search, parsed.data.limit)
    return NextResponse.json({ data, supplier_id: receipt.supplier_id, scope: parsed.data.scope })
  } catch (error) {
    return receiptError(error)
  }
}
