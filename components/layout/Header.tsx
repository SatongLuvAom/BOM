'use client'

import { useI18n } from '@/lib/i18n/client'

interface HeaderProps {
  title:     string
  subtitle?: string
  actions?:  React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { text } = useI18n()

  return (
    <div className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-6 border-b border-stone-200 bg-[var(--app-surface)]/95 px-7 py-4 shadow-sm shadow-stone-200/40 backdrop-blur transition-all">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-1.5 rounded-full bg-gradient-to-b from-cyan-600 via-slate-900 to-emerald-600" />
        <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold leading-tight tracking-tight text-slate-950">{text(title)}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm font-medium text-slate-500">{text(subtitle)}</p>
        )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actions && (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
    </div>
  )
}
