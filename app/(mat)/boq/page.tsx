import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BoqList } from '@/components/boq/BoqList'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
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

export default async function BoqPage({ searchParams }: PageProps) {
  const sp     = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const status = sp.status ?? ''
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit  = 20
  const { from, to } = getPaginationRange(page, limit)

  const supabase = await createClient()

  let query = supabase
    .from('boq_project')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(buildOrIlikeFilter(['project_name', 'client_name', 'project_id'], search))
  }
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  const projects = data ?? []
  const total    = count ?? 0

  return (
    <div className="flex flex-col h-full">
      <Header
        title="BOQ Projects"
        subtitle={`${total.toLocaleString()} โปรเจกต์`}
        actions={
          <Link href="/boq/new" className="btn-primary">
            + สร้าง BOQ
          </Link>
        }
      />
      <div className="mx-6 mt-4 rounded-t-2xl border border-b-0 border-stone-200 bg-[var(--app-surface)] px-5 py-3">
        <SearchInput placeholder="ค้นหาชื่อโปรเจกต์, ลูกค้า, รหัส..." />
      </div>
      <div className="mx-6 flex-1 overflow-auto border-x border-stone-200 bg-[var(--app-surface)]">
        <BoqList projects={projects as any} />
      </div>
      <Pagination total={total} page={page} limit={limit} />
    </div>
  )
}
