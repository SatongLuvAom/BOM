import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { PriceDetail } from '@/components/mat/PriceDetail'

type Props = {
  params: Promise<{ materialId: string; supplierId: string; effectiveDate: string }>
}

export default async function PriceViewPage({ params }: Props) {
  const { materialId, supplierId, effectiveDate } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('mat_price_base')
    .select(`
      *,
      material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
      supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
      uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
    `)
    .eq('material_id', materialId)
    .eq('supplier_id', supplierId)
    .eq('effective_date', effectiveDate)
    .eq('is_deleted', false)
    .single()

  if (!data) notFound()

  const price = assertSupabase({ data, error: null }, `Failed to load price ${materialId}/${supplierId}/${effectiveDate}`)

  return (
    <div>
      <Header
        title="Price Detail"
        subtitle={`${materialId} / ${supplierId} / ${effectiveDate}`}
      />
      <PriceDetail price={price as any} />
    </div>
  )
}
