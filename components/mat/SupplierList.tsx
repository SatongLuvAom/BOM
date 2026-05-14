'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { statusLabel } from '@/lib/utils'
import type { Supplier, SupplierStatus } from '@/types/mat'

interface SupplierListProps {
  suppliers: Supplier[]
}

const STATUS_OPTIONS: { value: SupplierStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

export function SupplierList({ suppliers }: SupplierListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div>
      <div className="ops-toolbar">
        <select
          value={searchParams.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
          className="ops-select"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Supplier ID</th>
              <th>Code</th>
              <th>Name</th>
              <th>Tax ID</th>
              <th>Contact</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  No suppliers found
                </td>
              </tr>
            )}
            {suppliers.map((supplier) => {
              const { label, color } = statusLabel(supplier.status)

              return (
                <tr key={supplier.supplier_id}>
                  <td>
                    <Link
                      href={`/suppliers/${supplier.supplier_id}`}
                      className="font-mono text-xs font-semibold text-cyan-700 hover:underline"
                    >
                      {supplier.supplier_id}
                    </Link>
                  </td>
                  <td>
                    <Badge label={supplier.supplier_code} color="blue" />
                  </td>
                  <td>
                    <p className="font-medium text-gray-900">{supplier.supplier_name_th}</p>
                    {supplier.supplier_name_en && (
                      <p className="text-xs text-gray-400">{supplier.supplier_name_en}</p>
                    )}
                  </td>
                  <td className="text-slate-500">{supplier.tax_id ?? '-'}</td>
                  <td className="text-slate-500">
                    {supplier.contact_name || supplier.phone || '-'}
                  </td>
                  <td>
                    <Badge label={label} color={color as 'green' | 'gray' | 'red'} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/suppliers/${supplier.supplier_id}`}
                        className="text-xs text-gray-500 hover:text-gray-900"
                      >
                        View
                      </Link>
                      <Link
                        href={`/suppliers/${supplier.supplier_id}/edit`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
