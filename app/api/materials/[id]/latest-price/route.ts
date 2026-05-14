import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { getMaterialPriceWarning } from '@/lib/material-master'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()

  const material = await resolveMaterialReference<{ material_id: string }>(supabase, id, 'material_id')

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('material_latest_prices')
    .select('material_uuid, material_id, material_code, supplier_id, supplier_name, effective_date, quote_date, valid_until, price_uom, price_uom_id, price_uom_name_th, unit_price, currency_code, min_order_qty, lead_time_days, vat_included, delivery_included, source_type, source_note, created_at, is_stale, price_status')
    .eq('material_id', material.material_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data
      ? {
        ...data,
        warning: getMaterialPriceWarning(data),
      }
      : null,
    warning: getMaterialPriceWarning(data),
  })
}
