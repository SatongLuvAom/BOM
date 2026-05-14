export const supportedLocales = ['th', 'en'] as const

export type Locale = (typeof supportedLocales)[number]

export interface Dictionary {
  [key: string]: DictionaryValue
}

export type DictionaryValue = string | string[] | Dictionary

export const defaultLocale: Locale = 'th'
export const localeCookieName = 'boq_locale'

export function isLocale(value: unknown): value is Locale {
  return supportedLocales.includes(value as Locale)
}

export function getPathValue(dictionary: Dictionary, key: string): DictionaryValue | undefined {
  return key.split('.').reduce<DictionaryValue | undefined>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }

    return current[part]
  }, dictionary)
}

export function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template

  return Object.entries(params).reduce(
    (value, [key, replacement]) => value.replaceAll(`{${key}}`, String(replacement)),
    template,
  )
}
