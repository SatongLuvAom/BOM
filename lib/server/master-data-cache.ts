import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export const getCachedActiveCategories = cache(
  async () => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('mat_category')
      .select('id, cat_id, cat_code, code_prefix, cat_name_th, cat_name_en, parent_cat_id, is_active, sort_order, deleted_at, created_by, updated_by, created_at, updated_at')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('sort_order')

    if (error) throw new Error(error.message)
    return data ?? []
  },
)

export const getCachedActiveUoms = cache(
  async () => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('mat_uom')
      .select('id, uom_code, uom_name_th, uom_name_en, is_active, created_at, updated_at')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('uom_code')

    if (error) throw new Error(error.message)
    return data ?? []
  },
)

export const getCachedActiveMaterialTypes = cache(
  async () => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('material_types')
      .select('id, category_id, name, code_prefix, description, is_active, created_at, updated_at, category:mat_category!material_types_category_id_fkey(id, cat_id, cat_code, cat_name_th, code_prefix)')
      .eq('is_active', true)
      .order('code_prefix')

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: any) => ({
      ...row,
      category: normalizeRelation(row.category),
    }))
  },
)

export const getCachedActiveSuppliers = cache(
  async () => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('supplier')
      .select('supplier_id, supplier_name_th, supplier_code')
      .eq('is_deleted', false)
      .eq('status', 'ACTIVE')
      .order('supplier_name_th')

    if (error) throw new Error(error.message)
    return data ?? []
  },
)
