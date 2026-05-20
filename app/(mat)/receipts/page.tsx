import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Pagination } from '@/components/ui/Pagination'
import { ReceiptListTable } from '@/components/receipts/ReceiptListTable'
import { RECEIPT_SELECT, isReceiptSchemaMissing } from '@/lib/server/receipt-import'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, buildPostgrestInFilter, normalizeSearchTerm } from '@/lib/supabase/filters'
import type { PurchaseReceipt, ReceiptStatus } from '@/types/receipt'

interface PageProps {
  searchParams: Promise<{
    search?: string
    status?: ReceiptStatus
    page?: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function ReceiptsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const status = sp.status ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit = 20
  const { from, to } = getPaginationRange(page, limit)
  const supabase = await createClient()

  let receipts: PurchaseReceipt[] = []
  let total = 0
  let schemaError: string | null = null

  try {
    let query = supabase
      .from('purchase_receipts')
      .select(RECEIPT_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)

    if (search) {
      const { data: supplierMatches } = await supabase
        .from('supplier')
        .select('id')
        .eq('is_deleted', false)
        .or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id'], search))
        .limit(100)

      const filters = [
        buildOrIlikeFilter(['receipt_no', 'supplier_name_raw', 'supplier_tax_id_raw', 'notes'], search),
        buildPostgrestInFilter('supplier_id', (supplierMatches ?? []).map((row) => row.id)),
      ].filter(Boolean)

      if (filters.length > 0) query = query.or(filters.join(','))
    }

    const result = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (result.error) throw result.error
    receipts = (result.data ?? []) as any
    total = result.count ?? 0

    const receiptIds = receipts.map((receipt) => receipt.id)
    if (receiptIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('purchase_receipt_items')
        .select('receipt_id')
        .in('receipt_id', receiptIds)

      const counts = new Map<string, number>()
      for (const row of itemRows ?? []) {
        counts.set(row.receipt_id, (counts.get(row.receipt_id) ?? 0) + 1)
      }
      receipts = receipts.map((receipt) => ({ ...receipt, item_count: counts.get(receipt.id) ?? 0 }))
    }
  } catch (error) {
    if (isReceiptSchemaMissing(error)) {
      schemaError = 'ยังไม่ได้รัน SQL migration สำหรับ Receipt Import v1'
    } else {
      throw error
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <span>คลังวัสดุ</span>
              <span className="text-slate-300">/</span>
              <span className="text-blue-950">นำเข้าราคาจากสลิป</span>
            </div>
            <h1 className="text-2xl font-bold text-blue-950">นำเข้าราคาจากสลิป</h1>
            <p className="mt-1 text-sm text-slate-500">
              จัดการสลิปซื้อวัสดุ ตรวจรายการ และบันทึกราคาเข้าระบบหลังตรวจสอบ
            </p>
          </div>
          <Link href="/receipts/new" className="btn-primary whitespace-nowrap">
            + สร้าง Draft ใหม่
          </Link>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {schemaError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <h2 className="font-bold">{schemaError}</h2>
            <p className="mt-2 text-sm">
              ให้รันไฟล์ <code className="rounded bg-white px-1">sql/phase2b_receipt_import_v1.sql</code> ใน Supabase ก่อนใช้งานหน้านี้
            </p>
          </div>
        ) : (
          <>
            <ReceiptListTable receipts={receipts} />
            <Pagination total={total} page={page} limit={limit} />
          </>
        )}
      </div>
    </div>
  )
}
