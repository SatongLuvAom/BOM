'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { MatMaster, MatPriceBase, Supplier } from '@/types/mat'

interface PriceListProps {
  prices: MatPriceBase[]
  materials: Pick<MatMaster, 'material_id' | 'mat_name_th'>[]
  suppliers: Pick<Supplier, 'supplier_id' | 'supplier_name_th'>[]
}

export function PriceList({ prices, materials, suppliers }: PriceListProps) {
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
          value={searchParams.get('material_id') ?? ''}
          onChange={(e) => setParam('material_id', e.target.value)}
          className="ops-select"
        >
          <option value="">All materials</option>
          {materials.map((material) => (
            <option key={material.material_id} value={material.material_id}>
              {material.mat_name_th}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get('supplier_id') ?? ''}
          onChange={(e) => setParam('supplier_id', e.target.value)}
          className="ops-select"
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.supplier_id} value={supplier.supplier_id}>
              {supplier.supplier_name_th}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Effective Date</th>
              <th>Material</th>
              <th>Supplier</th>
              <th>Unit Price</th>
              <th>MOQ</th>
              <th>Lead Time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                  No price records found
                </td>
              </tr>
            )}
            {prices.map((price) => (
              <tr key={`${price.material_id}-${price.supplier_id}-${price.effective_date}`}>
                <td className="text-slate-500">{price.effective_date}</td>
                <td>
                  <p className="font-medium text-gray-900">{price.material?.mat_name_th ?? price.material_id}</p>
                  <p className="text-xs text-gray-400">{price.material_id}</p>
                </td>
                <td>
                  <p className="font-medium text-gray-900">{price.supplier?.supplier_name_th ?? price.supplier_id}</p>
                  <p className="text-xs text-gray-400">{price.supplier?.supplier_code ?? price.supplier_id}</p>
                </td>
                <td className="font-semibold text-slate-900">
                  {price.currency_code} {price.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  <span className="text-gray-500"> / {price.price_uom}</span>
                </td>
                <td className="text-slate-500">{price.min_order_qty}</td>
                <td className="text-slate-500">{price.lead_time_days} days</td>
                <td>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/prices/${price.material_id}/${price.supplier_id}/${price.effective_date}`}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      View
                    </Link>
                    <Link
                      href={`/prices/${price.material_id}/${price.supplier_id}/${price.effective_date}/edit`}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
