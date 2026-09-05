import { analyzeMaterialQuality, type MaterialQualityAnalysis } from '@/lib/material-quality'

type SupabaseLike = {
  from: (table: string) => any
}

export type LatestMaterialPrice = {
  material_id: string
  material_uuid?: string | null
  material_code?: string | null
  supplier_id: string | null
  supplier_name: string | null
  effective_date: string | null
  quote_date: string | null
  valid_until: string | null
  price_uom: string | null
  price_uom_id: string | null
  price_uom_name_th?: string | null
  unit_price: number
  currency_code: string
  min_order_qty?: number | null
  lead_time_days?: number | null
  vat_included?: boolean
  delivery_included?: boolean
  source_type?: string | null
  source_note?: string | null
  created_at?: string | null
  is_stale?: boolean
  price_status?: string
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function priceSortKey(row: {
  quote_date?: string | null
  effective_date?: string | null
  created_at?: string | null
}) {
  return row.quote_date ?? row.effective_date ?? row.created_at ?? ''
}

function toLatestPrice(row: any): LatestMaterialPrice {
  const supplier = firstRelation(row.supplier)
  const uom = firstRelation(row.uom)

  return {
    material_id: row.material_id,
    material_uuid: row.material_uuid ?? null,
    material_code: row.material?.material_code ?? null,
    supplier_id: row.supplier_id ?? null,
    supplier_name: supplier?.supplier_name_th ?? null,
    effective_date: row.effective_date ?? null,
    quote_date: row.quote_date ?? row.effective_date ?? null,
    valid_until: row.valid_until ?? null,
    price_uom: row.price_uom ?? null,
    price_uom_id: row.price_uom_id ?? null,
    price_uom_name_th: uom?.uom_name_th ?? null,
    unit_price: Number(row.unit_price ?? 0),
    currency_code: row.currency_code ?? 'THB',
    min_order_qty: row.min_order_qty ?? null,
    lead_time_days: row.lead_time_days ?? null,
    vat_included: row.vat_included ?? row.is_tax_included ?? false,
    delivery_included: row.delivery_included ?? false,
    source_type: row.source_type ?? null,
    source_note: row.source_note ?? null,
    created_at: row.created_at ?? null,
  }
}

function toLatestPriceFromView(row: any): LatestMaterialPrice {
  return {
    material_id: row.material_id,
    material_uuid: row.material_uuid ?? null,
    material_code: row.material_code ?? null,
    supplier_id: row.supplier_id ?? null,
    supplier_name: row.supplier_name ?? null,
    effective_date: row.effective_date ?? null,
    quote_date: row.quote_date ?? row.effective_date ?? null,
    valid_until: row.valid_until ?? null,
    price_uom: row.price_uom ?? null,
    price_uom_id: row.price_uom_id ?? null,
    price_uom_name_th: row.price_uom_name_th ?? null,
    unit_price: Number(row.unit_price ?? 0),
    currency_code: row.currency_code ?? 'THB',
    min_order_qty: row.min_order_qty ?? null,
    lead_time_days: row.lead_time_days ?? null,
    vat_included: row.vat_included ?? false,
    delivery_included: row.delivery_included ?? false,
    source_type: row.source_type ?? null,
    source_note: row.source_note ?? null,
    created_at: row.created_at ?? null,
    is_stale: row.is_stale ?? false,
    price_status: row.price_status ?? undefined,
  }
}

function buildLatestPriceMap(rows: any[]) {
  const sorted = [...rows].sort((left, right) => {
    const rightKey = priceSortKey(right)
    const leftKey = priceSortKey(left)
    if (rightKey !== leftKey) return rightKey.localeCompare(leftKey)
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
  })

  const map: Record<string, LatestMaterialPrice> = {}
  for (const row of sorted) {
    if (!map[row.material_id]) {
      map[row.material_id] = toLatestPrice(row)
    }
  }

  return map
}

function buildLatestPriceMapFromView(rows: any[]) {
  const map: Record<string, LatestMaterialPrice> = {}
  for (const row of rows) {
    if (row?.material_id) {
      map[row.material_id] = toLatestPriceFromView(row)
    }
  }

  return map
}

function shouldFallbackToRawPriceQuery(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return (
    message.includes('material_latest_prices') ||
    message.includes('valid_until') ||
    message.includes('price_uom_id') ||
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

export async function fetchLatestPriceMap(
  supabase: SupabaseLike,
  materialIds?: string[],
  onQuery?: (metric: { query: string; duration_ms: number; row_count: number | null; error_code: string | null }) => void,
) {
  const uniqueIds = Array.from(new Set((materialIds ?? []).filter(Boolean)))
  if (materialIds && uniqueIds.length === 0) {
    return {}
  }

  let latestQuery = supabase
    .from('material_latest_prices')
    .select(`
      material_uuid, material_id, material_code, supplier_id, supplier_name,
      effective_date, quote_date, valid_until, price_uom, price_uom_id,
      price_uom_name_th, unit_price, currency_code, min_order_qty, lead_time_days,
      vat_included, delivery_included, source_type, source_note, created_at,
      is_stale, price_status
    `)

  if (uniqueIds.length > 0) {
    latestQuery = latestQuery.in('material_id', uniqueIds)
  }

  const latestStarted = onQuery ? performance.now() : 0
  const { data: latestData, error: latestError } = await latestQuery.limit(
    uniqueIds.length > 0 ? uniqueIds.length : 50000,
  )
  onQuery?.({ query: 'material_latest_prices', duration_ms: Math.round(performance.now() - latestStarted), row_count: Array.isArray(latestData) ? latestData.length : null, error_code: latestError?.code ?? null })

  if (!latestError) {
    return buildLatestPriceMapFromView(latestData ?? [])
  }

  if (!shouldFallbackToRawPriceQuery(latestError)) {
    throw new Error(latestError.message)
  }

  // Compatibility fallback for databases that have not run the latest view migration yet.
  let rawQuery = supabase
    .from('mat_price_base')
    .select(`
      material_id, material_uuid, supplier_id, effective_date, quote_date, valid_until,
      price_uom, price_uom_id, unit_price, currency_code, min_order_qty, lead_time_days,
      is_tax_included, vat_included, delivery_included, source_type, source_note, created_at,
      material:mat_master!mat_price_base_material_id_fkey(material_code),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `)
    .eq('is_deleted', false)

  if (uniqueIds.length > 0) {
    rawQuery = rawQuery.in('material_id', uniqueIds)
  }

  const rawStarted = onQuery ? performance.now() : 0
  const { data, error } = await rawQuery.limit(50000)
  onQuery?.({ query: 'mat_price_base_fallback', duration_ms: Math.round(performance.now() - rawStarted), row_count: Array.isArray(data) ? data.length : null, error_code: error?.code ?? null })
  if (error) throw new Error(error.message)

  return buildLatestPriceMap(data ?? [])
}

export function buildQualityScoreMap(
  materials: any[],
  latestPrices: Record<string, LatestMaterialPrice>,
) {
  const map: Record<string, MaterialQualityAnalysis & { material_id: string; material_code?: string | null }> = {}

  for (const material of materials) {
    map[material.material_id] = {
      material_id: material.material_id,
      material_code: material.material_code ?? null,
      ...analyzeMaterialQuality({
        material,
        latestPrice: latestPrices[material.material_id] ?? null,
      }),
    }
  }

  return map
}
