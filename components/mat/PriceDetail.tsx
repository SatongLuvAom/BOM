import Link from 'next/link'
import type { MatPriceBase } from '@/types/mat'

interface PriceDetailProps {
  price: MatPriceBase
}

export function PriceDetail({ price }: PriceDetailProps) {
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div>
            <p className="text-sm text-gray-400">Price Key</p>
            <h2 className="mt-0.5 text-xl font-bold text-gray-900">
              {price.material?.mat_name_th ?? price.material_id}
            </h2>
            <p className="text-sm text-gray-500">
              {price.supplier?.supplier_name_th ?? price.supplier_id} / effective {price.effective_date}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <Row label="Material ID">{price.material_id}</Row>
            <Row label="Supplier ID">{price.supplier_id}</Row>
            <Row label="Supplier Code">{price.supplier?.supplier_code ?? '-'}</Row>
            <Row label="Effective Date">{price.effective_date}</Row>
            <Row label="Unit Price">
              {price.currency_code} {price.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </Row>
            <Row label="Price UOM">{price.uom?.uom_name_th ?? price.price_uom}</Row>
            <Row label="MOQ">{price.min_order_qty}</Row>
            <Row label="Lead Time">{price.lead_time_days} days</Row>
            <Row label="Tax Included">{price.is_tax_included ? 'Yes' : 'No'}</Row>
            <Row label="Created At">{new Date(price.created_at).toLocaleString('en-GB')}</Row>
            <Row label="Updated At">{new Date(price.updated_at).toLocaleString('en-GB')}</Row>
          </dl>

          {price.source_note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Source Note:</strong> {price.source_note}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Link
            href={`/prices/${price.material_id}/${price.supplier_id}/${price.effective_date}/edit`}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit price
          </Link>
          <Link
            href={`/materials/${price.material_id}`}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View material
          </Link>
          <Link
            href={`/suppliers/${price.supplier_id}`}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View supplier
          </Link>
          <Link
            href="/prices"
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to prices
          </Link>
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
