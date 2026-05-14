'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  function getLoginErrorMessage(message?: string) {
    const normalized = (message ?? '').toLowerCase()

    if (normalized.includes('email not confirmed')) {
      return 'บัญชียังไม่ได้ Confirm email: ไปที่ Supabase > Authentication > Users แล้วกด Confirm user หรือสร้างใหม่พร้อม Auto Confirm'
    }

    if (normalized.includes('invalid login credentials')) {
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    }

    return message ? `เข้าสู่ระบบไม่สำเร็จ: ${message}` : 'เข้าสู่ระบบไม่สำเร็จ'
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(getLoginErrorMessage(error.message))
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.22)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-950">BOQ System</h1>
          <p className="mt-1 text-sm text-gray-500">เข้าสู่ระบบเพื่อใช้งาน</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 rounded-2xl border border-stone-200 bg-[var(--app-surface)] p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 placeholder:text-slate-300 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-950/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 placeholder:text-slate-300 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-950/10"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
