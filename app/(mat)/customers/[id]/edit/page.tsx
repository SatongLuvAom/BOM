import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { CustomerForm } from '@/components/customer/CustomerForm'

type PageProps = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function EditCustomerPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer')
    .select('*')
    .eq('customer_id', id)
    .eq('is_deleted', false)
    .single()
  if (error || !data) notFound()

  return (
    <div className="flex flex-col h-full">
      <Header title="แก้ไขลูกค้า" subtitle={data.customer_name} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl">
          <CustomerForm customer={data as any} />
        </div>
      </div>
    </div>
  )
}
