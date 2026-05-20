'use client'

import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'

type Color = 'green' | 'gray' | 'red' | 'blue' | 'yellow' | 'orange'

const colorMap: Record<Color, string> = {
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  gray:   'bg-stone-100   text-slate-600   ring-stone-200',
  red:    'bg-red-50      text-red-700     ring-red-200',
  blue:   'bg-cyan-50     text-cyan-800    ring-cyan-200',
  yellow: 'bg-amber-50    text-amber-800   ring-amber-200',
  orange: 'bg-orange-50   text-orange-800  ring-orange-200',
}

interface BadgeProps {
  label: string
  color?: Color
  className?: string
}

export function Badge({ label, color = 'gray', className }: BadgeProps) {
  const { text } = useI18n()

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset',
        colorMap[color],
        className,
      )}
    >
      {text(label)}
    </span>
  )
}
