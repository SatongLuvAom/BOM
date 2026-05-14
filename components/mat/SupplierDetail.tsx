import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { SupplierMaterialMapManager } from '@/components/mat/SupplierMaterialMapManager'
import { statusLabel } from '@/lib/utils'
import type { MatMaster, MatPriceBase, MatSupplierMap, Supplier } from '@/types/mat'

interface SupplierDetailProps {
  supplier: Supplier
  maps: MatSupplierMap[]
  prices: MatPriceBase[]
  materials: Pick<MatMaster, 'material_id' | 'mat_name_th' | 'spec'>[]
}

export function SupplierDetail({
  supplier,
  maps,
  prices,
  materials,
}: SupplierDetailProps) {
  const { label, color } = statusLabel(supplier.status)

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm text-gray-400">{supplier.supplier_id}</p>
              <h2 className="mt-0.5 text-xl font-bold text-gray-900">{supplier.supplier_name_th}</h2>
              <p className="text-sm text-gray-500">{supplier.supplier_name_en || supplier.supplier_code}</p>
            </div>
            <Badge label={label} color={color as 'green' | 'gray' | 'red'} />
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <Row label="Supplier Code">{supplier.supplier_code}</Row>
            <Row label="Tax ID">{supplier.tax_id ?? '-'}</Row>
            <Row label="Contact">{supplier.contact_name ?? '-'}</Row>
            <Row label="Phone">{supplier.phone ?? '-'}</Row>
            <Row label="Email">{supplier.email ?? '-'}</Row>
            <Row label="LINE ID">{supplier.line_id ?? '-'}</Row>
            <Row label="Payment Terms">{supplier.payment_terms ?? '-'}</Row>
            <Row label="Updated At">{new Date(supplier.updated_at).toLocaleString('en-GB')}</Row>
          </dl>

          {supplier.address && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <strong className="text-gray-900">Address:</strong> {supplier.address}
            </div>
          )}

          {supplier.note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Note:</strong> {supplier.note}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Link
            href={`/suppliers/${supplier.supplier_id}/edit`}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit supplier
          </Link>
          <Link
            href={`/prices/new?supplier_id=${encodeURIComponent(supplier.supplier_id)}`}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add price
          </Link>
          <Link
            href="/suppliers"
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to suppliers
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SupplierMaterialMapManager
          supplierId={supplier.supplier_id}
          maps={maps}
          materials={materials}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Price History</h3>
            <p className="text-sm text-gray-500">{prices.length} records</p>
          </div>
          <Link
            href={`/prices?supplier_id=${encodeURIComponent(supplier.supplier_id)}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View all prices
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Effective Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Material</th>
                <th className="px-4 py-3 font-medium text-gray-500">Price</th>
                <th className="px-4 py-3 font-medium text-gray-500">MOQ</th>
                <th className="px-4 py-3 font-medium text-gray-500">Lead Time</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No prices yet
                  </td>
                </tr>
              )}
              {prices.map((price) => (
                <tr key={`${price.material_id}-${price.supplier_id}-${price.effective_date}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{price.effective_date}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{price.material?.mat_name_th ?? price.material_id}</p>
                    <p className="text-xs text-gray-400">{price.material_id}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {price.currency_code} {price.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    <span className="text-gray-500"> / {price.price_uom}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{price.min_order_qty}</td>
                  <td className="px-4 py-3 text-gray-500">{price.lead_time_days} days</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/prices/${price.material_id}/${price.supplier_id}/${price.effective_date}`}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </>
  )
}
