import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { CategoryForm } from '@/components/mat/CategoryForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditCategoryPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [catRes, allCatsRes] = await Promise.all([
    supabase.from('mat_category').select('*').eq('cat_id', id).single(),
    supabase.from('mat_category').select('*').order('sort_order'),
  ])

  if (catRes.error) notFound()

  const category = assertSupabase(catRes, `Failed to load category ${id}`)
  const allCategories = assertSupabase(allCatsRes, 'Failed to load categories for edit form')

  return (
    <div>
      <Header title="แก้ไขหมวดหมู่" subtitle={catRes.data.cat_name_th} />
      <div className="mx-auto max-w-2xl">
        <CategoryForm
          mode="edit"
          category={category}
          categories={allCategories}
        />
      </div>
    </div>
  )
}
