import type { createClient } from '@/lib/supabase/server'
import { inferTypePrefixFromText } from '@/lib/material-code'

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
    matNameEn?: string | null
    matNameTh?: string | null
    spec?: string | null
    brand?: string | null
    model?: string | null
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

  return {
    materialType: {
      id: null,
      category_id: input.categoryId,
      code_prefix: inferTypePrefixFromText({
        matNameEn: input.matNameEn,
        matNameTh: input.matNameTh,
        spec: input.spec,
        brand: input.brand,
        model: input.model,
        fallback: DEFAULT_TYPE_PREFIX,
      }),
      name: DEFAULT_TYPE_NAME,
      description: DEFAULT_TYPE_DESCRIPTION,
      is_active: true,
    },
    createdDefault: false,
    error: null,
  }
}
