import { Header } from '@/components/layout/Header'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/owner'
import { getSystemQaGroups, type SystemQaGroup } from '@/lib/server/system-qa'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'warning' | 'error'

interface HealthCheck {
  name: string
  status: HealthStatus
  message: string
  detail?: string
  required?: boolean
}

const REQUIRED_TABLES = [
  'mat_master',
  'mat_category',
  'mat_uom',
  'supplier',
  'mat_alias',
  'mat_supplier_map',
  'mat_price_base',
  'mat_uom_conv',
  'boq_project',
  'boq_item',
  'customer',
  'boq_attachment',
  'boq_comment',
  'boq_template',
  'boq_template_item',
  'bom_template',
  'bom_item',
  'audit_logs',
  'mat_audit_log',
]

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

const OPTIONAL_ENV = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_BOT_API_BASE_URL',
  'ANTHROPIC_API_KEY',
]

function getEnvCheck(name: string, required: boolean): HealthCheck {
  const value = process.env[name]

  if (value && value.trim()) {
    return {
      name,
      status: 'ok',
      message: 'Configured',
      detail: `${value.length} chars`,
      required,
    }
  }

  return {
    name,
    status: required ? 'error' : 'warning',
    message: required ? 'Missing' : 'Optional',
    detail: required ? 'Required for app startup' : 'Required only when the feature is used',
    required,
  }
}

async function checkTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tableName: string,
): Promise<HealthCheck> {
  const { error, count } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })

  if (error) {
    return {
      name: tableName,
      status: 'error',
      message: 'Failed',
      detail: error.message,
      required: true,
    }
  }

  return {
    name: tableName,
    status: 'ok',
    message: 'Available',
    detail: typeof count === 'number' ? `${count} rows` : 'Table reachable',
    required: true,
  }
}

async function checkView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewName: string,
): Promise<HealthCheck> {
  const { error } = await supabase
    .from(viewName)
    .select('*', { count: 'exact', head: true })

  if (error) {
    return {
      name: viewName,
      status: 'error',
      message: 'Failed',
      detail: error.message,
      required: true,
    }
  }

  return {
    name: viewName,
    status: 'ok',
    message: 'Available',
    detail: 'View reachable',
    required: true,
  }
}

async function checkStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<HealthCheck> {
  const { error } = await supabase.storage
    .from('boq-attachments')
    .list('', { limit: 1 })

  if (error) {
    return {
      name: 'boq-attachments',
      status: 'error',
      message: 'Failed',
      detail: error.message,
      required: true,
    }
  }

  return {
    name: 'boq-attachments',
    status: 'ok',
    message: 'Available',
    detail: 'Storage bucket reachable',
    required: true,
  }
}

async function checkAuth(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<HealthCheck> {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    return {
      name: 'Current session',
      status: 'warning',
      message: 'No active user',
      detail: error.message,
    }
  }

  if (!data.user) {
    return {
      name: 'Current session',
      status: 'warning',
      message: 'No active user',
      detail: 'Sign in before testing protected app flows',
    }
  }

  return {
    name: 'Current session',
    status: 'ok',
    message: 'Signed in',
    detail: data.user.email ?? data.user.id,
  }
}

function statusColor(status: HealthStatus) {
  if (status === 'ok') return 'green'
  if (status === 'warning') return 'yellow'
  return 'red'
}

function statusLabel(status: HealthStatus) {
  if (status === 'ok') return 'OK'
  if (status === 'warning') return 'WARN'
  return 'FAIL'
}

function overallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === 'error' && check.required !== false)) {
    return 'error'
  }

  if (checks.some((check) => check.status !== 'ok')) {
    return 'warning'
  }

  return 'ok'
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{check.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">{check.detail ?? check.message}</p>
      </div>
      <Badge label={statusLabel(check.status)} color={statusColor(check.status)} />
    </div>
  )
}

function HealthPanel({ title, checks }: { title: string; checks: HealthCheck[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <Badge label={statusLabel(overallStatus(checks))} color={statusColor(overallStatus(checks))} />
      </div>
      <div>
        {checks.map((check) => (
          <CheckRow key={check.name} check={check} />
        ))}
      </div>
    </section>
  )
}

function SummaryCard({ label, value, status }: { label: string; value: number; status: HealthStatus }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between">
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        <Badge label={statusLabel(status)} color={statusColor(status)} />
      </div>
    </div>
  )
}

const EXPORT_LINKS = [
  { label: 'Materials CSV', href: '/api/materials/export' },
  { label: 'Suppliers CSV', href: '/api/export/suppliers' },
  { label: 'Price History CSV', href: '/api/export/price-history' },
  { label: 'BOM Templates CSV', href: '/api/export/bom-templates' },
  { label: 'BOM Items CSV', href: '/api/export/bom-items' },
  { label: 'BOQ Projects CSV', href: '/api/export/boq-projects' },
  { label: 'BOQ Items CSV', href: '/api/export/boq-items' },
  { label: 'All Master Data ZIP', href: '/api/export/all-master-data' },
]

function BackupExportPanel() {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Backup & Export</h2>
          <p className="mt-1 text-xs text-slate-500">
            Exports exclude soft-deleted records by default. Use these files for quick backup and spreadsheet review.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {EXPORT_LINKS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-center text-xs font-bold text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
          >
            {item.label}
          </a>
        ))}
      </div>
    </section>
  )
}

function DataQaPanel({ groups }: { groups: SystemQaGroup[] }) {
  const totalIssues = groups.reduce((sum, group) => sum + group.issues.length, 0)
  const hasError = groups.some((group) => group.issues.some((issue) => issue.severity === 'error'))

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Core Data QA</h2>
          <p className="mt-1 text-xs text-slate-500">
            Foundation checks before BOM Production Engine work.
          </p>
        </div>
        <Badge
          label={totalIssues === 0 ? 'OK' : `${totalIssues} issues`}
          color={totalIssues === 0 ? 'green' : hasError ? 'red' : 'yellow'}
        />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{group.description}</p>
              </div>
              <Badge
                label={String(group.issues.length)}
                color={group.issues.some((issue) => issue.severity === 'error') ? 'red' : group.issues.length > 0 ? 'yellow' : 'green'}
              />
            </div>

            {group.issues.length === 0 ? (
              <p className="mt-4 text-xs font-medium text-emerald-700">No issues found.</p>
            ) : (
              <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                {group.issues.map((issue) => {
                  const content = (
                    <>
                      <p className="truncate text-xs font-bold text-slate-800">{issue.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{issue.detail}</p>
                    </>
                  )

                  return issue.href ? (
                    <a
                      key={issue.key}
                      href={issue.href}
                      className="block rounded-md border border-white bg-white px-3 py-2 shadow-sm hover:border-cyan-200 hover:bg-cyan-50"
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={issue.key} className="rounded-md border border-white bg-white px-3 py-2 shadow-sm">
                      {content}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function SystemHealthPage() {
  await requireOwner()

  const envChecks = [
    ...REQUIRED_ENV.map((name) => getEnvCheck(name, true)),
    ...OPTIONAL_ENV.map((name) => getEnvCheck(name, false)),
  ]

  const requiredEnvOk = REQUIRED_ENV.every((name) => Boolean(process.env[name]?.trim()))

  let databaseChecks: HealthCheck[] = []
  let integrationChecks: HealthCheck[] = []
  let qaGroups: SystemQaGroup[] = []

  if (requiredEnvOk) {
    const supabase = await createClient()

    const [authCheck, storageCheck, viewCheck, ...tableChecks] = await Promise.all([
      checkAuth(supabase),
      checkStorage(supabase),
      checkView(supabase, 'v_mat_latest_price'),
      ...REQUIRED_TABLES.map((table) => checkTable(supabase, table)),
    ])

    qaGroups = await getSystemQaGroups(supabase)

    databaseChecks = [viewCheck, ...tableChecks]
    integrationChecks = [
      authCheck,
      storageCheck,
      {
        name: 'LINE webhook',
        status: process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'ok' : 'warning',
        message: process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'Configured' : 'Missing env',
        detail: '/api/line/webhook',
      },
      {
        name: 'AI price suggestion',
        status: process.env.ANTHROPIC_API_KEY ? 'ok' : 'warning',
        message: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Optional',
        detail: '/api/boq/[id]/ai-price',
      },
    ]
  } else {
    databaseChecks = [
      {
        name: 'Supabase checks',
        status: 'error',
        message: 'Skipped',
        detail: 'Set required Supabase env first',
        required: true,
      },
    ]
    integrationChecks = [
      {
        name: 'App integrations',
        status: 'warning',
        message: 'Skipped',
        detail: 'Waiting for Supabase env',
      },
    ]
  }

  const allChecks = [...envChecks, ...databaseChecks, ...integrationChecks]
  const okCount = allChecks.filter((check) => check.status === 'ok').length
  const warnCount = allChecks.filter((check) => check.status === 'warning').length
  const failCount = allChecks.filter((check) => check.status === 'error').length

  return (
    <div className="flex h-full flex-col">
      <Header title="System Health" subtitle="ตรวจ env, Supabase, storage และ integration ที่จำเป็น" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard label="Passed" value={okCount} status="ok" />
          <SummaryCard label="Warnings" value={warnCount} status="warning" />
          <SummaryCard label="Failed" value={failCount} status="error" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <HealthPanel title="Environment" checks={envChecks} />
          <HealthPanel title="Database" checks={databaseChecks} />
          <HealthPanel title="Integrations" checks={integrationChecks} />
        </div>

        <BackupExportPanel />

        <DataQaPanel groups={qaGroups} />

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Run Order</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-4">
            <div className="rounded-md bg-slate-50 p-3">1. Run setup_complete.sql</div>
            <div className="rounded-md bg-slate-50 p-3">2. Run seed.sql if needed</div>
            <div className="rounded-md bg-slate-50 p-3">3. Set .env.local</div>
            <div className="rounded-md bg-slate-50 p-3">4. Restart npm run dev</div>
          </div>
        </section>
      </div>
    </div>
  )
}
