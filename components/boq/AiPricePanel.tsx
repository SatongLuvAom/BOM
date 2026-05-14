'use client'

import { useState } from 'react'
import type { AiPriceSuggestion } from '@/types/boq'

interface Props {
  projectId:   string
  onApplied:   () => void
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   'bg-emerald-100 text-emerald-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-red-100 text-red-700',
}
const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ',
}

export function AiPricePanel({ projectId, onApplied }: Props) {
  const [suggestions, setSuggestions] = useState<AiPriceSuggestion[]>([])
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(false)
  const [applying,    setApplying]    = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)

  async function fetchSuggestions() {
    setLoading(true)
    setError('')
    setSuggestions([])
    setDone(false)
    try {
      const res  = await fetch(`/api/boq/${projectId}/ai-price`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      const data: AiPriceSuggestion[] = json.data ?? []
      setSuggestions(data)
      // Pre-select items where suggested ≠ current
      const diff = new Set(data.filter((s) => s.suggested_price !== s.current_price).map((s) => s.item_id))
      setSelected(diff)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applySelected() {
    const toUpdate = suggestions.filter((s) => selected.has(s.item_id))
    if (toUpdate.length === 0) return

    const names = toUpdate.map((s) => `• ${s.item_name}: ${s.current_price.toLocaleString()} → ${s.suggested_price.toLocaleString()}`).join('\n')
    if (!confirm(`อัพเดทราคา ${toUpdate.length} รายการ?\n\n${names}`)) return

    setApplying(true)
    try {
      await Promise.all(
        toUpdate.map((s) =>
          fetch(`/api/boq/${projectId}/items/${s.item_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              unit_price: s.suggested_price,
              final_unit_price: s.suggested_price,
              price_source: 'AI',
            }),
          }),
        ),
      )
      setDone(true)
      onApplied()
    } finally {
      setApplying(false)
    }
  }

  // Initial state — show button only
  if (suggestions.length === 0 && !loading) {
    return (
      <div>
        <button
          onClick={fetchSuggestions}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
        >
          🤖 แนะนำราคา AI
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-purple-600">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        AI กำลังวิเคราะห์ราคา...
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        ✓ อัพเดทราคาเรียบร้อย
        <button onClick={() => { setSuggestions([]); setDone(false) }} className="text-xs text-gray-400 hover:text-gray-600 underline">
          วิเคราะห์ใหม่
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50">
      <div className="flex items-center justify-between border-b border-purple-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-purple-800">🤖 ผลการวิเคราะห์ราคา AI</span>
          <span className="text-xs text-purple-500">({suggestions.length} รายการ)</span>
        </div>
        <button
          onClick={() => setSuggestions([])}
          className="text-xs text-purple-400 hover:text-purple-700"
        >
          ✕ ปิด
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-purple-200 text-left">
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={selected.size === suggestions.length}
                  onChange={() => {
                    if (selected.size === suggestions.length) setSelected(new Set())
                    else setSelected(new Set(suggestions.map((s) => s.item_id)))
                  }}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-2 font-medium text-purple-700">รายการ</th>
              <th className="px-3 py-2 text-right font-medium text-purple-700">ราคาปัจจุบัน</th>
              <th className="px-3 py-2 text-right font-medium text-purple-700">ราคาแนะนำ</th>
              <th className="px-3 py-2 text-right font-medium text-purple-700">เปลี่ยนแปลง</th>
              <th className="px-3 py-2 font-medium text-purple-700">ความแน่นอน</th>
              <th className="px-3 py-2 font-medium text-purple-700">เหตุผล</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-100">
            {suggestions.map((s) => {
              const diff    = s.suggested_price - s.current_price
              const diffPct = s.current_price > 0 ? ((diff / s.current_price) * 100).toFixed(1) : null
              const isUp    = diff > 0
              const isDown  = diff < 0
              return (
                <tr
                  key={s.item_id}
                  className={`hover:bg-purple-100/50 transition-colors ${selected.has(s.item_id) ? 'bg-purple-100/40' : ''}`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(s.item_id)}
                      onChange={() => toggleSelect(s.item_id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[160px]">
                    <p className="truncate">{s.item_name}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                    {s.current_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">
                    {s.suggested_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {diff === 0 ? (
                      <span className="text-gray-400 text-xs">—</span>
                    ) : (
                      <span className={`text-xs font-medium ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isUp ? '▲' : '▼'} {diffPct}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLE[s.confidence]}`}>
                      {CONFIDENCE_LABEL[s.confidence]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px]">
                    <p className="truncate" title={s.reasoning}>{s.reasoning}</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-purple-200">
        <p className="text-xs text-purple-500">เลือก {selected.size} จาก {suggestions.length} รายการ</p>
        <div className="flex gap-2">
          <button
            onClick={fetchSuggestions}
            className="rounded-lg border border-purple-300 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-100"
          >
            วิเคราะห์ใหม่
          </button>
          <button
            onClick={applySelected}
            disabled={selected.size === 0 || applying}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {applying ? 'กำลังอัพเดท...' : `อัพเดทราคา (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
