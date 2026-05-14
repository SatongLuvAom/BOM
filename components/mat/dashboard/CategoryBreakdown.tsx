interface CategoryRow {
  cat_id: string
  cat_code: string
  cat_name_th: string
  count: number
}

interface Props {
  data: CategoryRow[]
  total: number
}

export function CategoryBreakdown({ data, total }: Props) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="font-semibold text-gray-900">วัสดุตามหมวดหมู่</h3>
      </div>

      <div className="space-y-3 p-5">
        {data.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</p>
        )}
        {data.map((row) => {
          const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
          const barPct = Math.round((row.count / maxCount) * 100)
          return (
            <div key={row.cat_id}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 font-mono text-xs text-gray-500">{row.cat_code}</span>
                  <span className="truncate text-sm text-gray-700">{row.cat_name_th}</span>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900">{row.count}</span>
                  <span className="text-xs text-gray-400">({pct}%)</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
