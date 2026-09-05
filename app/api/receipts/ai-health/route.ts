import { NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { checkReceiptAiModels } from '@/lib/server/receipt-ai'
import { apiError } from '@/lib/api/responses'

export const maxDuration = 45

// Explicit action: uses only synthetic text, never receipt files or database mutations.
export async function POST() {
  const user = await requireOwnerApi()
  if (user instanceof NextResponse) return user
  try {
    return NextResponse.json({ data: await checkReceiptAiModels() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return apiError('BAD_REQUEST', 'ตรวจการเชื่อมต่อ AI ไม่สำเร็จ กรุณาตรวจค่าตั้งบนเซิร์ฟเวอร์', 503)
  }
}
