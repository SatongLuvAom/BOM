import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { apiError, databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { ReceiptImportError, searchMaterialCandidates } from '@/lib/server/receipt-import'

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
  const limit = Math.min(10, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '8', 10)))

  try {
    const supabase = await createClient()
    const data = await searchMaterialCandidates(supabase, search, limit)
    return NextResponse.json({ data })
  } catch (error) {
    return receiptError(error)
  }
}
