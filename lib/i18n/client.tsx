'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dictionaries, translateKey, translateString } from './runtime'
import { defaultLocale, localeCookieName, type Dictionary, type Locale } from './types'

type I18nContextValue = {
  locale: Locale
  dictionary: Dictionary
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
  text: (value: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function writeLocale(locale: Locale) {
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; SameSite=Lax`
  document.documentElement.lang = locale
}

export function I18nProvider({
  initialLocale = defaultLocale,
  children,
}: {
  initialLocale?: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    setLocaleState(initialLocale)
    writeLocale(initialLocale)
  }, [initialLocale])

  const setLocale = useCallback((nextLocale: Locale) => {
    writeLocale(nextLocale)
    // Update the client snapshot before refreshing Server Components so both
    // sides render from the same cookie locale throughout the transition.
    setLocaleState(nextLocale)
    router.refresh()
  }, [router])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    dictionary: dictionaries[locale],
    setLocale,
    t: (key, params) => translateKey(locale, key, params),
    text: (input, params) => translateString(locale, input, params),
  }), [locale, setLocale])

  return (
    <I18nContext.Provider value={value}>
      {children}
      <LegacyTextLocalizer locale={locale} />
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return context
}

function translateNodeText(locale: Locale, value: string) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return value

  const translated = translateString(locale, compact)
  if (translated === compact) return value

  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}

function LegacyTextLocalizer({ locale }: { locale: Locale }) {
  const originalsRef = useRef(new WeakMap<Node, string>())
  const attributeOriginalsRef = useRef(new WeakMap<Element, Record<string, string>>())

  useEffect(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-root]'))
    const targets = roots.length > 0 ? roots : [document.body]
    const originals = originalsRef.current
    const attributeOriginals = attributeOriginalsRef.current
    const managedSelector = '[data-i18n-managed]'
    let frame = 0

    function translateElementAttributes(element: Element) {
      if (element.closest(managedSelector)) return

      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const value = element.getAttribute(attribute)
        if (!value) continue

        const originalMap = attributeOriginals.get(element) ?? {}
        const original = originalMap[attribute] ?? value
        originalMap[attribute] = original
        attributeOriginals.set(element, originalMap)
        element.setAttribute(attribute, translateString(locale, original))
      }
    }

    function translateRoot(root: Element) {
      if (root.matches(managedSelector)) return

      translateElementAttributes(root)

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            return node.nodeType === Node.ELEMENT_NODE
              && (node as Element).matches(managedSelector)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT
          },
        },
      )
      let node = walker.nextNode()

      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const original = originals.get(node) ?? node.textContent ?? ''
          originals.set(node, original)
          const nextText = translateNodeText(locale, original)
          if (node.textContent !== nextText) {
            node.textContent = nextText
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(node as Element)
        }

        node = walker.nextNode()
      }
    }

    function run() {
      frame = 0
      for (const target of targets) {
        translateRoot(target)
      }
    }

    function schedule() {
      if (frame) return
      frame = window.requestAnimationFrame(run)
    }

    run()
    const observer = new MutationObserver(schedule)
    for (const target of targets) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label'],
      })
    }

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [locale])

  return null
}
