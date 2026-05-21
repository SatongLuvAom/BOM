import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { MaterialDetailSections } from '@/components/mat/MaterialDetailSections'
import { statusLabel } from '@/lib/utils'
import { getMaterialCode, getMaterialPriceWarning, getMaterialRouteId } from '@/lib/material-master'
import type { MatLatestPrice, MatMaster, MatQualityScore } from '@/types/mat'

type PreferredSupplierSummary = {
  supplier_id: string
  supplier_sku: string | null
  supplier?: {
    supplier_id: string
    supplier_code: string
    supplier_name_th: string
    status: string
  } | null
} | null

interface MaterialDetailProps {
  material: MatMaster
  latestPrice?: MatLatestPrice | null
  quality?: MatQualityScore | null
  preferredSupplier?: PreferredSupplierSummary
}

export function MaterialDetail({
  material,
  latestPrice,
  quality,
  preferredSupplier,
}: MaterialDetailProps) {
  const { label, color } = statusLabel(material.status)
  const materialCode = getMaterialCode(material)
  const routeId = getMaterialRouteId(material)
  const priceWarning = quality?.is_price_expired ? 'Price expired' : getMaterialPriceWarning(latestPrice)
  const qualityWarnings = quality?.warnings ?? []

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-sm text-slate-400">{materialCode}</p>
              <h2 className="mt-0.5 truncate text-xl font-bold text-slate-950">{material.mat_name_th}</h2>
              {material.mat_name_en && <p className="text-sm text-slate-500">{material.mat_name_en}</p>}
              {material.id && <p className="mt-1 max-w-xl truncate text-[11px] text-slate-300">UUID: {material.id}</p>}
            </div>
            <Badge label={label} color={color as 'green' | 'gray' | 'red'} />
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <Row label="Category">
              {material.category ? (
                <span>
                  <Badge label={material.category.cat_code} color="blue" className="mr-1.5" />
                  {material.category.cat_name_th}
                </span>
              ) : '-'}
            </Row>
            <Row label="Base UOM">{material.uom?.uom_name_th ?? material.base_uom} ({material.base_uom})</Row>
            <Row label="Spec">{material.spec ?? '-'}</Row>
            <Row label="Brand">{material.brand ?? '-'}</Row>
            <Row label="Model">{material.model ?? '-'}</Row>
            <Row label="Material type">
              {material.material_type
                ? `[${material.material_type.code_prefix}] ${material.material_type.name}`
                : 'Legacy / not assigned'}
            </Row>
            <Row label="Code spec key">{material.code_spec_key ?? 'GEN'}</Row>
            <Row label="Preferred supplier">
              {preferredSupplier?.supplier?.supplier_name_th ?? '-'}
              {preferredSupplier?.supplier_sku ? ` / ${preferredSupplier.supplier_sku}` : ''}
            </Row>
            <Row label="Updated">{new Date(material.updated_at).toLocaleString('th-TH')}</Row>
            <Row label="Created">{new Date(material.created_at).toLocaleString('th-TH')}</Row>
          </dl>

          {material.note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Note:</strong> {material.note}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest price</p>
            {latestPrice ? (
              <div className="mt-2">
                <p className="text-xl font-bold text-slate-950">
                  {Number(latestPrice.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    {latestPrice.currency_code}/{latestPrice.price_uom}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {latestPrice.supplier_name ?? 'Supplier not set'} - {latestPrice.quote_date ?? latestPrice.effective_date}
                </p>
                {priceWarning && <p className="mt-2 text-xs font-medium text-amber-700">{priceWarning}</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold text-red-600">ยังไม่มีราคา</p>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quality score</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{quality?.quality_score ?? 0}/100</p>
            <p className="text-xs text-slate-500">{quality?.quality_label ?? 'Incomplete'}</p>
            {qualityWarnings.length > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                {qualityWarnings.length} warning{qualityWarnings.length === 1 ? '' : 's'} need review
              </p>
            )}
          </div>

          <Link
            href={`/materials/${routeId}/edit`}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Edit material
          </Link>
          <Link
            href={`/materials/${routeId}#code-history`}
            className="flex w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          >
            เปลี่ยนรหัสวัสดุ
          </Link>
          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-slate-500">
            รหัสวัสดุถูกล็อกหลังสร้างเพื่อป้องกัน BOM / BOQ เดิมเสียความสัมพันธ์ หากต้องเปลี่ยน ระบบจะบันทึกเหตุผล เก็บประวัติ และทำ Alias จากรหัสเดิมให้ค้นหาเจอ
          </p>
          <Link
            href="/materials"
            className="flex w-full items-center justify-center rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-stone-50"
          >
            Back to materials
          </Link>
        </div>
      </div>

      <MaterialDetailSections material={material} />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-900">{children}</dd>
    </>
  )
}
