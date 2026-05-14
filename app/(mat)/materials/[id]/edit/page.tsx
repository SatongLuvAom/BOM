import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { MaterialForm } from '@/components/mat/MaterialForm'
import { MaterialPriceManager } from '@/components/mat/MaterialPriceManager'
import { getMaterialCode } from '@/lib/material-master'
import { getCachedActiveCategories, getCachedActiveMaterialTypes, getCachedActiveSuppliers, getCachedActiveUoms } from '@/lib/server/master-data-cache'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

type Props = { params: Promise<{ id: string }> }

export default async function EditMaterialPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const resolved = await resolveMaterialReference<{ material_id: string }>(supabase, id, 'material_id')

  if (!resolved) notFound()

  const [matRes, categories, uoms, suppliers, materialTypes] = await Promise.all([
    supabase
      .from('mat_master')
      .select('id, material_id, material_code, cat_id, category_id, material_type_id, code_spec_key, mat_name_th, mat_name_en, normalized_name, spec, brand, model, base_uom, base_uom_id, status, note, code_locked, code_generated_at, code_rule_version, is_deleted, created_at, updated_at')
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .single(),
    getCachedActiveCategories(),
    getCachedActiveUoms(),
    getCachedActiveSuppliers(),
    getCachedActiveMaterialTypes(),
  ])

  if (matRes.error) notFound()

  const material   = assertSupabase(matRes,       `Failed to load material ${id}`)

  return (
    <div>
      <Header
        title="แก้ไขวัสดุ"
        subtitle={`${getMaterialCode(matRes.data)} — ${matRes.data.mat_name_th}`}
      />
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
        <MaterialForm
          mode="edit"
          material={material as any}
          categories={categories}
          uoms={uoms}
          materialTypes={materialTypes}
        />
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">ราคาวัสดุ</h2>
          <MaterialPriceManager
            materialId={material.material_id}
            baseUom={material.base_uom}
            suppliers={suppliers}
            uoms={uoms}
          />
        </div>
      </div>
    </div>
  )
}
