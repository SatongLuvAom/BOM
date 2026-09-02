import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BomList } from '@/components/bom/BomList'

export const dynamic = 'force-dynamic'

export default async function BomLibraryPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('bom_category')
    .order('bom_name')

  const boms = data ?? []

  return (
    <div>
      <Header
        title="BOM Library"
        subtitle="สูตรงานบูธและรายการวัสดุ/แรงงานมาตรฐานที่ใช้ซ้ำได้"
        actions={
          <Link
            href="/bom/create"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            สร้าง BOM
          </Link>
        }
      />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <BomList boms={boms as any} />
      </div>
    </div>
  )
}
