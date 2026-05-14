import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { MaterialCodeCleanupClient, type MaterialCodeCleanupRow, type MaterialCodeCleanupStatus } from '@/components/mat/MaterialCodeCleanupClient'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { getMaterialRouteId } from '@/lib/material-master'
import { getMaterialCodeIssue, inferSpecKeyFromText, isStandardMaterialCode } from '@/lib/material-code'
import { getCachedActiveCategories, getCachedActiveMaterialTypes } from '@/lib/server/master-data-cache'

export const dynamic = 'force-dynamic'

type CleanupMaterial = {
  id: string
  material_id: string
  material_code: string | null
  mat_name_th: string
  spec: string | null
  brand: string | null
  model: string | null
  cat_id: string | null
  category_id: string | null
  material_type_id: string | null
  code_spec_key: string | null
  category?: { id: string; cat_id: string; cat_code: string; cat_name_th: string; code_prefix: string | null } | null
  material_type?: { id: string; name: string; code_prefix: string; category_id: string } | null
}

type SequenceGroup = {
  category_prefix: string
  type_prefix: string
  spec_key: string
  last_no: number
}

function sequenceKey(categoryPrefix: string, typePrefix: string, specKey: string) {
  return `${categoryPrefix}-${typePrefix}-${specKey}`
}

function buildRows(
  materials: CleanupMaterial[],
  materialTypes: any[],
  sequences: SequenceGroup[],
): MaterialCodeCleanupRow[] {
  const typesByCategory = new Map<string, any[]>()
  for (const type of materialTypes) {
    const list = typesByCategory.get(type.category_id) ?? []
    list.push(type)
    typesByCategory.set(type.category_id, list)
  }

  const sequenceMap = new Map(
    sequences.map((sequence) => [
      sequenceKey(sequence.category_prefix, sequence.type_prefix, sequence.spec_key),
      Number(sequence.last_no ?? 0),
    ]),
  )
  const groupAllocations = new Map<string, number>()
  const activeCodes = new Set(materials.map((material) => String(material.material_code ?? '').toUpperCase()).filter(Boolean))

  return materials.map((material) => {
    const currentCode = material.material_code?.trim() || null
    const codeIssue = getMaterialCodeIssue(currentCode)
    const isStandard = isStandardMaterialCode(currentCode)
    const categoryId = material.category_id ?? material.category?.id ?? null
    const configuredMaterialType = material.material_type
      ?? materialTypes.find((type) => type.id === material.material_type_id)
      ?? null
    const materialType = configuredMaterialType
      ?? (categoryId ? (typesByCategory.get(categoryId) ?? [])[0] : null)
      ?? null
    const specKey = material.code_spec_key
      ?? inferSpecKeyFromText([material.spec, material.model, material.brand].filter(Boolean).join(' '))
    const category = material.category
    const categoryPrefix = category?.code_prefix ?? category?.cat_code
    const typePrefix = materialType?.code_prefix

    let suggestedNewCode: string | null = null
    if (categoryPrefix && typePrefix && specKey) {
      const key = sequenceKey(categoryPrefix, typePrefix, specKey)
      const allocated = groupAllocations.get(key) ?? 0
      const nextNo = (sequenceMap.get(key) ?? 0) + allocated + 1
      groupAllocations.set(key, allocated + 1)
      suggestedNewCode = `${key}-${String(nextNo).padStart(4, '0')}`
    }

    let status: MaterialCodeCleanupStatus = 'READY'
    if (!categoryId || !categoryPrefix) status = 'NEED_CATEGORY'
    else if (!configuredMaterialType) status = 'NEED_TYPE'
    else if (!material.code_spec_key) status = 'NEED_SPEC'
    else if (suggestedNewCode && activeCodes.has(suggestedNewCode) && suggestedNewCode !== currentCode) status = 'DUPLICATE_RISK'
    else if (isStandard && material.material_type_id && material.code_spec_key) status = 'ALREADY_STANDARD'
    else if (codeIssue) status = 'INVALID_OLD_CODE'
    else status = 'READY'

    return {
      material_id: material.material_id,
      route_id: getMaterialRouteId(material),
      current_code: currentCode,
      material_name: material.mat_name_th,
      category_id: categoryId,
      material_type_id: material.material_type_id ?? materialType?.id ?? null,
      spec: material.spec,
      suggested_spec_key: specKey || 'GEN',
      suggested_new_code: suggestedNewCode,
      status,
      warning: codeIssue ?? (status === 'ALREADY_STANDARD' ? 'Already follows Material Code Standard v1.' : ''),
    }
  }).sort((left, right) => {
    const rank: Record<MaterialCodeCleanupStatus, number> = {
      READY: 1,
      INVALID_OLD_CODE: 2,
      NEED_CATEGORY: 3,
      NEED_TYPE: 4,
      NEED_SPEC: 5,
      DUPLICATE_RISK: 6,
      NEED_REVIEW: 7,
      ALREADY_STANDARD: 8,
    }
    return rank[left.status] - rank[right.status] || left.material_name.localeCompare(right.material_name)
  })
}

export default async function MaterialCodeCleanupPage() {
  const supabase = await createClient()
  const [materialsRes, categories, materialTypes, sequencesRes] = await Promise.all([
    supabase
      .from('mat_master')
      .select(`
        id, material_id, material_code, mat_name_th, spec, brand, model, cat_id, category_id,
        material_type_id, code_spec_key,
        category:mat_category!mat_master_cat_id_fkey(id, cat_id, cat_code, cat_name_th, code_prefix),
        material_type:material_types!mat_master_material_type_id_v1_fkey(id, name, code_prefix, category_id)
      `)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(10000),
    getCachedActiveCategories(),
    getCachedActiveMaterialTypes(),
    supabase
      .from('material_code_sequences')
      .select('category_prefix, type_prefix, spec_key, last_no'),
  ])

  const materials = assertSupabase(materialsRes, 'Failed to load materials') as any[]
  const sequences = assertSupabase(sequencesRes, 'Failed to load material code sequences')
  const rows = buildRows(
    materials.map((row) => ({
      ...row,
      category: Array.isArray(row.category) ? row.category[0] ?? null : row.category,
      material_type: Array.isArray(row.material_type) ? row.material_type[0] ?? null : row.material_type,
    })),
    materialTypes,
    sequences as any,
  )
  const issueCount = rows.filter((row) => row.status !== 'ALREADY_STANDARD').length

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Material Code Cleanup"
        subtitle={`${issueCount.toLocaleString()} materials need code review out of ${rows.length.toLocaleString()}`}
        actions={
          <div className="flex gap-2">
            <Link href="/settings/material-code" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-stone-50">
              Code settings
            </Link>
            <Link href="/materials" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Materials
            </Link>
          </div>
        }
      />
      <main className="flex-1 overflow-auto px-6 py-6">
        <MaterialCodeCleanupClient
          rows={rows}
          categories={categories as any}
          materialTypes={materialTypes as any}
        />
      </main>
    </div>
  )
}
