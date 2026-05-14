import Link from 'next/link'
import { formatThaiDateShort } from '@/lib/utils'
import type { MatPriceBase } from '@/types/mat'

export function LatestPrices({ prices }: { prices: MatPriceBase[] }) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
        <h3 className="text-base font-bold text-neutral-950">ราคาวัสดุล่าสุด</h3>
        <Link href="/materials" className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-950">
          ดูวัสดุทั้งหมด →
        </Link>
      </div>

      <div className="divide-y divide-neutral-100">
        {prices.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">ยังไม่มีข้อมูลราคา</p>
        )}
        {prices.map((p) => (
          <div
            key={`${p.material_id}-${p.supplier_id}-${p.effective_date}`}
            className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-neutral-50/80"
          >
            <div className="min-w-0 flex-1">
              <Link href={`/materials/${p.material_id}`} className="block truncate text-sm font-semibold text-neutral-900 hover:text-neutral-600">
                {p.material?.mat_name_th ?? p.material_id}
              </Link>
              <p className="text-xs text-neutral-400">{p.supplier?.supplier_name_th ?? p.supplier_id}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-neutral-950">
                {Number(p.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-neutral-400">
                {p.currency_code}/{p.uom?.uom_name_th ?? p.price_uom}
              </p>
            </div>
            <div className="w-14 shrink-0 text-right text-[10px] text-neutral-400">
              {formatThaiDateShort(p.effective_date)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
