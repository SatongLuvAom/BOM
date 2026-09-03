import assert from 'node:assert/strict'
import { validateReceiptCalculations } from '../lib/receipt-calculations.ts'

const balanced = validateReceiptCalculations({
  header: { subtotal: 200, vat: 14, discount: 10, grandTotal: 204 },
  items: [
    { id: 'a', lineNo: 1, qty: 2, unitPrice: 50, lineTotal: 100 },
    { id: 'b', lineNo: 2, qty: 4, unitPrice: 25, lineTotal: 100 },
  ],
})
assert.equal(balanced.issues.length, 0)
assert.equal(balanced.itemTotal, 200)
assert.equal(balanced.expectedGrandTotal, 204)

const lineMismatch = validateReceiptCalculations({
  header: { subtotal: 120, grandTotal: 120 },
  items: [{ id: 'line-1', lineNo: 1, qty: 2, unitPrice: 50, lineTotal: 120 }],
})
assert.ok(lineMismatch.issues.some((issue) => issue.code === 'ITEM_TOTAL_MISMATCH'))

const subtotalMismatch = validateReceiptCalculations({
  header: { subtotal: 90, grandTotal: 90 },
  items: [{ id: 'line-1', lineNo: 1, qty: 2, unitPrice: 50, lineTotal: 100 }],
})
assert.ok(subtotalMismatch.issues.some((issue) => issue.code === 'SUBTOTAL_MISMATCH'))

const taxMismatch = validateReceiptCalculations({
  header: { subtotal: 100, vat: 7, discount: 5, grandTotal: 107 },
  items: [{ id: 'line-1', lineNo: 1, qty: 1, unitPrice: 100, lineTotal: 100 }],
})
assert.ok(taxMismatch.issues.some((issue) => issue.code === 'GRAND_TOTAL_MISMATCH'))

const incomplete = validateReceiptCalculations({
  header: { subtotal: null, vat: null, discount: null, grandTotal: null },
  items: [{ id: 'line-1', lineNo: 1, qty: 1, unitPrice: null, lineTotal: null }],
})
assert.equal(incomplete.issues.length, 0)
assert.equal(incomplete.hasCompleteItemTotal, false)

console.log('Receipt calculation smoke test passed (5 scenarios).')
