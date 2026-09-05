import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createMaterialSchema } from '@/lib/validations/material'
import { getPaginationRange } from '@/lib/utils'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { apiError, databaseError, validationError } from '@/lib/api/responses'
import { createMaterialMasterRecord, MaterialCreateError } from '@/lib/server/material-create'

type MaterialSortKey = 'material_code' | 'material_id' | 'mat_name_th' | 'brand' | 'status' | 'updated_at'

const MATERIAL_SORT_KEYS: MaterialSortKey[] = ['material_code', 'material_id', 'mat_name_th', 'brand', 'status', 'updated_at']

// GET /api/materials?search=&cat_id=&status=&page=1&limit=20&sort_by=updated_at&sort_dir=desc
export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const search  = normalizeSearchTerm(searchParams.get('search'))
  const cat_id  = searchParams.get('cat_id')  ?? ''
  const status  = searchParams.get('status')  ?? ''
  const hasPrice = searchParams.get('has_price') ?? ''
  const stalePrice = searchParams.get('stale_price') ?? ''
  const supplierId = searchParams.get('supplier_id') ?? ''
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit   = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
  const rawSortBy = searchParams.get('sort_by') ?? 'updated_at'
  const sortBy: MaterialSortKey = MATERIAL_SORT_KEYS.includes(rawSortBy as MaterialSortKey)
    ? (rawSortBy as MaterialSortKey)
    : 'updated_at'
  const sortAsc = searchParams.get('sort_dir') === 'asc'
  const { from, to } = getPaginationRange(page, limit)

  // Keep existing non-search sorting; push cross-table search and ranking to SQL.
  if (search) {
    const started = performance.now()
    const { data: payload, error } = await supabase.rpc('list_materials', {
      p_search: search ? normalizeMaterialSearchText(search) : null,
      p_cat_id: cat_id || null,
      p_status: status || null,
      p_has_price: hasPrice || null,
      p_stale_price: stalePrice || null,
      p_supplier_id: supplierId || null,
      p_sort_by: search ? null : sortBy,
      p_sort_dir: sortAsc ? 'asc' : 'desc',
      p_limit: limit,
      p_offset: from,
    })
    if (error) return databaseError('Could not search materials', error)
    const pageRows = Array.isArray(payload?.materials) ? payload.materials : []
    if (pageRows.length === 0) {
      return NextResponse.json({ data: [], total: Number(payload?.total ?? 0), page, limit })
    }
    // Hydrate only this page to preserve the existing API fields (including note/created_at).
    const { data: details, error: detailsError } = await supabase.from('mat_master')
      .select(`id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en,
        normalized_name, spec, brand, model, base_uom, base_uom_id, status, note, created_at, updated_at,
        category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th)`)
      .eq('is_deleted', false)
      .in('material_id', pageRows.map((row: { material_id: string }) => row.material_id))
    if (detailsError) return databaseError('Could not load material search results', detailsError)
    console.info(JSON.stringify({ event: 'material_search_page', duration_ms: Math.round(performance.now() - started), row_count: pageRows.length, query_count: 2 }))
    const byId = new Map((details ?? []).map((row) => [row.material_id, row]))
    return NextResponse.json({
      data: pageRows.map((row: { material_id: string }) => byId.get(row.material_id)).filter(Boolean),
      total: Number(payload?.total ?? 0), page, limit,
    })
  }

  let query = supabase
    .from('mat_master')
    .select(`
      id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en,
      normalized_name, spec, brand, model, base_uom, base_uom_id, status, note, created_at, updated_at,
      category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th)
    `, { count: 'exact' })
    .eq('is_deleted', false)

  if (cat_id)  query = query.eq('cat_id', cat_id)
  if (status)  query = query.eq('status', status)

  if (supplierId) {
    const { data: supplierMaps, error } = await supabase.from('mat_supplier_map')
      .select('material_id').eq('supplier_id', supplierId).eq('is_deleted', false)
    if (error) return databaseError('Could not filter material suppliers', error)
    query = query.in('material_id', supplierMaps?.map((row) => row.material_id) ?? ['__none__'])
  }
  if (hasPrice || stalePrice) {
    const { data: latestRows, error } = await supabase.from('material_latest_prices').select('material_id, is_stale')
    if (error) return databaseError('Could not filter material prices', error)
    let ids = (latestRows ?? []).map((row) => row.material_id)
    if (hasPrice === 'missing') {
      const { data: allRows, error } = await supabase.from('mat_master').select('material_id').eq('is_deleted', false)
      if (error) return databaseError('Could not filter missing prices', error)
      const priced = new Set(ids)
      ids = (allRows ?? []).map((row) => row.material_id).filter((id) => !priced.has(id))
    }
    if (stalePrice === 'yes') ids = (latestRows ?? []).filter((row) => row.is_stale).map((row) => row.material_id)
    query = query.in('material_id', ids.length > 0 ? ids : ['__none__'])
  }

  query = query.order(sortBy, { ascending: sortAsc }).range(from, to)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}

// POST /api/materials
export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const body = await req.json()

  const parsed = createMaterialSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten())
  }

  try {
    const data = await createMaterialMasterRecord(supabase, parsed.data, owner.id)
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    if (error instanceof MaterialCreateError) {
      return apiError(error.code as any, error.message, error.status, error.details)
    }
    return databaseError('Could not create material', { message: (error as Error).message })
  }
}
