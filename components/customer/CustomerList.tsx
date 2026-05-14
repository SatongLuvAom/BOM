'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer } from '@/types/customer'

export function CustomerList({ customers }: { customers: Customer[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(c: Customer) {
    if (!confirm(`ลบลูกค้า "${c.customer_name}" ?`)) return
    setDeleting(c.customer_id)
    try {
      await fetch(`/api/customers/${c.customer_id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-gray-100 bg-gray-50 text-left">
            <th className="px-4 py-3 font-medium text-gray-500">รหัส</th>
            <th className="px-4 py-3 font-medium text-gray-500">ชื่อลูกค้า</th>
            <th className="px-4 py-3 font-medium text-gray-500">ผู้ติดต่อ</th>
            <th className="px-4 py-3 font-medium text-gray-500">โทรศัพท์</th>
            <th className="px-4 py-3 font-medium text-gray-500">อีเมล</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {customers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                ยังไม่มีลูกค้า
              </td>
            </tr>
          )}
          {customers.map((c) => (
            <tr key={c.customer_id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/customers/${c.customer_id}`}
                  className="font-mono text-xs text-blue-600 hover:underline"
                >
                  {c.customer_id}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{c.customer_name}</td>
              <td className="px-4 py-3 text-gray-500">{c.contact_name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.phone ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{c.email ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link href={`/customers/${c.customer_id}`}      className="text-xs text-gray-500 hover:text-gray-900">ดู</Link>
                  <Link href={`/customers/${c.customer_id}/edit`} className="text-xs text-blue-600 hover:text-blue-800">แก้ไข</Link>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deleting === c.customer_id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                  >
                    {deleting === c.customer_id ? '...' : 'ลบ'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
