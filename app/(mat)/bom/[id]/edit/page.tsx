import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BomTemplateForm } from '@/components/bom/BomTemplateForm'

type Props = { params: Promise<{ id: string }> }

export default async function EditBomPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bom_template')
    .select('*, items:bom_item(*)')
    .eq('bom_id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !data) notFound()

  return (
    <div>
      <Header title="แก้ไข BOM" subtitle={`${data.bom_id} — ${data.bom_name}`} />
      <div className="mx-auto max-w-4xl">
        <BomTemplateForm mode="edit" bom={data as any} />
      </div>
    </div>
  )
}
