'use client'

import { useEffect, useState } from 'react'
import type { BoqItemType } from '@/types/boq'

interface Props {
  projectId: string
  open:      boolean
  onClose:   () => void
  onImported: () => void
}

interface ParsedRow {
  ok:        boolean
  error?:    string
  item_type: BoqItemType
  item_name: string
  spec:      string
  uom:       string
  qty:       number
  waste_pct: number
  unit_price: number
  note:      string
}

// ── Helpers ──────────────────────────────────────────────────────

function toNum(v: string): number {
  if (!v) return 0
  const n = parseFloat(v.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function normalizeType(v: string): BoqItemType {
  const u = v.trim().toUpperCase()
  if (['MAT', 'วัสดุ', 'M'].includes(u)) return 'MAT'
  if (['LABOR', 'แรงงาน', 'L'].includes(u)) return 'LABOR'
  if (['SERVICE', 'บริการ', 'S'].includes(u)) return 'SERVICE'
  if (['MISC', 'อื่นๆ', 'อื่น', 'OTHER'].includes(u)) return 'MISC'
  if (['SECTION', 'หัวข้อ', 'กลุ่ม', 'GROUP'].includes(u)) return 'SECTION'
  return 'MAT'
}

// Parse tab / comma / semi-colon separated text pasted from Excel
function parseTsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  // Detect delimiter: tab (Excel default) > comma > semicolon
  const sample = lines[0]
  const delim  = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ','

  // Detect if first line is header (contains Thai/English header keywords)
  const headerKeywords = ['ประเภท', 'ชื่อ', 'รายการ', 'หน่วย', 'จำนวน', 'ราคา', 'waste', 'type', 'name', 'uom', 'qty', 'price']
  const firstLower = sample.toLowerCase()
  const hasHeader  = headerKeywords.some((k) => firstLower.includes(k.toLowerCase()))

  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const cols = line.split(delim).map((c) => c.trim())
    // Expected columns: type | name | spec | uom | qty | waste_pct | unit_price | note
    // Minimum: name | uom | qty | unit_price
    let [c0, c1, c2, c3, c4, c5, c6, c7] = cols

    // If first col is not a type keyword → assume no type column, default MAT
    const firstIsType = /^(MAT|LABOR|SERVICE|MISC|SECTION|วัสดุ|แรงงาน|บริการ|อื่น|หัวข้อ|กลุ่ม|M|L|S)$/i.test(c0 ?? '')
    let item_type: BoqItemType = 'MAT'
    let name = ''
    let spec = ''
    let uom  = ''
    let qty  = 0
    let waste_pct = 0
    let unit_price = 0
    let note = ''

    if (firstIsType) {
      item_type  = normalizeType(c0)
      name       = c1 ?? ''
      spec       = c2 ?? ''
      uom        = c3 ?? ''
      qty        = toNum(c4 ?? '')
      waste_pct  = toNum(c5 ?? '')
      unit_price = toNum(c6 ?? '')
      note       = c7 ?? ''
    } else {
      // name | uom | qty | unit_price | waste_pct | note | spec
      name       = c0 ?? ''
      uom        = c1 ?? ''
      qty        = toNum(c2 ?? '')
      unit_price = toNum(c3 ?? '')
      waste_pct  = toNum(c4 ?? '')
      note       = c5 ?? ''
      spec       = c6 ?? ''
    }

    let error: string | undefined
    if (!name) error = 'ไม่มีชื่อรายการ'
    else if (item_type !== 'SECTION' && !uom) error = 'ไม่มีหน่วย'

    return {
      ok: !error,
      error,
      item_type,
      item_name: name,
      spec,
      uom,
      qty,
      waste_pct,
      unit_price,
      note,
    }
  })
}

// ── Component ────────────────────────────────────────────────────

export function ExcelImportModal({ projectId, open, onClose, onImported }: Props) {
  const [raw,     setRaw]     = useState('')
  const [rows,    setRows]    = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [step,    setStep]    = useState<'paste' | 'preview'>('paste')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleKey)
      // Reset on open
      setRaw('')
      setRows([])
      setStep('paste')
      setError('')
    }
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  function handlePreview() {
    const parsed = parseTsv(raw)
    if (parsed.length === 0) {
      setError('ไม่พบข้อมูล')
      return
    }
    setRows(parsed)
    setStep('preview')
    setError('')
  }

  async function handleImport() {
    const validItems = rows.filter((r) => r.ok).map((r) => ({
      item_type:  r.item_type,
      item_name:  r.item_name,
      spec:       r.spec || undefined,
      uom:        r.uom,
      qty:        r.qty,
      waste_pct:  r.waste_pct,
      unit_price: r.unit_price,
      note:       r.note || undefined,
    }))
    if (validItems.length === 0) {
      setError('ไม่มีรายการที่ถูกต้อง')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/boq/${projectId}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      onImported()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const validCount = rows.filter((r) => r.ok).length
  const errorCount = rows.length - validCount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            📋 นำเข้าจาก Excel {step === 'preview' && `— ${rows.length} รายการ`}
          </h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 'paste' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                <p className="font-semibold mb-1">💡 วิธีใช้งาน</p>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li>คัดลอกข้อมูลจาก Excel (เลือก cell แล้ว Ctrl+C)</li>
                  <li>วางลงในช่องด้านล่าง (Ctrl+V)</li>
                  <li>รองรับคอลัมน์: <span className="font-mono">ประเภท | ชื่อ | สเปก | หน่วย | จำนวน | waste% | ราคา | หมายเหตุ</span></li>
                  <li>หรือรูปแบบสั้น: <span className="font-mono">ชื่อ | หน่วย | จำนวน | ราคา</span></li>
                  <li>ประเภท: <span className="font-mono">MAT / LABOR / SERVICE / MISC / SECTION</span> (หรือภาษาไทย)</li>
                  <li>บรรทัดแรกเป็น header ก็ได้ (จะถูกข้าม)</li>
                </ol>
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="วางข้อมูลจาก Excel ที่นี่ (Ctrl+V)"
                rows={14}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                  ✓ ถูกต้อง {validCount}
                </span>
                {errorCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">
                    ✗ มีปัญหา {errorCount}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 w-8">#</th>
                      <th className="px-2 py-1.5">ประเภท</th>
                      <th className="px-2 py-1.5">ชื่อรายการ</th>
                      <th className="px-2 py-1.5">หน่วย</th>
                      <th className="px-2 py-1.5 text-right">จำนวน</th>
                      <th className="px-2 py-1.5 text-right">Waste%</th>
                      <th className="px-2 py-1.5 text-right">ราคา</th>
                      <th className="px-2 py-1.5 text-right">รวม</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => {
                      const total = r.item_type === 'SECTION' ? 0 : r.qty * (1 + r.waste_pct / 100) * r.unit_price
                      return (
                        <tr key={i} className={r.ok ? '' : 'bg-red-50'}>
                          <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-2 py-1.5 font-mono">{r.item_type}</td>
                          <td className="px-2 py-1.5 font-medium">
                            {r.item_name || <span className="text-red-500">—</span>}
                            {r.spec && <p className="text-[10px] text-gray-400">{r.spec}</p>}
                          </td>
                          <td className="px-2 py-1.5">{r.uom || '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.qty.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.waste_pct}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.unit_price.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-semibold">
                            {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.ok
                              ? <span className="text-emerald-600">✓</span>
                              : <span className="text-red-500 text-[10px]" title={r.error}>{r.error}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
          <div className="text-xs text-gray-500">
            {step === 'preview' && `จะนำเข้า ${validCount} รายการ`}
          </div>
          <div className="flex gap-2">
            {step === 'preview' && (
              <button
                onClick={() => setStep('paste')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                ← ย้อนกลับ
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            {step === 'paste' ? (
              <button
                onClick={handlePreview}
                disabled={!raw.trim()}
                className="btn-primary"
              >
                ดูตัวอย่าง →
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={loading || validCount === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? 'กำลังนำเข้า...' : `นำเข้า ${validCount} รายการ`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
