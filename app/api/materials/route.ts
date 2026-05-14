import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createMaterialSchema } from '@/lib/validations/material'
import { writeAuditLog } from '@/lib/server-utils'
import { getPaginationRange } from '@/lib/utils'
import { buildNormalizedMaterialName } from '@/lib/material-master'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { resolveMaterialSearchMatches, sortRowsBySearchRank } from '@/lib/server/material-search'
import { databaseError, duplicateError, validationError } from '@/lib/api/responses'
import { sanitizeSpecKey } from '@/lib/material-code'
import { resolveMaterialTypeForCode } from '@/lib/server/material-type-default'

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

  const input = parsed.data
  const materialTypeId = String(input.material_type_id ?? '').trim()
  const codeSpecKey = sanitizeSpecKey(input.code_spec_key || input.spec || 'GEN')

  // Duplicate check: same name + spec + cat
  const { data: existing } = await supabase
    .from('mat_master')
    .select('material_id')
    .eq('is_deleted', false)
    .eq('cat_id', input.cat_id)
    .eq('mat_name_th', input.mat_name_th)
    .eq('spec', input.spec ?? '')
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `วัสดุชื่อนี้มีอยู่แล้ว (${existing[0].material_id})` },
      { status: 409 },
    )
  }

  // Get cat_code for ID generation
  const { data: cat } = await supabase
    .from('mat_category')
    .select('id, cat_code, code_prefix')
    .eq('cat_id', input.cat_id)
    .single()

  if (!cat) {
    return NextResponse.json({ error: 'ไม่พบหมวดหมู่' }, { status: 400 })
  }

  const resolvedType = await resolveMaterialTypeForCode(supabase, {
    categoryId: cat.id,
    materialTypeId,
    createDefault: false,
  })

  if (resolvedType.error) {
    if (resolvedType.error.kind === 'validation') {
      return validationError({ material_type_id: [resolvedType.error.message] })
    }
    return databaseError('Could not validate material type', { message: resolvedType.error.message })
  }

  const materialType = resolvedType.materialType

  if (!materialType) {
    return databaseError('Could not resolve material type fallback')
  }

  const { data: uom } = await supabase
    .from('mat_uom')
    .select('id, uom_code')
    .eq('uom_code', input.base_uom)
    .eq('is_deleted', false)
    .single()

  if (!uom) {
    return NextResponse.json({ error: 'ไม่พบหน่วยนับ' }, { status: 400 })
  }

  const { data: generatedCode, error: generateError } = await supabase.rpc('fn_generate_material_code_v1', {
    p_category_prefix: cat.code_prefix ?? cat.cat_code,
    p_type_prefix: materialType.code_prefix,
    p_spec_key: codeSpecKey,
  })

  if (generateError || !generatedCode) {
    return databaseError('Could not generate material code. Run the Material Code Standard v1 SQL migration first.', {
      message: generateError?.message,
    })
  }

  const materialCode = String(generatedCode)

  const { data: codeExisting } = await supabase
    .from('mat_master')
    .select('material_id, material_code')
    .eq('material_code', materialCode)
    .limit(1)

  if (codeExisting && codeExisting.length > 0) {
    return duplicateError(`Material code "${materialCode}" already exists`)
  }

  const normalized_name = buildNormalizedMaterialName({
    ...input,
    material_code: materialCode,
  })
  const material_id = materialCode
  const { data, error } = await supabase
    .from('mat_master')
    .insert({
      ...input,
      material_id,
      material_code: materialCode,
      normalized_name,
      category_id: cat.id,
      base_uom_id: uom.id,
      material_type_id: materialType.id ?? null,
      code_spec_key: codeSpecKey,
      code_locked: true,
      code_generated_at: new Date().toISOString(),
      code_rule_version: 'v1',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return duplicateError(`Material code "${materialCode}" already exists`)
    }
    return databaseError('Could not create material', { message: error.message })
  }

  const { error: historyError } = await supabase
    .from('material_code_history')
    .insert({
      material_id,
      old_code: null,
      new_code: materialCode,
      change_reason: 'Material code generated on material creation',
      changed_by: owner.id,
    })

  if (historyError) {
    console.error('Failed to write material code creation history', historyError)
  }

  await writeAuditLog({
    entityType: 'mat_master',
    entityKey: material_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
