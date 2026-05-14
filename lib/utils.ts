// Client-safe utilities — ไม่มี server import
// ใช้ได้ทั้ง Server และ Client Components

// ── Class name helper ─────────────────────────────────────────
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ── Status label ──────────────────────────────────────────────
export function statusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    ACTIVE:       { label: 'ใช้งาน', color: 'green' },
    INACTIVE:     { label: 'ปิดใช้', color: 'gray' },
    DISCONTINUED: { label: 'ยกเลิก', color: 'red' },
  }
  return map[status] ?? { label: status, color: 'gray' }
}

// ── Pagination ────────────────────────────────────────────────
export function getPaginationRange(page: number, limit: number) {
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { from, to }
}

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export function formatThaiDateShort(value: string | Date | null | undefined): string {
  if (!value) return '-'

  const raw = value instanceof Date ? value.toISOString() : value
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return '-'

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '-'

  const buddhistYear = year + 543
  return `${day.toString().padStart(2, '0')} ${THAI_SHORT_MONTHS[month - 1]} ${String(buddhistYear).slice(-2)}`
}
