import type { CreateMaterialInput } from '@/lib/validations/material'
import { buildNormalizedMaterialName, normalizeMaterialSearchText } from '@/lib/material-master'
import { inferSpecKeyFromMaterialText, sanitizeSpecKey } from '@/lib/material-code'
import { generateAliasId, writeAuditLog } from '@/lib/server-utils'
import { resolveMaterialTypeForCode } from '@/lib/server/material-type-default'
import { generateMaterialCodeForCreate } from '@/lib/server/material-code-generator'

export const MATERIAL_WRITE_SELECT = `
  id, material_id, material_code, cat_id, category_id, material_type_id, code_spec_key,
  mat_name_th, mat_name_en, normalized_name, spec, brand, model, base_uom, base_uom_id,
  status, note, code_locked, code_generated_at, code_rule_version, created_at, updated_at
`

export class MaterialCreateError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: 'VALIDATION_ERROR' | 'DUPLICATE' | 'DATABASE_ERROR' | 'BAD_REQUEST' = 'BAD_REQUEST',
    public details?: unknown,
  ) {
    super(message)
  }
}

export async function createMaterialMasterRecord(
  supabase: any,
  input: CreateMaterialInput,
  userId: string,
  options: {
    aliasNames?: Array<string | null | undefined>
    supplierId?: string | null
    supplierMaterialName?: string | null
    sourceNote?: string | null
  } = {},
) {
  const materialTypeId = String(input.material_type_id ?? '').trim()
  const submittedSpecKey = input.code_spec_key ? sanitizeSpecKey(input.code_spec_key) : ''
  const inferredSpecKey = inferSpecKeyFromMaterialText({
    spec: input.spec,
    matNameEn: input.mat_name_en,
    matNameTh: input.mat_name_th,
    brand: input.brand,
    model: input.model,
  })
  const codeSpecKey = submittedSpecKey && submittedSpecKey !== 'GEN'
    ? submittedSpecKey
    : inferredSpecKey

  const { data: existing, error: existingError } = await supabase
    .from('mat_master')
    .select('material_id')
    .eq('is_deleted', false)
    .eq('cat_id', input.cat_id)
    .eq('mat_name_th', input.mat_name_th)
    .eq('spec', input.spec ?? '')
    .limit(1)

  if (existingError) {
    throw new MaterialCreateError('Could not validate duplicate material', 500, 'DATABASE_ERROR', existingError)
  }

  if (existing && existing.length > 0) {
    throw new MaterialCreateError(`วัสดุชื่อนี้มีอยู่แล้ว (${existing[0].material_id})`, 409, 'DUPLICATE')
  }

  const { data: cat, error: catError } = await supabase
    .from('mat_category')
    .select('id, cat_id, cat_code, code_prefix')
    .eq('cat_id', input.cat_id)
    .maybeSingle()

  if (catError) throw new MaterialCreateError('Could not load material category', 500, 'DATABASE_ERROR', catError)
  if (!cat) throw new MaterialCreateError('ไม่พบหมวดหมู่', 400, 'VALIDATION_ERROR')

  const resolvedType = await resolveMaterialTypeForCode(supabase, {
    categoryId: cat.id,
    materialTypeId,
    createDefault: false,
    matNameEn: input.mat_name_en,
    matNameTh: input.mat_name_th,
    spec: input.spec,
    brand: input.brand,
    model: input.model,
  })

  if (resolvedType.error) {
    throw new MaterialCreateError(
      resolvedType.error.message,
      resolvedType.error.kind === 'validation' ? 400 : 500,
      resolvedType.error.kind === 'validation' ? 'VALIDATION_ERROR' : 'DATABASE_ERROR',
    )
  }

  const materialType = resolvedType.materialType
  if (!materialType) throw new MaterialCreateError('Could not resolve material type fallback', 500, 'DATABASE_ERROR')

  const { data: uom, error: uomError } = await supabase
    .from('mat_uom')
    .select('id, uom_code')
    .eq('uom_code', input.base_uom)
    .eq('is_deleted', false)
    .maybeSingle()

  if (uomError) throw new MaterialCreateError('Could not load UOM', 500, 'DATABASE_ERROR', uomError)
  if (!uom) throw new MaterialCreateError('ไม่พบหน่วยนับ', 400, 'VALIDATION_ERROR')

  let generatedCodeData = await generateUniqueMaterialCode(supabase, {
    categoryPrefix: cat.code_prefix ?? cat.cat_code,
    typePrefix: materialType.code_prefix,
    specKey: codeSpecKey,
  })
  let materialCode = generatedCodeData.code

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data: codeExisting, error: codeCheckError } = await supabase
      .from('mat_master')
      .select('material_id, material_code')
      .eq('material_code', materialCode)
      .limit(1)

    if (codeCheckError) {
      throw new MaterialCreateError('Could not validate material code uniqueness', 500, 'DATABASE_ERROR', codeCheckError)
    }

    if (!codeExisting || codeExisting.length === 0) break

    generatedCodeData = await generateUniqueMaterialCode(supabase, {
      categoryPrefix: generatedCodeData.categoryPrefix,
      typePrefix: generatedCodeData.typePrefix,
      specKey: generatedCodeData.specKey,
    })
    materialCode = generatedCodeData.code
  }

  const { data: duplicateAfterRetry, error: duplicateAfterRetryError } = await supabase
    .from('mat_master')
    .select('material_id')
    .eq('material_code', materialCode)
    .limit(1)

  if (duplicateAfterRetryError) {
    throw new MaterialCreateError('Could not validate material code uniqueness', 500, 'DATABASE_ERROR', duplicateAfterRetryError)
  }
  if (duplicateAfterRetry && duplicateAfterRetry.length > 0) {
    throw new MaterialCreateError(`Material code "${materialCode}" already exists`, 409, 'DUPLICATE')
  }

  const normalized_name = buildNormalizedMaterialName({
    ...input,
    material_code: materialCode,
  })
  const material_id = materialCode
  const { data, error } = await supabase
    .from('mat_master')
    .insert({
      ...input,
      material_id,
      material_code: materialCode,
      normalized_name,
      category_id: cat.id,
      base_uom_id: uom.id,
      material_type_id: materialType.id ?? null,
      code_spec_key: generatedCodeData.specKey,
      code_locked: true,
      code_generated_at: new Date().toISOString(),
      code_rule_version: 'v1',
    })
    .select(MATERIAL_WRITE_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new MaterialCreateError(`Material code "${materialCode}" already exists`, 409, 'DUPLICATE', error)
    }
    throw new MaterialCreateError('Could not create material', 500, 'DATABASE_ERROR', error)
  }

  await supabase
    .from('material_code_history')
    .insert({
      material_id,
      old_code: null,
      new_code: materialCode,
      change_reason: options.sourceNote ?? 'Material code generated on material creation',
      changed_by: userId,
    })

  await Promise.all([
    addMaterialAliases(supabase, data, options.aliasNames ?? [], userId),
    addMaterialSupplierMap(supabase, data, options, userId),
  ])

  await writeAuditLog({
    entityType: 'mat_master',
    entityKey: material_id,
    action: 'CREATE',
    payload: data,
    createdBy: userId,
  })

  return data
}

async function generateUniqueMaterialCode(supabase: any, input: {
  categoryPrefix: string | null | undefined
  typePrefix: string | null | undefined
  specKey: string | null | undefined
}) {
  const generatedCode = await generateMaterialCodeForCreate(supabase, input)
  if (!generatedCode.data) {
    throw new MaterialCreateError(
      'Could not generate material code. Run the Material Code Standard v1 SQL migration first.',
      500,
      'DATABASE_ERROR',
      { message: generatedCode.error ?? undefined },
    )
  }
  return generatedCode.data
}

async function addMaterialAliases(supabase: any, material: any, aliases: Array<string | null | undefined>, userId: string) {
  const uniqueAliases = Array.from(new Set(
    aliases
      .map((alias) => String(alias ?? '').trim())
      .filter((alias) => alias.length >= 2 && alias !== material.material_code && alias !== material.material_id),
  )).slice(0, 5)

  for (const alias of uniqueAliases) {
    const normalizedAlias = normalizeMaterialSearchText(alias)
    const { data: existing } = await supabase
      .from('mat_alias')
      .select('alias_id')
      .eq('material_id', material.material_id)
      .eq('is_deleted', false)
      .eq('normalized_alias', normalizedAlias)
      .limit(1)

    if (existing && existing.length > 0) continue

    const alias_id = await generateAliasId()
    const { data, error } = await supabase
      .from('mat_alias')
      .insert({
        alias_id,
        material_id: material.material_id,
        material_uuid: material.id,
        alias_name: alias,
        normalized_alias: normalizedAlias,
        alias_type: 'COMMON',
        lang: /[\u0E00-\u0E7F]/.test(alias) ? 'TH' : 'EN',
        note: 'Receipt material candidate alias',
      })
      .select('alias_id, material_id, alias_name, normalized_alias')
      .single()

    if (!error) {
      await writeAuditLog({
        entityType: 'mat_alias',
        entityKey: alias_id,
        action: 'CREATE',
        payload: data,
        createdBy: userId,
      })
    }
  }
}

async function addMaterialSupplierMap(
  supabase: any,
  material: any,
  options: {
    supplierId?: string | null
    supplierMaterialName?: string | null
  },
  userId: string,
) {
  if (!options.supplierId) return

  const { data: supplier, error: supplierError } = await supabase
    .from('supplier')
    .select('id, supplier_id')
    .eq('id', options.supplierId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (supplierError || !supplier) return

  const { data: existing } = await supabase
    .from('mat_supplier_map')
    .select('id, is_deleted')
    .eq('material_id', material.material_id)
    .eq('supplier_id', supplier.supplier_id)
    .limit(1)

  if (existing?.some((row: any) => !row.is_deleted)) return

  const payload = {
    material_id: material.material_id,
    material_uuid: material.id,
    supplier_id: supplier.supplier_id,
    supplier_uuid: supplier.id,
    supplier_material_name: options.supplierMaterialName || material.mat_name_th,
    is_preferred: true,
    is_active: true,
    note: 'Created from receipt material candidate',
  }

  const { data, error } = await supabase
    .from('mat_supplier_map')
    .insert(payload)
    .select('id, material_id, supplier_id, supplier_material_name, is_preferred')
    .single()

  if (!error) {
    await writeAuditLog({
      entityType: 'mat_supplier_map',
      entityKey: `${material.material_id}:${supplier.supplier_id}`,
      action: 'CREATE',
      payload: data,
      createdBy: userId,
    })
  }
}
