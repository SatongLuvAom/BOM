import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const ACTIVE_CATEGORIES_CACHE_TAG = 'master-data:active-categories'
const ACTIVE_SUPPLIERS_CACHE_TAG = 'master-data:active-suppliers'
const MASTER_DATA_CACHE_TTL_SECONDS = 300

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

async function fetchActiveCategories(supabase: SupabaseClient, persisted = false) {
    const startedAt = performance.now()
    const { data, error } = await supabase
      .from('mat_category')
      .select('id, cat_id, cat_code, code_prefix, cat_name_th, cat_name_en, parent_cat_id, is_active, sort_order, deleted_at, created_by, updated_by, created_at, updated_at')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('sort_order')

    if (error) throw new Error(error.message)
    const categories = data ?? []
    console.info(JSON.stringify({
      event: persisted ? 'master_data_cache_miss' : 'master_data_session_read',
      resource: 'active_categories',
      duration_ms: Math.round(performance.now() - startedAt),
      row_count: categories.length,
    }))
    return categories
}

const getPersistedActiveCategories = unstable_cache(
  () => fetchActiveCategories(createAdminClient(), true),
  ['active-categories-v1'],
  { tags: [ACTIVE_CATEGORIES_CACHE_TAG], revalidate: MASTER_DATA_CACHE_TTL_SECONDS },
)

export const getCachedActiveCategories = cache(async () => {
  // Session-scoped development reads must stay outside the shared persistent cache.
  if (process.env.NODE_ENV === 'development' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fetchActiveCategories(await createClient())
  }
  return getPersistedActiveCategories()
})

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

async function fetchActiveSuppliers(supabase: SupabaseClient, persisted = false) {
    const startedAt = performance.now()
    const { data, error } = await supabase
      .from('supplier')
      .select('supplier_id, supplier_name_th, supplier_code')
      .eq('is_deleted', false)
      .eq('status', 'ACTIVE')
      .order('supplier_name_th')

    if (error) throw new Error(error.message)
    const suppliers = data ?? []
    console.info(JSON.stringify({
      event: persisted ? 'master_data_cache_miss' : 'master_data_session_read',
      resource: 'active_suppliers',
      duration_ms: Math.round(performance.now() - startedAt),
      row_count: suppliers.length,
    }))
    return suppliers
}

const getPersistedActiveSuppliers = unstable_cache(
  () => fetchActiveSuppliers(createAdminClient(), true),
  ['active-suppliers-v1'],
  { tags: [ACTIVE_SUPPLIERS_CACHE_TAG], revalidate: MASTER_DATA_CACHE_TTL_SECONDS },
)

export const getCachedActiveSuppliers = cache(async () => {
  if (process.env.NODE_ENV === 'development' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fetchActiveSuppliers(await createClient())
  }
  return getPersistedActiveSuppliers()
})

export function invalidateActiveCategoriesCache() {
  revalidateTag(ACTIVE_CATEGORIES_CACHE_TAG)
}

export function invalidateActiveSuppliersCache() {
  revalidateTag(ACTIVE_SUPPLIERS_CACHE_TAG)
}
