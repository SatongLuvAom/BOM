import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { MaterialCodeSettingsClient } from '@/components/mat/MaterialCodeSettingsClient'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { getDictionary } from '@/lib/i18n/getDictionary'
import { getCachedActiveCategories, getCachedActiveMaterialTypes } from '@/lib/server/master-data-cache'

export const dynamic = 'force-dynamic'

export default async function MaterialCodeSettingsPage() {
  const supabase = await createClient()
  const { text } = await getDictionary()
  const [categories, materialTypes, sequencesRes] = await Promise.all([
    getCachedActiveCategories(),
    getCachedActiveMaterialTypes(),
    supabase
      .from('material_code_sequences')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200),
  ])

  const sequences = assertSupabase(sequencesRes, 'Failed to load material code sequences')

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Material Code Settings"
        subtitle="Manage CATEGORY-TYPE-SPEC-SEQ rules, prefixes, material types, and sequence groups"
        actions={
          <div className="flex flex-wrap gap-2" data-i18n-managed>
            <Link href="/materials/code-cleanup" className="btn-secondary">
              {text('Code cleanup')}
            </Link>
            <Link href="/materials" className="btn-primary">
              {text('Materials')}
            </Link>
          </div>
        }
      />
      <div className="app-page-content flex-1 overflow-auto">
        <MaterialCodeSettingsClient
          categories={categories as any}
          materialTypes={materialTypes as any}
          sequences={sequences as any}
        />
      </div>
    </div>
  )
}
