import { en } from './dictionaries/en'
import { th } from './dictionaries/th'
import {
  defaultLocale,
  getPathValue,
  interpolate,
  isLocale,
  type Dictionary,
  type Locale,
} from './types'

export const dictionaries: Record<Locale, Dictionary> = { en, th }

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale
}

export function translateKey(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
) {
  const value = getPathValue(dictionaries[locale], key) ?? getPathValue(en, key)
  if (typeof value === 'string') {
    return interpolate(value, params)
  }

  return key
}

export function translateString(
  locale: Locale,
  value: string,
  params?: Record<string, string | number>,
) {
  const literal = getPathValue(dictionaries[locale], `legacy.${value}`) ?? getPathValue(en, `legacy.${value}`)
  if (typeof literal === 'string') {
    return interpolate(literal, params)
  }

  return interpolate(translateDynamicString(locale, value), params)
}

function translateDynamicString(locale: Locale, value: string) {
  if (locale === 'th') {
    return value
      .replace(/^([\d,]+) records$/i, '$1 รายการ')
      .replace(/^([\d,]+) active links$/i, '$1 รายการที่ผูกอยู่')
      .replace(/^([\d,]+) unresolved groups out of ([\d,]+)$/i, 'ยังไม่ได้ตัดสินใจ $1 กลุ่ม จาก $2 กลุ่ม')
      .replace(/^([\d,]+) materials need code review out of ([\d,]+)$/i, 'มีวัสดุ $1 รายการที่ต้องตรวจรหัส จากทั้งหมด $2 รายการ')
      .replace(/^([\d,]+) warning needs review$/i, 'มีคำเตือน $1 รายการที่ต้องตรวจ')
      .replace(/^([\d,]+) warnings need review$/i, 'มีคำเตือน $1 รายการที่ต้องตรวจ')
  }

  return value
    .replace(/^([\d,]+) รายการ$/, '$1 records')
    .replace(/^([\d,]+) ราย$/, '$1 records')
    .replace(/^([\d,]+) โปรเจกต์$/, '$1 projects')
    .replace(/^([\d,]+) หมวดหมู่$/, '$1 categories')
    .replace(/^([\d,]+) หน่วย$/, '$1 UOM')
    .replace(/^ยังไม่ได้ตัดสินใจ ([\d,]+) กลุ่ม จาก ([\d,]+) กลุ่ม$/, '$1 unresolved groups out of $2')
    .replace(/^มีวัสดุ ([\d,]+) รายการที่ต้องตรวจรหัส จากทั้งหมด ([\d,]+) รายการ$/, '$1 materials need code review out of $2')
}
