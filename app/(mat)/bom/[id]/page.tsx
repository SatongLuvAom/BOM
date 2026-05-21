import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import type { BomItem, BomTemplate } from '@/types/bom'

type Props = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function BomDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('bom_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .single()

  if (error || !data) notFound()

  const bom = data as BomTemplate
  const items = [...(bom.items ?? [])].sort((a, b) => a.seq - b.seq)

  return (
    <div>
      <Header
        title={bom.bom_name}
        subtitle={bom.bom_id}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/bom" className="btn-secondary">กลับรายการ BOM</Link>
            <Link href={`/bom/${encodeURIComponent(bom.bom_id)}/edit`} className="btn-primary">แก้ไข BOM</Link>
          </div>
        }
      />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">หมวด</p>
              <p className="mt-1 font-semibold text-slate-900">{bom.bom_category ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">หน่วย BOM</p>
              <p className="mt-1 font-semibold text-slate-900">{bom.unit}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">จำนวนรายการ</p>
              <p className="mt-1 font-semibold text-slate-900">{items.length.toLocaleString('th-TH')} รายการ</p>
            </div>
          </div>
          {bom.description && (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{bom.description}</p>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-950">รายการในสูตร BOM</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">ลำดับ</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">รายการ</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">จำนวน/หน่วย</th>
                  <th className="px-4 py-3 text-right">Waste%</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">ยังไม่มีรายการใน BOM</td>
                  </tr>
                ) : items.map((item: BomItem) => (
                  <tr key={item.item_id ?? item.id}>
                    <td className="px-4 py-3 text-slate-500">{item.seq + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{item.item_type}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.item_name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.uom}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{Number(item.qty_per_unit).toLocaleString('th-TH')}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{Number(item.waste_pct).toLocaleString('th-TH')}</td>
                    <td className="px-4 py-3 text-slate-500">{item.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
