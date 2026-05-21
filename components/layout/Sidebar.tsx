'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
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
  | 'file'
  | 'receipt'
  | 'template'
  | 'chart'

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

const boqItems: NavItem[] = [
  { labelKey: 'nav.boq', href: '/boq', icon: 'file' },
  { labelKey: 'nav.customers', href: '/customers', icon: 'users' },
  { labelKey: 'nav.templates', href: '/templates', icon: 'template' },
  { labelKey: 'nav.reports', href: '/reports', icon: 'chart' },
]

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
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
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8M16 17H8" />
      </>
    ),
    receipt: (
      <>
        <path d="M4 3v18l2-1.5L8 21l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V3z" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    ),
    template: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-5" />
      </>
    ),
  }

  return <svg {...common}>{paths[name]}</svg>
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-2 mt-5 px-5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 first:mt-2">
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
      className={cn(
        'group relative mx-3 mb-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150',
        active
          ? 'bg-blue-950 text-white shadow-sm shadow-blue-950/20'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950',
      )}
    >
      <span className={cn('shrink-0 transition-colors duration-150', active ? 'text-white' : 'text-slate-400 group-hover:text-blue-900')}>
        <NavIcon name={item.icon} />
      </span>
      {t(item.labelKey)}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="z-30 flex h-full w-64 flex-col border-r border-slate-200 bg-[var(--app-sidebar)] md:w-72">
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-950 text-white shadow-sm">
          <NavIcon name="box" />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-base font-bold tracking-tight text-blue-950">{t('app.name')}</p>
          <p className="truncate text-xs font-medium text-slate-500">{t('app.subtitle')}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-1 pb-4 scrollbar-none">
        <SectionLabel label={t('nav.overview')} />
        {overviewItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <SectionLabel label={t('nav.materialMaster')} />
        {matItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <SectionLabel label={t('nav.boqProjects')} />
        {boqItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-4">
        <LanguageSwitcher compact />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-blue-950">{t('app.versionPhase')}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{t('app.versionStatus')}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-red-600"
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
}
