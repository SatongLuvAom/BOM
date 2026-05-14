import { normalizeMaterialSearchText } from '@/lib/material-master'

type SupabaseLike = {
  from: (table: string) => any
}

export type SystemQaSeverity = 'error' | 'warning'

export type SystemQaIssue = {
  key: string
  label: string
  detail: string
  href?: string
  severity: SystemQaSeverity
}

export type SystemQaGroup = {
  key: string
  title: string
  description: string
  issues: SystemQaIssue[]
}

function compact(value: unknown) {
  return String(value ?? '').trim()
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return map
}

function issue(
  key: string,
  label: string,
  detail: string,
  severity: SystemQaSeverity,
  href?: string,
): SystemQaIssue {
  return { key, label, detail, severity, href }
}

function limitIssues(issues: SystemQaIssue[], limit = 50) {
  return issues.slice(0, limit)
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getSystemQaGroups(supabase: SupabaseLike): Promise<SystemQaGroup[]> {
  const [
    materialsRes,
    aliasesRes,
    supplierMapsRes,
    pricesRes,
    bomItemsRes,
    boqItemsRes,
  ] = await Promise.all([
    supabase
      .from('mat_master')
      .select('id, material_id, material_code, mat_name_th, cat_id, category_id, base_uom, base_uom_id')
      .eq('is_deleted', false)
      .limit(20000),
    supabase
      .from('mat_alias')
      .select('alias_id, material_id, alias_name, normalized_alias')
      .eq('is_deleted', false)
      .limit(30000),
    supabase
      .from('mat_supplier_map')
      .select('material_id, supplier_id')
      .eq('is_deleted', false)
      .limit(30000),
    supabase
      .from('mat_price_base')
      .select('material_id')
      .eq('is_deleted', false)
      .limit(50000),
    supabase
      .from('bom_item')
      .select('item_id, bom_id, material_id, item_name, qty_per_unit')
      .eq('is_deleted', false)
      .limit(30000),
    supabase
      .from('boq_item')
      .select('item_id, project_id, item_type, material_id, item_name, unit_price, estimated_unit_price, final_unit_price, price_snapshot_at, price_source')
      .eq('is_deleted', false)
      .limit(50000),
  ])

  const loadErrors = [
    ['materials', materialsRes.error],
    ['aliases', aliasesRes.error],
    ['supplier mappings', supplierMapsRes.error],
    ['price history', pricesRes.error],
    ['BOM items', bomItemsRes.error],
    ['BOQ items', boqItemsRes.error],
  ].filter(([, error]) => error)

  if (loadErrors.length > 0) {
    return [
      {
        key: 'qa-load-error',
        title: 'Data QA unavailable',
        description: 'One or more QA checks could not read data.',
        issues: loadErrors.map(([name, error]) =>
          issue(
            `load-${name}`,
            `Could not load ${name}`,
            (error as { message?: string }).message ?? 'Database read failed',
            'error',
          ),
        ),
      },
    ]
  }

  const materials = (materialsRes.data ?? []) as any[]
  const aliases = (aliasesRes.data ?? []) as any[]
  const supplierMaps = (supplierMapsRes.data ?? []) as any[]
  const prices = (pricesRes.data ?? []) as any[]
  const bomItems = (bomItemsRes.data ?? []) as any[]
  const boqItems = (boqItemsRes.data ?? []) as any[]

  const duplicateMaterialCodes = Array.from(
    groupBy(materials, (row) => compact(row.material_code).toUpperCase()).entries(),
  )
    .filter(([code, rows]) => code && rows.length > 1)
    .flatMap(([code, rows]) =>
      rows.map((row) =>
        issue(
          `duplicate-material-code-${row.material_id}`,
          code,
          `${rows.length} active materials share this material_code`,
          'error',
          `/materials/${row.material_id}`,
        ),
      ),
    )

  const duplicateAliases = Array.from(
    groupBy(aliases, (row) => {
      const alias = normalizeMaterialSearchText(row.normalized_alias || row.alias_name)
      return alias ? `${row.material_id}:${alias}` : ''
    }).entries(),
  )
    .filter(([, rows]) => rows.length > 1)
    .flatMap(([key, rows]) =>
      rows.map((row) =>
        issue(
          `duplicate-alias-${row.alias_id}`,
          row.alias_name || key,
          `${rows.length} active aliases normalize to the same value for material ${row.material_id}`,
          'warning',
          `/materials/${row.material_id}`,
        ),
      ),
    )

  const duplicateSupplierMappings = Array.from(
    groupBy(supplierMaps, (row) => `${row.material_id}:${row.supplier_id}`).entries(),
  )
    .filter(([, rows]) => rows.length > 1)
    .flatMap(([key, rows]) =>
      rows.map((row, index) =>
        issue(
          `duplicate-supplier-map-${key}-${index}`,
          `${row.material_id} / ${row.supplier_id}`,
          `${rows.length} active supplier mappings use the same material and supplier`,
          'warning',
          `/materials/${row.material_id}`,
        ),
      ),
    )

  const priceMaterialIds = new Set(prices.map((row) => row.material_id).filter(Boolean))
  const materialsWithoutCategory = materials
    .filter((row) => !row.cat_id && !row.category_id)
    .map((row) =>
      issue(
        `material-without-category-${row.material_id}`,
        row.material_code || row.material_id,
        row.mat_name_th || 'Material has no category',
        'warning',
        `/materials/${row.material_id}`,
      ),
    )

  const materialsWithoutUom = materials
    .filter((row) => !row.base_uom && !row.base_uom_id)
    .map((row) =>
      issue(
        `material-without-uom-${row.material_id}`,
        row.material_code || row.material_id,
        row.mat_name_th || 'Material has no base UOM',
        'warning',
        `/materials/${row.material_id}`,
      ),
    )

  const materialsWithoutPrice = materials
    .filter((row) => !priceMaterialIds.has(row.material_id))
    .map((row) =>
      issue(
        `material-without-price-${row.material_id}`,
        row.material_code || row.material_id,
        row.mat_name_th || 'Material has no active price history',
        'warning',
        `/materials/${row.material_id}`,
      ),
    )

  const bomItemsMissingIdentity = bomItems
    .filter((row) => !row.material_id && !compact(row.item_name))
    .map((row) =>
      issue(
        `bom-item-missing-identity-${row.item_id}`,
        row.item_id,
        `BOM ${row.bom_id} item has no material_id and no item_name`,
        'error',
        `/bom/${row.bom_id}/edit`,
      ),
    )

  const bomItemsInvalidQty = bomItems
    .filter((row) => {
      const qty = numberValue(row.qty_per_unit)
      return qty === null || qty <= 0
    })
    .map((row) =>
      issue(
        `bom-item-invalid-qty-${row.item_id}`,
        row.item_name || row.item_id,
        `BOM ${row.bom_id} qty_per_unit must be greater than 0`,
        'error',
        `/bom/${row.bom_id}/edit`,
      ),
    )

  const boqItemsMissingSnapshotPrice = boqItems
    .filter((row) => {
      if (row.item_type !== 'MAT' || !row.material_id) return false
      const unitPrice = numberValue(row.unit_price) ?? 0
      const estimated = numberValue(row.estimated_unit_price) ?? 0
      const final = numberValue(row.final_unit_price) ?? 0
      return !row.price_snapshot_at && unitPrice <= 0 && estimated <= 0 && final <= 0
    })
    .map((row) =>
      issue(
        `boq-item-missing-snapshot-${row.item_id}`,
        row.item_name || row.item_id,
        `BOQ ${row.project_id} material item has no snapshot price`,
        'warning',
        `/boq/${row.project_id}`,
      ),
    )

  return [
    {
      key: 'duplicate-material-codes',
      title: 'Duplicate material codes',
      description: 'Active materials that share the same material_code.',
      issues: limitIssues(duplicateMaterialCodes),
    },
    {
      key: 'duplicate-aliases',
      title: 'Duplicate aliases',
      description: 'Aliases that normalize to the same value for one material.',
      issues: limitIssues(duplicateAliases),
    },
    {
      key: 'duplicate-supplier-mappings',
      title: 'Duplicate supplier mappings',
      description: 'Repeated active material + supplier mappings.',
      issues: limitIssues(duplicateSupplierMappings),
    },
    {
      key: 'materials-without-category',
      title: 'Materials without category',
      description: 'Materials missing both legacy cat_id and UUID category_id.',
      issues: limitIssues(materialsWithoutCategory),
    },
    {
      key: 'materials-without-uom',
      title: 'Materials without UOM',
      description: 'Materials missing both legacy base_uom and UUID base_uom_id.',
      issues: limitIssues(materialsWithoutUom),
    },
    {
      key: 'materials-without-price',
      title: 'Materials without price',
      description: 'Materials with no active price history rows.',
      issues: limitIssues(materialsWithoutPrice),
    },
    {
      key: 'bom-items-missing-identity',
      title: 'BOM items without identity',
      description: 'BOM rows missing both material_id and item_name.',
      issues: limitIssues(bomItemsMissingIdentity),
    },
    {
      key: 'bom-items-invalid-qty',
      title: 'BOM items with invalid qty',
      description: 'BOM rows where qty_per_unit is missing or not greater than 0.',
      issues: limitIssues(bomItemsInvalidQty),
    },
    {
      key: 'boq-items-missing-snapshot-price',
      title: 'BOQ items missing snapshot price',
      description: 'Material BOQ rows that do not appear to have a price snapshot.',
      issues: limitIssues(boqItemsMissingSnapshotPrice),
    },
  ]
}
