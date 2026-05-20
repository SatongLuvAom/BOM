import Link from 'next/link'
import { ReceiptCreateDraftForm } from '@/components/receipts/ReceiptCreateDraftForm'

export const dynamic = 'force-dynamic'

export default async function NewReceiptPage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Link href="/receipts" className="hover:text-blue-950">นำเข้าราคาจากสลิป</Link>
              <span className="text-slate-300">/</span>
              <span className="text-blue-950">สร้าง Draft ใหม่</span>
            </div>
            <h1 className="text-2xl font-bold text-blue-950">นำเข้าราคาจากสลิป</h1>
            <p className="mt-1 text-sm text-slate-500">
              อัปโหลดสลิปซื้อวัสดุ แล้วให้ระบบช่วยอ่านข้อมูลเพื่อสร้าง Draft สำหรับตรวจสอบก่อนบันทึกราคา
            </p>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <ReceiptCreateDraftForm />
      </div>
    </div>
  )
}
