export type MaterialFormProfile = 'laminate' | 'board' | 'paint' | 'vinyl'

interface ProfileMaterialType {
  id: string
  category_id: string
  code_prefix: string
  is_active: boolean
}

interface ProfileCategory {
  id: string
  cat_code: string | null
  is_active: boolean
  is_deleted?: boolean
}

type ResolutionReason = 'mapped' | 'missing_selection' | 'ambiguous_type' | 'inactive_type'
  | 'category_mismatch' | 'ambiguous_category' | 'inactive_category' | 'unsupported_type'

interface ProfileResolution {
  profile: MaterialFormProfile | null
  materialTypeId: string | null
  reason: ResolutionReason
}

// Category cat_code, NOT the editable code-generation prefix (FNR != LAM, PNT != PT).
// No vinyl mapping until a dedicated flooring type is verified.
const PROFILE_RULES: ReadonlyArray<{
  category: string
  prefixes: readonly string[]
  profile: MaterialFormProfile
}> = [
  { category: 'FNR', prefixes: ['HPL', 'LAM'], profile: 'laminate' },
  { category: 'WD', prefixes: ['MDF', 'HMR', 'PLY', 'PB'], profile: 'board' },
  { category: 'STR', prefixes: ['MDF', 'HMR', 'PLY'], profile: 'board' },
  { category: 'PNT', prefixes: ['ACR', 'OIL', 'PRM', 'TOP', 'CLEAR'], profile: 'paint' },
  { category: 'FNR', prefixes: ['PAINT', 'PRM', 'TOP'], profile: 'paint' },
]

/** Resolve from authorized master data already loaded by the caller. Not product matching or write authorization. */
export function resolveMaterialFormProfile(
  materialTypeId: string | null | undefined,
  categoryId: string | null | undefined,
  materialTypes: readonly ProfileMaterialType[],
  categories: readonly ProfileCategory[],
): ProfileResolution {
  const unmapped = (reason: ResolutionReason): ProfileResolution => ({ profile: null, materialTypeId: materialTypeId ?? null, reason })
  if (!materialTypeId || !categoryId) return unmapped('missing_selection')
  const matches = materialTypes.filter(row => row.id === materialTypeId)
  if (matches.length !== 1) return unmapped('ambiguous_type')
  const type = matches[0]
  if (type.is_active !== true) return unmapped('inactive_type')
  if (type.category_id !== categoryId) return unmapped('category_mismatch')
  if (materialTypes.filter(row => row.is_active && row.category_id === categoryId && row.code_prefix === type.code_prefix).length !== 1) return unmapped('ambiguous_type')
  const categoryMatches = categories.filter(row => row.id === categoryId)
  if (categoryMatches.length !== 1) return unmapped('ambiguous_category')
  const category = categoryMatches[0]
  if (category.is_active !== true || category.is_deleted === true) return unmapped('inactive_category')
  if (categories.filter(row => row.is_active && !row.is_deleted && row.cat_code === category.cat_code).length !== 1) return unmapped('ambiguous_category')
  const rule = PROFILE_RULES.find(row => row.category === category.cat_code && row.prefixes.includes(type.code_prefix))
  return rule ? { profile: rule.profile, materialTypeId, reason: 'mapped' } : unmapped('unsupported_type')
}
