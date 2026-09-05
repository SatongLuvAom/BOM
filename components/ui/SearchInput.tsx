'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useI18n } from '@/lib/i18n/client'

interface SearchInputProps {
  placeholder?: string
  paramName?: string
  debounceMs?: number
  minSearchLength?: number
  searchOn?: 'debounce' | 'enter'
}

export function SearchInput({
  placeholder = 'ค้นหา...',
  paramName = 'search',
  debounceMs = 550,
  minSearchLength = 1,
  searchOn = 'debounce',
}: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t, text } = useI18n()
  const [isPending, startTransition] = useTransition()
  const currentValue = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(currentValue)

  useEffect(() => {
    setValue(currentValue)
  }, [currentValue])

  useEffect(() => {
    if (searchOn !== 'debounce') return

    const trimmed = value.trim()
    const activeValue = trimmed.length >= minSearchLength ? trimmed : ''
    const currentParam = searchParams.get(paramName) ?? ''

    if (activeValue === currentParam) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (activeValue) {
        params.set(paramName, activeValue)
      } else {
        params.delete(paramName)
      }

      params.set('page', '1')
      const queryString = params.toString()

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname)
      })
    }, debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [debounceMs, minSearchLength, paramName, pathname, router, searchOn, searchParams, value])

  function applySearch(nextValue: string) {
    const trimmed = nextValue.trim()
    const activeValue = trimmed.length >= minSearchLength ? trimmed : ''
    const params = new URLSearchParams(searchParams.toString())

    if (activeValue) {
      params.set(paramName, activeValue)
    } else {
      params.delete(paramName)
    }

    params.set('page', '1')
    const queryString = params.toString()

    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname)
    })
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    applySearch(value)
  }

  return (
    <form className="relative" onSubmit={handleSubmit}>
      <svg
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={text(placeholder)}
        aria-label={text(placeholder)}
        className={`min-h-11 w-full rounded-full border border-slate-300 bg-white py-2.5 pl-11 ${searchOn === 'enter' ? 'pr-24' : 'pr-4'} text-sm font-medium text-slate-800
                   placeholder-slate-400 transition-all duration-150
                   focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15`}
      />
      {searchOn === 'enter' && value !== currentValue && !isPending && (
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          {t('common.search')}
        </button>
      )}
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
        </div>
      )}
    </form>
  )
}
