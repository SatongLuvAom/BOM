import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { SupplierList } from '@/components/mat/SupplierList'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'

interface PageProps {
  searchParams: Promise<{
    search?: string
    status?: string
    page?: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function SuppliersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const status = sp.status ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit = 20
  const { from, to } = getPaginationRange(page, limit)
  const supabase = await createClient()

  let query = supabase
    .from('supplier')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    query = query.or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id'], search))
  }

  if (status) {
    query = query.eq('status', status)
  }

  const result = await query
    .order('updated_at', { ascending: false })
    .range(from, to)

  const suppliers = assertSupabase(result, 'Failed to load suppliers')
  const total = result.count ?? 0

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Suppliers"
        subtitle={`${total.toLocaleString()} records`}
        actions={
          <Link
            href="/suppliers/create"
            className="btn-primary"
          >
            + Add supplier
          </Link>
        }
      />

      <div className="mx-5 mt-6 rounded-t-3xl border border-b-0 border-slate-200 bg-white px-5 py-5 sm:mx-8">
        <SearchInput placeholder="Search supplier code, name, or tax ID..." />
      </div>

      <div className="mx-5 mb-6 min-h-48 flex-1 overflow-auto rounded-b-3xl border border-t-0 border-slate-200 bg-white sm:mx-8">
        <SupplierList suppliers={suppliers as any} />
      </div>

      <Pagination total={total} page={page} limit={limit} />
    </div>
  )
}
