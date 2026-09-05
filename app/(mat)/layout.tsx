import { Sidebar } from '@/components/layout/Sidebar'
import { AiHelper } from '@/components/layout/AiHelper'
import { PageHelpCard } from '@/components/layout/PageHelpCard'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocaleFromCookie } from '@/lib/i18n/getDictionary'

export default async function MatLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocaleFromCookie()

  return (
    <I18nProvider key={locale} initialLocale={locale}>
      <div data-i18n-root className="app-shell">
        <a href="#app-content" className="app-skip-link print:hidden" data-i18n-managed>{locale === 'th' ? 'ข้ามไปเนื้อหา' : 'Skip to content'}</a>
        <Sidebar />
        <main id="app-content" tabIndex={-1} className="app-main">
          {children}
          <PageHelpCard />
        </main>
        <AiHelper />
      </div>
    </I18nProvider>
  )
}
