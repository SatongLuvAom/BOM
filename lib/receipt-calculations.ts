export type ReceiptCalculationValue = number | string | null | undefined

export type ReceiptCalculationItem = {
  id?: string | null
  lineNo?: number | null
  qty?: ReceiptCalculationValue
  unitPrice?: ReceiptCalculationValue
  lineTotal?: ReceiptCalculationValue
}

export type ReceiptCalculationHeader = {
  subtotal?: ReceiptCalculationValue
  vat?: ReceiptCalculationValue
  discount?: ReceiptCalculationValue
  grandTotal?: ReceiptCalculationValue
}

export type ReceiptCalculationIssue = {
  code: 'ITEM_TOTAL_MISMATCH' | 'SUBTOTAL_MISMATCH' | 'GRAND_TOTAL_MISMATCH'
  scope: 'item' | 'summary'
  itemId: string | null
  lineNo: number | null
  message: string
  expected: number
  actual: number
}

export type ReceiptCalculationResult = {
  issues: ReceiptCalculationIssue[]
  itemTotal: number | null
  expectedGrandTotal: number | null
  checkedItemCount: number
  itemCount: number
  hasCompleteItemTotal: boolean
}

const MONEY_TOLERANCE = 0.05

export function validateReceiptCalculations(input: {
  header: ReceiptCalculationHeader
  items: ReceiptCalculationItem[]
}): ReceiptCalculationResult {
  const issues: ReceiptCalculationIssue[] = []
  let itemTotal = 0
  let checkedItemCount = 0
  let hasCompleteItemTotal = input.items.length > 0

  input.items.forEach((item, index) => {
    const qty = toFiniteNumber(item.qty)
    const unitPrice = toFiniteNumber(item.unitPrice)
    const lineTotal = toFiniteNumber(item.lineTotal)
    const expectedLineTotal = qty != null && unitPrice != null
      ? roundMoney(qty * unitPrice)
      : null

    if (expectedLineTotal != null && lineTotal != null) {
      checkedItemCount += 1
      if (!amountsMatch(lineTotal, expectedLineTotal)) {
        const lineNo = item.lineNo ?? index + 1
        issues.push({
          code: 'ITEM_TOTAL_MISMATCH',
          scope: 'item',
          itemId: item.id ?? null,
          lineNo,
          message: `รายการ ${lineNo}: ${formatNumber(qty!)} × ${formatMoney(unitPrice!)} ควรเป็น ${formatMoney(expectedLineTotal)} แต่ระบุ ${formatMoney(lineTotal)}`,
          expected: expectedLineTotal,
          actual: lineTotal,
        })
      }
    }

    const effectiveLineTotal = lineTotal ?? expectedLineTotal
    if (effectiveLineTotal == null) {
      hasCompleteItemTotal = false
      return
    }
    itemTotal += effectiveLineTotal
  })

  const normalizedItemTotal = hasCompleteItemTotal ? roundMoney(itemTotal) : null
  const subtotal = toFiniteNumber(input.header.subtotal)
  const vat = toFiniteNumber(input.header.vat) ?? 0
  const discount = toFiniteNumber(input.header.discount) ?? 0
  const grandTotal = toFiniteNumber(input.header.grandTotal)

  if (
    subtotal != null
    && normalizedItemTotal != null
    && !amountsMatch(subtotal, normalizedItemTotal)
  ) {
    issues.push({
      code: 'SUBTOTAL_MISMATCH',
      scope: 'summary',
      itemId: null,
      lineNo: null,
      message: `ผลรวมรายการควรเป็น ${formatMoney(normalizedItemTotal)} แต่ Subtotal ระบุ ${formatMoney(subtotal)}`,
      expected: normalizedItemTotal,
      actual: subtotal,
    })
  }

  const grandTotalBase = subtotal ?? normalizedItemTotal
  const expectedGrandTotal = grandTotalBase == null
    ? null
    : roundMoney(grandTotalBase + vat - discount)

  if (
    grandTotal != null
    && expectedGrandTotal != null
    && !amountsMatch(grandTotal, expectedGrandTotal)
  ) {
    issues.push({
      code: 'GRAND_TOTAL_MISMATCH',
      scope: 'summary',
      itemId: null,
      lineNo: null,
      message: `Subtotal ${formatMoney(grandTotalBase!)} + VAT ${formatMoney(vat)} - ส่วนลด ${formatMoney(discount)} ควรสุทธิ ${formatMoney(expectedGrandTotal)} แต่ระบุ ${formatMoney(grandTotal)}`,
      expected: expectedGrandTotal,
      actual: grandTotal,
    })
  }

  return {
    issues,
    itemTotal: normalizedItemTotal,
    expectedGrandTotal,
    checkedItemCount,
    itemCount: input.items.length,
    hasCompleteItemTotal,
  }
}

export function formatReceiptMoney(value: number | null | undefined) {
  return value == null ? '—' : formatMoney(value)
}

function toFiniteNumber(value: ReceiptCalculationValue) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'string'
    ? Number(value.replace(/,/g, '').trim())
    : value
  return Number.isFinite(parsed) ? Number(parsed) : null
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function amountsMatch(actual: number, expected: number) {
  return Math.abs(actual - expected) <= MONEY_TOLERANCE
}

function formatMoney(value: number) {
  return roundMoney(value)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}
