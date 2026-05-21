import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { CustomerList } from '@/components/customer/CustomerList'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'

interface PageProps {
  searchParams: Promise<{
    search?: string
    page?:   string
  }>
}

export const dynamic = 'force-dynamic'

export default async function CustomersPage({ searchParams }: PageProps) {
  const sp     = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit  = 30
  const { from, to } = getPaginationRange(page, limit)

  const supabase = await createClient()

  let query = supabase
    .from('customer')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('customer_name', { ascending: true })
    .range(from, to)

  if (search) {
    query = query.or(buildOrIlikeFilter(['customer_name', 'contact_name', 'phone', 'customer_id'], search))
  }

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  const customers = data ?? []
  const total     = count ?? 0

  return (
    <div className="flex flex-col h-full">
      <Header
        title="ลูกค้า"
        subtitle={`${total.toLocaleString()} ราย`}
        actions={
          <Link
            href="/customers/create"
            className="btn-primary"
          >
            + เพิ่มลูกค้า
          </Link>
        }
      />
      <div className="px-6 pt-4">
        <SearchInput placeholder="ค้นหาชื่อลูกค้า, ผู้ติดต่อ, โทรศัพท์..." />
      </div>
      <div className="flex-1 overflow-auto">
        <CustomerList customers={customers as any} />
      </div>
      <Pagination total={total} page={page} limit={limit} />
    </div>
  )
}
