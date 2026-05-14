import Link from 'next/link'
import { UnauthorizedActions } from '@/components/auth/UnauthorizedActions'
import { getOwnerEmail } from '@/lib/auth/owner-email'
import { createClient } from '@/lib/supabase/server'

export default async function UnauthorizedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const ownerEmail = getOwnerEmail()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-[var(--app-surface)] p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">Unauthorized</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          บัญชีนี้ไม่ใช่ owner ที่ตั้งไว้ในระบบ กรุณาเข้าสู่ระบบด้วยอีเมลเดียวกับค่า OWNER_EMAIL
        </p>
        <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-xs text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">Current session:</span>{' '}
            {user?.email ?? 'ยังไม่มี session'}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">OWNER_EMAIL:</span>{' '}
            {ownerEmail || 'ยังไม่ได้ตั้งค่า'}
          </p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <UnauthorizedActions />
          <Link href="/login" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-stone-50">
            กลับไป Login
          </Link>
        </div>
      </section>
    </main>
  )
}
