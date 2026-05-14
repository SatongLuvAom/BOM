import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/server-utils'
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
    'material_code',
    'legacy_material_id',
    'ชื่อวัสดุ (TH)',
    'ชื่อวัสดุ (EN)',
    'สเปก',
    'ยี่ห้อ',
    'รุ่น',
    'หน่วยหลัก',
    'หมวดหมู่',
    'สถานะ',
    'หมายเหตุ',
    'อัปเดตล่าสุด',
  ]

  const rows = exportRows.map((m: any) => [
    m.material_code ?? m.material_id,
    m.material_id,
    m.mat_name_th ?? '',
    m.mat_name_en ?? '',
    m.spec ?? '',
    m.brand ?? '',
    m.model ?? '',
    m.base_uom ?? '',
    m.category?.cat_name_th ?? '',
    m.status ?? '',
    m.note ?? '',
    m.updated_at ? new Date(m.updated_at).toISOString().slice(0, 10) : '',
  ])

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    .join('\r\n')

  const bom = '\uFEFF' // UTF-8 BOM for Excel Thai text support
  const filename = `materials_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
