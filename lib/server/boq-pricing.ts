type SupabaseLike = {
  from: (table: string) => any
}

export type BoqPriceSource =
  | 'MANUAL'
  | 'LATEST_PRICE'
  | 'AI'
  | 'IMPORT'
  | 'TEMPLATE'
  | 'BOM'
  | 'UNKNOWN'

interface LatestMaterialPrice {
  material_id: string
  supplier_id: string | null
  effective_date: string
  price_uom: string
  unit_price: number
  currency_code: string
}

interface ResolveBoqPriceSnapshotInput {
  item_type: string
  material_id?: string | null
  unit_price?: number | null
  estimated_unit_price?: number | null
  final_unit_price?: number | null
  supplier_id?: string | null
  currency_code?: string | null
  price_source?: BoqPriceSource | null
  price_snapshot_at?: string | null
  preferred_source?: BoqPriceSource
}

export interface ResolvedBoqPriceSnapshot {
  unit_price: number
  estimated_unit_price: number
  final_unit_price: number
  supplier_id: string | null
  currency_code: string
  price_source: BoqPriceSource
  price_snapshot_at: string | null
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function samePrice(left: number, right: number) {
  return Math.abs(left - right) < 0.0001
}

export async function getLatestMaterialPriceForBoq(
  supabase: SupabaseLike,
  materialId: string | null | undefined,
): Promise<LatestMaterialPrice | null> {
  if (!materialId) {
    return null
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('material_latest_prices')
    .select('material_id, supplier_id, effective_date, price_uom, unit_price, currency_code')
    .eq('material_id', materialId)
    .lte('effective_date', today)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return {
    material_id: data.material_id,
    supplier_id: data.supplier_id ?? null,
    effective_date: data.effective_date,
    price_uom: data.price_uom,
    unit_price: toNumber(data.unit_price),
    currency_code: data.currency_code ?? 'THB',
  }
}

export async function resolveBoqPriceSnapshot(
  supabase: SupabaseLike,
  input: ResolveBoqPriceSnapshotInput,
): Promise<ResolvedBoqPriceSnapshot> {
  const isSection = input.item_type === 'SECTION'
  if (isSection) {
    return {
      unit_price: 0,
      estimated_unit_price: 0,
      final_unit_price: 0,
      supplier_id: null,
      currency_code: input.currency_code ?? 'THB',
      price_source: input.price_source ?? 'MANUAL',
      price_snapshot_at: null,
    }
  }

  const latest = await getLatestMaterialPriceForBoq(supabase, input.material_id)
  const explicitFinalPrice = input.final_unit_price ?? input.unit_price
  const explicitPrice = toNumber(explicitFinalPrice, 0)
  const now = new Date().toISOString()

  if (explicitPrice > 0) {
    const estimatedPrice = toNumber(input.estimated_unit_price, latest?.unit_price ?? explicitPrice)
    const priceSource =
      input.price_source ??
      (latest && samePrice(explicitPrice, latest.unit_price) ? 'LATEST_PRICE' : input.preferred_source ?? 'MANUAL')

    return {
      unit_price: explicitPrice,
      estimated_unit_price: estimatedPrice,
      final_unit_price: explicitPrice,
      supplier_id: input.supplier_id ?? latest?.supplier_id ?? null,
      currency_code: input.currency_code ?? latest?.currency_code ?? 'THB',
      price_source: priceSource,
      price_snapshot_at: input.price_snapshot_at ?? (input.material_id ? now : null),
    }
  }

  if (latest) {
    return {
      unit_price: latest.unit_price,
      estimated_unit_price: latest.unit_price,
      final_unit_price: latest.unit_price,
      supplier_id: latest.supplier_id,
      currency_code: latest.currency_code,
      price_source: 'LATEST_PRICE',
      price_snapshot_at: input.price_snapshot_at ?? now,
    }
  }

  return {
    unit_price: 0,
    estimated_unit_price: toNumber(input.estimated_unit_price, 0),
    final_unit_price: 0,
    supplier_id: input.supplier_id ?? null,
    currency_code: input.currency_code ?? 'THB',
    price_source: input.price_source ?? input.preferred_source ?? 'MANUAL',
    price_snapshot_at: input.price_snapshot_at ?? (input.material_id ? now : null),
  }
}
