'use client'

import { useState } from 'react'
import { statusLabel } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import type { MatStatus } from '@/types/mat'

const OPTIONS: { value: MatStatus; labelKey: string }[] = [
  { value: 'ACTIVE', labelKey: 'status.active' },
  { value: 'INACTIVE', labelKey: 'status.inactive' },
  { value: 'DISCONTINUED', labelKey: 'status.archived' },
]

interface Props {
  materialId: string
  currentStatus: MatStatus
}

const STATUS_CLASS: Record<MatStatus, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  INACTIVE: 'border-neutral-200 bg-neutral-50 text-neutral-600',
  DISCONTINUED: 'border-red-200 bg-red-50 text-red-600',
}

export function InlineStatusSelect({ materialId, currentStatus }: Props) {
  const { t, text } = useI18n()
  const [status, setStatus] = useState<MatStatus>(currentStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(next: MatStatus) {
    if (next === status) return
    const previous = status
    setStatus(next)
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatus(previous)
        setError(json.error ?? 'Update failed')
        return
      }
    } finally {
      setLoading(false)
    }
  }

  const { label } = statusLabel(status)

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <label className="sr-only" htmlFor={`status-${materialId}`}>
        {t('common.status')}
      </label>
      <select
        id={`status-${materialId}`}
        value={status}
        disabled={loading}
        onChange={(event) => handleChange(event.target.value as MatStatus)}
        className={`h-7 rounded-lg border px-2 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-neutral-950/10 disabled:cursor-wait disabled:opacity-60 ${STATUS_CLASS[status]}`}
        title={`${t('common.status')}: ${loading ? '...' : text(label)}`}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

