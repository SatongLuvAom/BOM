'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer } from '@/types/customer'

interface Props {
  customer?: Customer
}

export function CustomerForm({ customer }: Props) {
  const router = useRouter()
  const isEdit = !!customer

  const [form, setForm] = useState({
    customer_code: customer?.customer_code ?? '',
    customer_name: customer?.customer_name ?? '',
    contact_name:  customer?.contact_name  ?? '',
    phone:         customer?.phone         ?? '',
    email:         customer?.email         ?? '',
    address:       customer?.address       ?? '',
    tax_id:        customer?.tax_id        ?? '',
    note:          customer?.note          ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      customer_code: form.customer_code.trim() || undefined,
      customer_name: form.customer_name.trim(),
      contact_name:  form.contact_name.trim()  || undefined,
      phone:         form.phone.trim()         || undefined,
      email:         form.email.trim()         || undefined,
      address:       form.address.trim()       || undefined,
      tax_id:        form.tax_id.trim()        || undefined,
      note:          form.note.trim()          || undefined,
    }

    try {
      const url    = isEdit ? `/api/customers/${customer!.customer_id}` : '/api/customers'
      const method = isEdit ? 'PATCH' : 'POST'
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      router.push(`/customers/${isEdit ? customer!.customer_id : json.data.customer_id}`)
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className={label}>ชื่อลูกค้า <span className="text-red-500">*</span></label>
          <input name="customer_name" value={form.customer_name} onChange={handleChange} required className={field} placeholder="เช่น บริษัท เอบีซี จำกัด" />
        </div>
        <div>
          <label className={label}>รหัสลูกค้า (ถ้ามี)</label>
          <input name="customer_code" value={form.customer_code} onChange={handleChange} className={field} placeholder="CUS-XXX" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label}>ผู้ติดต่อ</label>
          <input name="contact_name" value={form.contact_name} onChange={handleChange} className={field} placeholder="ชื่อผู้ติดต่อ" />
        </div>
        <div>
          <label className={label}>โทรศัพท์</label>
          <input name="phone" value={form.phone} onChange={handleChange} className={field} placeholder="08x-xxx-xxxx" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={label}>อีเมล</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} className={field} placeholder="email@example.com" />
        </div>
        <div>
          <label className={label}>เลขผู้เสียภาษี</label>
          <input name="tax_id" value={form.tax_id} onChange={handleChange} className={field} placeholder="0-0000-00000-00-0" />
        </div>
      </div>

      <div>
        <label className={label}>ที่อยู่</label>
        <textarea name="address" value={form.address} onChange={handleChange} rows={3} className={field} placeholder="ที่อยู่สำหรับออกใบเสนอราคา/ใบกำกับภาษี" />
      </div>

      <div>
        <label className={label}>หมายเหตุ</label>
        <textarea name="note" value={form.note} onChange={handleChange} rows={2} className={field} placeholder="หมายเหตุเพิ่มเติม" />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มลูกค้า'}
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
