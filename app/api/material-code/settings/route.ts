import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { databaseError, duplicateError, relationInUseError, validationError } from '@/lib/api/responses'
import { isStandardMaterialCode, sanitizeCategoryPrefix, sanitizeTypePrefix } from '@/lib/material-code'
import { invalidateActiveCategoriesCache } from '@/lib/server/master-data-cache'

const CATEGORY_SETTINGS_SELECT = 'id, cat_id, cat_code, code_prefix, cat_name_th, cat_name_en, is_active, is_deleted, created_at, updated_at'
const MATERIAL_TYPE_SETTINGS_SELECT = 'id, category_id, name, code_prefix, description, is_active, created_at, updated_at'

const settingsSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_category_prefix'),
    category_id: z.string().uuid(),
    code_prefix: z.string().min(1).max(20),
  }),
  z.object({
    action: z.literal('create_type'),
    category_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    code_prefix: z.string().min(1).max(20),
    description: z.string().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal('update_type'),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    code_prefix: z.string().min(1).max(20).optional(),
    description: z.string().max(500).optional().nullable(),
    is_active: z.boolean().optional(),
  }),
])

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const input = parsed.data
  const supabase = await createClient()

  if (input.action === 'update_category_prefix') {
    const codePrefix = sanitizeCategoryPrefix(input.code_prefix)
    const { data: before } = await supabase
      .from('mat_category')
      .select(CATEGORY_SETTINGS_SELECT)
      .eq('id', input.category_id)
      .maybeSingle()

    if (!before) {
      return validationError({ category_id: ['Category not found'] })
    }

    const currentPrefix = sanitizeCategoryPrefix(before.code_prefix ?? before.cat_code)
    if (currentPrefix !== codePrefix) {
      const [byCategoryId, byCatId] = await Promise.all([
        supabase
          .from('mat_master')
          .select('material_id, material_code')
          .eq('category_id', input.category_id)
          .eq('is_deleted', false)
          .limit(1000),
        before.cat_id
          ? supabase
              .from('mat_master')
              .select('material_id, material_code')
              .eq('cat_id', before.cat_id)
              .eq('is_deleted', false)
              .limit(1000)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (byCategoryId.error || byCatId.error) {
        return databaseError('Could not validate category prefix usage', {
          message: byCategoryId.error?.message ?? byCatId.error?.message,
        })
      }

      const materialsInCategory = [
        ...(byCategoryId.data ?? []),
        ...(byCatId.data ?? []),
      ]
      const uniqueMaterials = new Map(materialsInCategory.map((material) => [material.material_id, material]))
      const standardizedCount = Array.from(uniqueMaterials.values()).filter((material) => (
        isStandardMaterialCode(material.material_code)
      )).length

      if (standardizedCount > 0) {
        return relationInUseError(
          'Cannot change this category prefix because standardized material codes already use this category. Use material code cleanup/change flow for controlled migration.',
          { standardized_materials: standardizedCount },
        )
      }
    }

    const { data, error } = await supabase
      .from('mat_category')
      .update({ code_prefix: codePrefix, updated_at: new Date().toISOString() })
      .eq('id', input.category_id)
      .select(CATEGORY_SETTINGS_SELECT)
      .single()

    if (error) return databaseError('Could not update category prefix', { message: error.message })

    invalidateActiveCategoriesCache()

    await writeAuditLog({
      entityType: 'mat_category',
      entityKey: data.cat_id,
      action: 'UPDATE',
      payload: { before, after: data },
      createdBy: owner.id,
    })

    return NextResponse.json({ data })
  }

  if (input.action === 'create_type') {
    const codePrefix = sanitizeTypePrefix(input.code_prefix)
    const { data: existing } = await supabase
      .from('material_types')
      .select('id')
      .eq('category_id', input.category_id)
      .eq('code_prefix', codePrefix)
      .maybeSingle()

    if (existing) {
      return duplicateError(`Material type prefix "${codePrefix}" already exists in this category`)
    }

    const { data, error } = await supabase
      .from('material_types')
      .insert({
        category_id: input.category_id,
        name: input.name.trim(),
        code_prefix: codePrefix,
        description: input.description ?? null,
        is_active: true,
      })
      .select(MATERIAL_TYPE_SETTINGS_SELECT)
      .single()

    if (error) return databaseError('Could not create material type', { message: error.message })

    await writeAuditLog({
      entityType: 'material_types',
      entityKey: data.id,
      action: 'CREATE',
      payload: data,
      createdBy: owner.id,
    })

    return NextResponse.json({ data }, { status: 201 })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.code_prefix !== undefined) patch.code_prefix = sanitizeTypePrefix(input.code_prefix)
  if (input.description !== undefined) patch.description = input.description ?? null
  if (input.is_active !== undefined) patch.is_active = input.is_active

  const { data: before } = await supabase
    .from('material_types')
    .select(MATERIAL_TYPE_SETTINGS_SELECT)
    .eq('id', input.id)
    .maybeSingle()

  if (!before) {
    return validationError({ id: ['Material type not found'] })
  }

  if (
    input.code_prefix !== undefined
    && sanitizeTypePrefix(input.code_prefix) !== before.code_prefix
  ) {
    const { data: usedMaterials, error: usedError } = await supabase
      .from('mat_master')
      .select('material_id, material_code')
      .eq('material_type_id', input.id)
      .eq('is_deleted', false)
      .limit(1000)

    if (usedError) {
      return databaseError('Could not validate material type usage', { message: usedError.message })
    }

    const standardizedCount = (usedMaterials ?? []).filter((material) => (
      isStandardMaterialCode(material.material_code)
    )).length

    if (standardizedCount > 0) {
      return relationInUseError(
        'Cannot change this material type prefix because standardized material codes already use it. Create a new type or use material code cleanup/change flow.',
        { standardized_materials: standardizedCount },
      )
    }
  }

  const { data, error } = await supabase
    .from('material_types')
    .update(patch)
    .eq('id', input.id)
    .select(MATERIAL_TYPE_SETTINGS_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return duplicateError('Material type prefix already exists in this category')
    }
    return databaseError('Could not update material type', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'material_types',
    entityKey: data.id,
    action: 'UPDATE',
    payload: { before, after: data },
    createdBy: owner.id,
  })

  return NextResponse.json({ data })
}
