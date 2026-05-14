import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { PriceForm } from '@/components/mat/PriceForm'

interface PageProps {
  searchParams: Promise<{
    material_id?: string
    supplier_id?: string
  }>
}

export default async function NewPricePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const supabase = await createClient()

  const [materialsRes, suppliersRes, uomsRes] = await Promise.all([
    supabase.from('mat_master').select('material_id, mat_name_th, base_uom').order('mat_name_th'),
    supabase
      .from('supplier')
      .select('supplier_id, supplier_name_th, supplier_code')
      .eq('is_deleted', false)
      .order('supplier_name_th'),
    supabase.from('mat_uom').select('*').order('uom_code'),
  ])

  const materials = assertSupabase(materialsRes, 'Failed to load materials for new price form')
  const suppliers = assertSupabase(suppliersRes, 'Failed to load suppliers for new price form')
  const uoms = assertSupabase(uomsRes, 'Failed to load UOMs for new price form')

  return (
    <div>
      <Header title="Add Base Price" subtitle="Create a new supplier price record" />
      <div className="mx-auto max-w-3xl">
        <PriceForm
          mode="create"
          materials={materials as any}
          suppliers={suppliers as any}
          uoms={uoms as any}
          initialMaterialId={sp.material_id}
          initialSupplierId={sp.supplier_id}
        />
      </div>
    </div>
  )
}
