'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/client'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'

type NavItem = {
  labelKey: string
  href: string
  icon: IconName
}

type IconName =
  | 'dashboard'
  | 'shield'
  | 'code'
  | 'check'
  | 'bom'
  | 'box'
  | 'edit'
  | 'duplicate'
  | 'list'
  | 'users'
  | 'receipt'

const overviewItems: NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/dashboard', icon: 'dashboard' },
  { labelKey: 'nav.systemHealth', href: '/settings/system', icon: 'shield' },
  { labelKey: 'nav.materialCode', href: '/settings/material-code', icon: 'code' },
  { labelKey: 'nav.setupChecklist', href: '/settings/setup', icon: 'check' },
]

const matItems: NavItem[] = [
  { labelKey: 'nav.bom', href: '/bom', icon: 'bom' },
  { labelKey: 'nav.materials', href: '/materials', icon: 'box' },
  { labelKey: 'nav.codeCleanup', href: '/materials/code-cleanup', icon: 'edit' },
  { labelKey: 'nav.duplicates', href: '/materials/duplicates', icon: 'duplicate' },
  { labelKey: 'nav.categories', href: '/categories', icon: 'list' },
  { labelKey: 'nav.uom', href: '/uom', icon: 'list' },
  { labelKey: 'nav.suppliers', href: '/suppliers', icon: 'users' },
  { labelKey: 'nav.receipts', href: '/receipts', icon: 'receipt' },
]

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.65,
    'aria-hidden': true as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  const paths: Record<IconName, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    shield: (
      <>
        <path d="M20 13c0 5-3.5 7.5-8 8.5C7.5 20.5 4 18 4 13V5l8-3 8 3v8z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ),
    code: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h10" />
        <path d="M4 17h16" />
        <path d="M17 10l3 2-3 2" />
      </>
    ),
    check: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    bom: (
      <>
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4" />
        <path d="M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
      </>
    ),
    box: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.27 6.96 12 12.01l8.73-5.05" />
        <path d="M12 22.08V12" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    duplicate: (
      <>
        <rect x="3" y="4" width="7" height="7" rx="1" />
        <rect x="14" y="4" width="7" height="7" rx="1" />
        <path d="M10 8h4" />
        <rect x="8.5" y="15" width="7" height="5" rx="1" />
      </>
    ),
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </>
    ),
    receipt: (
      <>
        <path d="M4 3v18l2-1.5L8 21l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V3z" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    ),
  }

  return <svg {...common}>{paths[name]}</svg>
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-2 mt-6 px-6 text-[11px] font-medium tracking-wide text-slate-500 first:mt-2">
      {label}
    </p>
  )
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { t } = useI18n()
  const active =
    item.href === '/dashboard'
      ? pathname === '/dashboard'
      : item.href === '/materials'
        ? pathname.startsWith('/materials') &&
          !pathname.startsWith('/materials/code-cleanup') &&
          !pathname.startsWith('/materials/duplicates')
        : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="app-nav-link group"
    >
      <span className="app-nav-icon">
        <NavIcon name={item.icon} />
      </span>
      {t(item.labelKey)}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t, locale } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    dialogRef.current?.close()
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) dialogRef.current?.close() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [pathname])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const content = (mobile = false) => (
    <aside className="app-sidebar" data-i18n-managed>
      <div className="app-brand">
        <div className="app-brand-mark">
          <NavIcon name="box" />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-base font-semibold tracking-tight text-slate-950">{t('app.name')}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{t('app.subtitle')}</p>
        </div>
        {mobile && <button type="button" onClick={() => dialogRef.current?.close()} aria-label={t('common.close')} className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">✕</button>}
      </div>

      <nav aria-label={locale === 'th' ? 'เมนูหลัก' : 'Main navigation'} className="min-h-0 flex-1 overflow-y-auto pb-6" onClick={(event) => { if (mobile && (event.target as HTMLElement).closest('a')) dialogRef.current?.close() }}>
        <SectionLabel label={t('nav.overview')} />
        {overviewItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <SectionLabel label={t('nav.materialMaster')} />
        {matItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

      </nav>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <LanguageSwitcher compact />
        <div className="flex flex-wrap items-center justify-between gap-1 px-2 text-[10px] text-slate-500">
          <p>{t('app.versionPhase')}</p>
          <p>{t('app.versionStatus')}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="app-sidebar-desktop print:hidden">{content()}</div>
      <div className="app-sidebar-mobile print:hidden" data-i18n-managed>
        <Link href="/dashboard" className="flex items-center gap-2.5 text-sm font-semibold text-slate-950"><NavIcon name="box" />{t('app.name')}</Link>
        <button type="button" aria-label={locale === 'th' ? 'เปิดเมนูหลัก' : 'Open navigation'} aria-controls="app-mobile-navigation" aria-expanded={menuOpen} onClick={() => { dialogRef.current?.showModal(); setMenuOpen(true) }} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
        </button>
      </div>
      <dialog id="app-mobile-navigation" ref={dialogRef} aria-label={locale === 'th' ? 'เมนูหลัก' : 'Main navigation'} className="app-nav-dialog" onClose={() => setMenuOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        {content(true)}
      </dialog>
    </>
  )
}
