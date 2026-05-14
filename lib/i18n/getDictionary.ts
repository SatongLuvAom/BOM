import { cookies } from 'next/headers'
import {
  localeCookieName,
  type Locale,
} from './types'
import { dictionaries, resolveLocale, translateKey, translateString } from './runtime'

export async function getLocaleFromCookie(): Promise<Locale> {
  const cookieStore = await cookies()
  return resolveLocale(cookieStore.get(localeCookieName)?.value)
}

export async function getDictionary() {
  const locale = await getLocaleFromCookie()
  return {
    locale,
    dictionary: dictionaries[locale],
    t: (key: string, params?: Record<string, string | number>) => translateKey(locale, key, params),
    text: (value: string, params?: Record<string, string | number>) => translateString(locale, value, params),
  }
}
