import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'

type PageProps = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer, error } = await supabase
    .from('customer')
    .select('*')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .single()
  if (error || !customer) notFound()

  const { data: projects } = await supabase
    .from('boq_project')
    .select('project_id, project_name, project_date, status, created_at')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  const projectList = projects ?? []

  // Optional: aggregate total value across customer's BOQs
  let totalValue = 0
  if (projectList.length > 0) {
    const { data: items } = await supabase
      .from('boq_item')
      .select('total_price, project_id, item_type')
      .in('project_id', projectList.map((p) => p.project_id))
    totalValue = (items ?? [])
      .filter((i) => i.item_type !== 'SECTION')
      .reduce((s, r) => s + Number(r.total_price ?? 0), 0)
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={customer.customer_name}
        subtitle={`${customer.customer_id}${customer.customer_code ? ' · ' + customer.customer_code : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/customers/${id}/edit`}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              แก้ไข
            </Link>
            <Link
              href="/customers"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              ← กลับ
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Info card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white border border-gray-200 p-4 md:col-span-2">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">ข้อมูลติดต่อ</h3>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500">ผู้ติดต่อ</dt>
              <dd className="text-gray-900">{customer.contact_name ?? '—'}</dd>
              <dt className="text-gray-500">โทรศัพท์</dt>
              <dd className="text-gray-900">{customer.phone ?? '—'}</dd>
              <dt className="text-gray-500">อีเมล</dt>
              <dd className="text-gray-900">{customer.email ?? '—'}</dd>
              <dt className="text-gray-500">เลขผู้เสียภาษี</dt>
              <dd className="text-gray-900 font-mono text-xs">{customer.tax_id ?? '—'}</dd>
              <dt className="text-gray-500">ที่อยู่</dt>
              <dd className="text-gray-900 whitespace-pre-line">{customer.address ?? '—'}</dd>
            </dl>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-3">สรุป</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-blue-600">จำนวนโปรเจกต์</p>
                <p className="text-2xl font-bold text-blue-900">{projectList.length}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600">มูลค่ารวมทั้งหมด</p>
                <p className="text-xl font-bold text-blue-900">
                  {totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-blue-500">THB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Note */}
        {customer.note && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4">
            <h3 className="text-sm font-semibold text-yellow-800 mb-1">หมายเหตุ</h3>
            <p className="text-sm text-yellow-900 whitespace-pre-line">{customer.note}</p>
          </div>
        )}

        {/* Project history */}
        <div className="rounded-xl bg-white border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">ประวัติโปรเจกต์</h3>
            <span className="text-xs text-gray-400">{projectList.length} โปรเจกต์</span>
          </div>
          {projectList.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">ยังไม่มีโปรเจกต์ BOQ</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-2 font-medium text-gray-500">Project ID</th>
                  <th className="px-4 py-2 font-medium text-gray-500">ชื่อโปรเจกต์</th>
                  <th className="px-4 py-2 font-medium text-gray-500">วันที่</th>
                  <th className="px-4 py-2 font-medium text-gray-500">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projectList.map((p: any) => (
                  <tr key={p.project_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link href={`/boq/${p.project_id}`} className="font-mono text-xs text-blue-600 hover:underline">
                        {p.project_id}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-900">{p.project_name}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(p.project_date).toLocaleDateString('th-TH')}</td>
                    <td className="px-4 py-2 text-gray-500">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
