import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { SupplierDetail } from '@/components/mat/SupplierDetail'

type Props = { params: Promise<{ id: string }> }

export default async function SupplierViewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [supplierRes, mapsRes, pricesRes, materialsRes] = await Promise.all([
    supabase
      .from('supplier')
      .select('*')
      .eq('supplier_id', id)
      .eq('is_deleted', false)
      .single(),
    supabase
      .from('mat_supplier_map')
      .select(`
        *,
        material:mat_master!mat_supplier_map_material_id_fkey(material_id, mat_name_th, spec, base_uom),
        supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
      `)
      .eq('supplier_id', id)
      .eq('is_deleted', false)
      .order('is_preferred', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabase
      .from('mat_price_base')
      .select(`
        *,
        material:mat_master!mat_price_base_material_id_fkey(material_id, mat_name_th, spec, base_uom),
        supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
        uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
      `)
      .eq('supplier_id', id)
      .eq('is_deleted', false)
      .order('effective_date', { ascending: false }),
    supabase
      .from('mat_master')
      .select('material_id, mat_name_th, spec')
      .order('mat_name_th'),
  ])

  if (supplierRes.error) notFound()

  const supplier = assertSupabase(supplierRes, `Failed to load supplier ${id}`)
  const maps = assertSupabase(mapsRes, 'Failed to load supplier-material links')
  const prices = assertSupabase(pricesRes, 'Failed to load supplier prices')
  const materials = assertSupabase(materialsRes, 'Failed to load materials for supplier page')

  return (
    <div>
      <Header
        title={supplier.supplier_name_th}
        subtitle={supplier.supplier_id}
      />
      <SupplierDetail
        supplier={supplier as any}
        maps={maps as any}
        prices={prices as any}
        materials={materials as any}
      />
    </div>
  )
}
