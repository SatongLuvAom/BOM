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
    <header className="app-header">
      <div className="min-w-0 flex-1 basis-56" data-i18n-managed>
        <h1 className="app-heading app-enter">{text(title)}</h1>
        {subtitle && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{text(subtitle)}</p>
        )}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-3">
        {actions && (
          <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}
