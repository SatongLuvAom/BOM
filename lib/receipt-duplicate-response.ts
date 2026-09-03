export type ReceiptDuplicateNotice = {
  id: string
  receiptNo: string | null
  supplierName: string | null
  matchType: 'file_hash' | 'supplier_receipt_no'
}

export function getReceiptDuplicateNotice(payload: unknown): ReceiptDuplicateNotice | null {
  if (!payload || typeof payload !== 'object') return null
  const response = payload as Record<string, any>
  const existing = response.details?.existingReceipt
  if (response.code !== 'DUPLICATE' || !existing || typeof existing.id !== 'string') return null

  return {
    id: existing.id,
    receiptNo: typeof existing.receipt_no === 'string' ? existing.receipt_no : null,
    supplierName: typeof existing.supplier_name_raw === 'string' ? existing.supplier_name_raw : null,
    matchType: response.details?.matchType === 'supplier_receipt_no'
      ? 'supplier_receipt_no'
      : 'file_hash',
  }
}
