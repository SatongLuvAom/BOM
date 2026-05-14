import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { PriceForm } from '@/components/mat/PriceForm'

type Props = {
  params: Promise<{ materialId: string; supplierId: string; effectiveDate: string }>
}

export default async function EditPricePage({ params }: Props) {
  const { materialId, supplierId, effectiveDate } = await params
  const supabase = await createClient()

  const [priceRes, materialsRes, suppliersRes, uomsRes] = await Promise.all([
    supabase
      .from('mat_price_base')
      .select('*')
      .eq('material_id', materialId)
      .eq('supplier_id', supplierId)
      .eq('effective_date', effectiveDate)
      .eq('is_deleted', false)
      .single(),
    supabase.from('mat_master').select('material_id, mat_name_th, base_uom').order('mat_name_th'),
    supabase
      .from('supplier')
      .select('supplier_id, supplier_name_th, supplier_code')
      .eq('is_deleted', false)
      .order('supplier_name_th'),
    supabase.from('mat_uom').select('*').order('uom_code'),
  ])

  if (!priceRes.data) notFound()

  const price = assertSupabase({ data: priceRes.data, error: null }, `Failed to load price ${materialId}/${supplierId}/${effectiveDate}`)
  const materials = assertSupabase(materialsRes, 'Failed to load materials for price edit form')
  const suppliers = assertSupabase(suppliersRes, 'Failed to load suppliers for price edit form')
  const uoms = assertSupabase(uomsRes, 'Failed to load UOMs for price edit form')

  return (
    <div>
      <Header
        title="Edit Price"
        subtitle={`${materialId} / ${supplierId} / ${effectiveDate}`}
      />
      <div className="mx-auto max-w-3xl">
        <PriceForm
          mode="edit"
          price={price as any}
          materials={materials as any}
          suppliers={suppliers as any}
          uoms={uoms as any}
        />
      </div>
    </div>
  )
}
