'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import type { MatAlias, AliasType } from '@/types/mat'

interface AliasManagerProps {
  materialId: string
  aliases: MatAlias[]
}

const TYPE_LABELS: Record<AliasType, string> = {
  COMMON: 'ทั่วไป',
  BRAND:  'แบรนด์',
  ABBREV: 'ย่อ',
  LINE:   'LINE bot',
}

const TYPE_COLORS: Record<AliasType, 'gray' | 'blue' | 'orange' | 'green'> = {
  COMMON: 'gray',
  BRAND:  'blue',
  ABBREV: 'orange',
  LINE:   'green',
}

export function AliasManager({ materialId, aliases }: AliasManagerProps) {
  const [aliasRows, setAliasRows] = useState(aliases)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<MatAlias | null>(null)
  const [form, setForm] = useState({
    alias_name: '',
    alias_type: 'COMMON' as AliasType,
    lang: 'TH' as 'TH' | 'EN',
    note: '',
  })

  useEffect(() => {
    setAliasRows(aliases)
  }, [aliases])

  function openAdd() {
    setEditing(null)
    setForm({ alias_name: '', alias_type: 'COMMON', lang: 'TH', note: '' })
    setError(null)
    setMessage('')
    setOpen(true)
  }

  function openEdit(alias: MatAlias) {
    setEditing(alias)
    setForm({
      alias_name: alias.alias_name,
      alias_type: alias.alias_type,
      lang: alias.lang,
      note: alias.note ?? '',
    })
    setError(null)
    setMessage('')
    setOpen(true)
  }

  async function handleAdd() {
    if (!form.alias_name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(editing ? `/api/aliases/${editing.alias_id}` : '/api/aliases', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? form : { ...form, material_id: materialId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      const saved = json.data as MatAlias
      setAliasRows((current) => (
        editing
          ? current.map((alias) => alias.alias_id === saved.alias_id ? saved : alias)
          : [saved, ...current]
      ))
      setOpen(false)
      setEditing(null)
      setForm({ alias_name: '', alias_type: 'COMMON', lang: 'TH', note: '' })
      setMessage(editing ? 'Alias updated.' : 'Alias added.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(aliasId: string) {
    if (!confirm('ยืนยันลบ?')) return
    setDeleting(aliasId)
    setError(null)
    setMessage('')
    try {
      const res = await fetch(`/api/aliases/${aliasId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Delete failed')
        return
      }
      setAliasRows((current) => current.filter((alias) => alias.alias_id !== aliasId))
      setMessage('Alias deleted.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">ชื่อเรียกอื่น (Alias)</h3>
        <button
          onClick={openAdd}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
        >
          + เพิ่ม
        </button>
      </div>

      {(error || message) && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {aliasRows.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มี alias</p>
      ) : (
        <div className="space-y-2">
          {aliasRows.map((a) => (
            <div
              key={a.alias_id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge
                  label={TYPE_LABELS[a.alias_type]}
                  color={TYPE_COLORS[a.alias_type]}
                />
                <span className="text-sm text-gray-800">{a.alias_name}</span>
                <span className="text-xs text-gray-400">[{a.lang}]</span>
                {a.note && <span className="text-xs text-gray-400">{a.note}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(a)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  แก้
                </button>
                <button
                  onClick={() => handleDelete(a.alias_id)}
                  disabled={deleting === a.alias_id}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไข Alias' : 'เพิ่ม Alias'}>
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อเรียก *</label>
            <input
              type="text"
              value={form.alias_name}
              onChange={(e) => setForm((f) => ({ ...f, alias_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="เช่น เหล็กกล่อง 40x40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ประเภท</label>
              <select
                value={form.alias_type}
                onChange={(e) => setForm((f) => ({ ...f, alias_type: e.target.value as AliasType }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ภาษา</label>
              <select
                value={form.lang}
                onChange={(e) => setForm((f) => ({ ...f, lang: e.target.value as 'TH' | 'EN' }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="TH">ไทย</option>
                <option value="EN">English</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAdd}
              disabled={saving || !form.alias_name.trim()}
              className="btn-primary"
            >
              {saving ? 'กำลังบันทึก...' : editing ? 'บันทึก' : 'เพิ่ม'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
