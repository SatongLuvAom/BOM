import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { databaseError, validationError } from '@/lib/api/responses'
import { sanitizeSpecKey } from '@/lib/material-code'

const previewSchema = z.object({
  cat_id: z.string().optional(),
  category_id: z.string().optional(),
  material_type_id: z.string().min(1),
  spec_key: z.string().optional().default('GEN'),
})

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const supabase = await createClient()
  const input = parsed.data
  const specKey = sanitizeSpecKey(input.spec_key)

  const { data: materialType, error: typeError } = await supabase
    .from('material_types')
    .select('id, category_id, code_prefix, category:mat_category!material_types_category_id_fkey(id, cat_id, cat_code, code_prefix)')
    .eq('id', input.material_type_id)
    .eq('is_active', true)
    .maybeSingle()

  if (typeError) {
    return databaseError('Could not load material type', { message: typeError.message })
  }

  if (!materialType) {
    return validationError({ material_type_id: ['Material type not found'] })
  }

  const category = Array.isArray((materialType as any).category)
    ? (materialType as any).category[0]
    : (materialType as any).category

  if (input.cat_id && category?.cat_id !== input.cat_id) {
    return validationError({ material_type_id: ['Material type does not belong to selected category'] })
  }

  if (input.category_id && category?.id !== input.category_id) {
    return validationError({ material_type_id: ['Material type does not belong to selected category'] })
  }

  const { data: preview, error } = await supabase.rpc('fn_material_code_preview_v1', {
    p_category_prefix: category?.code_prefix ?? category?.cat_code,
    p_type_prefix: materialType.code_prefix,
    p_spec_key: specKey,
  })

  if (error || !preview) {
    return databaseError('Could not preview material code. Run the Material Code Standard v1 SQL migration first.', {
      message: error?.message,
    })
  }

  return NextResponse.json({
    data: {
      preview,
      category_prefix: category?.code_prefix ?? category?.cat_code,
      type_prefix: materialType.code_prefix,
      spec_key: specKey,
      note: 'Preview only. Final sequence is generated on save.',
    },
  })
}
