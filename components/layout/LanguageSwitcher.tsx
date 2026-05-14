'use client'

import { useI18n } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/types'
import { cn } from '@/lib/utils'

const options: Array<{ locale: Locale; labelKey: string }> = [
  { locale: 'th', labelKey: 'language.thai' },
  { locale: 'en', labelKey: 'language.english' },
]

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      className={cn(
        'inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm',
        compact && 'w-full',
      )}
      aria-label={t('language.label')}
    >
      {options.map((option) => {
        const active = locale === option.locale
        return (
          <button
            key={option.locale}
            type="button"
            onClick={() => setLocale(option.locale)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-bold transition',
              compact && 'flex-1',
              active
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-500 hover:bg-stone-100 hover:text-slate-950',
            )}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

