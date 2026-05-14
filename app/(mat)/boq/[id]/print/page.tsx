import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BoqProject } from '@/types/boq'

interface PageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  MAT:     'วัสดุ',
  LABOR:   'แรงงาน',
  SERVICE: 'บริการ',
  MISC:    'อื่นๆ',
}

export default async function PrintPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_project')
    .select(`*, items:boq_item(*)`)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('seq', { referencedTable: 'items', ascending: true })
    .single()

  if (error || !data) notFound()

  const project = data as unknown as BoqProject
  const items   = project.items ?? []
  const grandTotal = items.reduce((s, i) => s + (i.total_price ?? 0), 0)

  const thDate = new Date(project.project_date).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex items-center gap-3 border-b border-gray-200 bg-white px-8 py-4">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨️ พิมพ์ PDF
        </button>
        <a href={`/boq/${id}`} className="text-sm text-gray-500 hover:text-gray-800">
          ← กลับ
        </a>
      </div>

      {/* Print content */}
      <div className="mx-auto max-w-4xl px-8 py-10 print:px-0 print:py-0 print:max-w-none">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">ใบประมาณราคา (BOQ)</h1>
          <p className="mt-1 text-sm text-gray-500">{project.project_id}</p>
        </div>

        {/* Project Info */}
        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-gray-200 p-5 text-sm">
          <div>
            <span className="text-gray-500">โปรเจกต์: </span>
            <span className="font-medium">{project.project_name}</span>
          </div>
          <div>
            <span className="text-gray-500">วันที่: </span>
            <span className="font-medium">{thDate}</span>
          </div>
          {project.client_name && (
            <div>
              <span className="text-gray-500">ลูกค้า: </span>
              <span className="font-medium">{project.client_name}</span>
            </div>
          )}
          {project.site_address && (
            <div className="col-span-2">
              <span className="text-gray-500">สถานที่: </span>
              <span className="font-medium">{project.site_address}</span>
            </div>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-900 bg-gray-100 text-left">
              <th className="px-3 py-2 text-center w-8">#</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2">รายการ / สเปก</th>
              <th className="px-3 py-2 text-center">หน่วย</th>
              <th className="px-3 py-2 text-right">จำนวน</th>
              <th className="px-3 py-2 text-right">Waste%</th>
              <th className="px-3 py-2 text-right">จำนวนสุทธิ</th>
              <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
              <th className="px-3 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.item_id} className="border-b border-gray-200">
                <td className="px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{TYPE_LABEL[item.item_type]}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{item.item_name}</p>
                  {item.spec && <p className="text-xs text-gray-500">{item.spec}</p>}
                </td>
                <td className="px-3 py-2 text-center">{item.uom}</td>
                <td className="px-3 py-2 text-right">{Number(item.qty).toLocaleString('th-TH', { maximumFractionDigits: 4 })}</td>
                <td className="px-3 py-2 text-right">{Number(item.waste_pct).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">{Number(item.final_qty).toLocaleString('th-TH', { maximumFractionDigits: 4 })}</td>
                <td className="px-3 py-2 text-right">{Number(item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(item.total_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">ไม่มีรายการ</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-900 bg-gray-50">
              <td colSpan={8} className="px-3 py-3 text-right font-semibold">รวมทั้งสิ้น</td>
              <td className="px-3 py-3 text-right text-lg font-bold text-blue-700">
                {grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Note */}
        {project.note && (
          <div className="mt-6 rounded border border-gray-200 p-4">
            <p className="text-xs text-gray-500">หมายเหตุ</p>
            <p className="mt-1 text-sm">{project.note}</p>
          </div>
        )}

        {/* Signature */}
        <div className="mt-16 grid grid-cols-2 gap-16 text-sm text-center">
          <div>
            <div className="border-t border-gray-400 pt-2">ผู้จัดทำ</div>
            <p className="mt-1 text-xs text-gray-400">วันที่ ........../........../..........&nbsp;</p>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">ผู้อนุมัติ</div>
            <p className="mt-1 text-xs text-gray-400">วันที่ ........../........../..........&nbsp;</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { font-size: 12px; }
        }
      `}</style>
    </>
  )
}
