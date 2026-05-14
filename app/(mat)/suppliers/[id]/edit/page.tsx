import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { SupplierForm } from '@/components/mat/SupplierForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditSupplierPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('supplier')
    .select('*')
    .eq('supplier_id', id)
    .eq('is_deleted', false)
    .single()

  if (!data) notFound()

  const supplier = assertSupabase({ data, error: null }, `Failed to load supplier ${id}`)

  return (
    <div>
      <Header title="Edit Supplier" subtitle={`${supplier.supplier_id} - ${supplier.supplier_name_th}`} />
      <div className="mx-auto max-w-3xl">
        <SupplierForm mode="edit" supplier={supplier as any} />
      </div>
    </div>
  )
}
