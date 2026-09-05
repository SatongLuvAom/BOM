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
        'inline-flex rounded-full bg-slate-100 p-1',
        compact && 'w-full',
      )}
      aria-label={t('language.label')}
      role="group"
      data-i18n-managed
    >
      {options.map((option) => {
        const active = locale === option.locale
        return (
          <button
            key={option.locale}
            type="button"
            onClick={() => setLocale(option.locale)}
            aria-pressed={active}
            className={cn(
              'min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
              compact && 'flex-1',
              active
                ? 'bg-white text-slate-950 shadow-sm'
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
