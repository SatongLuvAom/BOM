import type { LineMaterialLookupResult } from '@/types/line'

const SAMPLE_COMMANDS = [
  'ราคา MDF 9 มม',
  'วัสดุ MDF 9 มม',
  'ค้นหา MDF',
]

function formatCurrency(value: number, currencyCode: string) {
  return `${new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${currencyCode}`
}

function formatPriceLine(material: LineMaterialLookupResult) {
  if (!material.latest_price) {
    return 'ราคา: ยังไม่พบราคาปัจจุบัน'
  }

  const price = material.latest_price
  const uomLabel = price.price_uom_name_th ?? price.price_uom
  const supplierLabel = price.supplier_name_th ?? price.supplier_id

  return [
    `ราคา: ${formatCurrency(price.unit_price, price.currency_code)} / ${uomLabel}`,
    `ผู้ขาย: ${supplierLabel}`,
    `มีผล: ${price.effective_date}`,
  ].join('\n')
}

export function formatHelpMessage() {
  return [
    'คำสั่งที่ใช้ได้',
    ...SAMPLE_COMMANDS.map((command) => `- ${command}`),
  ].join('\n')
}

export function formatFallbackMessage() {
  return [
    'ยังไม่เข้าใจคำสั่งนี้',
    'ลองพิมพ์แบบนี้ได้เลย:',
    ...SAMPLE_COMMANDS.map((command) => `- ${command}`),
  ].join('\n')
}

export function formatEmptySearchMessage(keyword: string, mode: 'price' | 'material' | 'search') {
  const prefix =
    mode === 'price'
      ? 'ไม่พบราคาวัสดุ'
      : mode === 'material'
        ? 'ไม่พบข้อมูลวัสดุ'
        : 'ไม่พบผลการค้นหา'

  return `${prefix} สำหรับ "${keyword}"`
}

export function formatPriceLookupMessage(keyword: string, results: LineMaterialLookupResult[]) {
  const lines = [`ผลลัพธ์ราคา "${keyword}"`]

  for (const [index, material] of results.slice(0, 3).entries()) {
    lines.push(
      '',
      `${index + 1}. ${material.mat_name_th}${material.spec ? ` ${material.spec}` : ''}`,
      `ID: ${material.material_id}`,
      formatPriceLine(material),
    )
  }

  return lines.join('\n')
}

export function formatMaterialLookupMessage(keyword: string, results: LineMaterialLookupResult[]) {
  const lines = [`ข้อมูลวัสดุ "${keyword}"`]

  for (const [index, material] of results.slice(0, 3).entries()) {
    const aliasPreview = material.aliases.slice(0, 3).join(', ')

    lines.push(
      '',
      `${index + 1}. ${material.mat_name_th}`,
      `ID: ${material.material_id}`,
      `สเปก: ${material.spec || '-'}`,
      `หมวด: ${material.category_name_th || '-'}`,
      `หน่วยหลัก: ${material.base_uom}`,
      `Alias: ${aliasPreview || '-'}`,
      formatPriceLine(material),
    )
  }

  return lines.join('\n')
}

export function formatSearchResultMessage(keyword: string, results: LineMaterialLookupResult[]) {
  const lines = [`ค้นหา "${keyword}" พบ ${results.length} รายการ`]

  for (const [index, material] of results.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${material.mat_name_th}${material.spec ? ` ${material.spec}` : ''} [${material.material_id}]`,
    )
  }

  return lines.join('\n')
}
