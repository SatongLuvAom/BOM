'use client'

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'

interface Props {
  categories: { cat_id: string; cat_name_th: string }[]
  suppliers?: { supplier_id: string; supplier_name_th: string }[]
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  ACTIVE: 'status.active',
  INACTIVE: 'status.inactive',
  DISCONTINUED: 'materialsPage.list.discontinued',
}

const PRICE_LABEL_KEYS: Record<string, string> = {
  yes: 'materialsPage.list.hasPrice',
  missing: 'materialsPage.missingPrice',
}

const STALE_PRICE_LABEL_KEYS: Record<string, string> = {
  yes: 'materialsPage.list.priceOlderThan30Days',
}

export function FilterChips({ categories, suppliers = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const [isPending, startTransition] = useTransition()

  const search = searchParams.get('search') ?? ''
  const catId = searchParams.get('cat_id') ?? ''
  const status = searchParams.get('status') ?? ''
  const hasPrice = searchParams.get('has_price') ?? ''
  const stalePrice = searchParams.get('stale_price') ?? ''
  const supplierId = searchParams.get('supplier_id') ?? ''

  const chips: { key: string; label: string }[] = []
  if (search) chips.push({ key: 'search', label: `${t('materialsPage.filters.search')}: ${search}` })
  if (catId) chips.push({ key: 'cat_id', label: `${t('materialsPage.filters.category')}: ${categories.find((c) => c.cat_id === catId)?.cat_name_th ?? catId}` })
  if (status) chips.push({ key: 'status', label: `${t('materialsPage.filters.status')}: ${STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : status}` })
  if (hasPrice) chips.push({ key: 'has_price', label: `${t('materialsPage.filters.price')}: ${PRICE_LABEL_KEYS[hasPrice] ? t(PRICE_LABEL_KEYS[hasPrice]) : hasPrice}` })
  if (stalePrice) chips.push({ key: 'stale_price', label: `${t('materialsPage.filters.priceAge')}: ${STALE_PRICE_LABEL_KEYS[stalePrice] ? t(STALE_PRICE_LABEL_KEYS[stalePrice]) : stalePrice}` })
  if (supplierId) chips.push({ key: 'supplier_id', label: `${t('materialsPage.filters.supplier')}: ${suppliers.find((supplier) => supplier.supplier_id === supplierId)?.supplier_name_th ?? supplierId}` })

  function removeFilter(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function clearAll() {
    startTransition(() => router.push(pathname))
  }

  if (chips.length === 0) {
    return <p className="text-xs font-medium text-slate-400">{t('materialsPage.filters.none')}</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-slate-500">{t('materialsPage.filters.applied')}</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"
        >
          {chip.label}
          <button
            onClick={() => removeFilter(chip.key)}
            disabled={isPending}
            className="ml-0.5 rounded-full p-0.5 leading-none hover:bg-blue-100 disabled:cursor-wait disabled:opacity-50"
            aria-label={t('materialsPage.filters.remove', { filter: chip.label })}
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={clearAll}
        disabled={isPending}
        className="text-xs font-bold text-blue-700 underline hover:text-blue-950 disabled:cursor-wait disabled:opacity-50"
      >
        {t('materialsPage.filters.clearAll')}
      </button>
      {isPending && <span className="text-xs font-semibold text-blue-700">{t('materialsPage.filters.updating')}</span>}
    </div>
  )
}
