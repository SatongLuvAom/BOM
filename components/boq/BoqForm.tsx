'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { BoqProject } from '@/types/boq'
import type { Customer } from '@/types/customer'

interface Props {
  project?: BoqProject
}

export function BoqForm({ project }: Props) {
  const router  = useRouter()
  const isEdit  = !!project

  const [customers, setCustomers] = useState<Customer[]>([])

  const [form, setForm] = useState({
    project_name: project?.project_name ?? '',
    customer_id:  project?.customer_id  ?? '',
    client_name:  project?.client_name  ?? '',
    site_address: project?.site_address ?? '',
    project_date: project?.project_date ? project.project_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    status:       project?.status ?? 'DRAFT',
    note:         project?.note ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Load customer list
  useEffect(() => {
    fetch('/api/customers?limit=500')
      .then((r) => r.json())
      .then((j) => setCustomers(j.data ?? []))
      .catch(() => {})
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleCustomer(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    const c  = customers.find((x) => x.customer_id === id)
    setForm((f) => ({
      ...f,
      customer_id: id,
      client_name: c?.customer_name ?? f.client_name,
      site_address: c?.address ?? f.site_address,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      project_name: form.project_name.trim(),
      customer_id:  form.customer_id   || null,
      client_name:  form.client_name.trim()  || undefined,
      site_address: form.site_address.trim() || undefined,
      project_date: form.project_date,
      status:       form.status,
      note:         form.note.trim() || undefined,
    }

    try {
      const url    = isEdit ? `/api/boq/${project!.project_id}` : '/api/boq'
      const method = isEdit ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      router.push(`/boq/${isEdit ? project!.project_id : json.data.project_id}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const field = 'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'
  const label = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className={label}>ชื่อโปรเจกต์ <span className="text-red-500">*</span></label>
        <input name="project_name" value={form.project_name} onChange={handleChange} required className={field} placeholder="เช่น บูธงาน Thailand Lab 2025" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>ลูกค้า</label>
          <select name="customer_id" value={form.customer_id} onChange={handleCustomer} className={field}>
            <option value="">— ไม่ระบุ (กรอกเอง) —</option>
            {customers.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            ยังไม่มี? <a href="/customers/new" target="_blank" className="text-blue-600 hover:underline">เพิ่มลูกค้า</a>
          </p>
        </div>
        <div>
          <label className={label}>วันที่</label>
          <input name="project_date" type="date" value={form.project_date} onChange={handleChange} className={field} />
        </div>
      </div>

      <div>
        <label className={label}>ชื่อลูกค้า (แสดงในเอกสาร)</label>
        <input name="client_name" value={form.client_name} onChange={handleChange} className={field} placeholder="จะถูกกรอกอัตโนมัติเมื่อเลือกลูกค้า" />
      </div>

      <div>
        <label className={label}>สถานที่</label>
        <input name="site_address" value={form.site_address} onChange={handleChange} className={field} placeholder="ที่อยู่หรือสถานที่ติดตั้ง" />
      </div>

      {isEdit && (
        <div>
          <label className={label}>สถานะ</label>
          <select name="status" value={form.status} onChange={handleChange} className={field}>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">ยืนยันแล้ว</option>
            <option value="CANCELLED">ยกเลิก</option>
          </select>
        </div>
      )}

      <div>
        <label className={label}>หมายเหตุ</label>
        <textarea name="note" value={form.note} onChange={handleChange} rows={3} className={field} placeholder="หมายเหตุเพิ่มเติม" />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'สร้าง BOQ'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  )
}
