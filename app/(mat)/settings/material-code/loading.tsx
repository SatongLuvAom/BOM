import { Header } from '@/components/layout/Header'

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200 ${className}`} />
}

export default function MaterialCodeSettingsLoading() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Material Code Settings" subtitle="Loading prefixes, types, and sequence groups..." />
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, section) => (
            <section key={section} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <SkeletonLine className="h-5 w-56" />
              <SkeletonLine className="mt-3 h-4 w-80" />
              <div className="mt-5 space-y-3">
                {Array.from({ length: 5 }).map((__, row) => (
                  <SkeletonLine key={row} className="h-10 w-full" />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
