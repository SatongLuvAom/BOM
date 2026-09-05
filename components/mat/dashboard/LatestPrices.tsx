import Link from 'next/link'
import { formatThaiDateShort } from '@/lib/utils'
import type { MatPriceBase } from '@/types/mat'
import styles from './dashboard.module.css'

export function LatestPrices({ prices }: { prices: MatPriceBase[] }) {
  return (
    <section className={styles.panel} aria-labelledby="latest-prices-title">
      <div className={styles.panelHeader}>
        <h2 id="latest-prices-title" className={styles.panelTitle}>ราคาวัสดุล่าสุด</h2>
        <Link href="/materials" className={styles.textLink}>
          ดูวัสดุทั้งหมด →
        </Link>
      </div>

      <div>
        {prices.length === 0 && (
          <p className={styles.empty}>ยังไม่มีข้อมูลราคา</p>
        )}
        {prices.map((p) => (
          <div
            key={`${p.material_id}-${p.supplier_id}-${p.effective_date}`}
            className={styles.row}
          >
            <div className={styles.rowMain}>
              <Link href={`/materials/${p.material_id}`} className={styles.itemLink}>
                {p.material?.mat_name_th ?? p.material_id}
              </Link>
              <p className={styles.meta}>{p.supplier?.supplier_name_th ?? p.supplier_id}</p>
            </div>
            <div className={styles.price}>
              <p>
                {Number(p.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
              <p className={styles.meta}>
                {p.currency_code}/{p.uom?.uom_name_th ?? p.price_uom}
              </p>
            </div>
            <div className={styles.date}>
              {formatThaiDateShort(p.effective_date)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
