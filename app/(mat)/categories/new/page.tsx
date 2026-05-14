import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { CategoryForm } from '@/components/mat/CategoryForm'

export default async function NewCategoryPage() {
  const supabase = await createClient()
  const categoriesRes = await supabase
    .from('mat_category')
    .select('*')
    .order('sort_order')
  const categories = assertSupabase(categoriesRes, 'Failed to load categories for form')

  return (
    <div>
      <Header title="เพิ่มหมวดหมู่" />
      <div className="mx-auto max-w-2xl">
        <CategoryForm mode="create" categories={categories ?? []} />
      </div>
    </div>
  )
}
