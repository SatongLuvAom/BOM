import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createMaterialSchema } from '@/lib/validations/material'
import { getPaginationRange } from '@/lib/utils'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { resolveMaterialSearchMatches, sortRowsBySearchRank } from '@/lib/server/material-search'
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
  const page    = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10))
  const limit   = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
  const rawSortBy = searchParams.get('sort_by') ?? 'updated_at'
  const sortBy: MaterialSortKey = MATERIAL_SORT_KEYS.includes(rawSortBy as MaterialSortKey)
    ? (rawSortBy as MaterialSortKey)
    : 'updated_at'
  const sortAsc = searchParams.get('sort_dir') === 'asc'
  const { from, to } = getPaginationRange(page, limit)

  let rankedSearchIds: string[] = []
  let query = supabase
    .from('mat_master')
    .select(`
      id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en,
      normalized_name, spec, brand, model, base_uom, base_uom_id, status, note, created_at, updated_at,
      category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th)
    `, { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    rankedSearchIds = await resolveMaterialSearchMatches(supabase, search)
    query = query.in('material_id', rankedSearchIds.length > 0 ? rankedSearchIds : ['__none__'])
  }

  if (cat_id)  query = query.eq('cat_id', cat_id)
  if (status)  query = query.eq('status', status)

  if (supplierId) {
    const { data: supplierMaps } = await supabase
      .from('mat_supplier_map')
      .select('material_id')
      .eq('supplier_id', supplierId)
      .eq('is_deleted', false)
    query = query.in('material_id', supplierMaps?.map((row) => row.material_id) ?? ['__none__'])
  }

  if (hasPrice || stalePrice) {
    const { data: latestRows } = await supabase
      .from('material_latest_prices')
      .select('material_id, is_stale')

    const latestByMaterial = new Map((latestRows ?? []).map((row) => [row.material_id, row]))
    let ids = Array.from(latestByMaterial.keys())

    if (hasPrice === 'missing') {
      const { data: allRows } = await supabase
        .from('mat_master')
        .select('material_id')
        .eq('is_deleted', false)
      const priced = new Set(ids)
      ids = (allRows ?? []).map((row) => row.material_id).filter((id) => !priced.has(id))
    } else if (hasPrice === 'yes') {
      ids = Array.from(latestByMaterial.keys())
    }

    if (stalePrice === 'yes') {
      ids = Array.from(latestByMaterial.values()).filter((row) => row.is_stale).map((row) => row.material_id)
    }

    query = query.in('material_id', ids.length > 0 ? ids : ['__none__'])
  }

  if (!search) {
    query = query.order(sortBy, { ascending: sortAsc }).range(from, to)
  } else {
    query = query.limit(1000)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = search ? sortRowsBySearchRank(data ?? [], rankedSearchIds) : (data ?? [])

  return NextResponse.json({
    data: search ? rows.slice(from, to + 1) : rows,
    total: search ? rows.length : count ?? 0,
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
