import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertSupabase } from '@/lib/supabase/assert'
import { Header } from '@/components/layout/Header'
import { MaterialDetail } from '@/components/mat/MaterialDetail'
import { getMaterialCode } from '@/lib/material-master'
import { fetchLatestPriceMap } from '@/lib/server/material-quality-data'
import { analyzeMaterialQuality } from '@/lib/material-quality'
import { resolveMaterialReference } from '@/lib/server/material-resolver'

type Props = { params: Promise<{ id: string }> }

export default async function MaterialViewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const resolved = await resolveMaterialReference(supabase, id)

  if (!resolved) notFound()

  const [matRes, latestPriceMap, preferredSupplierRes, supplierFlagsRes, aliasCountRes, uomConvFlagsRes] = await Promise.all([
    supabase
      .from('mat_master')
      .select(`
        id, material_id, material_code, cat_id, category_id, mat_name_th, mat_name_en, normalized_name,
        spec, brand, model, base_uom, base_uom_id, material_type_id, code_spec_key, code_locked,
        code_generated_at, code_rule_version, status, note, is_deleted, created_at, updated_at,
        category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th),
        uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th),
        material_type:material_types!mat_master_material_type_id_v1_fkey(id, name, code_prefix)
      `)
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .single(),
    fetchLatestPriceMap(supabase, [resolved.material_id]),
    supabase
      .from('mat_supplier_map')
      .select(`
        supplier_id, supplier_sku,
        supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
      `)
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .eq('is_preferred', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mat_supplier_map')
      .select('is_preferred, is_deleted')
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .limit(50),
    supabase
      .from('mat_alias')
      .select('alias_id', { count: 'exact', head: true })
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false),
    supabase
      .from('mat_uom_conv')
      .select('from_uom, from_uom_id, to_uom, to_uom_id, is_deleted')
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false)
      .limit(50),
  ])

  if (matRes.error) notFound()

  const material  = assertSupabase(matRes,       `Failed to load material ${id}`)
  const latestPrice = latestPriceMap[resolved.material_id] ?? null
  const quality = analyzeMaterialQuality({
    material: {
      ...(material as any),
      aliases: (aliasCountRes.count ?? 0) > 0 ? [{ alias_id: 'summary' }] : [],
      supplier_maps: supplierFlagsRes.data ?? [],
      uom_conversions: uomConvFlagsRes.data ?? [],
    },
    latestPrice,
  })

  return (
    <div>
      <Header
        title={material.mat_name_th}
        subtitle={getMaterialCode(material)}
      />
      <MaterialDetail
        material={material as any}
        latestPrice={latestPrice as any}
        quality={quality as any}
        preferredSupplier={preferredSupplierRes.data as any}
      />
    </div>
  )
}
