'use client'

import { useState, useEffect } from 'react'

interface MaterialOption {
  id?: string
  material_id: string
  material_code?: string | null
  mat_name_th: string
  base_uom:    string
  brand:       string | null
  category:    { cat_code: string; cat_name_th: string } | null
}

interface LatestPrice {
  unit_price:    number
  currency_code: string
  price_uom:     string
  price_uom_name_th?: string | null
  uom:           { uom_code: string; uom_name_th: string } | null
}

export interface PickedMaterial {
  material_id:   string
  item_name:     string
  uom:           string
  unit_price:    number
  currency_code: string
}

interface Props {
  onPick: (m: PickedMaterial) => void
}

export function MaterialPicker({ onPick }: Props) {
  const [options,  setOptions]  = useState<MaterialOption[]>([])
  const [loading,  setLoading]  = useState(false)
  const [fetching, setFetching] = useState(false) // fetching price
  const [value,    setValue]    = useState('')

  // Load materials once on mount
  useEffect(() => {
    setLoading(true)
    fetch('/api/materials?status=ACTIVE&limit=500&sort_by=mat_name_th&sort_dir=asc')
      .then((r) => r.json())
      .then((j) => setOptions(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setValue(id)
    if (!id) return

    const mat = options.find((m) => m.material_id === id)
    if (!mat) return

    setFetching(true)
    let unit_price    = 0
    let currency_code = 'THB'
    let uom           = mat.base_uom

    try {
      const res  = await fetch(`/api/materials/${id}/latest-price`)
      const json = await res.json()
      if (json.data) {
        const p: LatestPrice = json.data
        unit_price    = p.unit_price
        currency_code = p.currency_code
        uom           = p.uom?.uom_name_th ?? p.price_uom_name_th ?? p.price_uom ?? mat.base_uom
      }
    } catch {}
    finally {
      setFetching(false)
    }

    onPick({ material_id: id, item_name: mat.mat_name_th, uom, unit_price, currency_code })
  }

  // Group by category
  const grouped = options.reduce<Record<string, MaterialOption[]>>((acc, m) => {
    const key = m.category ? `${m.category.cat_code} — ${m.category.cat_name_th}` : 'ไม่มีหมวดหมู่'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <div className="relative">
      <select
        value={value}
        onChange={handleChange}
        disabled={loading}
        className="block w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      >
        <option value="">{loading ? 'กำลังโหลดวัสดุ...' : '— เลือกวัสดุ —'}</option>
        {Object.entries(grouped).map(([group, mats]) => (
          <optgroup key={group} label={group}>
            {mats.map((m) => (
              <option key={m.material_id} value={m.material_id}>
                {m.material_code ?? m.material_id} · {m.mat_name_th}{m.brand ? ` (${m.brand})` : ''} · {m.base_uom}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {fetching && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      )}
    </div>
  )
}
