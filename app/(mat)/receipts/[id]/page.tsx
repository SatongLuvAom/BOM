import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReceiptReviewClient } from '@/components/receipts/ReceiptReviewClient'
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge'
import {
  ReceiptImportError,
  getReceiptById,
  isReceiptSchemaMissing,
  listReceiptItems,
} from '@/lib/server/receipt-import'
import { enrichReceiptItemsWithMaterialCandidates } from '@/lib/server/receipt-material-match'
import type { PurchaseReceiptItem, ReceiptSupplier, ReceiptUom } from '@/types/receipt'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ ai?: string; notice?: string; warning?: string }>
}

export const dynamic = 'force-dynamic'

export default async function ReceiptReviewPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const search = await searchParams
  const supabase = await createClient()

  try {
    const [receipt, items, suppliersRes, uomsRes] = await Promise.all([
      getReceiptById(supabase, id),
      listReceiptItems(supabase, id),
      supabase
        .from('supplier')
        .select('id, supplier_id, supplier_code, supplier_name_th')
        .eq('is_deleted', false)
        .order('supplier_name_th'),
      supabase
        .from('mat_uom')
        .select('id, uom_code, uom_name_th')
        .eq('is_deleted', false)
        .order('uom_code'),
    ])

    if (!receipt) notFound()
    if (suppliersRes.error) throw suppliersRes.error
    if (uomsRes.error) throw uomsRes.error
    const enrichedItems = await enrichReceiptItemsWithMaterialCandidates(supabase, items, receipt.supplier_id)

    return (
      <div className="flex min-h-full flex-col bg-slate-50">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Link href="/receipts" className="hover:text-blue-950">นำเข้าราคาจากสลิป</Link>
                <span className="text-slate-300">/</span>
                <span className="text-blue-950">สลิปซื้อวัสดุ</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-blue-950">สลิปซื้อวัสดุ</h1>
                <ReceiptStatusBadge status={receipt.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {receipt.supplier?.supplier_name_th || receipt.supplier_name_raw || 'ยังไม่ระบุ Supplier'}
                {receipt.receipt_no ? ` / ${receipt.receipt_no}` : ''}
                {receipt.receipt_date ? ` / ${receipt.receipt_date}` : ''}
              </p>
            </div>
            <Link href="/receipts" className="btn-secondary">กลับรายการสลิป</Link>
          </div>
        </div>

        <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
          <ReceiptReviewClient
            initialReceipt={receipt}
            initialItems={enrichedItems as PurchaseReceiptItem[]}
            suppliers={(suppliersRes.data ?? []) as ReceiptSupplier[]}
            uoms={(uomsRes.data ?? []) as ReceiptUom[]}
            initialMessage={getInitialReceiptMessage(search)}
            initialWarning={getInitialReceiptWarning(search)}
          />
        </div>
      </div>
    )
  } catch (error) {
    if (error instanceof ReceiptImportError && error.status === 404) notFound()
    if (isReceiptSchemaMissing(error)) {
      return (
        <div className="p-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <h1 className="font-bold">ยังไม่ได้รัน SQL migration สำหรับ Receipt Import v1</h1>
            <p className="mt-2 text-sm">
              ให้รันไฟล์ <code className="rounded bg-white px-1">sql/phase2b_receipt_import_v1.sql</code> และ <code className="rounded bg-white px-1">sql/phase2b2_receipt_ai_gemini.sql</code> ใน Supabase ก่อนใช้งานหน้านี้
            </p>
          </div>
        </div>
      )
    }
    throw error
  }
}

function getInitialReceiptMessage(search?: { ai?: string; notice?: string; warning?: string }) {
  if (search?.ai === 'success' || search?.notice === 'ai_success') {
    return 'อ่านสลิปสำเร็จ กรุณาตรวจสอบข้อมูลก่อนบันทึก'
  }
  return null
}

function getInitialReceiptWarning(search?: { ai?: string; warning?: string }) {
  if (search?.ai === 'missing_config') {
    return 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณากรอกข้อมูลเอง'
  }
  if (search?.ai === 'failed') {
    return search.warning || 'ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือกรอกข้อมูลเอง'
  }
  return search?.warning ?? null
}
