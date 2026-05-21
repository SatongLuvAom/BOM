'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'

const suggestions = [
  {
    labelKey: 'aiHelper.suggestions.materials',
    href: '/materials',
    hintKey: 'aiHelper.suggestions.materialsHint',
  },
  {
    labelKey: 'aiHelper.suggestions.boq',
    href: '/boq/create',
    hintKey: 'aiHelper.suggestions.boqHint',
  },
]

export function AiHelper() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { t } = useI18n()

  if (pathname.startsWith('/receipts')) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 print:hidden">
      <div
        className={cn(
          'pointer-events-auto mb-3 w-[calc(100vw-2rem)] max-w-[18rem] origin-bottom-right rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_18px_54px_rgba(15,23,42,0.18)] transition-all duration-200',
          open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0',
        )}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="m16.24 16.24 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="m16.24 7.76 2.83-2.83" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-950">{t('aiHelper.title')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('aiHelper.description')}</p>
          </div>
        </div>

        <div className="space-y-2">
          {suggestions.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 transition hover:border-cyan-200 hover:bg-cyan-50"
              onClick={() => setOpen(false)}
            >
              <span>
                <span className="block text-xs font-semibold text-slate-800">{t(item.labelKey)}</span>
                <span className="block text-[11px] text-slate-400">{t(item.hintKey)}</span>
              </span>
              <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-700">-&gt;</span>
            </Link>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-medium leading-5 text-slate-600">{t('aiHelper.note')}</p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          aria-label={open ? t('aiHelper.close') : t('aiHelper.open')}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="assistant-float pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white opacity-90 shadow-[0_10px_24px_rgba(15,23,42,0.22)] ring-1 ring-white transition hover:-translate-y-0.5 hover:opacity-100 hover:shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
        >
          <span className="absolute right-[-2px] top-[-2px] h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          {open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          ) : (
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8" />
              <rect x="4" y="8" width="16" height="11" rx="3" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M9 13h.01" />
              <path d="M15 13h.01" />
              <path d="M10 17h4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
