'use client'

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Props {
  categories: { cat_id: string; cat_name_th: string }[]
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้',
  DISCONTINUED: 'ยกเลิก',
}

export function FilterChips({ categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const search = searchParams.get('search') ?? ''
  const catId  = searchParams.get('cat_id') ?? ''
  const status = searchParams.get('status') ?? ''

  const chips: { key: string; label: string }[] = []
  if (search) chips.push({ key: 'search', label: `"${search}"` })
  if (catId)  chips.push({ key: 'cat_id',  label: categories.find((c) => c.cat_id === catId)?.cat_name_th ?? catId })
  if (status) chips.push({ key: 'status',  label: STATUS_LABELS[status] ?? status })

  if (chips.length === 0) return null

  function removeFilter(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function clearAll() {
    startTransition(() => router.push(pathname))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pt-2">
      <span className="text-xs text-gray-400">ตัวกรอง:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
        >
          {chip.label}
          <button
            onClick={() => removeFilter(chip.key)}
            disabled={isPending}
            className="ml-0.5 rounded-full p-0.5 leading-none hover:bg-blue-200 disabled:cursor-wait disabled:opacity-50"
            aria-label={`ลบตัวกรอง ${chip.label}`}
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={clearAll}
          disabled={isPending}
          className="text-xs text-gray-500 underline hover:text-gray-900 disabled:cursor-wait disabled:opacity-50"
        >
          ล้างทั้งหมด
        </button>
      )}
      {isPending && <span className="text-xs font-medium text-cyan-700">Updating...</span>}
    </div>
  )
}
