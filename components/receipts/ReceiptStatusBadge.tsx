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
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${item.className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {item.label}
    </span>
  )
}
