import { Sidebar } from '@/components/layout/Sidebar'
import { AiHelper } from '@/components/layout/AiHelper'
import { PageHelpCard } from '@/components/layout/PageHelpCard'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocaleFromCookie } from '@/lib/i18n/getDictionary'

export default async function MatLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocaleFromCookie()

  return (
    <I18nProvider initialLocale={locale}>
      <div data-i18n-root className="relative h-screen w-screen overflow-hidden bg-[var(--app-bg)] print:block print:h-auto print:w-auto print:overflow-visible print:bg-white">
        <div className="relative z-10 flex h-full w-full overflow-hidden bg-transparent print:block print:h-auto print:overflow-visible print:bg-white">
          <div className="print:hidden">
            <Sidebar />
          </div>
          <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--app-shell)] print:overflow-visible">
            <PageHelpCard />
            {children}
          </main>
        </div>
        <AiHelper />
      </div>
    </I18nProvider>
  )
}
