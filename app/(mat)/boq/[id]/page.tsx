import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { BoqDetail } from '@/components/boq/BoqDetail'
import type { BoqProject } from '@/types/boq'

interface PageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function BoqDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_project')
    .select(`*, items:boq_item(*)`)
    .eq('project_id', id)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('seq', { referencedTable: 'items', ascending: true })
    .single()

  if (error || !data) notFound()

  const project = data as unknown as BoqProject

  return (
    <div className="flex flex-col h-full">
      <Header
        title={project.project_name}
        subtitle={project.project_id}
      />
      <div className="flex-1 overflow-auto">
        <BoqDetail project={project} />
      </div>
    </div>
  )
}
