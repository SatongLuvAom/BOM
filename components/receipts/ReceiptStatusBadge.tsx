import type { ReceiptStatus } from '@/types/receipt'

const statusMap: Record<ReceiptStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  needs_review: {
    label: 'ต้องตรวจสอบ',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  reviewed: {
    label: 'ตรวจแล้ว',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  posted: {
    label: 'บันทึกแล้ว',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: 'ยกเลิก',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
}

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const item = statusMap[status] ?? statusMap.draft
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${item.className}`}>
      {item.label}
    </span>
  )
}
