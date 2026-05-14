'use client'

import { useEffect, useState, Fragment } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { MatCategory } from '@/types/mat'

interface CategoryListProps {
  categories: MatCategory[]
}

export function CategoryList({ categories }: CategoryListProps) {
  const [categoryRows, setCategoryRows] = useState(categories)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<Record<string, string>>({})

  useEffect(() => {
    setCategoryRows(categories)
  }, [categories])

  async function handleDelete(cat: MatCategory) {
    if (!confirm(`ลบหมวดหมู่ "${cat.cat_name_th}" ?`)) return
    setDeleting(cat.cat_id)
    setDeleteError((e) => ({ ...e, [cat.cat_id]: '' }))
    try {
      const res = await fetch(`/api/categories/${cat.cat_id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError((e) => ({ ...e, [cat.cat_id]: json.error }))
        return
      }
      setCategoryRows((current) => current.filter((row) => row.cat_id !== cat.cat_id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-y border-gray-100 bg-gray-50 text-left">
          <th className="px-6 py-3 font-medium text-gray-500">ID</th>
          <th className="px-4 py-3 font-medium text-gray-500">รหัส (Code)</th>
          <th className="px-4 py-3 font-medium text-gray-500">ชื่อหมวดหมู่</th>
          <th className="px-4 py-3 font-medium text-gray-500">Parent</th>
          <th className="px-4 py-3 font-medium text-gray-500">สถานะ</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {categoryRows.length === 0 && (
          <tr>
            <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
              ยังไม่มีหมวดหมู่
            </td>
          </tr>
        )}
        {categoryRows.map((c) => (
          <Fragment key={c.cat_id}>
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 font-mono text-xs text-gray-400">{c.cat_id}</td>
              <td className="px-4 py-3">
                <Badge label={c.cat_code} color="blue" />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{c.cat_name_th}</p>
                {c.cat_name_en && (
                  <p className="text-xs text-gray-400">{c.cat_name_en}</p>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {c.parent ? (
                  <Badge label={c.parent.cat_code} color="gray" />
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3">
                <Badge
                  label={c.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                  color={c.is_active ? 'green' : 'gray'}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/categories/${c.cat_id}/edit`}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    แก้ไข
                  </Link>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deleting === c.cat_id}
                    className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-40"
                  >
                    ลบ
                  </button>
                </div>
                {deleteError[c.cat_id] && (
                  <p className="mt-1 text-xs text-red-500">{deleteError[c.cat_id]}</p>
                )}
              </td>
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
