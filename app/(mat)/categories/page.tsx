import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { CategoryList } from '@/components/mat/CategoryList'
import type { MatCategory } from '@/types/mat'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const supabase = await createClient()

  const categoriesRes = await supabase
    .from('mat_category')
    .select('*')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('sort_order')
    .order('cat_id')

  const flat = assertSupabase(categoriesRes, 'Failed to load categories')

  // Client-side self-join for parent
  const categories: MatCategory[] = flat.map((c) => ({
    ...c,
    parent: c.parent_cat_id
      ? flat.find((p) => p.cat_id === c.parent_cat_id) ?? null
      : null,
  }))

  return (
    <div>
      <Header
        title="หมวดหมู่วัสดุ"
        subtitle={`${categories.length} หมวดหมู่`}
        actions={
          <Link
            href="/categories/new"
            className="btn-primary"
          >
            + เพิ่มหมวดหมู่
          </Link>
        }
      />
      <CategoryList categories={categories} />
    </div>
  )
}
