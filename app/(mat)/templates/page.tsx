import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { TemplateList } from '@/components/templates/TemplateList'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('boq_template')
    .select(`*, items:boq_template_item(item_id)`)
    .eq('is_deleted', false)
    .eq('items.is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (
    <div className="flex flex-col h-full">
      <Header
        title="BOQ Templates"
        subtitle="บันทึก BOQ เป็น Template เพื่อใช้ซ้ำ"
      />
      <div className="flex-1 overflow-auto">
        <TemplateList templates={(data ?? []) as any} />
      </div>
    </div>
  )
}
