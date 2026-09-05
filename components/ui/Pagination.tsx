'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useI18n } from '@/lib/i18n/client'

interface PaginationProps {
  total: number
  page: number
  limit: number
}

export function Pagination({ total, page, limit }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const [isPending, startTransition] = useTransition()

  const totalPages = Math.ceil(total / limit)
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  function go(p: number) {
    if (p === page || p < 1 || p > totalPages) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  if (totalPages <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 bg-[var(--app-surface)] px-5 py-4" data-i18n-managed>
      <p className="text-xs text-slate-500 font-medium">
        {t('common.pagination.summary', { start, end, total: total.toLocaleString() })}
        {isPending && <span className="ml-2 font-semibold text-cyan-700">{t('common.pagination.loading')}</span>}
      </p>
      <nav aria-label={t('common.pagination.summary', { start, end, total: total.toLocaleString() })} className="flex max-w-full flex-wrap items-center gap-1">
        <button
          onClick={() => go(page - 1)}
          disabled={isPending || page <= 1}
          className="min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600
                     hover:bg-stone-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {t('common.pagination.previous')}
        </button>

        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = i + 1
          return (
            <button
              key={p}
              onClick={() => go(p)}
              disabled={isPending || p === page}
              aria-current={p === page ? 'page' : undefined}
              className={`min-h-11 min-w-11 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'
              }`}
            >
              {p}
            </button>
          )
        })}

        <button
          onClick={() => go(page + 1)}
          disabled={isPending || page >= totalPages}
          className="min-h-11 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600
                     hover:bg-stone-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {t('common.pagination.next')}
        </button>
      </nav>
    </div>
  )
}
