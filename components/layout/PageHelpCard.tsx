'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'
import { getPathValue } from '@/lib/i18n/types'

type HelpContent = {
  key: string
  title: string
  body: string
  steps: string[]
}

function normalizeHelpKey(pathname: string) {
  if (pathname === '/dashboard') return 'dashboard'
  if (pathname === '/materials/new') return 'materialNew'
  if (pathname === '/materials/cleanup') return 'cleanup'
  if (pathname === '/materials/code-cleanup') return 'codeCleanup'
  if (pathname === '/materials/duplicates') return 'duplicates'
  if (pathname.startsWith('/materials/')) return 'materialDetail'
  if (pathname === '/materials') return 'materials'
  if (pathname.startsWith('/bom')) return 'bom'
  if (pathname.startsWith('/boq')) return pathname.includes('/print') ? null : 'boq'
  if (pathname.startsWith('/categories')) return 'categories'
  if (pathname.startsWith('/uom')) return 'uom'
  if (pathname.startsWith('/suppliers')) return 'suppliers'
  if (pathname.startsWith('/prices')) return 'prices'
  if (pathname.startsWith('/receipts')) return 'receipts'
  if (pathname.startsWith('/customers')) return 'customers'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/templates')) return 'boq'
  return null
}

export function PageHelpCard() {
  const pathname = usePathname()
  const { dictionary, t } = useI18n()
  const key = normalizeHelpKey(pathname)
  const storageKey = key ? `page-help:${key}` : null
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!storageKey) return

    try {
      setCollapsed(window.localStorage.getItem(storageKey) === 'collapsed')
    } catch {
      setCollapsed(false)
    }
  }, [storageKey])

  const content = useMemo<HelpContent | null>(() => {
    if (!key) return null

    const title = t(`pageHelp.${key}.title`)
    const body = t(`pageHelp.${key}.body`)
    const rawSteps = getPathValue((dictionary ?? {}) as any, `pageHelp.${key}.steps`)
    const steps = Array.isArray(rawSteps) ? rawSteps.filter((step): step is string => typeof step === 'string') : []
    return { key, title, body, steps }
  }, [dictionary, key, t])

  if (!content || !storageKey) return null

  function toggle() {
    const keyForStorage = storageKey ?? ''

    setCollapsed((value) => {
      const next = !value
      try {
        window.localStorage.setItem(keyForStorage, next ? 'collapsed' : 'expanded')
      } catch {
        // Non-critical preference.
      }
      return next
    })
  }

  return (
    <section className="px-6 pt-4 print:hidden">
      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-900">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                {t('pageHelp.title')}
              </p>
              <h2 className="truncate text-sm font-bold text-slate-950">{content.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {collapsed ? t('pageHelp.expand') : t('pageHelp.collapse')}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-3 text-sm leading-6 text-slate-600">
            <p>{content.body}</p>
            {content.steps.length > 0 && (
              <ul className="mt-2 grid gap-1 md:grid-cols-3">
                {content.steps.map((step) => (
                  <li key={step} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
