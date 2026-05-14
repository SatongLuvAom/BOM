'use client'

import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n/client'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const { text, t } = useI18n()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-[var(--app-surface)] shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
          <h3 className="text-base font-bold text-slate-950">{text(title)}</h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[calc(92vh-4rem)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
