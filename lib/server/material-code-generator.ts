import { buildMaterialCodePreview, sanitizeCategoryPrefix, sanitizeSpecKey, sanitizeTypePrefix } from '@/lib/material-code'
import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface MaterialCodeInput {
  categoryPrefix: string | null | undefined
  typePrefix: string | null | undefined
  specKey: string | null | undefined
  minNo?: number
}

interface MaterialCodeResult {
  code: string
  categoryPrefix: string
  typePrefix: string
  specKey: string
  nextNo: number
  source: 'rpc' | 'existing_rows'
  rpcError?: string
}

function normalizeInput(input: MaterialCodeInput) {
  return {
    categoryPrefix: sanitizeCategoryPrefix(input.categoryPrefix),
    typePrefix: sanitizeTypePrefix(input.typePrefix),
    specKey: sanitizeSpecKey(input.specKey),
    minNo: Math.max(1, Math.floor(input.minNo ?? 1)),
  }
}

function sequenceFromCode(code: string, prefix: string) {
  if (!code.startsWith(prefix)) return 0
  const suffix = code.slice(prefix.length)
  return /^[0-9]{4}$/.test(suffix) ? Number(suffix) : 0
}

export async function generateMaterialCodeForCreate(
  supabase: SupabaseClient,
  input: MaterialCodeInput,
): Promise<{ data: MaterialCodeResult | null; error: string | null }> {
  const normalized = normalizeInput(input)

  const { data: rpcCode, error: rpcError } = await supabase.rpc('fn_generate_material_code_v1', {
    p_category_prefix: normalized.categoryPrefix,
    p_type_prefix: normalized.typePrefix,
    p_spec_key: normalized.specKey,
  })

  if (rpcCode && !rpcError) {
    const code = String(rpcCode)
    const nextNo = sequenceFromCode(code, `${normalized.categoryPrefix}-${normalized.typePrefix}-${normalized.specKey}-`)
    return {
      data: {
        ...normalized,
        code,
        nextNo: nextNo || normalized.minNo,
        source: 'rpc',
      },
      error: null,
    }
  }

  const fallback = await getNextMaterialCodeFromExistingRows(supabase, normalized)
  if (!fallback.data) {
    return { data: null, error: fallback.error ?? rpcError?.message ?? 'Could not generate material code' }
  }

  return {
    data: {
      ...fallback.data,
      source: 'existing_rows',
      rpcError: rpcError?.message,
    },
    error: null,
  }
}

export async function getNextMaterialCodeFromExistingRows(
  supabase: SupabaseClient,
  input: MaterialCodeInput,
): Promise<{ data: Omit<MaterialCodeResult, 'source' | 'rpcError'> | null; error: string | null }> {
  const normalized = normalizeInput(input)
  const prefix = `${normalized.categoryPrefix}-${normalized.typePrefix}-${normalized.specKey}-`

  const { data, error } = await supabase
    .from('mat_master')
    .select('material_code')
    .like('material_code', `${prefix}%`)
    .eq('is_deleted', false)
    .limit(1000)

  if (error) {
    return { data: null, error: error.message }
  }

  const maxExistingNo = (data ?? []).reduce((max, row) => {
    return Math.max(max, sequenceFromCode(String(row.material_code ?? ''), prefix))
  }, 0)
  const nextNo = Math.max(maxExistingNo + 1, normalized.minNo)

  return {
    data: {
      ...normalized,
      code: buildMaterialCodePreview({
        categoryPrefix: normalized.categoryPrefix,
        typePrefix: normalized.typePrefix,
        specKey: normalized.specKey,
        seq: nextNo,
      }),
      nextNo,
    },
    error: null,
  }
}
