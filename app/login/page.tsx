'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

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
    <main className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.showcase}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <path d="m3.5 7 8.5 5 8.5-5M12 12v10" />
              </svg>
            </span>
            <span>BOQ System</span>
          </div>
          <div className={styles.materials} aria-hidden="true">
            <div className={`${styles.sheet} ${styles.sheetBase}`} />
            <div className={`${styles.sheet} ${styles.sheetMiddle}`} />
            <div className={`${styles.sheet} ${styles.sheetTop}`} />
          </div>
          <p className={styles.caption}>
            <span className={styles.captionTitle}>Material Master.</span>
            วัสดุ · หน่วยนับ · ราคาฐาน
          </p>
        </div>

        <section className={styles.formPanel} aria-labelledby="login-title">
          <p className={styles.eyebrow}>BOQ System</p>
          <h1 id="login-title" className={styles.title}>เข้าสู่ระบบ</h1>
          <p className={styles.subtitle}>เข้าสู่ระบบเพื่อใช้งาน</p>
          <form onSubmit={handleLogin} className={styles.form} aria-busy={loading}>
            <div>
              <label htmlFor="email" className={styles.label}>อีเมล</label>
              <input
                id="email"
                name="email"
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className={styles.input}
              />
            </div>
            <div>
              <label htmlFor="password" className={styles.label}>รหัสผ่าน</label>
              <input
                id="password"
                name="password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={styles.input}
              />
            </div>

            {error && (
              <p role="alert" className={styles.error}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={styles.submit}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
