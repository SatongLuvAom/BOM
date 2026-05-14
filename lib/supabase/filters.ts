const MAX_SEARCH_LENGTH = 120

const POSTGREST_OR_DELIMITERS = /[(),]/g
const SQL_LIKE_WILDCARDS = /[%_*]/g

export function normalizeSearchTerm(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(POSTGREST_OR_DELIMITERS, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SEARCH_LENGTH)
    .trim()
}

export function escapePostgrestLikePattern(value: string | null | undefined): string {
  const normalized = normalizeSearchTerm(value)

  return normalized
    .replace(/\\/g, '\\\\')
    .replace(SQL_LIKE_WILDCARDS, (match) => `\\${match}`)
}

export function buildIlikeContainsPattern(value: string | null | undefined): string {
  const escaped = escapePostgrestLikePattern(value)
  return escaped ? `%${escaped}%` : ''
}

export function buildOrIlikeFilter(columns: readonly string[], value: string | null | undefined): string {
  const pattern = buildIlikeContainsPattern(value)
  if (!pattern) return ''

  return columns.map((column) => `${column}.ilike.${pattern}`).join(',')
}

export function buildPostgrestInFilter(column: string, values: readonly string[]): string {
  const safeValues = values
    .map((value) =>
      normalizeSearchTerm(value)
        .replace(POSTGREST_OR_DELIMITERS, '')
        .replace(/"/g, '')
        .trim(),
    )
    .filter(Boolean)

  return safeValues.length ? `${column}.in.(${safeValues.join(',')})` : ''
}
