import type { PurchaseReceipt, ReceiptSupplier } from '@/types/receipt'

export type ReceiptSupplierMatch = {
  supplier: ReceiptSupplier
  reasons: string[]
  conflicts: string[]
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function digits(value: unknown) {
  return text(value).replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)))
}

export function normalizeReceiptSupplierTaxId(value: unknown) {
  return digits(value).replace(/[\s.-]/g, '')
}

function taxId(value: unknown) {
  const normalized = normalizeReceiptSupplierTaxId(value)
  return /^\d{13}$/.test(normalized) ? normalized : ''
}

function phones(value: unknown) {
  return digits(value).split(/[;,/|]/).map((phone) => {
    const normalized = phone.replace(/[\s().-]/g, '').replace(/^\+?66(?=\d{8,9}$)/, '0')
    return /^0\d{8,9}$/.test(normalized) ? normalized : ''
  }).filter(Boolean)
}

function name(value: unknown) {
  return digits(value).normalize('NFC').toLowerCase()
    .replace(/^(?:บริษัท|ห้างหุ้นส่วนจำกัด|หจก\.?)\s*/u, '')
    .replace(/\s*จำกัด(?:\s*\(มหาชน\))?$/u, '')
    .replace(/\b(?:co\.?\s*,?\s*ltd\.?|limited|ltd\.?)$/i, '')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '')
}

export function getReceiptSupplierDraft(
  receipt: Pick<PurchaseReceipt, 'supplier_name_raw' | 'supplier_tax_id_raw' | 'ai_raw_json'>,
) {
  const raw = receipt.ai_raw_json
  const seller = raw && typeof raw === 'object' && 'supplier' in raw ? raw.supplier : null
  const field = (key: string) => text(seller && typeof seller === 'object' ? (seller as Record<string, unknown>)[key] : null)
  return {
    supplier_name_th: text(receipt.supplier_name_raw),
    tax_id: normalizeReceiptSupplierTaxId(receipt.supplier_tax_id_raw),
    phone: field('phone'),
    address: field('address'),
    email: field('email'),
  }
}

export function findReceiptSupplierDuplicates(
  input: { supplier_name_th: string; tax_id?: string | null },
  suppliers: ReceiptSupplier[],
): ReceiptSupplier[] {
  const inputTaxId = taxId(input.tax_id)
  const inputName = name(input.supplier_name_th)
  // Inactive records still belong to the master: do not create another copy.
  return suppliers.filter((supplier) => (
    (inputTaxId && inputTaxId === taxId(supplier.tax_id))
    || (inputName.length >= 2 && [name(supplier.supplier_name_th), name(supplier.supplier_name_en)].includes(inputName))
  )).slice(0, 5)
}

export function matchReceiptSuppliers(
  receipt: Pick<PurchaseReceipt, 'supplier_name_raw' | 'supplier_tax_id_raw' | 'ai_raw_json'>,
  suppliers: ReceiptSupplier[],
): ReceiptSupplierMatch[] {
  const raw = receipt.ai_raw_json
  const seller = raw && typeof raw === 'object' && 'supplier' in raw ? raw.supplier : null
  const sellerPhone = seller && typeof seller === 'object' && 'phone' in seller ? seller.phone : null
  const inputPhones = phones(sellerPhone)
  const inputTaxId = taxId(receipt.supplier_tax_id_raw)
  const inputName = name(receipt.supplier_name_raw)

  return suppliers.flatMap((supplier) => {
    if (supplier.status && supplier.status !== 'ACTIVE') return []
    const supplierTaxId = taxId(supplier.tax_id)
    const supplierPhones = phones(supplier.phone)
    const names = [name(supplier.supplier_name_th), name(supplier.supplier_name_en)].filter(Boolean)
    const sameTaxId = Boolean(inputTaxId && inputTaxId === supplierTaxId)
    const samePhone = inputPhones.some((phone) => supplierPhones.includes(phone))
    const sameName = inputName.length >= 3 && names.includes(inputName)
    // Preserve branches, numbers and spelling. A contained name is only a suggestion, never an exact match.
    const similarName = !sameName && inputName.length >= 5 && names.some((candidate) => (
      candidate.length >= 5
      && Math.min(candidate.length, inputName.length) / Math.max(candidate.length, inputName.length) >= 0.5
      && (candidate.includes(inputName) || inputName.includes(candidate))
    ))
    if (!sameTaxId && !samePhone && !sameName && !similarName) return []

    const reasons: string[] = []
    const conflicts: string[] = []
    if (sameTaxId) reasons.push('เลขผู้เสียภาษีตรงกัน')
    if (sameName) reasons.push('ชื่อร้านตรงกัน')
    if (samePhone) reasons.push('เบอร์โทรตรงกัน')
    if (similarName) reasons.push('ชื่อร้านคล้ายกัน ต้องตรวจสอบ')
    if (inputTaxId && supplierTaxId && !sameTaxId) conflicts.push('เลขผู้เสียภาษีไม่ตรงกัน กรุณาตรวจต้นฉบับ')
    if (inputPhones.length && supplierPhones.length && !samePhone) conflicts.push('เบอร์โทรไม่ตรงกัน กรุณาตรวจต้นฉบับ')
    if (inputName && names.length && !sameName && !similarName) conflicts.push('ชื่อร้านต่างจากข้อมูลในระบบ กรุณาตรวจต้นฉบับ')

    const rank = (sameTaxId ? 100 : 0) + (sameName ? 30 : 0) + (samePhone ? 20 : 0)
      + (similarName ? 10 : 0) - (inputTaxId && supplierTaxId && !sameTaxId ? 100 : 0)
    return [{ supplier, reasons, conflicts, rank }]
  }).sort((left, right) => (
    right.rank - left.rank || (left.supplier.id < right.supplier.id ? -1 : left.supplier.id > right.supplier.id ? 1 : 0)
  )).slice(0, 5).map(({ supplier, reasons, conflicts }) => ({ supplier, reasons, conflicts }))
}
