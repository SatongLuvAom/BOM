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

function joinedText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(' ').trim()
}

function matchSpecPattern(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return null

  const upper = text.toUpperCase()

  const dimensions = upper.match(/\b([0-9]{1,4})\s*[Xx*\u00D7]\s*([0-9]{1,4})(?:\s*[Xx*\u00D7]\s*([0-9]{1,4}))?\s*(MM|CM|M)?\b/)
  if (dimensions) {
    return sanitizeSpecKey([dimensions[1], dimensions[2], dimensions[3]].filter(Boolean).join('X'))
  }

  const laminateCode = upper.match(/\b([A-Z][0-9]{3,5})\b/)
  if (laminateCode) return sanitizeSpecKey(laminateCode[1])

  const watt = upper.match(/\b([0-9]{1,4})\s*W\b/)
  if (watt) return sanitizeSpecKey(`${watt[1].padStart(3, '0')}W`)

  const voltage = upper.match(/\b(12|24|110|220|240)\s*V\b/)
  if (voltage) return sanitizeSpecKey(`${voltage[1]}V`)

  const thickness = upper.match(/\b([0-9]{1,3})(?:\.[0-9]+)?\s*MM\b/)
  if (thickness) return sanitizeSpecKey(thickness[1].padStart(3, '0'))

  if (/\b(WHT|WHITE)\b/.test(upper)) return 'WHT'
  if (/\b(BLK|BLACK)\b/.test(upper)) return 'BLK'
  if (/\b(CLR|CLEAR)\b/.test(upper)) return 'CLR'
  if (/\b(GRY|GRAY|GREY)\b/.test(upper)) return 'GRY'

  return null
}

export function inferSpecKeyFromText(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  if (!text) return 'GEN'

  const specPattern = matchSpecPattern(text)
  if (specPattern) return specPattern

  const firstToken = text.toUpperCase().match(/[A-Z0-9]{2,12}/)
  return firstToken ? sanitizeSpecKey(firstToken[0]) : 'GEN'
}

export function inferSpecKeyFromMaterialText(input: {
  spec?: string | null
  matNameEn?: string | null
  matNameTh?: string | null
  brand?: string | null
  model?: string | null
}) {
  const explicitSpec = String(input.spec ?? '').trim()
  if (explicitSpec) return inferSpecKeyFromText(explicitSpec)

  return matchSpecPattern(joinedText([
    input.matNameEn,
    input.matNameTh,
    input.brand,
    input.model,
  ])) ?? 'GEN'
}

const TYPE_RULES: Array<{ prefix: string; pattern: RegExp }> = [
  { prefix: 'HMR', pattern: /\bHMR\b|MOISTURE\s*RESIST/i },
  { prefix: 'MDF', pattern: /\bMDF\b|MEDIUM\s*DENSITY/i },
  { prefix: 'PLY', pattern: /\bPLY\b|PLYWOOD/i },
  { prefix: 'PB', pattern: /\bPARTICLE\s*BOARD\b|\bCHIPBOARD\b|\bPB\b/i },
  { prefix: 'OSB', pattern: /\bOSB\b/i },
  { prefix: 'HPL', pattern: /\bHPL\b|HIGH\s*PRESSURE\s*LAMINATE|LAMINATE/i },
  { prefix: 'EDG', pattern: /\bEDGE\s*BAND|\bEDGEBAND/i },
  { prefix: 'FILM', pattern: /\bFILM\b/i },
  { prefix: 'MEL', pattern: /\bMELAMINE\b|\bMEL\b/i },
  { prefix: 'THN', pattern: /\bTHINNER\b|\bTHINER\b|\bTINNER\b|\bTINER\b|\bTHN\b/i },
  { prefix: 'PRM', pattern: /\bPRIMER\b|\bPRM\b/i },
  { prefix: 'PUT', pattern: /\bPUTTY\b|\bFILLER\b/i },
  { prefix: 'SPR', pattern: /\bSPRAY\b|\bAEROSOL\b/i },
  { prefix: 'OIL', pattern: /\bOIL\b/i },
  { prefix: 'PNT', pattern: /\bPAINT\b|\bCOATING\b/i },
  { prefix: 'SPOT', pattern: /\bSPOT\s*LIGHT\b|\bSPOTLIGHT\b|\bDOWN\s*LIGHT\b|\bDOWNLIGHT\b/i },
  { prefix: 'STRIP', pattern: /\bLED\s*STRIP\b|\bSTRIP\s*LIGHT\b/i },
  { prefix: 'PSU', pattern: /\bPSU\b|\bPOWER\s*SUPPLY\b|\bDRIVER\b/i },
  { prefix: 'WIRE', pattern: /\bWIRE\b|\bCABLE\b/i },
  { prefix: 'PLUG', pattern: /\bPLUG\b|\bSOCKET\b/i },
  { prefix: 'SW', pattern: /\bSWITCH\b/i },
  { prefix: 'HINGE', pattern: /\bHINGE\b/i },
  { prefix: 'HANDLE', pattern: /\bHANDLE\b|\bPULL\b/i },
  { prefix: 'SCREW', pattern: /\bSCREW\b|\bBOLT\b/i },
  { prefix: 'LOCK', pattern: /\bLOCK\b/i },
  { prefix: 'RUNNER', pattern: /\bRUNNER\b|\bSLIDE\b/i },
  { prefix: 'BRKT', pattern: /\bBRACKET\b|\bBRKT\b/i },
  { prefix: 'BOX', pattern: /\bSQUARE\s*TUBE\b|\bBOX\s*SECTION\b|\bBOX\b/i },
  { prefix: 'PIPE', pattern: /\bPIPE\b|\bROUND\s*TUBE\b|\bTUBE\b/i },
  { prefix: 'ANGLE', pattern: /\bANGLE\b|\bL\s*BAR\b/i },
  { prefix: 'FLAT', pattern: /\bFLAT\s*BAR\b|\bFLAT\b/i },
  { prefix: 'SHEET', pattern: /\bSHEET\b|\bPLATE\b/i },
  { prefix: 'VIN', pattern: /\bVINYL\b/i },
  { prefix: 'STK', pattern: /\bSTICKER\b|\bDECAL\b/i },
  { prefix: 'BAN', pattern: /\bBANNER\b/i },
  { prefix: 'ACR', pattern: /\bACRYLIC\b|\bACR\b/i },
  { prefix: 'GLS', pattern: /\bGLASS\b/i },
  { prefix: 'MIR', pattern: /\bMIRROR\b/i },
  { prefix: 'SIL', pattern: /\bSILICONE\b|\bSEALANT\b/i },
  { prefix: 'GLUE', pattern: /\bGLUE\b|\bADHESIVE\b/i },
  { prefix: 'TAPE', pattern: /\bTAPE\b/i },
  { prefix: 'FAB', pattern: /\bFABRIC\b|\bTEXTILE\b/i },
  { prefix: 'LTH', pattern: /\bLEATHER\b/i },
  { prefix: 'FOAM', pattern: /\bFOAM\b/i },
  { prefix: 'VALVE', pattern: /\bVALVE\b/i },
  { prefix: 'PUMP', pattern: /\bPUMP\b/i },
  { prefix: 'ELBOW', pattern: /\bELBOW\b/i },
]

export function inferTypePrefixFromText(input: {
  matNameEn?: string | null
  matNameTh?: string | null
  spec?: string | null
  brand?: string | null
  model?: string | null
  fallback?: string | null
}) {
  const text = joinedText([
    input.matNameEn,
    input.spec,
    input.matNameTh,
    input.model,
    input.brand,
  ])

  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(text)) return sanitizeTypePrefix(rule.prefix)
  }

  return sanitizeTypePrefix(input.fallback ?? 'GEN')
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
