import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { databaseError, validationError } from '@/lib/api/responses'
import { inferSpecKeyFromMaterialText, sanitizeSpecKey } from '@/lib/material-code'
import { resolveMaterialTypeForCode } from '@/lib/server/material-type-default'

const previewSchema = z.object({
  cat_id: z.string().optional(),
  category_id: z.string().optional(),
  material_type_id: z.string().optional(),
  spec_key: z.string().optional(),
  mat_name_en: z.string().optional(),
  mat_name_th: z.string().optional(),
  spec: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const supabase = await createClient()
  const input = parsed.data
  const submittedSpecKey = input.spec_key ? sanitizeSpecKey(input.spec_key) : ''
  const inferredSpecKey = inferSpecKeyFromMaterialText({
    spec: input.spec,
    matNameEn: input.mat_name_en,
    matNameTh: input.mat_name_th,
    brand: input.brand,
    model: input.model,
  })
  const specKey = submittedSpecKey && submittedSpecKey !== 'GEN'
    ? submittedSpecKey
    : inferredSpecKey

  let category: { id: string; cat_id: string; cat_code: string; code_prefix: string | null } | null = null
  let materialType: { id: string | null; category_id: string; code_prefix: string; name: string } | null = null

  if (input.material_type_id) {
    const { data: selectedType, error: typeError } = await supabase
      .from('material_types')
      .select('id, category_id, code_prefix, name, category:mat_category!material_types_category_id_fkey(id, cat_id, cat_code, code_prefix)')
      .eq('id', input.material_type_id)
      .eq('is_active', true)
      .maybeSingle()

    if (typeError) {
      return databaseError('Could not load material type', { message: typeError.message })
    }

    if (!selectedType) {
      return validationError({ material_type_id: ['Material type not found'] })
    }

    category = Array.isArray((selectedType as any).category)
      ? (selectedType as any).category[0]
      : (selectedType as any).category

    if (input.cat_id && category?.cat_id !== input.cat_id) {
      return validationError({ material_type_id: ['Material type does not belong to selected category'] })
    }

    if (input.category_id && category?.id !== input.category_id) {
      return validationError({ material_type_id: ['Material type does not belong to selected category'] })
    }

    materialType = selectedType
  } else {
    let categoryQuery = supabase
      .from('mat_category')
      .select('id, cat_id, cat_code, code_prefix')
      .limit(1)

    if (input.category_id) {
      categoryQuery = categoryQuery.eq('id', input.category_id)
    } else if (input.cat_id) {
      categoryQuery = categoryQuery.eq('cat_id', input.cat_id)
    } else {
      return validationError({ cat_id: ['Category is required for material code preview'] })
    }

    const { data: categoryRows, error: categoryError } = await categoryQuery

    if (categoryError) {
      return databaseError('Could not load category', { message: categoryError.message })
    }

    category = categoryRows?.[0] ?? null
    if (!category) {
      return validationError({ cat_id: ['Category not found'] })
    }

    const resolvedType = await resolveMaterialTypeForCode(supabase, {
      categoryId: category.id,
      createDefault: false,
      matNameEn: input.mat_name_en,
      matNameTh: input.mat_name_th,
      spec: input.spec,
      brand: input.brand,
      model: input.model,
    })

    if (resolvedType.error) {
      if (resolvedType.error.kind === 'validation') {
        return validationError({ material_type_id: [resolvedType.error.message] })
      }
      return databaseError('Could not resolve material type', { message: resolvedType.error.message })
    }

    materialType = resolvedType.materialType
  }

  const { data: preview, error } = await supabase.rpc('fn_material_code_preview_v1', {
    p_category_prefix: category?.code_prefix ?? category?.cat_code,
    p_type_prefix: materialType?.code_prefix,
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
      type_prefix: materialType?.code_prefix,
      spec_key: specKey,
      note: 'Preview only. Final sequence is generated on save.',
    },
  })
}
