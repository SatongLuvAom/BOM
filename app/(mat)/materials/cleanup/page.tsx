import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { MaterialCleanupClient } from '@/components/mat/MaterialCleanupClient'

export const dynamic = 'force-dynamic'

export default function MaterialCleanupPage() {
  return (
    <div className="flex h-full flex-col">
      <Header
        title="Material cleanup"
        subtitle="Review material QA groups on demand instead of recalculating every page load"
        actions={
          <Link href="/materials" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-stone-50">
            Back to materials
          </Link>
        }
      />
      <MaterialCleanupClient />
    </div>
  )
}
