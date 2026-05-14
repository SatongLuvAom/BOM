import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params
  const supabase = await createClient()
  const material = await resolveMaterialReference<{ material_id: string }>(supabase, id, 'material_id')

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('mat_price_base')
    .select(
      `effective_date, unit_price, currency_code, price_uom,
       supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
       uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)`,
    )
    .eq('material_id', material.material_id)
    .eq('is_deleted', false)
    .order('effective_date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
