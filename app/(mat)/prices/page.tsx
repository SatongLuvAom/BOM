import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pagination } from '@/components/ui/Pagination'
import { PriceList } from '@/components/mat/PriceList'
import { getPaginationRange } from '@/lib/utils'
import { buildOrIlikeFilter, buildPostgrestInFilter, normalizeSearchTerm } from '@/lib/supabase/filters'

interface PageProps {
  searchParams: Promise<{
    search?: string
    material_id?: string
    supplier_id?: string
    page?: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function PricesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const search = normalizeSearchTerm(sp.search)
  const materialId = sp.material_id ?? ''
  const supplierId = sp.supplier_id ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit = 20
  const { from, to } = getPaginationRange(page, limit)
  const supabase = await createClient()

  const [materialsRes, suppliersRes] = await Promise.all([
    supabase
      .from('mat_master')
      .select('material_id, mat_name_th')
      .eq('is_deleted', false)
      .order('mat_name_th'),
    supabase
      .from('supplier')
      .select('supplier_id, supplier_name_th')
      .eq('is_deleted', false)
      .order('supplier_name_th'),
  ])

  const materials = assertSupabase(materialsRes, 'Failed to load materials for price list')
  const suppliers = assertSupabase(suppliersRes, 'Failed to load suppliers for price list')

  let query = supabase
    .from('mat_price_base')
    .select(`
      *,
      material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `, { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    const [materialMatches, supplierMatches] = await Promise.all([
      supabase
        .from('mat_master')
        .select('material_id')
        .eq('is_deleted', false)
        .or(buildOrIlikeFilter(['mat_name_th', 'mat_name_en', 'spec'], search)),
      supabase
        .from('supplier')
        .select('supplier_id')
        .eq('is_deleted', false)
        .or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en'], search)),
    ])

    const filters: string[] = []
    const materialIds = materialMatches.data?.map((row) => row.material_id) ?? []
    const supplierIds = supplierMatches.data?.map((row) => row.supplier_id) ?? []

    if (materialIds.length > 0) {
      filters.push(buildPostgrestInFilter('material_id', materialIds))
    }

    if (supplierIds.length > 0) {
      filters.push(buildPostgrestInFilter('supplier_id', supplierIds))
    }

    const safeFilters = filters.filter(Boolean)

    if (safeFilters.length === 0) {
      return (
        <div className="flex h-full flex-col">
          <Header
            title="Base Prices"
            subtitle="0 records"
            actions={
              <Link
                href="/prices/new"
                className="btn-primary"
              >
                + Add price
              </Link>
            }
          />
          <div className="mx-6 mt-4 rounded-t-2xl border border-b-0 border-stone-200 bg-[var(--app-surface)] px-5 py-3">
            <SearchInput placeholder="Search material or supplier..." />
          </div>
          <div className="mx-6 flex-1 overflow-auto border-x border-stone-200 bg-[var(--app-surface)]">
            <PriceList
              prices={[]}
              materials={materials as any}
              suppliers={suppliers as any}
            />
          </div>
        </div>
      )
    }

    query = query.or(safeFilters.join(','))
  }

  if (materialId) {
    query = query.eq('material_id', materialId)
  }

  if (supplierId) {
    query = query.eq('supplier_id', supplierId)
  }

  const result = await query
    .order('effective_date', { ascending: false })
    .range(from, to)

  const prices = assertSupabase(result, 'Failed to load prices')
  const total = result.count ?? 0

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Base Prices"
        subtitle={`${total.toLocaleString()} records`}
        actions={
          <Link
            href="/prices/new"
            className="btn-primary"
          >
            + Add price
          </Link>
        }
      />

      <div className="mx-6 mt-4 rounded-t-2xl border border-b-0 border-stone-200 bg-[var(--app-surface)] px-5 py-3">
        <SearchInput placeholder="Search material or supplier..." />
      </div>

      <div className="mx-6 flex-1 overflow-auto border-x border-stone-200 bg-[var(--app-surface)]">
        <PriceList
          prices={prices as any}
          materials={materials as any}
          suppliers={suppliers as any}
        />
      </div>

      <Pagination total={total} page={page} limit={limit} />
    </div>
  )
}
