import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { formatThaiDateShort, statusLabel } from '@/lib/utils'
import type { MatMaster } from '@/types/mat'
import styles from './dashboard.module.css'

export function RecentMaterials({ materials }: { materials: MatMaster[] }) {
  return (
    <section className={styles.panel} aria-labelledby="recent-materials-title">
      <div className={styles.panelHeader}>
        <h2 id="recent-materials-title" className={styles.panelTitle}>อัปเดตล่าสุด</h2>
        <Link href="/materials" className={styles.textLink}>
          ดูทั้งหมด →
        </Link>
      </div>

      <div>
        {materials.length === 0 && (
          <p className={styles.empty}>ยังไม่มีข้อมูล</p>
        )}
        {materials.map((m) => {
          const { label, color } = statusLabel(m.status)
          return (
            <div key={m.material_id} className={styles.row}>
              <div className={styles.rowMain}>
                <Link
                  href={`/materials/${m.material_id}`}
                  className={styles.itemLink}
                >
                  {m.mat_name_th}
                </Link>
                <p className={`${styles.meta} font-mono`}>{m.material_id}</p>
              </div>
              <Badge label={label} color={color as 'green' | 'gray' | 'red'} />
              <span className={styles.date}>
                {formatThaiDateShort(m.updated_at)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
