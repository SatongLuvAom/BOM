export const MATERIAL_CODE_REGEX = /^[A-Z0-9]{2,5}-[A-Z0-9]{2,8}-[A-Z0-9]{2,12}-[0-9]{4}$/
export const MATERIAL_CODE_RULE_VERSION = 'v1'

export function sanitizeCodePart(
  value: string | null | undefined,
  fallback = 'GEN',
  maxLength = 12,
) {
  const sanitized = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  const safeFallback = String(fallback || 'GEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'GEN'

  return (sanitized || safeFallback).slice(0, Math.max(1, maxLength))
}

export function sanitizeCategoryPrefix(value: string | null | undefined) {
  const prefix = sanitizeCodePart(value, 'MISC', 5)
  return prefix.length >= 2 ? prefix : 'MISC'
}

export function sanitizeTypePrefix(value: string | null | undefined) {
  const prefix = sanitizeCodePart(value, 'GEN', 8)
  return prefix.length >= 2 ? prefix : 'GEN'
}

export function sanitizeSpecKey(value: string | null | undefined) {
  const spec = sanitizeCodePart(value, 'GEN', 12)
  return spec.length >= 2 ? spec : 'GEN'
}

export function isStandardMaterialCode(value: string | null | undefined) {
  return MATERIAL_CODE_REGEX.test(String(value ?? '').trim().toUpperCase())
}

export function hasInvalidMaterialCodeCharacters(value: string | null | undefined) {
  const code = String(value ?? '')
  return /[\u0E00-\u0E7F]/.test(code) || /\s/.test(code) || /[^A-Za-z0-9_-]/.test(code)
}

export function buildMaterialCodePreview(input: {
  categoryPrefix?: string | null
  typePrefix?: string | null
  specKey?: string | null
  seq?: number | null
}) {
  const categoryPrefix = sanitizeCategoryPrefix(input.categoryPrefix)
  const typePrefix = sanitizeTypePrefix(input.typePrefix)
  const specKey = sanitizeSpecKey(input.specKey)
  const seq = typeof input.seq === 'number' && Number.isFinite(input.seq) && input.seq > 0
    ? input.seq
    : 1

  return `${categoryPrefix}-${typePrefix}-${specKey}-${String(Math.floor(seq)).padStart(4, '0')}`
}

export function inferSpecKeyFromText(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return 'GEN'

  const upper = text.toUpperCase()

  const laminateCode = upper.match(/\b([A-Z][0-9]{3,5})\b/)
  if (laminateCode) return sanitizeSpecKey(laminateCode[1])

  const watt = upper.match(/\b([0-9]{1,4})\s*W\b/)
  if (watt) return sanitizeSpecKey(`${watt[1].padStart(3, '0')}W`)

  const voltage = upper.match(/\b(12|24|110|220|240)\s*V\b/)
  if (voltage) return sanitizeSpecKey(`${voltage[1]}V`)

  const thickness = upper.match(/\b([0-9]{1,3})(?:\.[0-9]+)?\s*(MM|มม\.?|มิล)\b/)
  if (thickness) return sanitizeSpecKey(thickness[1].padStart(3, '0'))

  if (/\b(WHT|WHITE)\b|ขาว/.test(upper)) return 'WHT'
  if (/\b(BLK|BLACK)\b|ดำ|ดํา/.test(upper)) return 'BLK'
  if (/\b(CLR|CLEAR)\b|ใส/.test(upper)) return 'CLR'
  if (/\b(GRY|GRAY|GREY)\b|เทา/.test(upper)) return 'GRY'

  const firstToken = upper.match(/[A-Z0-9]{2,12}/)
  return firstToken ? sanitizeSpecKey(firstToken[0]) : 'GEN'
}

export function getMaterialCodeIssue(value: string | null | undefined) {
  const code = String(value ?? '').trim()
  if (!code) return 'Missing material code'
  if (isStandardMaterialCode(code)) return null
  if (/[\u0E00-\u0E7F]/.test(code)) return 'Contains Thai text'
  if (/\s/.test(code)) return 'Contains spaces'
  if (/[a-z]/.test(code)) return 'Contains lowercase letters'
  if (/[^A-Za-z0-9_-]/.test(code)) return 'Contains special characters'
  return 'Does not match CATEGORY-TYPE-SPEC-SEQ'
}
