import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/server-utils'
import { csvResponse, datedCsvFilename, toCsv } from '@/lib/server/csv'
import { exportMaterialName, parseMaterialDimensions } from '@/lib/server/material-export'
import { fetchLatestPriceMap } from '@/lib/server/material-quality-data'
import { normalizeSearchTerm } from '@/lib/supabase/filters'
import { resolveMaterialSearchMatches, sortRowsBySearchRank } from '@/lib/server/material-search'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const sp = req.nextUrl.searchParams
  const search = normalizeSearchTerm(sp.get('search'))
  const cat_id = sp.get('cat_id') ?? ''
  const status = sp.get('status') ?? ''
  const hasPrice = sp.get('has_price') ?? ''
  const stalePrice = sp.get('stale_price') ?? ''
  const supplierId = sp.get('supplier_id') ?? ''

  const supabase = await createClient()
  let latestPrices: Awaited<ReturnType<typeof fetchLatestPriceMap>>

  try {
    latestPrices = await fetchLatestPriceMap(supabase)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown latest-price error'
    return NextResponse.json({ error: `Could not load current material prices: ${message}` }, { status: 500 })
  }

  let rankedSearchIds: string[] = []
  let query = supabase
    .from('mat_master')
    .select(
      `id, material_id, material_code, mat_name_th, mat_name_en, normalized_name, spec, brand, model, base_uom,
       status, note, updated_at,
       category:mat_category!mat_master_cat_id_fkey(cat_code, cat_name_th)`,
    )
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(10000)

  if (search) {
    rankedSearchIds = await resolveMaterialSearchMatches(supabase, search)
    query = query.in('material_id', rankedSearchIds.length > 0 ? rankedSearchIds : ['__none__'])
  }
  if (cat_id) query = query.eq('cat_id', cat_id)
  if (status) query = query.eq('status', status)
  if (supplierId) {
    const { data: supplierMaps } = await supabase
      .from('mat_supplier_map')
      .select('material_id')
      .eq('supplier_id', supplierId)
      .eq('is_deleted', false)
    query = query.in('material_id', supplierMaps?.map((row) => row.material_id) ?? ['__none__'])
  }
  if (hasPrice || stalePrice) {
    const latestByMaterial = new Map(Object.values(latestPrices).map((row) => [row.material_id, row]))
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

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const exportRows = search ? sortRowsBySearchRank(data ?? [], rankedSearchIds) : (data ?? [])

  await createAuditLog({
    entityType: 'export',
    action: 'EXPORT_CSV',
    newValue: { type: 'materials', count: exportRows.length },
    note: 'export:materials',
  })

  const headers = [
    'Material_Code',
    'Category',
    'Material_Name',
    'Thickness_mm',
    'Width_m',
    'Length_m',
    'Purchase_Unit',
    'Supplier_ID',
    'Current_Rate',
    'Active',
    'Notes',
  ]

  const rows = exportRows.map((material: any) => {
    const price = latestPrices[material.material_id]
    const dimensions = parseMaterialDimensions(
      [material.spec, material.mat_name_en, material.mat_name_th].filter(Boolean).join(' '),
    )

    return [
      material.material_code ?? material.material_id,
      material.category?.cat_code ?? material.category?.cat_name_th ?? '',
      exportMaterialName(material),
      dimensions.thicknessMm,
      dimensions.widthM,
      dimensions.lengthM,
      price?.price_uom ?? material.base_uom ?? '',
      price?.supplier_id ?? '',
      price ? price.unit_price : '',
      material.status === 'ACTIVE' ? 'YES' : 'NO',
      material.note ?? '',
    ]
  })

  return csvResponse(datedCsvFilename('materials'), toCsv(headers, rows))
}
