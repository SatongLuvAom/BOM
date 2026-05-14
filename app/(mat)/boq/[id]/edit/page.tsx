import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BoqForm } from '@/components/boq/BoqForm'
import type { BoqProject } from '@/types/boq'

interface PageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function EditBoqPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_project')
    .select('*')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !data) notFound()

  return (
    <div className="flex flex-col h-full">
      <Header title="แก้ไข BOQ" subtitle={id} />
      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl">
        <BoqForm project={data as BoqProject} />
      </div>
    </div>
  )
}
