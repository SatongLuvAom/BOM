import { Header } from '@/components/layout/Header'

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200 ${className}`} />
}

export default function MaterialsLoading() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Material Master" subtitle="Loading material data..." />
      <main className="flex-1 overflow-hidden px-6 py-6">
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <SkeletonLine className="h-10 max-w-xl" />
          </div>
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-4 gap-3">
              <SkeletonLine className="h-9" />
              <SkeletonLine className="h-9" />
              <SkeletonLine className="h-9" />
              <SkeletonLine className="h-9" />
            </div>
            <div className="overflow-hidden rounded-lg border border-stone-100">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr] gap-4 border-b border-stone-100 p-4 last:border-b-0">
                  <SkeletonLine className="h-4" />
                  <SkeletonLine className="h-4" />
                  <SkeletonLine className="h-4" />
                  <SkeletonLine className="h-4" />
                  <SkeletonLine className="h-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
