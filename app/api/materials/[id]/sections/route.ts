import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { analyzeMaterialQuality } from '@/lib/material-quality'
import { fetchLatestPriceMap } from '@/lib/server/material-quality-data'
import { getCachedActiveMaterialTypes, getCachedActiveSuppliers, getCachedActiveUoms } from '@/lib/server/master-data-cache'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const section = req.nextUrl.searchParams.get('section') ?? ''
  const supabase = await createClient()
  const resolved = await resolveMaterialReference(supabase, id)

  if (!resolved) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (section === 'price-history') {
    const [suppliers, uoms] = await Promise.all([
      getCachedActiveSuppliers(),
      getCachedActiveUoms(),
    ])
    return NextResponse.json({ data: { suppliers, uoms } })
  }

  if (section === 'suppliers') {
    const { data, error } = await supabase
      .from('mat_supplier_map')
      .select(`
        id, material_id, material_uuid, supplier_id, supplier_uuid, supplier_material_name, supplier_sku,
        is_preferred, lead_time_days, min_order_qty, is_active, note, is_deleted, deleted_at, created_at, updated_at,
        supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
      `)
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .order('is_preferred', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { supplier_maps: data ?? [] } })
  }

  if (section === 'aliases') {
    const { data, error } = await supabase
      .from('mat_alias')
      .select('id, alias_id, material_id, material_uuid, alias_name, normalized_alias, alias_type, lang, note, is_deleted, deleted_at, created_at, updated_at')
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { aliases: data ?? [] } })
  }

  if (section === 'uom-conversions') {
    const [conversionsRes, uoms] = await Promise.all([
      supabase
        .from('mat_uom_conv')
        .select(`
          id, material_id, material_uuid, from_uom, from_uom_id, to_uom, to_uom_id, factor,
          formula_note, is_deleted, deleted_at, created_at, updated_at,
          from_uom_data:mat_uom!mat_uom_conv_from_uom_fkey(uom_code, uom_name_th),
          to_uom_data:mat_uom!mat_uom_conv_to_uom_fkey(uom_code, uom_name_th)
        `)
        .eq('material_id', resolved.material_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      getCachedActiveUoms(),
    ])

    if (conversionsRes.error) {
      return NextResponse.json({ error: conversionsRes.error.message }, { status: 500 })
    }

    return NextResponse.json({ data: { uom_conversions: conversionsRes.data ?? [], uoms } })
  }

  if (section === 'usage') {
    const bomUsageRes = await supabase
      .from('bom_item')
      .select('bom_id, item_name, uom, qty_per_unit, bom_template:bom_template(bom_name)', { count: 'exact' })
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .limit(10)

    if (bomUsageRes.error) {
      return NextResponse.json({ error: bomUsageRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        bomUsage: { count: bomUsageRes.count ?? 0, rows: bomUsageRes.data ?? [] },
      },
    })
  }

  if (section === 'audit') {
    const { data, error } = await supabase
      .from('mat_audit_log')
      .select('action, created_at, created_by')
      .eq('entity_type', 'mat_master')
      .or(`entity_key.eq.${resolved.material_id},entity_key.eq.${resolved.material_code ?? resolved.material_id}`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { auditRows: data ?? [] } })
  }

  if (section === 'qa') {
    const [matRes, latestPriceMap] = await Promise.all([
      supabase
        .from('mat_master')
        .select(`
          id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en, normalized_name,
          spec, brand, model, base_uom, base_uom_id, material_type_id, code_spec_key, status, note,
          aliases:mat_alias!mat_alias_material_id_fkey(alias_id, is_deleted),
          supplier_maps:mat_supplier_map!mat_supplier_map_material_id_fkey(is_preferred, is_deleted),
          uom_conversions:mat_uom_conv!mat_uom_conv_material_id_fkey(from_uom, from_uom_id, to_uom, to_uom_id, is_deleted)
        `)
        .eq('material_id', resolved.material_id)
        .eq('is_deleted', false)
        .eq('aliases.is_deleted', false)
        .eq('supplier_maps.is_deleted', false)
        .eq('uom_conversions.is_deleted', false)
        .single(),
      fetchLatestPriceMap(supabase, [resolved.material_id]),
    ])

    if (matRes.error) return NextResponse.json({ error: matRes.error.message }, { status: 500 })
    const latestPrice = latestPriceMap[resolved.material_id] ?? null
    return NextResponse.json({
      data: {
        quality: analyzeMaterialQuality({ material: matRes.data as any, latestPrice }),
      },
    })
  }

  if (section === 'code-history') {
    const [codeHistoryRes, materialTypes] = await Promise.all([
      supabase
        .from('material_code_history')
        .select('id, material_id, old_code, new_code, change_reason, changed_by, changed_at')
        .eq('material_id', resolved.material_id)
        .order('changed_at', { ascending: false })
        .limit(20),
      getCachedActiveMaterialTypes(),
    ])

    if (codeHistoryRes.error) {
      return NextResponse.json({ error: codeHistoryRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        codeHistory: codeHistoryRes.data ?? [],
        materialTypes,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown material detail section' }, { status: 400 })
}
