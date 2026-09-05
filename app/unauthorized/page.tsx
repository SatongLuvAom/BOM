import Link from 'next/link'
import { UnauthorizedActions } from '@/components/auth/UnauthorizedActions'
import { createClient } from '@/lib/supabase/server'
import styles from './unauthorized.module.css'

export default async function UnauthorizedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="unauthorized-title">
        <p className={styles.brand}>BOQ System</p>
        <div className={styles.icon}>
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10" width="14" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
        </div>
        <h1 id="unauthorized-title" className={styles.title}>Unauthorized</h1>
        <p className={styles.description}>
          บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งานส่วนนี้ หรือ session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง
          หากยังเข้าไม่ได้ให้ติดต่อผู้ดูแลระบบ
        </p>
        <div className={styles.session}>
          <p>
            <span className={styles.sessionLabel}>Current session:</span>{' '}
            {user?.email ?? 'ยังไม่มี session'}
          </p>
        </div>
        <div className={styles.actions}>
          <UnauthorizedActions />
          <Link href="/login" className={styles.back}>
            กลับไป Login
          </Link>
        </div>
      </section>
    </main>
  )
}
