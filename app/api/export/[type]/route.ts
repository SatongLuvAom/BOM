import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '@/lib/server-utils'
import { csvResponse, datedCsvFilename, toCsv } from '@/lib/server/csv'
import { createZip } from '@/lib/server/zip'
import { databaseError, notFoundError } from '@/lib/api/responses'

type Params = { params: Promise<{ type: string }> }

function includeDeleted(req: NextRequest) {
  return req.nextUrl.searchParams.get('include_deleted') === '1'
}

function csvFile(
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  return {
    name,
    data: `\uFEFF${toCsv(headers, rows)}`,
  }
}

function zipResponse(filename: string, files: ReturnType<typeof csvFile>[]) {
  const zip = createZip(files)
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { type } = await params
  const supabase = await createClient()
  const withDeleted = includeDeleted(req)

  if (type === 'suppliers') {
    let query = supabase
      .from('supplier')
      .select('supplier_id, supplier_code, supplier_name_th, supplier_name_en, tax_id, contact_name, phone, email, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export suppliers', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('suppliers'),
      toCsv(
        ['supplier_id', 'supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id', 'contact_name', 'phone', 'email', 'status', 'updated_at'],
        (data ?? []).map((row) => [
          row.supplier_id,
          row.supplier_code,
          row.supplier_name_th,
          row.supplier_name_en,
          row.tax_id,
          row.contact_name,
          row.phone,
          row.email,
          row.status,
          row.updated_at,
        ]),
      ),
    )
  }

  if (type === 'price-history') {
    let query = supabase
      .from('mat_price_base')
      .select(`
        material_id, supplier_id, effective_date, quote_date, valid_until, price_uom, unit_price, currency_code,
        min_order_qty, lead_time_days, is_tax_included, vat_included, delivery_included, source_type, source_note, updated_at,
        material:mat_master!mat_price_base_material_id_fkey(material_code, mat_name_th, spec),
        supplier:supplier!mat_price_base_supplier_id_fkey(supplier_name_th)
      `)
      .order('effective_date', { ascending: false })
      .limit(10000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export price history', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('price_history'),
      toCsv(
        ['material_code', 'legacy_material_id', 'material_name', 'spec', 'supplier_id', 'supplier_name', 'effective_date', 'quote_date', 'valid_until', 'unit_price', 'currency_code', 'price_uom', 'min_order_qty', 'lead_time_days', 'tax_included', 'delivery_included', 'source_type', 'source_note', 'updated_at'],
        (data ?? []).map((row: any) => [
          row.material?.material_code ?? row.material_id,
          row.material_id,
          row.material?.mat_name_th,
          row.material?.spec,
          row.supplier_id,
          row.supplier?.supplier_name_th,
          row.effective_date,
          row.quote_date,
          row.valid_until,
          row.unit_price,
          row.currency_code,
          row.price_uom,
          row.min_order_qty,
          row.lead_time_days,
          row.vat_included ?? row.is_tax_included,
          row.delivery_included,
          row.source_type,
          row.source_note,
          row.updated_at,
        ]),
      ),
    )
  }

  if (type === 'boq-projects') {
    let query = supabase
      .from('boq_project')
      .select('project_id, project_name, customer_id, client_name, site_address, project_date, status, note, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export BOQ projects', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('boq_projects'),
      toCsv(
        ['project_id', 'project_name', 'customer_id', 'client_name', 'site_address', 'project_date', 'status', 'note', 'created_at', 'updated_at'],
        (data ?? []).map((row) => [
          row.project_id,
          row.project_name,
          row.customer_id,
          row.client_name,
          row.site_address,
          row.project_date,
          row.status,
          row.note,
          row.created_at,
          row.updated_at,
        ]),
      ),
    )
  }

  if (type === 'boq-items') {
    let query = supabase
      .from('boq_item')
      .select('item_id, project_id, seq, item_type, material_id, item_name, spec, uom, qty, waste_pct, final_qty, unit_price, estimated_unit_price, final_unit_price, total_price, price_source, supplier_id, currency_code, note, created_at, updated_at')
      .order('project_id', { ascending: false })
      .order('seq', { ascending: true })
      .limit(20000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export BOQ items', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('boq_items'),
      toCsv(
        ['item_id', 'project_id', 'seq', 'item_type', 'material_id', 'item_name', 'spec', 'uom', 'qty', 'waste_pct', 'final_qty', 'unit_price', 'estimated_unit_price', 'final_unit_price', 'total_price', 'price_source', 'supplier_id', 'currency_code', 'note', 'created_at', 'updated_at'],
        (data ?? []).map((row) => [
          row.item_id,
          row.project_id,
          row.seq,
          row.item_type,
          row.material_id,
          row.item_name,
          row.spec,
          row.uom,
          row.qty,
          row.waste_pct,
          row.final_qty,
          row.unit_price,
          row.estimated_unit_price,
          row.final_unit_price,
          row.total_price,
          row.price_source,
          row.supplier_id,
          row.currency_code,
          row.note,
          row.created_at,
          row.updated_at,
        ]),
      ),
    )
  }

  if (type === 'bom-templates') {
    let query = supabase
      .from('bom_template')
      .select('bom_id, bom_name, bom_category, unit, description, created_at, updated_at')
      .order('bom_name')
      .limit(10000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export BOM templates', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('bom_templates'),
      toCsv(
        ['bom_id', 'bom_name', 'bom_category', 'unit', 'description', 'created_at', 'updated_at'],
        (data ?? []).map((row) => [
          row.bom_id,
          row.bom_name,
          row.bom_category,
          row.unit,
          row.description,
          row.created_at,
          row.updated_at,
        ]),
      ),
    )
  }

  if (type === 'bom-items') {
    let query = supabase
      .from('bom_item')
      .select('item_id, bom_id, seq, item_type, material_id, item_name, uom, qty_per_unit, waste_pct, note')
      .order('bom_id')
      .order('seq')
      .limit(20000)

    if (!withDeleted) query = query.eq('is_deleted', false)

    const { data, error } = await query
    if (error) return databaseError('Could not export BOM items', { message: error.message })

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_CSV',
      newValue: { type, count: data?.length ?? 0, include_deleted: withDeleted },
      note: `export:${type}`,
    })

    return csvResponse(
      datedCsvFilename('bom_items'),
      toCsv(
        ['item_id', 'bom_id', 'seq', 'item_type', 'material_id', 'item_name', 'uom', 'qty_per_unit', 'waste_pct', 'note'],
        (data ?? []).map((row) => [
          row.item_id,
          row.bom_id,
          row.seq,
          row.item_type,
          row.material_id,
          row.item_name,
          row.uom,
          row.qty_per_unit,
          row.waste_pct,
          row.note,
        ]),
      ),
    )
  }

  if (type === 'all-master-data') {
    const date = new Date().toISOString().slice(0, 10)
    const [
      categoriesRes,
      uomsRes,
      materialsRes,
      aliasesRes,
      suppliersRes,
      supplierMapsRes,
      pricesRes,
      conversionsRes,
      bomTemplatesRes,
      bomItemsRes,
      boqProjectsRes,
      boqItemsRes,
    ] = await Promise.all([
      supabase.from('mat_category').select('cat_id, id, cat_code, cat_name_th, cat_name_en, parent_cat_id, is_active, sort_order, updated_at').order('cat_code').limit(10000),
      supabase.from('mat_uom').select('uom_code, id, uom_name_th, uom_name_en, is_active, updated_at').order('uom_code').limit(10000),
      supabase.from('mat_master').select('material_id, id, material_code, mat_name_th, mat_name_en, normalized_name, cat_id, category_id, base_uom, base_uom_id, brand, model, spec, status, note, updated_at').eq('is_deleted', false).order('material_code').limit(20000),
      supabase.from('mat_alias').select('alias_id, id, material_id, material_uuid, alias_name, normalized_alias, alias_type, lang, note, created_at').eq('is_deleted', false).order('material_id').limit(20000),
      supabase.from('supplier').select('supplier_id, id, supplier_code, supplier_name_th, supplier_name_en, tax_id, contact_name, phone, email, line_id, status, note, updated_at').eq('is_deleted', false).order('supplier_code').limit(10000),
      supabase.from('mat_supplier_map').select('material_id, material_uuid, supplier_id, supplier_uuid, supplier_material_name, supplier_sku, is_preferred, lead_time_days, min_order_qty, is_active, note, updated_at').eq('is_deleted', false).order('material_id').limit(20000),
      supabase.from('mat_price_base').select('material_id, material_uuid, supplier_id, supplier_uuid, effective_date, quote_date, valid_until, price_uom, price_uom_id, unit_price, currency_code, min_order_qty, lead_time_days, is_tax_included, vat_included, delivery_included, source_type, source_note, attachment_url, updated_at').eq('is_deleted', false).order('effective_date', { ascending: false }).limit(30000),
      supabase.from('mat_uom_conv').select('id, material_id, material_uuid, from_uom, from_uom_id, to_uom, to_uom_id, factor, formula_note, updated_at').eq('is_deleted', false).order('material_id').limit(20000),
      supabase.from('bom_template').select('bom_id, id, bom_name, bom_category, unit, description, created_at, updated_at').eq('is_deleted', false).order('bom_name').limit(10000),
      supabase.from('bom_item').select('item_id, id, bom_id, seq, item_type, material_id, item_name, uom, qty_per_unit, waste_pct, note').eq('is_deleted', false).order('bom_id').order('seq').limit(30000),
      supabase.from('boq_project').select('project_id, id, project_name, customer_id, client_name, site_address, project_date, status, note, created_at, updated_at').eq('is_deleted', false).order('project_date', { ascending: false }).limit(10000),
      supabase.from('boq_item').select('item_id, id, project_id, seq, item_type, material_id, item_name, spec, uom, qty, waste_pct, final_qty, unit_price, estimated_unit_price, final_unit_price, total_price, price_source, price_snapshot_at, supplier_id, currency_code, note, created_at, updated_at').eq('is_deleted', false).order('project_id').order('seq').limit(50000),
    ])

    const failed = [
      ['categories', categoriesRes.error],
      ['uom', uomsRes.error],
      ['materials', materialsRes.error],
      ['aliases', aliasesRes.error],
      ['suppliers', suppliersRes.error],
      ['supplier mappings', supplierMapsRes.error],
      ['price history', pricesRes.error],
      ['uom conversions', conversionsRes.error],
      ['bom templates', bomTemplatesRes.error],
      ['bom items', bomItemsRes.error],
      ['boq projects', boqProjectsRes.error],
      ['boq items', boqItemsRes.error],
    ].find(([, error]) => error)

    if (failed) {
      const [name, error] = failed
      return databaseError(`Could not export ${name}`, { message: (error as { message?: string }).message })
    }

    const files = [
      csvFile(
        'categories.csv',
        ['cat_id', 'uuid', 'cat_code', 'cat_name_th', 'cat_name_en', 'parent_cat_id', 'is_active', 'sort_order', 'updated_at'],
        (categoriesRes.data ?? []).map((row) => [row.cat_id, row.id, row.cat_code, row.cat_name_th, row.cat_name_en, row.parent_cat_id, row.is_active, row.sort_order, row.updated_at]),
      ),
      csvFile(
        'uom.csv',
        ['uom_code', 'uuid', 'uom_name_th', 'uom_name_en', 'is_active', 'updated_at'],
        (uomsRes.data ?? []).map((row) => [row.uom_code, row.id, row.uom_name_th, row.uom_name_en, row.is_active, row.updated_at]),
      ),
      csvFile(
        'materials.csv',
        ['material_id', 'uuid', 'material_code', 'mat_name_th', 'mat_name_en', 'normalized_name', 'cat_id', 'category_id', 'base_uom', 'base_uom_id', 'brand', 'model', 'spec', 'status', 'note', 'updated_at'],
        (materialsRes.data ?? []).map((row) => [row.material_id, row.id, row.material_code, row.mat_name_th, row.mat_name_en, row.normalized_name, row.cat_id, row.category_id, row.base_uom, row.base_uom_id, row.brand, row.model, row.spec, row.status, row.note, row.updated_at]),
      ),
      csvFile(
        'material_aliases.csv',
        ['alias_id', 'uuid', 'material_id', 'material_uuid', 'alias_name', 'normalized_alias', 'alias_type', 'lang', 'note', 'created_at'],
        (aliasesRes.data ?? []).map((row) => [row.alias_id, row.id, row.material_id, row.material_uuid, row.alias_name, row.normalized_alias, row.alias_type, row.lang, row.note, row.created_at]),
      ),
      csvFile(
        'suppliers.csv',
        ['supplier_id', 'uuid', 'supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id', 'contact_name', 'phone', 'email', 'line_id', 'status', 'note', 'updated_at'],
        (suppliersRes.data ?? []).map((row) => [row.supplier_id, row.id, row.supplier_code, row.supplier_name_th, row.supplier_name_en, row.tax_id, row.contact_name, row.phone, row.email, row.line_id, row.status, row.note, row.updated_at]),
      ),
      csvFile(
        'material_suppliers.csv',
        ['material_id', 'material_uuid', 'supplier_id', 'supplier_uuid', 'supplier_material_name', 'supplier_sku', 'is_preferred', 'lead_time_days', 'min_order_qty', 'is_active', 'note', 'updated_at'],
        (supplierMapsRes.data ?? []).map((row) => [row.material_id, row.material_uuid, row.supplier_id, row.supplier_uuid, row.supplier_material_name, row.supplier_sku, row.is_preferred, row.lead_time_days, row.min_order_qty, row.is_active, row.note, row.updated_at]),
      ),
      csvFile(
        'price_history.csv',
        ['material_id', 'material_uuid', 'supplier_id', 'supplier_uuid', 'effective_date', 'quote_date', 'valid_until', 'price_uom', 'price_uom_id', 'unit_price', 'currency_code', 'min_order_qty', 'lead_time_days', 'is_tax_included', 'vat_included', 'delivery_included', 'source_type', 'source_note', 'attachment_url', 'updated_at'],
        (pricesRes.data ?? []).map((row) => [row.material_id, row.material_uuid, row.supplier_id, row.supplier_uuid, row.effective_date, row.quote_date, row.valid_until, row.price_uom, row.price_uom_id, row.unit_price, row.currency_code, row.min_order_qty, row.lead_time_days, row.is_tax_included, row.vat_included, row.delivery_included, row.source_type, row.source_note, row.attachment_url, row.updated_at]),
      ),
      csvFile(
        'material_uom_conversions.csv',
        ['uuid', 'material_id', 'material_uuid', 'from_uom', 'from_uom_id', 'to_uom', 'to_uom_id', 'factor', 'formula_note', 'updated_at'],
        (conversionsRes.data ?? []).map((row) => [row.id, row.material_id, row.material_uuid, row.from_uom, row.from_uom_id, row.to_uom, row.to_uom_id, row.factor, row.formula_note, row.updated_at]),
      ),
      csvFile(
        'bom_templates.csv',
        ['bom_id', 'uuid', 'bom_name', 'bom_category', 'unit', 'description', 'created_at', 'updated_at'],
        (bomTemplatesRes.data ?? []).map((row) => [row.bom_id, row.id, row.bom_name, row.bom_category, row.unit, row.description, row.created_at, row.updated_at]),
      ),
      csvFile(
        'bom_items.csv',
        ['item_id', 'uuid', 'bom_id', 'seq', 'item_type', 'material_id', 'item_name', 'uom', 'qty_per_unit', 'waste_pct', 'note'],
        (bomItemsRes.data ?? []).map((row) => [row.item_id, row.id, row.bom_id, row.seq, row.item_type, row.material_id, row.item_name, row.uom, row.qty_per_unit, row.waste_pct, row.note]),
      ),
      csvFile(
        'boq_projects.csv',
        ['project_id', 'uuid', 'project_name', 'customer_id', 'client_name', 'site_address', 'project_date', 'status', 'note', 'created_at', 'updated_at'],
        (boqProjectsRes.data ?? []).map((row) => [row.project_id, row.id, row.project_name, row.customer_id, row.client_name, row.site_address, row.project_date, row.status, row.note, row.created_at, row.updated_at]),
      ),
      csvFile(
        'boq_items.csv',
        ['item_id', 'uuid', 'project_id', 'seq', 'item_type', 'material_id', 'item_name', 'spec', 'uom', 'qty', 'waste_pct', 'final_qty', 'unit_price', 'estimated_unit_price', 'final_unit_price', 'total_price', 'price_source', 'price_snapshot_at', 'supplier_id', 'currency_code', 'note', 'created_at', 'updated_at'],
        (boqItemsRes.data ?? []).map((row) => [row.item_id, row.id, row.project_id, row.seq, row.item_type, row.material_id, row.item_name, row.spec, row.uom, row.qty, row.waste_pct, row.final_qty, row.unit_price, row.estimated_unit_price, row.final_unit_price, row.total_price, row.price_source, row.price_snapshot_at, row.supplier_id, row.currency_code, row.note, row.created_at, row.updated_at]),
      ),
    ]

    await createAuditLog({
      entityType: 'export',
      action: 'EXPORT_ZIP',
      newValue: {
        type,
        include_deleted: false,
        files: files.map((file) => file.name),
      },
      note: `export:${type}`,
    })

    return zipResponse(`boq_master_data_${date}.zip`, files)
  }

  return notFoundError('Unknown export type')
}
