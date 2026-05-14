import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/material-master'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ResolvedMaterialReference = {
  id?: string
  material_id: string
  material_code?: string | null
}

export async function resolveMaterialReference<T extends ResolvedMaterialReference = ResolvedMaterialReference>(
  supabase: SupabaseServerClient,
  id: string,
  select = 'id, material_id, material_code',
) {
  let query = supabase
    .from('mat_master')
    .select(select)
    .eq('is_deleted', false)
    .limit(1)

  query = isUuid(id)
    ? query.eq('id', id)
    : query.or(`material_id.eq.${id},material_code.eq.${id}`)

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null

  return data as unknown as T
}
