import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const DEFAULT_TYPE_PREFIX = 'GEN'
const DEFAULT_TYPE_NAME = 'General / ไม่ระบุชนิด'
const DEFAULT_TYPE_DESCRIPTION = 'Default material type for quick material creation.'

export interface ResolvedMaterialTypeForCode {
  id: string | null
  category_id: string
  code_prefix: string
  name: string
  description?: string | null
  is_active?: boolean
}

export async function resolveMaterialTypeForCode(
  supabase: SupabaseClient,
  input: {
    categoryId: string
    materialTypeId?: string | null
    createDefault?: boolean
  },
): Promise<{
  materialType: ResolvedMaterialTypeForCode | null
  createdDefault: boolean
  error: { kind: 'database' | 'validation'; message: string } | null
}> {
  const materialTypeId = String(input.materialTypeId ?? '').trim()

  if (materialTypeId) {
    const { data, error } = await supabase
      .from('material_types')
      .select('id, category_id, code_prefix, name, description, is_active')
      .eq('id', materialTypeId)
      .eq('category_id', input.categoryId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      return { materialType: null, createdDefault: false, error: { kind: 'database', message: error.message } }
    }

    if (!data) {
      return {
        materialType: null,
        createdDefault: false,
        error: { kind: 'validation', message: 'Material type does not belong to selected category' },
      }
    }

    return { materialType: data, createdDefault: false, error: null }
  }

  const { data: existing, error: existingError } = await supabase
    .from('material_types')
    .select('id, category_id, code_prefix, name, description, is_active')
    .eq('category_id', input.categoryId)
    .eq('code_prefix', DEFAULT_TYPE_PREFIX)
    .maybeSingle()

  if (existingError) {
    return { materialType: null, createdDefault: false, error: { kind: 'database', message: existingError.message } }
  }

  if (existing) {
    return { materialType: existing, createdDefault: false, error: null }
  }

  if (!input.createDefault) {
    return {
      materialType: {
        id: null,
        category_id: input.categoryId,
        code_prefix: DEFAULT_TYPE_PREFIX,
        name: DEFAULT_TYPE_NAME,
        description: DEFAULT_TYPE_DESCRIPTION,
        is_active: true,
      },
      createdDefault: false,
      error: null,
    }
  }

  const { data: created, error: createError } = await supabase
    .from('material_types')
    .insert({
      category_id: input.categoryId,
      name: DEFAULT_TYPE_NAME,
      code_prefix: DEFAULT_TYPE_PREFIX,
      description: DEFAULT_TYPE_DESCRIPTION,
      is_active: true,
    })
    .select('id, category_id, code_prefix, name, description, is_active')
    .single()

  if (createError) {
    if (createError.code === '23505') {
      const { data: racedDefault, error: racedError } = await supabase
        .from('material_types')
        .select('id, category_id, code_prefix, name, description, is_active')
        .eq('category_id', input.categoryId)
        .eq('code_prefix', DEFAULT_TYPE_PREFIX)
        .maybeSingle()

      if (racedError) {
        return { materialType: null, createdDefault: false, error: { kind: 'database', message: racedError.message } }
      }

      return { materialType: racedDefault, createdDefault: false, error: null }
    }

    return { materialType: null, createdDefault: false, error: { kind: 'database', message: createError.message } }
  }

  return { materialType: created, createdDefault: true, error: null }
}
