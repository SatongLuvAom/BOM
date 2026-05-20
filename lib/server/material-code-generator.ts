import { sanitizeCategoryPrefix, sanitizeSpecKey, sanitizeTypePrefix } from '@/lib/material-code'
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
  source: 'rpc'
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

  if (rpcError || !rpcCode) {
    return {
      data: null,
      error: rpcError?.message ?? 'Material code generation function returned no code',
    }
  }

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
