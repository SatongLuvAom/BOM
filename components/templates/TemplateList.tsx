'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatThaiDateShort } from '@/lib/utils'

interface Template {
  template_id:   string
  template_name: string
  description:   string | null
  category:      string | null
  created_at:    string
  items:         { item_id: string }[]
}

interface ApplyForm {
  project_name: string
  client_name:  string
}

export function TemplateList({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [applying,    setApplying]    = useState<string | null>(null)
  const [applyForm,   setApplyForm]   = useState<ApplyForm>({ project_name: '', client_name: '' })
  const [selectedTpl, setSelectedTpl] = useState<Template | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  function openApply(t: Template) {
    setSelectedTpl(t)
    setApplyForm({ project_name: t.template_name, client_name: '' })
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTpl) return
    setApplying(selectedTpl.template_id)
    try {
      const res  = await fetch(`/api/templates/${selectedTpl.template_id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: applyForm.project_name.trim() || selectedTpl.template_name,
          client_name:  applyForm.client_name.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      setSelectedTpl(null)
      router.push(`/boq/${json.data.project_id}`)
    } finally {
      setApplying(null)
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`ลบ Template "${t.template_name}" ?`)) return
    setDeleting(t.template_id)
    try {
      const res = await fetch(`/api/templates/${t.template_id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error ?? 'Delete failed')
        return
      }
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  const field = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'

  return (
    <div className="p-6">
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-400 text-sm">ยังไม่มี Template</p>
          <p className="text-gray-400 text-xs mt-1">
            เปิด BOQ project แล้วกด &quot;บันทึกเป็น Template&quot; เพื่อสร้าง
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.template_id} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.template_name}</h3>
                  {t.category && (
                    <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      {t.category}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400 font-mono">{t.template_id}</span>
              </div>
              {t.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{t.items?.length ?? 0} รายการ</span>
                <span>{formatThaiDateShort(t.created_at)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => openApply(t)}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  ใช้ Template นี้
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  disabled={deleting === t.template_id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                >
                  {deleting === t.template_id ? '...' : 'ลบ'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply modal */}
      {selectedTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedTpl(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              สร้าง BOQ จาก Template
            </h3>
            <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg p-2">
              Template: <span className="font-medium text-gray-700">{selectedTpl.template_name}</span>
              {' '}({selectedTpl.items?.length ?? 0} รายการ)
            </p>
            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อโปรเจกต์ <span className="text-red-500">*</span>
                </label>
                <input
                  value={applyForm.project_name}
                  onChange={(e) => setApplyForm((f) => ({ ...f, project_name: e.target.value }))}
                  required
                  className={field}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อลูกค้า</label>
                <input
                  value={applyForm.client_name}
                  onChange={(e) => setApplyForm((f) => ({ ...f, client_name: e.target.value }))}
                  placeholder="ระบุลูกค้า (ถ้ามี)"
                  className={field}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={applying === selectedTpl.template_id}
                  className="btn-primary"
                >
                  {applying ? 'กำลังสร้าง...' : 'สร้าง BOQ'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTpl(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
