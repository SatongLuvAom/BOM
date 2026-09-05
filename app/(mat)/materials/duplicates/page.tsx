import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { MaterialDuplicateReviewClient } from '@/components/mat/MaterialDuplicateReviewClient'
import { createClient } from '@/lib/supabase/server'
import { getMaterialDuplicateGroups, type MaterialDuplicateGroup } from '@/lib/server/material-duplicates'
import { getCachedActiveCategories, getCachedActiveMaterialTypes } from '@/lib/server/master-data-cache'

export const dynamic = 'force-dynamic'

export default async function MaterialDuplicatesPage() {
  const supabase = await createClient({ measureDuplicateBomRead: true })
  const [categories, materialTypes] = await Promise.all([
    getCachedActiveCategories(),
    getCachedActiveMaterialTypes(),
  ])

  let groups: MaterialDuplicateGroup[] = []
  let initialError = ''
  try {
    groups = await getMaterialDuplicateGroups(supabase, { limit: 300 })
  } catch (error) {
    initialError = `Could not load duplicate groups. Run sql/phase2a11_material_duplicate_detection.sql in Supabase first. ${(error as Error).message}`
  }

  const unresolvedCount = groups.filter((group) => group.status === 'UNRESOLVED').length

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Material Duplicate Detection"
        subtitle={`${unresolvedCount.toLocaleString()} unresolved groups out of ${groups.length.toLocaleString()}`}
        actions={
          <div className="flex gap-2">
            <Link href="/materials/code-cleanup" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-stone-50">
              Code cleanup
            </Link>
            <Link href="/materials" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Materials
            </Link>
          </div>
        }
      />
      <main className="flex-1 overflow-auto px-6 py-6">
        <MaterialDuplicateReviewClient
          groups={groups as any}
          categories={categories as any}
          materialTypes={materialTypes as any}
          initialError={initialError}
        />
      </main>
    </div>
  )
}
