'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

interface PaginationProps {
  total: number
  page: number
  limit: number
}

export function Pagination({ total, page, limit }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
    <div className="flex items-center justify-between border-t border-stone-200 bg-[var(--app-surface)] px-5 py-3 pr-20">
      <p className="text-xs text-slate-500 font-medium">
        แสดง <span className="font-semibold text-slate-700">{start}–{end}</span> จาก <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> รายการ
        {isPending && <span className="ml-2 font-semibold text-cyan-700">Loading page...</span>}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => go(page - 1)}
          disabled={isPending || page <= 1}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600
                     hover:bg-stone-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          ← ก่อนหน้า
        </button>

        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = i + 1
          return (
            <button
              key={p}
              onClick={() => go(p)}
              disabled={isPending || p === page}
              className={`min-w-[32px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                p === page
                  ? 'bg-slate-950 text-white shadow-sm'
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
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600
                     hover:bg-stone-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          ถัดไป →
        </button>
      </div>
    </div>
  )
}
