'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { SearchInput } from '@/components/ui/SearchInput'
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge'
import styles from './receipts.module.css'
import type { PurchaseReceipt, ReceiptStatus } from '@/types/receipt'

const statusOptions: { value: ReceiptStatus | ''; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'draft', label: 'Draft' },
  { value: 'needs_review', label: 'ต้องตรวจสอบ' },
  { value: 'reviewed', label: 'ตรวจแล้ว' },
  { value: 'posted', label: 'บันทึกแล้ว' },
  { value: 'rejected', label: 'ยกเลิก' },
]

export function ReceiptListTable({ receipts }: { receipts: PurchaseReceipt[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [rows, setRows] = useState(receipts)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  async function deleteDraft(receipt: PurchaseReceipt) {
    if (receipt.status === 'posted') {
      setError('ไม่สามารถลบสลิปที่บันทึกเข้าระบบแล้วได้')
      return
    }
    if (!confirm(`ลบ Draft "${receipt.receipt_no || receipt.supplier_name_raw || receipt.id}" ?`)) return

    setDeleting(receipt.id)
    setError(null)
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'ลบ Draft ไม่สำเร็จ')
        return
      }
      setRows((current) => current.filter((row) => row.id !== receipt.id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className={`${styles.workflow} space-y-4`}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]">
          <SearchInput placeholder="ค้นหา supplier / receipt no..." searchOn="enter" minSearchLength={2} />
          <select aria-label="กรองตามสถานะสลิป" value={searchParams.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)} className="ops-select">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
      {isPending && (
        <div role="status" className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
          กำลังอัปเดตรายการ...
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-blue-950">รายการสลิป</h2>
          <p className="text-xs font-medium text-slate-500">แสดง {rows.length.toLocaleString('th-TH')} รายการในหน้านี้</p>
        </div>
        <div className="overflow-x-auto">
          <table className={`data-table ${styles.receiptTable}`}>
            <caption className="sr-only">รายการสลิปซื้อวัสดุและสถานะการตรวจสอบ</caption>
            <thead>
              <tr>
                <th scope="col">วันที่</th>
                <th scope="col">Supplier</th>
                <th scope="col">เลขที่เอกสาร</th>
                <th scope="col" className="text-right">ยอดรวม</th>
                <th scope="col">จำนวนรายการ</th>
                <th scope="col">สถานะ</th>
                <th scope="col">ผู้นำเข้า</th>
                <th scope="col" className="text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-400">
                    ยังไม่มี Draft สลิป
                  </td>
                </tr>
              )}
              {rows.map((receipt) => (
                <tr key={receipt.id}>
                  <td data-label="วันที่" className="whitespace-nowrap text-sm font-medium text-slate-600">
                    {receipt.receipt_date || '-'}
                  </td>
                  <td data-label="Supplier">
                    <p className="font-bold text-slate-900">{receipt.supplier?.supplier_name_th || receipt.supplier_name_raw || '-'}</p>
                    {receipt.supplier_name_raw && receipt.supplier?.supplier_name_th !== receipt.supplier_name_raw && (
                      <p className="text-xs text-slate-400">{receipt.supplier_name_raw}</p>
                    )}
                  </td>
                  <td data-label="เลขที่เอกสาร" className="font-mono text-xs font-semibold text-blue-900">{receipt.receipt_no || '-'}</td>
                  <td data-label="ยอดรวม" className="text-right font-semibold tabular-nums text-slate-900">
                    {receipt.grand_total == null ? '-' : Number(receipt.grand_total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td data-label="จำนวนรายการ" className="text-sm text-slate-500">{receipt.item_count ?? 0}</td>
                  <td data-label="สถานะ"><ReceiptStatusBadge status={receipt.status} /></td>
                  <td data-label="ผู้นำเข้า" title={receipt.created_by || undefined} className="max-w-[150px] truncate text-xs text-slate-500">{receipt.created_by || '-'}</td>
                  <td data-label="จัดการ">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link href={`/receipts/${receipt.id}`} className="rounded-lg px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50">
                        ดู / ตรวจสอบต่อ
                      </Link>
                      {receipt.status !== 'posted' && (
                        <button
                          type="button"
                          onClick={() => deleteDraft(receipt)}
                          disabled={deleting === receipt.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          {deleting === receipt.id ? 'กำลังลบ...' : 'ลบ Draft'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
