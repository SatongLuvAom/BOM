import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { formatThaiDateShort, statusLabel } from '@/lib/utils'
import type { MatMaster } from '@/types/mat'

export function RecentMaterials({ materials }: { materials: MatMaster[] }) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
        <h3 className="text-base font-bold text-neutral-950">อัปเดตล่าสุด</h3>
        <Link href="/materials" className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-950">
          ดูทั้งหมด →
        </Link>
      </div>

      <div className="divide-y divide-neutral-100">
        {materials.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">ยังไม่มีข้อมูล</p>
        )}
        {materials.map((m) => {
          const { label, color } = statusLabel(m.status)
          return (
            <div key={m.material_id} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-neutral-50/80">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/materials/${m.material_id}`}
                  className="block truncate text-sm font-semibold text-neutral-900 hover:text-neutral-600"
                >
                  {m.mat_name_th}
                </Link>
                <p className="font-mono text-[10px] text-neutral-400">{m.material_id}</p>
              </div>
              <Badge label={label} color={color as 'green' | 'gray' | 'red'} />
              <span className="w-14 whitespace-nowrap text-right text-[10px] text-neutral-400">
                {formatThaiDateShort(m.updated_at)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
