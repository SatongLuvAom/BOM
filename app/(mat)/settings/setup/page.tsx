import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Badge } from '@/components/ui/Badge'

export const dynamic = 'force-dynamic'

type StepStatus = 'done' | 'action' | 'optional'

interface SetupStep {
  title: string
  description: string
  command?: string
  href?: string
  status: StepStatus
}

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

const lineEnv = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
]

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim())
}

function statusColor(status: StepStatus) {
  if (status === 'done') return 'green'
  if (status === 'optional') return 'yellow'
  return 'blue'
}

function statusLabel(status: StepStatus) {
  if (status === 'done') return 'DONE'
  if (status === 'optional') return 'OPTIONAL'
  return 'ACTION'
}

function StepCard({ step, index }: { step: SetupStep; index: number }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-bold text-slate-700">
            {index + 1}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{step.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
          </div>
        </div>
        <Badge label={statusLabel(step.status)} color={statusColor(step.status)} />
      </div>

      {step.command && (
        <pre className="mt-4 overflow-x-auto rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-100">
          <code>{step.command}</code>
        </pre>
      )}

      {step.href && (
        <Link
          href={step.href}
          className="mt-4 inline-flex rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open
        </Link>
      )}
    </article>
  )
}

export default function SetupChecklistPage() {
  const supabaseEnvReady = requiredEnv.every(hasEnv)
  const lineReady = lineEnv.every(hasEnv)

  const steps: SetupStep[] = [
    {
      title: 'Install dependencies',
      description: 'Run this once after cloning or moving the project.',
      command: 'cd D:\\Program\\BOQ\nnpm install',
      status: 'action',
    },
    {
      title: 'Create .env.local',
      description: supabaseEnvReady
        ? 'Required Supabase env is available in the current runtime.'
        : 'Create .env.local from .env.local.example and set the Supabase URL plus publishable key.',
      command: 'NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx',
      status: supabaseEnvReady ? 'done' : 'action',
    },
    {
      title: 'Run database setup',
      description: 'Run the source-of-truth SQL file in Supabase SQL Editor.',
      command: 'D:\\Program\\BOQ\\supabase\\setup_complete.sql',
      status: 'action',
    },
    {
      title: 'Seed sample data',
      description: 'Run this only when you want sample materials, suppliers, and prices.',
      command: 'D:\\Program\\BOQ\\supabase\\seed.sql',
      status: 'optional',
    },
    {
      title: 'Create login user',
      description: 'Create at least one Supabase Auth user, then sign in through the app login page.',
      command: 'Supabase Dashboard > Authentication > Users > Add user',
      status: 'action',
    },
    {
      title: 'Check system health',
      description: 'Use this page after env and SQL setup to confirm tables, view, and integrations.',
      href: '/settings/system',
      status: supabaseEnvReady ? 'done' : 'action',
    },
    {
      title: 'Run local server',
      description: 'Start the Next.js dev server and open the app locally.',
      command: 'cd D:\\Program\\BOQ\nnpm run dev',
      status: 'action',
    },
    {
      title: 'Configure LINE bot',
      description: lineReady
        ? 'LINE env is available in the current runtime.'
        : 'Set LINE channel secret and access token, then configure webhook URL in LINE Developers.',
      command: 'https://your-domain.com/api/line/webhook',
      status: lineReady ? 'done' : 'optional',
    },
    {
      title: 'Deploy to Vercel',
      description: 'Add the same env values in Vercel Project Settings before deploying.',
      command: 'Vercel > Project Settings > Environment Variables',
      status: 'action',
    },
  ]

  const doneCount = steps.filter((step) => step.status === 'done').length
  const actionCount = steps.filter((step) => step.status === 'action').length
  const optionalCount = steps.filter((step) => step.status === 'optional').length

  return (
    <div className="flex h-full flex-col">
      <Header title="Setup Checklist" subtitle="ลำดับงานสำหรับติดตั้ง local, Supabase, LINE และ deploy" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Done</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{doneCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Required</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{actionCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{optionalCount}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {steps.map((step, index) => (
            <StepCard key={step.title} step={step} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
