'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge'
import styles from './receipts.module.css'
import { SupplierForm } from '@/components/mat/SupplierForm'
import {
  formatReceiptMoney,
  validateReceiptCalculations,
  type ReceiptCalculationResult,
} from '@/lib/receipt-calculations'
import {
  getReceiptDuplicateNotice,
  type ReceiptDuplicateNotice,
} from '@/lib/receipt-duplicate-response'
import { routes } from '@/lib/routes'
import { resolveMaterialFormProfile } from '@/lib/material-form-profile'
import { SPEC_PROFILES, readSpecDetails, writeSpecDetails, specDetailError, isNumericSpecField, type SpecProfile, type SpecDetails } from '@/lib/receipt-spec-fields'
import { getReceiptSupplierDraft, matchReceiptSuppliers } from '@/lib/receipt-supplier-match'
import type {
  MaterialCandidate,
  PurchaseReceipt,
  PurchaseReceiptItem,
  ReceiptCategory,
  ReceiptItemAction,
  ReceiptMaterialCandidate,
  ReceiptMaterialType,
  ReceiptSupplier,
  ReceiptUom,
} from '@/types/receipt'

type HeaderForm = {
  supplier_id: string
  supplier_name_raw: string
  supplier_tax_id_raw: string
  receipt_date: string
  receipt_no: string
  subtotal: string
  vat: string
  discount: string
  grand_total: string
  notes: string
}

type NewItemForm = {
  item_name_raw: string
  qty: string
  uom_raw: string
  uom_id: string
  unit_price: string
  line_total: string
}

const emptyNewItem: NewItemForm = {
  item_name_raw: '',
  qty: '',
  uom_raw: '',
  uom_id: '',
  unit_price: '',
  line_total: '',
}

const actionOptions: { value: ReceiptItemAction; label: string }[] = [
  { value: 'needs_review', label: 'ต้องตรวจสอบ' },
  { value: 'update_price', label: 'อัปเดตราคา' },
  { value: 'ignore', label: 'ไม่บันทึกรายการนี้' },
  { value: 'create_material_needed', label: 'สร้างวัสดุใหม่ภายหลัง' },
]

export function ReceiptReviewClient({
  initialReceipt,
  initialItems,
  suppliers: initialSuppliers,
  uoms,
  categories,
  materialTypes,
  initialMessage = null,
  initialWarning = null,
}: {
  initialReceipt: PurchaseReceipt
  initialItems: PurchaseReceiptItem[]
  suppliers: ReceiptSupplier[]
  uoms: ReceiptUom[]
  categories: ReceiptCategory[]
  materialTypes: ReceiptMaterialType[]
  initialMessage?: string | null
  initialWarning?: string | null
}) {
  const [receipt, setReceipt] = useState(initialReceipt)
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [newSupplierDraft, setNewSupplierDraft] = useState<ReturnType<typeof getReceiptSupplierDraft> | null>(null)
  const supplierDialog = useRef<HTMLDialogElement>(null)
  const [items, setItems] = useState(initialItems)
  const [header, setHeader] = useState<HeaderForm>(() => toHeaderForm(initialReceipt))
  const [newItem, setNewItem] = useState<NewItemForm>(emptyNewItem)
  const [savingHeader, setSavingHeader] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postingReady, setPostingReady] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [readingAi, setReadingAi] = useState(false)
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0)
  const [checkingAi, setCheckingAi] = useState(false)
  const [aiHealth, setAiHealth] = useState<string | null>(null)
  const [fillingUoms, setFillingUoms] = useState(false)
  const [matchingMaterials, setMatchingMaterials] = useState(false)
  const [creatingCandidates, setCreatingCandidates] = useState(false)
  const [repairingReceipt, setRepairingReceipt] = useState(false)
  const [candidateDraft, setCandidateDraft] = useState<ReceiptMaterialCandidate | null>(null)
  const [approvingCandidate, setApprovingCandidate] = useState(false)
  const [candidateApproveStage, setCandidateApproveStage] = useState<string | null>(null)
  const [candidateNeedsConfirm, setCandidateNeedsConfirm] = useState(false)
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState<string | null>(initialMessage)
  const [warning, setWarning] = useState<string | null>(initialWarning)
  const [error, setError] = useState<string | null>(null)
  const [duplicateReceipt, setDuplicateReceipt] = useState<ReceiptDuplicateNotice | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  const isPosted = receipt.status === 'posted'
  const hasReceiptFile = Boolean(receipt.file_name || receipt.file_url || receipt.file_storage_path)
  const hasAiExtraction = Boolean(receipt.ai_raw_json || receipt.ai_raw_text)
  const effectiveSupplierId = header.supplier_id || null
  const supplierConfirmed = Boolean(receipt.supplier_id && header.supplier_id === receipt.supplier_id)
  const supplierSelectionLocked = isPosted || Boolean(newSupplierDraft) || readingAi || savingHeader || matchingMaterials || posting || postingReady || creatingCandidates || repairingReceipt || uploadingFile
  const supplierMatches = matchReceiptSuppliers({
    ...receipt,
    supplier_name_raw: header.supplier_name_raw,
    supplier_tax_id_raw: header.supplier_tax_id_raw,
  }, suppliers)
  const receiptCalculation = useMemo(() => validateReceiptCalculations({
    header: {
      subtotal: header.subtotal,
      vat: header.vat,
      discount: header.discount,
      grandTotal: header.grand_total,
    },
    items: items.map((item) => ({
      id: item.id,
      lineNo: item.line_no,
      qty: item.qty,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
  }), [header.discount, header.grand_total, header.subtotal, header.vat, items])
  const itemCalculationIssues = useMemo(() => new Map(
    receiptCalculation.issues
      .filter((issue) => issue.itemId)
      .map((issue) => [issue.itemId!, issue]),
  ), [receiptCalculation.issues])
  const postBlockers = useMemo(() => Array.from(new Set([
    ...buildPostBlockers({ ...receipt, supplier_id: effectiveSupplierId }, items),
    ...receiptCalculation.issues.map((issue) => issue.message),
  ])), [effectiveSupplierId, receipt, receiptCalculation.issues, items])
  const readiness = useMemo(() => buildReadinessSummary(items, isPosted, effectiveSupplierId), [items, isPosted, effectiveSupplierId])
  const receiptFlowStatus = useMemo(
    () => buildReceiptFlowStatus(receipt.status, Boolean(effectiveSupplierId), items.length, readiness, postBlockers.length),
    [receipt.status, effectiveSupplierId, items.length, readiness, postBlockers.length],
  )
  const currentStep = !supplierConfirmed ? 1 : postBlockers.length > 0 ? 2 : 3

  useEffect(() => {
    if (!readingAi) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => setAiElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [readingAi])

  useEffect(() => {
    if (newSupplierDraft) supplierDialog.current?.showModal()
  }, [newSupplierDraft])

  function selectCreatedOrExistingSupplier(supplier: ReceiptSupplier, created: boolean) {
    setSuppliers((current) => [...current.filter((existing) => existing.id !== supplier.id), supplier])
    setHeaderField('supplier_id', supplier.id)
    setNewSupplierDraft(null)
    setMessage(created
      ? 'สร้างร้านแล้ว ยังไม่ได้ผูกกับสลิป กรุณากดยืนยันร้านและบันทึก Draft'
      : 'เลือกร้านเดิมแล้ว กรุณาตรวจและบันทึก Draft')
  }

  useEffect(() => {
    try {
      const key = `receipt-import-notice:${receipt.id}`
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return
      window.sessionStorage.removeItem(key)
      const notice = JSON.parse(raw) as { type?: string; text?: string }
      if (!notice.text) return
      if (notice.type === 'warning') setWarning(notice.text)
      else setMessage(notice.text)
    } catch {
      // A stored notice is only UI feedback; review page data is still loaded from the server.
    }
  }, [receipt.id])

  function setHeaderField<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setHeader((current) => ({ ...current, [key]: value }))
    clearMessages()
  }

  function setItemField<K extends keyof PurchaseReceiptItem>(id: string, key: K, value: PurchaseReceiptItem[K]) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
    clearMessages()
  }

  function setItemUom(id: string, uomId: string) {
    const selected = uoms.find((uom) => uom.id === uomId) ?? null
    setItems((current) => current.map((item) => item.id === id ? {
      ...item,
      uom_id: uomId || null,
      uom_raw: selected?.uom_code ?? item.uom_raw,
      uom: selected,
      match_reason: selected ? appendUiReason(item.match_reason, 'เลือกหน่วยเอง') : item.match_reason,
    } : item))
    clearMessages()
  }

  function clearMessages() {
    setMessage(null)
    setWarning(null)
    setError(null)
    setDuplicateReceipt(null)
  }

  function setItemBusy(id: string, busy: boolean) {
    setSavingItemIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function saveHeader() {
    setSavingHeader(true)
    clearMessages()
    try {
      await saveHeaderDraft()
      setMessage(header.supplier_id
        ? 'ยืนยันร้านค้าและบันทึก Draft แล้ว สามารถกดจับคู่วัสดุได้'
        : 'บันทึก Draft แล้ว กรุณาเลือกร้านค้าก่อนจับคู่วัสดุ')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึก Draft ไม่สำเร็จ')
    } finally {
      setSavingHeader(false)
    }
  }

  async function saveHeaderDraft() {
    if (receipt.supplier_id && header.supplier_id !== receipt.supplier_id
      && !confirm('เปลี่ยนร้านแล้วจะต้องตรวจและเลือกวัสดุทุกรายการใหม่ ราคาที่บันทึกแล้วจะไม่ถูกเปลี่ยน ยืนยันเปลี่ยนร้านหรือไม่?')) {
      throw new Error('ยังไม่ได้เปลี่ยนร้าน')
    }
    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toHeaderPayload(header)),
    })
    const json = await res.json()
    if (!res.ok) {
      setDuplicateReceipt(getReceiptDuplicateNotice(json))
      throw new Error(json.error ?? 'บันทึก Draft ไม่สำเร็จ')
    }
    if (!json.data) {
      throw new Error('บันทึก Draft แล้วแต่ระบบไม่ส่งข้อมูลกลับ กรุณารีเฟรชหน้าแล้วลองใหม่')
    }
    setReceipt(json.data)
    setHeader(toHeaderForm(json.data))
    if (json.items) setItems(json.items)
    return json.data as PurchaseReceipt
  }

  async function ensureHeaderSavedBeforePosting() {
    if (!supplierConfirmed) {
      throw new Error('กรุณายืนยันร้านและตรวจวัสดุให้ตรงกับร้านก่อนบันทึกราคา')
    }

    return saveHeaderDraft()
  }

  async function addItem() {
    setAddingItem(true)
    clearMessages()
    try {
      const nextLine = items.length + 1
      const res = await fetch(`/api/receipts/${receipt.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_no: nextLine,
          item_name_raw: newItem.item_name_raw,
          qty: toNumber(newItem.qty),
          uom_raw: newItem.uom_raw,
          uom_id: newItem.uom_id || null,
          unit_price: toNumber(newItem.unit_price),
          line_total: toNumber(newItem.line_total),
          action: 'needs_review',
          review_status: 'needs_review',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'เพิ่มรายการไม่สำเร็จ')
        return
      }
      setItems((current) => [...current, json.data])
      setReceipt((current) => ({ ...current, status: current.status === 'draft' ? 'needs_review' : current.status }))
      setNewItem(emptyNewItem)
    } finally {
      setAddingItem(false)
    }
  }

  async function saveItem(item: PurchaseReceiptItem, patch?: Partial<PurchaseReceiptItem>, confirmSupplierLink = false) {
    if (item.review_status === 'posted') return
    if (header.supplier_id !== (receipt.supplier_id ?? '')) {
      setError('กรุณายืนยันร้านและบันทึก Draft ก่อนแก้ไขรายการ')
      return false
    }
    clearMessages()
    setItemBusy(item.id, true)
    try {
    const payload = { ...toItemPayload({ ...item, ...patch }), expected_supplier_id: receipt.supplier_id, confirm_supplier_link: confirmSupplierLink }
    const res = await fetchWithTimeout(`/api/receipts/${receipt.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 30000)
    const json = await readApiJson(res)
    if (!res.ok) {
      setError(json.error ?? 'บันทึกรายการไม่สำเร็จ')
      return
    }
    if (!json.data) {
      setError('บันทึกรายการแล้วแต่ระบบไม่ส่งข้อมูลกลับ กรุณารีเฟรชหน้านี้')
      return
    }
    setItems((current) => current.map((row) => row.id === item.id ? mergeReceiptItem(row, json.data) : row))
    setMessage('บันทึกรายการแล้ว')
    return true
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึกรายการไม่สำเร็จ')
    } finally {
      setItemBusy(item.id, false)
    }
  }

  async function deleteItem(item: PurchaseReceiptItem) {
    if (item.review_status === 'posted') return
    if (!confirm(`ลบรายการ "${item.item_name_raw || item.id}" ?`)) return
    clearMessages()
    setItemBusy(item.id, true)
    try {
    const res = await fetchWithTimeout(`/api/receipts/${receipt.id}/items/${item.id}`, { method: 'DELETE' }, 30000)
    const json = await readApiJson(res)
    if (!res.ok) {
      setError(json.error ?? 'ลบรายการไม่สำเร็จ')
      return
    }
    setItems((current) => current.filter((row) => row.id !== item.id))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ลบรายการไม่สำเร็จ')
    } finally {
      setItemBusy(item.id, false)
    }
  }

  async function uploadReceiptFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingFile(true)
    clearMessages()
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/receipts/${receipt.id}/file`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) {
        setDuplicateReceipt(getReceiptDuplicateNotice(json))
        setError(json.error ?? 'แนบไฟล์สลิปไม่สำเร็จ')
        return
      }
      setReceipt(json.data)
      setHeader(toHeaderForm(json.data))
      setMessage('แนบไฟล์สลิปแล้ว สามารถกดอ่านสลิปด้วย AI ได้')
    } finally {
      setUploadingFile(false)
    }
  }

  async function readReceiptWithAi(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    if (isPosted || readingAi || !hasReceiptFile) return
    let replaceItems = false
    if (items.length > 0) {
      replaceItems = confirm('สลิปนี้มีรายการอยู่แล้ว ต้องการแทนที่ด้วยผลจาก AI หรือไม่')
      if (!replaceItems) return
    }

    setAiElapsedSeconds(0)
    setReadingAi(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replaceItems }),
      })
      const json = await res.json()
      if (!res.ok) {
        setDuplicateReceipt(getReceiptDuplicateNotice(json))
        setError(json.error ?? 'อ่านสลิปไม่สำเร็จ กรุณากรอกข้อมูลเองหรือลองใหม่')
        return
      }
      setReceipt(json.data.receipt)
      setHeader(toHeaderForm(json.data.receipt))
      setItems(json.data.items ?? [])
      const warningCount = json.data.extraction?.warnings?.length ?? 0
      setMessage(
        warningCount > 0
          ? 'ระบบอ่านข้อมูลได้บางส่วน กรุณาตรวจสอบอีกครั้ง'
          : 'อ่านสลิปสำเร็จ กรุณาตรวจสอบข้อมูลก่อนบันทึก',
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ติดต่อ AI ไม่สำเร็จ กรุณาโหลดสลิปใหม่เพื่อตรวจสถานะก่อนลองอีกครั้ง')
    } finally {
      setReadingAi(false)
    }
  }

  async function checkAiConnection() {
    if (checkingAi || readingAi) return
    setCheckingAi(true)
    setAiHealth(null)
    try {
      const res = await fetch('/api/receipts/ai-health', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'ตรวจ AI ไม่สำเร็จ')
      const labels: Record<string, string> = { available: 'พร้อมใช้', quota_exceeded: 'โควตาเต็ม', unavailable: 'ไม่พบรุ่นนี้', failed: 'เรียกไม่สำเร็จ', timeout_or_network: 'รอเกินเวลาหรือเครือข่ายขัดข้อง', not_checked: 'ยังไม่ได้ตรวจ' }
      setAiHealth(json.data.map((result: { model: string; status: string }) => `${result.model}: ${labels[result.status] || result.status}`).join('\n'))
    } catch (error) {
      setAiHealth(error instanceof Error ? error.message : 'ตรวจ AI ไม่สำเร็จ')
    } finally {
      setCheckingAi(false)
    }
  }

  async function fillMissingUoms() {
    if (isPosted || fillingUoms) return
    setFillingUoms(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/items/autofill-uom`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'เติมหน่วยอัตโนมัติไม่สำเร็จ')
        return
      }
      setItems(json.data.items ?? [])
      setMessage(`เติมหน่วยแล้ว ${json.data.filled ?? 0} รายการ, ยังต้องตรวจสอบ ${json.data.unresolved ?? 0} รายการ`)
    } finally {
      setFillingUoms(false)
    }
  }

  async function autoMatchMaterials() {
    if (isPosted || matchingMaterials) return
    if (!supplierConfirmed) {
      setError('กรุณายืนยันร้านค้าและบันทึก Draft ก่อนจับคู่วัสดุ')
      return
    }
    setMatchingMaterials(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/items/auto-match-materials`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'จับคู่วัสดุอัตโนมัติไม่สำเร็จ')
        return
      }
      setItems(json.data.items ?? [])
      setMessage(`เลือกให้อัตโนมัติ ${json.data.autoSelected ?? 0} รายการ, ต้องตรวจสอบ ${json.data.suggested ?? 0} รายการ, ไม่พบวัสดุ ${json.data.notFound ?? 0} รายการ`)
    } finally {
      setMatchingMaterials(false)
    }
  }

  async function createMaterialCandidates(itemIds?: string[]) {
    if (isPosted || creatingCandidates) return
    if (!supplierConfirmed) {
      setError('กรุณายืนยันร้านค้าและบันทึก Draft ก่อนสร้าง Draft วัสดุ')
      return
    }
    setCreatingCandidates(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/material-candidates/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemIds?.length ? { itemIds } : {}),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'สร้าง Draft วัสดุไม่สำเร็จ')
        return
      }
      setItems(json.data.items ?? [])
      setMessage(`สร้าง Draft วัสดุแล้ว ${json.data.created ?? 0} รายการ, ข้าม ${json.data.skipped ?? 0} รายการ`)
    } finally {
      setCreatingCandidates(false)
    }
  }

  async function repairReceiptState() {
    if (isPosted || repairingReceipt) return
    if (!confirm('ต้องการซ่อมสถานะสลิปนี้หรือไม่? ระบบจะปรับสถานะรายการที่ค้างให้ถูกต้อง แต่จะไม่บันทึกราคาและไม่สร้างวัสดุใหม่อัตโนมัติ')) return

    setRepairingReceipt(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/repair-state`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'ซ่อมสถานะไม่สำเร็จ')
        return
      }

      const fixedCount = json.data?.summary?.fixedCount ?? 0
      const warnings = json.data?.summary?.warnings ?? []
      if (json.data?.receipt) {
        setReceipt(json.data.receipt)
        setHeader(toHeaderForm(json.data.receipt))
      }
      setItems(json.data?.items ?? [])
      setMessage(`ซ่อมสถานะสลิปแล้ว ${fixedCount} จุด`)
      if (Array.isArray(warnings) && warnings.length > 0) {
        setWarning(warnings.slice(0, 3).join(', '))
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'ซ่อมสถานะไม่สำเร็จ')
    } finally {
      setRepairingReceipt(false)
    }
  }

  async function saveCandidateDraft(nextDraft: ReceiptMaterialCandidate) {
    setApprovingCandidate(true)
    setCandidateNeedsConfirm(false)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/material-candidates/${nextDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toCandidatePayload(nextDraft)),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'บันทึก Draft วัสดุไม่สำเร็จ')
        return
      }
      setCandidateDraft(json.data)
      setItems((current) => current.map((item) => (
        item.id === json.data.receipt_item_id ? { ...item, material_candidate: json.data, material_candidate_id: json.data.id } : item
      )))
      setMessage('บันทึก Draft วัสดุแล้ว')
    } finally {
      setApprovingCandidate(false)
    }
  }

  async function approveCandidateDraft(nextDraft: ReceiptMaterialCandidate, confirmDuplicate = false) {
    setApprovingCandidate(true)
    setCandidateApproveStage('กำลังสร้างวัสดุและเชื่อมกับรายการสลิป...')
    clearMessages()
    try {
      const res = await fetchWithTimeout(`/api/receipts/${receipt.id}/material-candidates/${nextDraft.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toCandidatePayload(nextDraft), confirmDuplicate, expected_supplier_id: receipt.supplier_id }),
      }, 60000)
      const json = await readApiJson(res)
      if (!res.ok) {
        if (json.code === 'DUPLICATE' && json.details?.requiresConfirmation) {
          setCandidateDraft((current) => current ? { ...current, duplicate_warning: json.details.duplicateWarning } : current)
          setCandidateNeedsConfirm(true)
          setWarning(json.error ?? 'พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่')
          return
        }
        setError(json.error ?? 'อนุมัติและสร้างวัสดุไม่สำเร็จ')
        return
      }
      if (!json.data?.items) {
        setError('อนุมัติแล้วแต่ระบบไม่ส่งรายการสลิปกลับ กรุณารีเฟรชหน้านี้เพื่อตรวจสอบผล')
        return
      }
      setItems(json.data.items ?? [])
      setCandidateDraft(null)
      setCandidateNeedsConfirm(false)
      const materialCode = json.data.result?.material_code ?? json.data.material?.material_code
      setMessage(materialCode ? `สร้างวัสดุสำเร็จ: ${materialCode}` : 'สร้างวัสดุสำเร็จ')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'อนุมัติและสร้างวัสดุไม่สำเร็จ')
    } finally {
      setCandidateApproveStage(null)
      setApprovingCandidate(false)
    }
  }

  async function postReceipt() {
    if (postBlockers.length > 0 || isPosted) return
    if (!confirm('บันทึกราคาเข้าระบบ Material Master จากสลิปนี้?')) return
    setPosting(true)
    clearMessages()
    try {
      await ensureHeaderSavedBeforePosting()
      const res = await fetch(`/api/receipts/${receipt.id}/post`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'บันทึกราคาเข้าระบบไม่สำเร็จ')
        return
      }
      setReceipt(json.data.receipt)
      setItems(json.data.items)
      const postedCount = json.data.result?.posted_count ?? json.data.result?.inserted_prices ?? 0
      const skippedCount = json.data.result?.skipped_count ?? 0
      setMessage(`บันทึกราคาเข้าระบบแล้ว ${postedCount} รายการ${skippedCount > 0 ? `, ข้าม ${skippedCount} รายการ เพราะข้อมูลยังไม่ครบ` : ''}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึกราคาเข้าระบบไม่สำเร็จ')
    } finally {
      setPosting(false)
    }
  }

  async function postReadyItems() {
    if (readiness.ready === 0 || isPosted || postingReady) return
    if (!confirm(`ต้องการบันทึกราคาจำนวน ${readiness.ready} รายการเข้าระบบหรือไม่?`)) return
    setPostingReady(true)
    clearMessages()
    try {
      await ensureHeaderSavedBeforePosting()
      const res = await fetch(`/api/receipts/${receipt.id}/post-ready-items`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'บันทึกราคาที่พร้อมไม่สำเร็จ')
        return
      }

      const result = json.data.result ?? {}
      setReceipt(json.data.receipt)
      setItems(json.data.items ?? [])
      const postedCount = result.posted_count ?? result.postedCount ?? 0
      const skippedCount = result.skipped_count ?? result.skippedCount ?? 0
      const skippedReasons = Array.isArray(result.skipped_reasons) ? result.skipped_reasons : []
      const firstReason = skippedReasons[0]?.reason ? ` (${skippedReasons[0].reason})` : ''
      setMessage(`บันทึกสำเร็จ ${postedCount} รายการ${skippedCount > 0 ? `, ข้าม ${skippedCount} รายการ เพราะข้อมูลยังไม่ครบ${firstReason}` : ''}`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึกราคาที่พร้อมไม่สำเร็จ')
    } finally {
      setPostingReady(false)
    }
  }

  return (
    <div className={`${styles.workflow} space-y-5`}>
      <nav aria-label="ขั้นตอนตรวจสลิป" className="rounded-2xl border border-slate-200 bg-white p-4">
        <ol className="grid grid-cols-3 gap-2 text-sm font-semibold">
          {['ยืนยันร้าน', 'ตรวจรายการ', 'บันทึกราคา'].map((label, index) => (
            <li key={label} aria-current={!isPosted && currentStep === index + 1 ? 'step' : undefined}>
              <a href={['#receipt-shop', '#receipt-items', '#receipt-post'][index]} className={`block rounded-xl px-3 py-3 ${isPosted || currentStep > index + 1 ? 'bg-emerald-50 text-emerald-800' : currentStep === index + 1 ? 'bg-blue-50 text-blue-900' : 'text-slate-500'}`}>
                {index + 1}. {label}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-600">{isPosted ? 'บันทึกราคาแล้ว' : currentStep === 1 ? 'เริ่มจากเลือกร้านให้ตรงกับเอกสาร แล้วกดยืนยันร้าน' : currentStep === 2 ? 'ตรวจชื่อวัสดุ จำนวน หน่วย และราคาให้ครบก่อนบันทึก' : 'ตรวจครบแล้ว กดบันทึกราคาเข้าระบบได้เลย'}</p>
      </nav>
      {(message || warning || error || duplicateReceipt) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
          error
            ? 'border-red-200 bg-red-50 text-red-700'
            : warning
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          <p>{error || warning || message}</p>
          {duplicateReceipt && routes.receipts.detail(duplicateReceipt.id) && (
            <Link href={routes.receipts.detail(duplicateReceipt.id)!} className="mt-2 inline-flex font-bold underline">
              เปิดสลิปเดิม{duplicateReceipt.receiptNo ? ` เลขที่ ${duplicateReceipt.receiptNo}` : ''}
            </Link>
          )}
        </div>
      )}

      <section id="receipt-shop" className="scroll-mt-24 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-blue-950">ข้อมูลหัวสลิป</h2>
              <p className="text-sm text-slate-500">กรอกข้อมูลจากสลิปก่อนตรวจรายการ</p>
            </div>
            <ReceiptStatusBadge status={receipt.status} />
          </div>

          {!isPosted && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="font-bold text-blue-950">ร้านค้าที่อาจตรงกับสลิป</h3>
              <p className="mt-1 text-xs text-slate-600">ตรวจว่าเป็นผู้ขายในเอกสาร เลือกร้าน แล้วกดยืนยันร้านและบันทึก Draft ระบบจะไม่เลือกร้านให้เอง</p>
              {supplierMatches.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {supplierMatches.map(({ supplier, reasons, conflicts }) => (
                    <li key={supplier.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-blue-950">{supplier.supplier_name_th} ({supplier.supplier_code || supplier.supplier_id})</p>
                          <p className="mt-1 text-xs text-slate-600">เลขผู้เสียภาษี: {supplier.tax_id || '-'} / โทร: {supplier.phone || '-'}</p>
                          <p className="mt-1 text-xs text-blue-700">{reasons.join(' · ')}</p>
                          {conflicts.map((conflict) => <p key={conflict} className="mt-1 text-xs font-semibold text-amber-800">{conflict}</p>)}
                        </div>
                        <button
                          type="button"
                          disabled={supplierSelectionLocked || header.supplier_id === supplier.id}
                          onClick={() => setHeaderField('supplier_id', supplier.id)}
                          aria-label={`เลือกร้าน ${supplier.supplier_name_th} (${supplier.supplier_code || supplier.supplier_id})`}
                          className="btn-secondary text-xs"
                        >
                          {header.supplier_id === supplier.id ? (supplierConfirmed ? 'ยืนยันแล้ว' : 'เลือกแล้ว รอยืนยัน') : 'เลือกร้านนี้'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-600">ยังไม่พบร้านที่ตรงจากข้อมูลนี้ กรุณาตรวจข้อความจากสลิปหรือเลือกร้านเองด้านล่าง</p>
              )}
              <button type="button" disabled={supplierSelectionLocked} className="btn-secondary mt-3" onClick={() => setNewSupplierDraft(getReceiptSupplierDraft({
                ...receipt, supplier_name_raw: header.supplier_name_raw, supplier_tax_id_raw: header.supplier_tax_id_raw,
              }))}>สร้างร้านใหม่จากสลิป</button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Supplier">
              <select aria-label="ร้านค้าของสลิป" disabled={supplierSelectionLocked} value={header.supplier_id} onChange={(e) => setHeaderField('supplier_id', e.target.value)} className={inputClass}>
                <option value="">- เลือกซัพพลายเออร์ -</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name_th} ({supplier.supplier_code || supplier.supplier_id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ชื่อ Supplier จากสลิป">
              <input aria-label="ชื่อผู้ขายจากสลิป" disabled={supplierSelectionLocked} value={header.supplier_name_raw} onChange={(e) => setHeaderField('supplier_name_raw', e.target.value)} className={inputClass} />
            </Field>
            <Field label="วันที่สลิป">
              <input disabled={isPosted} type="date" value={header.receipt_date} onChange={(e) => setHeaderField('receipt_date', e.target.value)} className={inputClass} />
            </Field>
            <Field label="เลขที่เอกสาร">
              <input disabled={isPosted} value={header.receipt_no} onChange={(e) => setHeaderField('receipt_no', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Tax ID จากสลิป">
              <input aria-label="เลขผู้เสียภาษีผู้ขายจากสลิป" disabled={supplierSelectionLocked} value={header.supplier_tax_id_raw} onChange={(e) => setHeaderField('supplier_tax_id_raw', e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field label="Subtotal">
              <input disabled={isPosted} type="number" step="0.01" value={header.subtotal} onChange={(e) => setHeaderField('subtotal', e.target.value)} className={inputClass} />
            </Field>
            <Field label="VAT">
              <input disabled={isPosted} type="number" step="0.01" value={header.vat} onChange={(e) => setHeaderField('vat', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Discount">
              <input disabled={isPosted} type="number" step="0.01" value={header.discount} onChange={(e) => setHeaderField('discount', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Grand total">
              <input disabled={isPosted} type="number" step="0.01" value={header.grand_total} onChange={(e) => setHeaderField('grand_total', e.target.value)} className={inputClass} />
            </Field>
          </div>

          <details className={`${styles.disclosure} mt-4`}>
            <summary>หมายเหตุเพิ่มเติม{header.notes ? ' · มีข้อมูล' : ''}</summary>
            <div className="pt-3">
            <Field label="Notes">
              <textarea aria-label="Notes" disabled={isPosted} rows={3} value={header.notes} onChange={(e) => setHeaderField('notes', e.target.value)} className={inputClass} />
            </Field>
            </div>
          </details>

          <div className="mt-5 flex justify-end">
            <button disabled={supplierSelectionLocked} type="button" onClick={saveHeader} className="btn-secondary">
              {savingHeader ? 'กำลังบันทึก...' : !supplierConfirmed && header.supplier_id ? 'ยืนยันร้านและบันทึก Draft' : 'บันทึก Draft'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-blue-950">ไฟล์สลิป</h3>
                <p className="mt-1 text-xs text-slate-500">รองรับ JPG, PNG, PDF ขนาดไม่เกิน 10 MB</p>
              </div>
              {!isPosted && (
                <label className={`inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${uploadingFile ? 'pointer-events-none opacity-50' : ''}`}>
                  {uploadingFile ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="sr-only"
                    onChange={uploadReceiptFile}
                    disabled={uploadingFile}
                  />
                </label>
              )}
            </div>
            {receipt.file_name ? (
              <a href={`/api/receipts/${receipt.id}/file`} target="_blank" rel="noreferrer" className="mt-3 block truncate text-sm font-semibold text-blue-700 underline">
                {receipt.file_name}
              </a>
            ) : (
              <p className="mt-2 text-sm text-slate-400">ยังไม่ได้แนบไฟล์</p>
            )}
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">อ่านสลิปด้วย AI</h3>
                <p className="mt-2 text-sm leading-6">
                  ให้ระบบช่วยอ่านข้อมูลจากสลิป แล้วเติมข้อมูลลง Draft เพื่อให้ตรวจสอบก่อนบันทึกราคา
                </p>
              </div>
              <button
                type="button"
                onClick={readReceiptWithAi}
                disabled={isPosted || readingAi || !hasReceiptFile}
                className="btn-primary"
              >
                {readingAi ? 'กำลังอ่านสลิปด้วย AI...' : 'อ่านสลิปด้วย AI อีกครั้ง'}
              </button>
            </div>
            {readingAi && (
              <div role="status" aria-live="polite" className="mt-3 rounded-xl bg-white p-3 text-sm">
                <p>{aiElapsedSeconds < 30 ? 'กำลังส่งเอกสารและรอผลจาก AI' : aiElapsedSeconds < 90 ? 'ยังรอผลจาก AI ระบบอาจลองโมเดลสำรองเมื่อรุ่นแรกไม่พร้อม' : 'หากอ่านสำเร็จ ระบบจะตรวจผลและบันทึกข้อมูลฉบับร่าง กรุณารอสถานะตอบกลับ'}</p>
                <p role="timer" aria-live="off" className="mt-1 tabular-nums">รอแล้ว {aiElapsedSeconds} วินาที</p>
                <p className="mt-1 text-xs">จำกัดเวลาลองโมเดลรวม 90 วินาที ไม่รวมรับส่งไฟล์และบันทึกผล</p>
              </div>
            )}
            {!hasReceiptFile && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                กรุณาแนบไฟล์สลิปก่อนอ่านด้วย AI
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-blue-800">
              AI เติมข้อมูลให้เท่านั้น ยังต้องตรวจรายการ เลือกวัสดุ และกดบันทึกราคาเข้าระบบด้วยตัวเอง
            </p>
            {!hasAiExtraction && items.length === 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                ยังไม่มีข้อมูลจาก AI กรุณากรอกข้อมูลหัวสลิปและรายการเอง
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-blue-950">สถานะก่อนบันทึก</h3>
            <div className={`mt-3 rounded-xl border px-4 py-3 ${receiptFlowStatus.className}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">สถานะสลิปตอนนี้</p>
                  <p className="mt-1 text-sm font-bold">{receiptFlowStatus.label}</p>
                  <p className="mt-1 text-xs font-semibold opacity-80">{receiptFlowStatus.helper}</p>
                </div>
                {receiptFlowStatus.nextSteps.length > 0 && (
                  <ol className="min-w-[220px] space-y-1 text-xs font-semibold">
                    {receiptFlowStatus.nextSteps.slice(0, 4).map((step, index) => (
                      <li key={step} className="flex gap-2">
                        <span>{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
            {postBlockers.length === 0 ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">พร้อมบันทึกราคาเข้าระบบ</p>
            ) : (
              <details className="mt-2 text-sm text-amber-700">
                <summary className="cursor-pointer">ดูสิ่งที่ต้องตรวจ ({postBlockers.length})</summary>
                <ul className="mt-2 space-y-1">
                {postBlockers.slice(0, 6).map((blocker) => (
                  <li key={blocker}>- {blocker}</li>
                ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">ตรวจชื่อ จำนวน และราคา เทียบกับเอกสารต้นฉบับ</p>
        <button type="button" className="btn-secondary" aria-expanded={showPreview} aria-controls="receipt-original-preview" onClick={() => setShowPreview((current) => !current)}>
          {showPreview ? 'ซ่อนเอกสารต้นฉบับ' : 'แสดงเอกสารต้นฉบับ'}
        </button>
      </div>
      <section className={`${styles.reviewLayout} ${showPreview ? styles.withPreview : ''}`}>
        <div id="receipt-original-preview" hidden={!showPreview} className={styles.previewColumn}>
          <ReceiptFilePreview receipt={receipt} />
        </div>

        <section id="receipt-items" className={`${styles.itemsPanel} scroll-mt-24 min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-blue-950">รายการจากสลิป <span className="text-sm font-medium text-slate-500">({items.length})</span></h2>
            <p className="text-sm text-slate-500">ตรวจวัสดุ จำนวน หน่วย และราคาตามเอกสาร</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!isPosted && (
              <button disabled={!supplierConfirmed || readingAi || savingHeader || matchingMaterials || fillingUoms || posting || postingReady || repairingReceipt} type="button" onClick={autoMatchMaterials} className="btn-secondary">
                {matchingMaterials ? 'กำลังจับคู่วัสดุ...' : 'จับคู่วัสดุอัตโนมัติ'}
              </button>
            )}
            {!isPosted && <details className="rounded-xl border border-slate-200 p-2">
              <summary className="cursor-pointer px-2 py-1 text-sm font-semibold">เครื่องมือเพิ่มเติม</summary>
              <div className="mt-3 flex max-w-sm flex-col gap-2">
              <button type="button" onClick={checkAiConnection} disabled={checkingAi || readingAi} className="btn-secondary">{checkingAi ? 'กำลังตรวจ AI...' : 'ตรวจการเชื่อมต่อ AI'}</button>
              <p className="text-xs text-slate-500">ส่งข้อความทดสอบสั้น ๆ ใช้โควตา AI เล็กน้อย</p>
              {aiHealth && <p role="status" className="whitespace-pre-line text-xs text-slate-700">{aiHealth}</p>}
              <button disabled={!supplierConfirmed || readingAi || savingHeader || creatingCandidates || matchingMaterials || fillingUoms || posting || postingReady || repairingReceipt} type="button" onClick={() => createMaterialCandidates()} className="btn-secondary">
                {creatingCandidates ? 'กำลังสร้าง Draft วัสดุ...' : 'สร้าง Draft วัสดุจากรายการที่ไม่พบ'}
              </button>
              <button disabled={repairingReceipt || fillingUoms || matchingMaterials || posting || postingReady} type="button" onClick={repairReceiptState} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {repairingReceipt ? 'กำลังซ่อมสถานะ...' : 'ซ่อมสถานะสลิปนี้'}
              </button>
              <button disabled={fillingUoms || matchingMaterials || posting || postingReady || repairingReceipt} type="button" onClick={fillMissingUoms} className="btn-secondary">
                {fillingUoms ? 'กำลังเติมหน่วย...' : 'เติมหน่วยอัตโนมัติ'}
              </button>
              <button disabled={postingReady || posting || matchingMaterials || repairingReceipt || savingHeader || readiness.ready === 0 || !effectiveSupplierId || receiptCalculation.issues.length > 0} type="button" onClick={postReadyItems} className="btn-primary">
                {postingReady ? 'กำลังบันทึก...' : `บันทึกราคาที่พร้อมทั้งหมด (${readiness.ready})`}
              </button>
              </div>
            </details>}
            <button id="receipt-post" disabled={isPosted || posting || postingReady || matchingMaterials || repairingReceipt || savingHeader || postBlockers.length > 0} type="button" onClick={postReceipt} className="btn-primary scroll-mt-24">
              {posting ? 'กำลังบันทึกราคา...' : isPosted ? 'สลิปนี้ถูกบันทึกเข้าระบบแล้ว' : 'บันทึกราคาเข้าระบบ'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 text-xs font-bold text-slate-700 md:grid-cols-4 xl:grid-cols-7">
          <SummaryPill label="พร้อมบันทึก" value={readiness.ready} tone="green" />
          <SummaryPill label="ยังไม่ผูกวัสดุ" value={readiness.missingMaterial} tone="red" />
          <SummaryPill label="รอสร้างวัสดุ" value={readiness.createMaterialNeeded} tone="amber" />
          <SummaryPill label="ไม่มีหน่วย" value={readiness.missingUom} tone="red" />
          <SummaryPill label="ไม่มีราคา" value={readiness.missingPrice} tone="red" />
          <SummaryPill label="ต้องตรวจสอบ" value={readiness.needsReview} tone="amber" />
          <SummaryPill label="จบแล้ว/ข้าม" value={readiness.posted + readiness.ignored} tone="slate" />
        </div>

        <ReceiptCalculationPanel result={receiptCalculation} />

        {!isPosted && !supplierConfirmed && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-semibold">กรุณายืนยันร้านค้าและบันทึก Draft ก่อนจับคู่วัสดุ</p>
            <p className="mt-1 text-xs leading-5">เลือกร้านในข้อมูลหัวสลิป แล้วกดยืนยันร้านและบันทึก Draft จากนั้นค้นหาวัสดุของร้าน หากไม่พบจึงเลือกจากคลังกลางหรือสร้างวัสดุใหม่</p>
          </div>
        )}

        {!isPosted && (
          <details className={`${styles.disclosure} border-b border-slate-100 p-5`} open={items.length === 0}>
            <summary>เพิ่มรายการจากสลิปด้วยตัวเอง</summary>
            <div className={`${styles.itemFields} pt-4`}>
            <Field label="รายการจากสลิป">
            <input placeholder="รายการจากสลิป" value={newItem.item_name_raw} onChange={(e) => setNewItem((current) => ({ ...current, item_name_raw: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="จำนวน">
            <input placeholder="จำนวน" type="number" step="0.0001" value={newItem.qty} onChange={(e) => setNewItem((current) => ({ ...current, qty: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="หน่วย">
            <select value={newItem.uom_id} onChange={(e) => {
              const selected = uoms.find((uom) => uom.id === e.target.value)
              setNewItem((current) => ({ ...current, uom_id: e.target.value, uom_raw: selected?.uom_code ?? current.uom_raw }))
            }} className={inputClass}>
              <option value="">หน่วย</option>
              {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code}</option>)}
            </select>
            </Field>
            <Field label="ราคา/หน่วย">
            <input placeholder="ราคา/หน่วย" type="number" step="0.0001" value={newItem.unit_price} onChange={(e) => setNewItem((current) => ({ ...current, unit_price: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="รวม">
            <input placeholder="รวม" type="number" step="0.01" value={newItem.line_total} onChange={(e) => setNewItem((current) => ({ ...current, line_total: e.target.value }))} className={inputClass} />
            </Field>
            </div>
            <div className="mt-3 flex justify-end">
            <button type="button" onClick={addItem} disabled={addingItem || !newItem.item_name_raw.trim()} className="btn-secondary whitespace-nowrap">
              {addingItem ? 'กำลังเพิ่ม...' : '+ เพิ่มรายการ'}
            </button>
            </div>
          </details>
        )}

        <div className={styles.itemList}>
              {items.length === 0 && (
                <p className="px-6 py-14 text-center text-sm text-slate-500">
                    ยังไม่พบรายการ
                </p>
              )}
              {items.map((item, index) => {
                const rowLocked = isPosted || item.review_status === 'posted'
                const rowBusy = savingItemIds.has(item.id)
                const readinessDetail = getReceiptItemReadiness(item, effectiveSupplierId)
                const pendingMaterialDraft = hasPendingMaterialDraft(item)
                const materialFlow = getReceiptItemMaterialFlow(item)
                const actionValue = getReceiptItemAction(item)
                const calculationIssue = itemCalculationIssues.get(item.id)
                return (
                <article key={item.id} aria-label={`รายการ ${item.line_no ?? index + 1}: ${item.item_name_raw || 'ยังไม่มีชื่อ'}`} className={`${styles.itemRow} ${calculationIssue ? styles.itemIssue : ''}`} aria-busy={rowBusy}>
                  <div className={styles.itemHeading}>
                    <span>รายการ {item.line_no ?? index + 1}</span>
                    {rowLocked && <span>ล็อกการแก้ไข</span>}
                  </div>
                  <div className={styles.itemFields}>
                  <Field label="รายการจากสลิป">
                    <input disabled={rowLocked || rowBusy} value={item.item_name_raw ?? ''} onChange={(e) => setItemField(item.id, 'item_name_raw', e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="จำนวน">
                    <input disabled={rowLocked || rowBusy} type="number" step="0.0001" value={item.qty ?? ''} onChange={(e) => setItemField(item.id, 'qty', e.target.value === '' ? null : Number(e.target.value))} className={inputClass} />
                  </Field>
                  <Field label="หน่วย">
                    <div className="space-y-1">
                      <select aria-label="หน่วย" disabled={rowLocked || rowBusy} value={item.uom_id ?? ''} onChange={(e) => setItemUom(item.id, e.target.value)} className={inputClass}>
                        <option value="">-</option>
                        {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code}</option>)}
                      </select>
                      <p className={`text-[11px] font-semibold ${item.uom_id ? 'text-slate-500' : 'text-amber-600'}`}>
                        {getUomHelperText(item)}
                      </p>
                    </div>
                  </Field>
                  <Field label="ราคา/หน่วย">
                    <input disabled={rowLocked || rowBusy} type="number" step="0.0001" value={item.unit_price ?? ''} onChange={(e) => setItemField(item.id, 'unit_price', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                  </Field>
                  <Field label="รวม">
                    <input aria-label="รวม" disabled={rowLocked || rowBusy} type="number" step="0.01" value={item.line_total ?? ''} onChange={(e) => setItemField(item.id, 'line_total', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                    {calculationIssue && (
                      <p className="mt-1 text-xs font-semibold leading-5 text-amber-700">
                        {calculationIssue.message}
                      </p>
                    )}
                  </Field>
                  </div>
                  <div className={styles.itemSecondary}>
                  <div className={styles.materialCell}>
                    <p className={styles.fieldCaption}>วัสดุที่เลือก</p>
                    <MaterialPicker
                      key={`${item.id}:${receipt.supplier_id}`}
                      receiptId={receipt.id}
                      supplierId={receipt.supplier_id}
                      item={item}
                      disabled={rowLocked || rowBusy || !supplierConfirmed}
                      onReviewCandidate={(candidate) => {
                        setCandidateDraft(candidate)
                        setCandidateNeedsConfirm(false)
                      }}
                      onCreateCandidate={() => createMaterialCandidates([item.id])}
                      onSelect={(candidate, confirmLink = false) => saveItem(item, {
                        ...buildMaterialSelectionPatch(item, candidate),
                        material_id: candidate.id,
                        material_candidate_id: null,
                        material_resolution_status: 'matched_existing',
                        match_confidence: 100,
                        action: !item.action || item.action === 'needs_review' || item.action === 'create_material_needed' ? 'update_price' : item.action,
                      } as any, confirmLink)}
                      onCreateMaterialNeeded={() => saveItem(item, {
                        action: 'create_material_needed',
                        material_resolution_status: 'create_material_needed',
                      } as any)}
                      onIgnore={() => saveItem(item, { action: 'ignore' } as any)}
                    />
                    <p className={`mt-2 text-[11px] font-bold ${materialFlow.className}`}>
                      {materialFlow.label}
                    </p>
                  </div>
                  <Field label="Action">
                    <select aria-label="Action" disabled={rowLocked || rowBusy || pendingMaterialDraft} value={actionValue} onChange={(e) => setItemField(item.id, 'action', e.target.value as ReceiptItemAction)} className={inputClass}>
                      {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {pendingMaterialDraft && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        ต้องอนุมัติ Draft วัสดุก่อนอัปเดตราคา
                      </p>
                    )}
                  </Field>
                  <div>
                    <p className={styles.fieldCaption}>สถานะตรวจสอบ</p>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${readinessDetail.className}`}>
                      {readinessDetail.label}
                    </span>
                    {readinessDetail.helper && (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{readinessDetail.helper}</p>
                    )}
                    {readinessDetail.nextAction && (
                      <p className="mt-1 text-[11px] font-bold text-blue-700">ถัดไป: {readinessDetail.nextAction}</p>
                    )}
                  </div>
                  </div>
                    <div className={styles.itemActions}>
                      {!rowLocked && (
                        <>
                          <button type="button" onClick={() => saveItem(item)} disabled={rowBusy} className="btn-secondary">
                            {rowBusy ? 'กำลังบันทึก...' : 'บันทึก'}
                          </button>
                          <button type="button" onClick={() => deleteItem(item)} disabled={rowBusy} className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                </article>
                )
              })}
        </div>
        </section>
      </section>

      {newSupplierDraft && (
        <dialog ref={supplierDialog} aria-labelledby="new-receipt-supplier-title" onCancel={(event) => event.preventDefault()} className="max-h-[90vh] w-[min(48rem,95vw)] rounded-2xl border border-slate-200 p-0 backdrop:bg-slate-950/40">
          <h2 id="new-receipt-supplier-title" className="px-6 pt-6 text-lg font-bold text-blue-950">สร้างร้านใหม่จากสลิป</h2>
          <SupplierForm mode="create" receiptContext={{
            receiptId: receipt.id,
            initialValues: newSupplierDraft,
            onCreated: (supplier) => selectCreatedOrExistingSupplier(supplier, true),
            onUseExisting: (supplier) => selectCreatedOrExistingSupplier(supplier, false),
            onCancel: () => setNewSupplierDraft(null),
          }} />
        </dialog>
      )}

      {candidateDraft && (
        <CandidateReviewModal
          candidate={candidateDraft}
          categories={categories}
          materialTypes={materialTypes}
          uoms={uoms}
          saving={approvingCandidate}
          savingText={candidateApproveStage}
          error={error}
          needsConfirm={candidateNeedsConfirm}
          onChange={(nextDraft) => {
            setCandidateDraft(nextDraft)
            setCandidateNeedsConfirm(false)
          }}
          onSave={() => saveCandidateDraft(candidateDraft)}
          onApprove={(confirmDuplicate) => approveCandidateDraft(candidateDraft, confirmDuplicate)}
          onClose={() => {
            if (!approvingCandidate) {
              setCandidateDraft(null)
              setCandidateNeedsConfirm(false)
            }
          }}
        />
      )}

      <div className="flex justify-between">
        <Link href="/receipts" className="btn-secondary">กลับรายการสลิป</Link>
      </div>
    </div>
  )
}

function ReceiptFilePreview({ receipt }: { receipt: PurchaseReceipt }) {
  const hasFile = Boolean(receipt.file_name || receipt.file_url || receipt.file_storage_path)
  const fileEndpoint = `/api/receipts/${encodeURIComponent(receipt.id)}/file`
  const fileIdentity = receipt.file_storage_path || receipt.file_url || receipt.file_name || receipt.id
  const fileName = receipt.file_name || 'ไฟล์สลิป'
  const isPdf = receipt.file_mime_type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-bold text-blue-950">เอกสารต้นฉบับ</h2>
          <p className="mt-1 truncate text-xs text-slate-500">{hasFile ? fileName : 'ยังไม่ได้แนบไฟล์'}</p>
        </div>
        {hasFile && (
          <a href={fileEndpoint} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-blue-700 underline">
            เปิดเต็มจอ
          </a>
        )}
      </div>

      <div className="flex min-h-80 items-center justify-center bg-slate-100 xl:h-[calc(100vh-11rem)] xl:max-h-[860px]">
        {!hasFile ? (
          <p className="px-6 text-center text-sm font-semibold text-slate-400">แนบรูปหรือ PDF เพื่อเปิดเทียบกับรายการ</p>
        ) : isPdf ? (
          <iframe
            key={fileIdentity}
            src={fileEndpoint}
            title={`เอกสารต้นฉบับ ${fileName}`}
            className="h-[70vh] min-h-[520px] w-full bg-white xl:h-full xl:min-h-0"
          />
        ) : (
          <img
            key={fileIdentity}
            src={fileEndpoint}
            alt={`เอกสารต้นฉบับ ${fileName}`}
            className="max-h-[70vh] w-full object-contain xl:max-h-full"
          />
        )}
      </div>
    </aside>
  )
}

function ReceiptCalculationPanel({ result }: { result: ReceiptCalculationResult }) {
  const hasIssues = result.issues.length > 0
  const hasCheckableData = result.checkedItemCount > 0 || result.itemTotal != null || result.expectedGrandTotal != null

  return (
    <div className={`border-b px-5 py-4 ${hasIssues ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50/70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-bold ${hasIssues ? 'text-amber-900' : 'text-blue-950'}`}>ตรวจความถูกต้องของยอด</h3>
          <p className={`mt-1 text-xs font-semibold ${hasIssues ? 'text-amber-700' : 'text-slate-500'}`}>
            {hasIssues
              ? `พบตัวเลขที่ต้องตรวจ ${result.issues.length} จุด`
              : hasCheckableData
                ? 'จำนวน ราคา และยอดรวมที่มีข้อมูลสัมพันธ์กัน'
                : 'กรอกจำนวน ราคา/หน่วย และยอดรวมเพื่อให้ระบบช่วยตรวจ'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs">
          <span className="text-slate-500">รวมรายการ</span>
          <span className="font-bold text-blue-950">{formatReceiptMoney(result.itemTotal)}</span>
          <span className="text-slate-500">ยอดสุทธิที่ควรเป็น</span>
          <span className="font-bold text-blue-950">{formatReceiptMoney(result.expectedGrandTotal)}</span>
          <span className="text-slate-500">ตรวจสูตรรายบรรทัด</span>
          <span className="font-bold text-blue-950">{result.checkedItemCount}/{result.itemCount}</span>
        </div>
      </div>

      {hasIssues && (
        <ul className="mt-3 space-y-1 text-xs font-semibold leading-5 text-amber-800">
          {result.issues.slice(0, 8).map((issue) => (
            <li key={`${issue.code}:${issue.itemId ?? 'summary'}`}>- {issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CandidateReviewModal({
  candidate,
  categories,
  materialTypes,
  uoms,
  saving,
  savingText,
  error,
  needsConfirm,
  onChange,
  onSave,
  onApprove,
  onClose,
}: {
  candidate: ReceiptMaterialCandidate
  categories: ReceiptCategory[]
  materialTypes: ReceiptMaterialType[]
  uoms: ReceiptUom[]
  saving: boolean
  savingText?: string | null
  error: string | null
  needsConfirm: boolean
  onChange: (candidate: ReceiptMaterialCandidate) => void
  onSave: () => void
  onApprove: (confirmDuplicate: boolean) => void
  onClose: () => void
}) {
  const availableTypes = materialTypes.filter((type) => !candidate.proposed_category_id || type.category_id === candidate.proposed_category_id)
  const details = readSpecDetails(candidate.proposed_spec)
  const detailsError = specDetailError(details)
  const mappedProfile = resolveMaterialFormProfile(candidate.proposed_material_type_id, candidate.proposed_category_id, materialTypes, categories.map(category => ({ ...category, is_active: category.is_active === true }))).profile
  const profileNeedsReview = !!details.profile && details.profile !== mappedProfile
  function changeDetails(next: SpecDetails) {
    onChange({ ...candidate, proposed_spec: writeSpecDetails(next) })
  }
  const duplicateMatches = candidate.duplicate_warning?.matches ?? []
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorPanel = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (error) errorPanel.current?.focus()
  }, [error])

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  function set<K extends keyof ReceiptMaterialCandidate>(key: K, value: ReceiptMaterialCandidate[K]) {
    onChange({ ...candidate, [key]: value })
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="receipt-candidate-title" className={styles.candidateDialog} onCancel={(event) => {
      event.preventDefault()
      if (!saving) onClose()
    }}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 id="receipt-candidate-title" className="text-xl font-bold text-blue-950">ตรวจ Draft วัสดุ</h3>
            <p className="mt-1 text-sm text-slate-500">ระบบจะสร้างรหัสวัสดุให้อัตโนมัติหลังอนุมัติ และยังไม่บันทึกราคาในขั้นตอนนี้</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            ปิด
          </button>
        </div>

        {savingText && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            {savingText}
          </div>
        )}

        {error && <p ref={errorPanel} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {duplicateMatches.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-bold">พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่</p>
            <div className="mt-2 space-y-1">
              {duplicateMatches.map((match, index) => (
                <p key={`${match.material_id ?? index}`} className="text-xs">
                  {match.material_code || match.material_id || '-'} / {match.mat_name_th || '-'} {match.spec ? ` / ${match.spec}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="ชื่อวัสดุ (ไทย)">
            <input value={candidate.proposed_mat_name_th ?? ''} onChange={(e) => set('proposed_mat_name_th', e.target.value)} className={inputClass} />
          </Field>
          <Field label="ชื่อวัสดุ (อังกฤษ)">
            <input value={candidate.proposed_mat_name_en ?? ''} onChange={(e) => set('proposed_mat_name_en', e.target.value)} className={inputClass} />
          </Field>
          <Field label="หมวดหมู่">
            <select
              value={candidate.proposed_category_id ?? ''}
              onChange={(e) => onChange({ ...candidate, proposed_category_id: e.target.value || null, proposed_material_type_id: null })}
              className={inputClass}
            >
              <option value="">- เลือกหมวดหมู่ -</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  [{category.code_prefix || category.cat_code}] {category.cat_name_th}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ชนิดวัสดุ">
            <select value={candidate.proposed_material_type_id ?? ''} onChange={(e) => set('proposed_material_type_id', e.target.value || null)} className={inputClass}>
              <option value="">- ให้ระบบเดาจากชื่อ -</option>
              {availableTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  [{type.code_prefix}] {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Spec key ของรหัส">
            <input value={candidate.proposed_code_spec_key ?? ''} onChange={(e) => set('proposed_code_spec_key', e.target.value.toUpperCase())} className={inputClass} />
          </Field>
          <Field label="สเปกเดิม / หมายเหตุ">
            <textarea value={details.notes} onChange={(e) => changeDetails({ ...details, notes: e.target.value })} className={inputClass} />
          </Field>
          <Field label="แบรนด์">
            <input value={candidate.proposed_brand ?? ''} onChange={(e) => set('proposed_brand', e.target.value)} className={inputClass} />
          </Field>
          <Field label="รุ่น">
            <input value={candidate.proposed_model ?? ''} onChange={(e) => set('proposed_model', e.target.value)} className={inputClass} />
          </Field>
          <Field label="หน่วยนับ">
            <select value={candidate.proposed_uom_id ?? ''} onChange={(e) => {
              const selected = uoms.find((uom) => uom.id === e.target.value)
              onChange({ ...candidate, proposed_uom_id: e.target.value || null, proposed_uom_raw: selected?.uom_code ?? candidate.proposed_uom_raw })
            }} className={inputClass}>
              <option value="">- เลือกหน่วย -</option>
              {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code} - {uom.uom_name_th}</option>)}
            </select>
          </Field>
          <Field label="ราคาจากสลิป">
            <input disabled value={candidate.proposed_unit_price ?? ''} className={inputClass} />
          </Field>
        </div>

        <fieldset disabled={saving} className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
          <legend className="px-2 font-bold text-blue-950">รายละเอียดตามประเภท</legend>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="draft-spec-profile">ประเภทสำหรับเลือกช่องกรอก</label>
          <select id="draft-spec-profile" value={details.profile} className={inputClass} onChange={(e) => {
            if (Object.values(details.values).some(Boolean) && !window.confirm('เปลี่ยนประเภทจะล้างรายละเอียดเฉพาะประเภทเดิม ชื่อสินค้า สเปกเดิม ร้าน และราคายังคงอยู่ ต้องการเปลี่ยนหรือไม่?')) return
            changeDetails({ ...details, profile: e.target.value as SpecProfile, values: {} })
          }}>
            <option value="">ยังไม่ระบุ / ใช้สเปกเดิม</option>
            {Object.entries(SPEC_PROFILES).map(([key,profile]) => <option key={key} value={key}>{profile.label}</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-500">เลือกเองเมื่อไม่มั่นใจ ไม่เปลี่ยนหมวด ชนิด หรือรหัสวัสดุอัตโนมัติ ช่องที่ไม่ทราบเว้นว่างได้เพื่อเก็บ Draft</p>
          {!details.profile && mappedProfile && <button type="button" className="mt-2 text-sm font-semibold text-blue-700 underline" onClick={() => changeDetails({ ...details, profile: mappedProfile, values: {} })}>ใช้ชุดฟอร์ม{SPEC_PROFILES[mappedProfile].label}ตามชนิดวัสดุที่เลือก</button>}
          {details.profile && details.profile !== mappedProfile && <p className="mt-2 text-sm text-amber-800">ชุดฟอร์มยังไม่ตรงกับชนิดวัสดุที่ยืนยันได้ กรุณาตรวจหมวดและชนิดก่อนอนุมัติ (เก็บ Draft ได้)</p>}
          {details.profile && <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {SPEC_PROFILES[details.profile].fields.map((key,index) => <div key={key}>
              <label htmlFor={`draft-spec-${index}`} className="mb-1 block text-sm text-slate-700">{key}</label>
              <input id={`draft-spec-${index}`} value={details.values[key] ?? ''} inputMode={isNumericSpecField(key) ? 'decimal' : 'text'} className={inputClass} onChange={(e) => changeDetails({ ...details, values: { ...details.values, [key]: e.target.value } })} />
            </div>)}
          </div>}
          <p className="mt-3 text-xs text-slate-500">บันทึกไปกับสเปกวัสดุ • {(candidate.proposed_spec ?? '').length}/500 ตัวอักษร • ยังไม่ใช่ข้อมูลที่ AI แยกให้</p>
          {detailsError && <p role="alert" className="mt-2 text-sm text-red-700">{detailsError}</p>}
        </fieldset>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-bold text-slate-800">Alias จากสลิป</p>
          <p className="mt-1">{(candidate.proposed_aliases ?? []).join(', ') || '-'}</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onSave} disabled={saving || !!detailsError} className="btn-secondary">
            {saving ? 'กำลังบันทึก...' : 'บันทึก Draft'}
          </button>
          <button type="button" onClick={() => onApprove(false)} disabled={saving || !!detailsError || profileNeedsReview} className="btn-primary">
            {saving ? 'กำลังสร้างวัสดุ...' : 'อนุมัติและสร้างวัสดุ'}
          </button>
          {needsConfirm && (
            <button type="button" onClick={() => onApprove(true)} disabled={saving || !!detailsError || profileNeedsReview} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">
              ยืนยันสร้างใหม่แม้พบวัสดุคล้ายกัน
            </button>
          )}
        </div>
    </dialog>
  )
}

function MaterialPicker({
  receiptId,
  supplierId,
  item,
  disabled,
  onReviewCandidate,
  onCreateCandidate,
  onSelect,
  onCreateMaterialNeeded,
  onIgnore,
}: {
  receiptId: string
  supplierId: string | null
  item: PurchaseReceiptItem
  disabled?: boolean
  onReviewCandidate: (candidate: ReceiptMaterialCandidate) => void
  onCreateCandidate: () => void
  onSelect: (candidate: MaterialCandidate, confirmLink?: boolean) => Promise<boolean | undefined>
  onCreateMaterialNeeded: () => void
  onIgnore: () => void
}) {
  const [query, setQuery] = useState(item.item_name_raw ?? '')
  const [loading, setLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [candidates, setCandidates] = useState<MaterialCandidate[]>([])
  const [scope, setScope] = useState<'supplier' | 'all'>('supplier')
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [pendingLink, setPendingLink] = useState<MaterialCandidate | null>(null)
  const searchVersion = useRef(0)
  useEffect(() => () => { searchVersion.current += 1 }, [])
  const selected = item.material
  const suggested = item.suggested_material
  const materialCandidate = item.material_candidate
  const matchCandidates = (item.match_candidates?.length
    ? item.match_candidates
    : supplierId && suggested && item.material_supplier_id === supplierId
      ? [{ ...suggested, match_confidence: item.match_confidence, match_reason: item.match_reason } as MaterialCandidate]
      : []
  ).slice(0, 3)
  const autoSelected = Boolean(selected && item.match_reason?.includes('เลือกให้อัตโนมัติ'))

  async function search(nextScope: 'supplier' | 'all' = scope) {
    if (query.trim().length < 2) return
    const version = ++searchVersion.current
    setScope(nextScope)
    setCandidates([])
    setPendingLink(null)
    setSearchError('')
    setSearched(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/receipts/material-candidates?receipt_id=${receiptId}&scope=${nextScope}&search=${encodeURIComponent(query)}&limit=8`)
      const json = await res.json()
      if (version !== searchVersion.current) return
      if (!res.ok) throw new Error(json.error ?? 'ค้นหาวัสดุไม่สำเร็จ')
      if (json.supplier_id !== supplierId) throw new Error('ร้านของสลิปเปลี่ยนแล้ว กรุณารีเฟรชหน้านี้')
      setCandidates(json.data ?? [])
      setSearched(true)
    } catch (error) {
      if (version === searchVersion.current) setSearchError(error instanceof Error ? error.message : 'ค้นหาวัสดุไม่สำเร็จ')
    } finally {
      if (version === searchVersion.current) setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-bold text-emerald-800">{selected.material_code || selected.material_id}</p>
                {autoSelected && (
                  <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    เลือกให้อัตโนมัติ
                  </span>
                )}
              </div>
              <p className="break-words text-sm text-emerald-700">{selected.mat_name_th}</p>
              {item.review_status !== 'posted' && item.material_supplier_id !== supplierId && (
                <p className="mt-1 text-[11px] font-semibold text-amber-800">กรุณากดเปลี่ยนและเลือกวัสดุเพื่อยืนยันร้านก่อนบันทึกราคา</p>
              )}
            </div>
            {!disabled && (
              <button type="button" onClick={() => setSearchOpen(true)} className="shrink-0 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                เปลี่ยน
              </button>
            )}
          </div>
        </div>
      ) : materialCandidate && materialCandidate.status !== 'rejected' ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {materialCandidate.status === 'created' ? 'สร้างวัสดุใหม่แล้ว' : 'รอสร้างวัสดุใหม่'}
            </span>
            {materialCandidate.proposed_code_spec_key && (
              <span className="text-[11px] font-semibold text-blue-700">{materialCandidate.proposed_code_spec_key}</span>
            )}
          </div>
          <p className="break-words text-sm font-semibold text-blue-950">{materialCandidate.proposed_mat_name_th || item.item_name_raw}</p>
          {materialCandidate.duplicate_warning?.matches?.length ? (
            <p className="mt-1 text-[11px] font-semibold text-amber-700">พบวัสดุคล้ายกัน กรุณาตรวจสอบก่อนสร้างใหม่</p>
          ) : null}
          {!disabled && materialCandidate.status !== 'created' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onReviewCandidate(materialCandidate)} className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-100">
                ตรวจ Draft วัสดุ
              </button>
              <button type="button" onClick={() => setSearchOpen(true)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                ใช้วัสดุเดิมแทน
              </button>
              <button type="button" onClick={onIgnore} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50">
                ไม่บันทึกรายการนี้
              </button>
            </div>
          )}
        </div>
      ) : matchCandidates.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-amber-700">พบวัสดุใกล้เคียง</p>
            <span className="text-[11px] font-semibold text-amber-700">
              {matchCandidates[0]?.match_confidence ?? item.match_confidence ?? 0}%
            </span>
          </div>
          <div className="space-y-1.5">
            {matchCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-lg border border-amber-200 bg-white px-2 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-amber-900">{candidate.material_code || candidate.material_id}</p>
                    <p className="break-words text-sm text-amber-800">{candidate.mat_name_th}</p>
                    <p className="text-[11px] text-amber-700">
                      {candidate.spec || candidate.code_spec_key || '-'}
                      {candidate.match_confidence != null ? ` / ${candidate.match_confidence}%` : ''}
                    </p>
                    {candidate.match_reason && <p className="mt-1 line-clamp-2 text-[11px] text-amber-700">{candidate.match_reason}</p>}
                  </div>
                  {!disabled && (
                    <button type="button" onClick={() => onSelect(candidate)} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                      เลือก
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-bold text-slate-500">{supplierId ? 'ไม่พบวัสดุที่ผูกกับร้านนี้' : 'รอยืนยันร้านค้า'}</p>
          {supplierId && <p className="mt-1 text-[11px] text-slate-500">ค้นหาในร้านก่อน หากไม่มีจึงเลือกจากคลังกลางหรือสร้างวัสดุใหม่</p>}
          {!disabled && (
            <button type="button" onClick={onCreateCandidate} className="mt-2 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-50">
              สร้าง Draft วัสดุ
            </button>
          )}
        </div>
      )}
      {!disabled && (
        searchOpen ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-600">{scope === 'supplier' ? 'ค้นหาเฉพาะวัสดุของร้านนี้' : 'คลังกลาง — ต้องยืนยันผูกกับร้านก่อนเลือก'}</p>
            <div className="flex gap-2">
            <input aria-label={scope === 'supplier' ? 'ค้นหาวัสดุของร้านนี้' : 'ค้นหาวัสดุในคลังกลาง'} value={query} onChange={(e) => { searchVersion.current += 1; setQuery(e.target.value); setCandidates([]); setPendingLink(null); setSearched(false); setLoading(false) }} className={inputClass} placeholder={scope === 'supplier' ? 'ชื่อหรือรหัสสินค้าของร้านนี้' : 'ค้นหาวัสดุในคลังกลาง'} />
            <button type="button" onClick={() => search()} disabled={loading || query.trim().length < 2} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {loading ? '...' : 'ค้นหา'}
            </button>
            </div>
            <button type="button" disabled={loading || query.trim().length < 2} onClick={() => search(scope === 'supplier' ? 'all' : 'supplier')} className="text-xs font-semibold text-blue-800 underline disabled:opacity-40">
              {scope === 'supplier' ? 'ไม่พบในร้าน? ค้นหาคลังกลาง' : 'กลับไปค้นหาเฉพาะร้านนี้'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSearchOpen(true)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              ค้นหาเอง
            </button>
            {!selected && (
              <button type="button" onClick={onCreateMaterialNeeded} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
                สร้างวัสดุใหม่ภายหลัง
              </button>
            )}
          </div>
        )
      )}
      {searchError && <p role="alert" className="text-xs text-red-700">{searchError}</p>}
      {searched && !loading && candidates.length === 0 && !disabled && <p className="text-xs text-slate-500">{scope === 'supplier' ? 'ไม่พบวัสดุที่ผูกกับร้านนี้' : 'ไม่พบวัสดุที่ค้นหาในคลังกลาง'}</p>}
      {pendingLink && !disabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p>ยืนยันว่าสินค้าในสลิปคือ “{pendingLink.mat_name_th}” ใช่หรือไม่? ระบบจะผูกวัสดุนี้กับร้านที่ยืนยันไว้ โดยไม่เปลี่ยนราคาของร้านอื่น</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="font-bold underline" onClick={async () => {
              if (await onSelect(pendingLink, true)) { setPendingLink(null); setCandidates([]); setSearchOpen(false) }
            }}>ยืนยันผูกกับร้านนี้และเลือก</button>
            <button type="button" onClick={() => setPendingLink(null)}>ยกเลิก</button>
          </div>
        </div>
      )}
      {candidates.length > 0 && !disabled && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={async () => {
                if (scope === 'all') { setPendingLink(candidate); return }
                if (await onSelect(candidate)) { setCandidates([]); setSearchOpen(false) }
              }}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-blue-50"
            >
              <span className="font-bold text-blue-900">{candidate.material_code || candidate.material_id}</span>
              <span className="ml-2 text-slate-700">{candidate.mat_name_th}</span>
              {candidate.spec && <span className="ml-2 text-slate-400">{candidate.spec}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldCaption}>{label}</span>
      {children}
    </label>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'slate' }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <span className="block text-[11px]">{label}</span>
      <span className="text-lg">{value}</span>
      <span className="ml-1 text-[11px]">รายการ</span>
    </div>
  )
}

function buildMaterialSelectionPatch(item: PurchaseReceiptItem, candidate: MaterialCandidate) {
  const materialUomId = candidate.uom?.id ?? candidate.base_uom_id ?? null
  const materialUomRaw = candidate.uom?.uom_code ?? candidate.base_uom ?? null
  const shouldFillUom = !item.uom_id && Boolean(materialUomId)
  const nextReason = appendUiReason(item.match_reason, 'manual')

  return {
    uom_id: shouldFillUom ? materialUomId : item.uom_id,
    uom_raw: shouldFillUom ? materialUomRaw : item.uom_raw,
    match_reason: shouldFillUom ? appendUiReason(nextReason, 'ใช้หน่วยจากวัสดุ') : nextReason,
  }
}

function getUomHelperText(item: PurchaseReceiptItem) {
  const reason = item.match_reason ?? ''
  if (reason.includes('ใช้หน่วยจากวัสดุ')) return 'ใช้หน่วยจากวัสดุ'
  if (reason.includes('เลือกหน่วยเอง')) return 'เลือกหน่วยเอง'
  if (reason.includes('เดาจากชื่อสินค้า')) return 'เดาจากชื่อสินค้า'
  if (item.uom_id && item.uom_raw) return 'อ่านจากสลิป'
  if (item.uom_id && item.material?.uom?.id === item.uom_id) return 'ใช้หน่วยจากวัสดุ'
  if (item.uom_id) return 'มีหน่วยแล้ว'
  if (item.uom_raw) return 'อ่านจากสลิป แต่ยังจับคู่หน่วยไม่ได้'
  return 'ยังไม่พบหน่วย'
}

function appendUiReason(existing: string | null | undefined, reason: string) {
  const current = String(existing ?? '').trim()
  if (!current) return reason
  if (current.includes(reason)) return current
  return `${current}; ${reason}`
}

function toNumber(value: string) {
  return value.trim() ? Number(value) : null
}

function toHeaderForm(receipt: PurchaseReceipt): HeaderForm {
  return {
    supplier_id: receipt.supplier_id ?? '',
    supplier_name_raw: receipt.supplier_name_raw ?? '',
    supplier_tax_id_raw: receipt.supplier_tax_id_raw ?? '',
    receipt_date: receipt.receipt_date ?? '',
    receipt_no: receipt.receipt_no ?? '',
    subtotal: receipt.subtotal == null ? '' : String(receipt.subtotal),
    vat: receipt.vat == null ? '' : String(receipt.vat),
    discount: receipt.discount == null ? '' : String(receipt.discount),
    grand_total: receipt.grand_total == null ? '' : String(receipt.grand_total),
    notes: receipt.notes ?? '',
  }
}

function toHeaderPayload(form: HeaderForm) {
  return {
    supplier_id: form.supplier_id || null,
    supplier_name_raw: form.supplier_name_raw,
    supplier_tax_id_raw: form.supplier_tax_id_raw,
    receipt_date: form.receipt_date || null,
    receipt_no: form.receipt_no,
    subtotal: toNumber(form.subtotal),
    vat: toNumber(form.vat),
    discount: toNumber(form.discount),
    grand_total: toNumber(form.grand_total),
    notes: form.notes,
  }
}

function toItemPayload(item: PurchaseReceiptItem) {
  const action = getReceiptItemAction(item)
  return {
    line_no: item.line_no,
    raw_text: item.raw_text,
    item_name_raw: item.item_name_raw,
    qty: item.qty,
    uom_raw: item.uom_raw,
    uom_id: item.uom_id,
    unit_price: item.unit_price,
    line_total: item.line_total,
    vat_amount: item.vat_amount,
    discount_amount: item.discount_amount,
    suggested_material_id: item.suggested_material_id,
    material_id: item.material_id,
    material_candidate_id: item.material_candidate_id,
    material_resolution_status: item.material_resolution_status,
    match_confidence: item.match_confidence,
    match_reason: item.match_reason,
    action,
    review_status: getClientReviewStatus(item),
  }
}

async function readApiJson(response: Response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(response.ok
      ? 'ระบบตอบกลับไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่'
      : `ระบบสร้างวัสดุไม่สำเร็จ (${response.status}) กรุณาลองใหม่`)
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 45000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('ระบบใช้เวลานานเกินไป กรุณารีเฟรชหน้าแล้วลองใหม่')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function mergeReceiptItem(existing: PurchaseReceiptItem, next: PurchaseReceiptItem): PurchaseReceiptItem {
  return {
    ...existing,
    ...next,
    material: next.material_id ? (next.material ?? existing.material ?? null) : null,
    suggested_material: next.suggested_material_id ? (next.suggested_material ?? existing.suggested_material ?? null) : null,
    uom: next.uom_id ? (next.uom ?? existing.uom ?? null) : null,
    material_candidate: next.material_candidate_id
      ? (next.material_candidate ?? existing.material_candidate ?? null)
      : null,
    match_candidates: next.match_candidates ?? existing.match_candidates ?? null,
  }
}

function toCandidatePayload(candidate: ReceiptMaterialCandidate) {
  return {
    proposed_mat_name_th: candidate.proposed_mat_name_th,
    proposed_mat_name_en: candidate.proposed_mat_name_en,
    proposed_category_id: candidate.proposed_category_id,
    proposed_material_type_id: candidate.proposed_material_type_id,
    proposed_code_spec_key: candidate.proposed_code_spec_key,
    proposed_spec: candidate.proposed_spec,
    proposed_brand: candidate.proposed_brand,
    proposed_model: candidate.proposed_model,
    proposed_uom_id: candidate.proposed_uom_id,
    proposed_uom_raw: candidate.proposed_uom_raw,
    proposed_aliases: candidate.proposed_aliases ?? [],
  }
}

function getClientReviewStatus(item: PurchaseReceiptItem) {
  if (item.review_status === 'posted') return 'posted'
  const action = getReceiptItemAction(item)
  if (action === 'ignore') return 'reviewed'
  if (action === 'create_material_needed') return 'needs_review'
  if (action === 'update_price') {
    return item.material_id && item.uom_id && Number(item.unit_price ?? 0) > 0
      ? 'reviewed'
      : 'needs_review'
  }
  return 'needs_review'
}

function getReceiptItemReadiness(item: PurchaseReceiptItem, supplierId: string | null) {
  if (item.review_status === 'posted') {
    return {
      key: 'posted',
      label: 'บันทึกแล้ว',
      helper: null,
      nextAction: null,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  const action = getReceiptItemAction(item)

  if (action === 'ignore') {
    return {
      key: 'ignored',
      label: 'ไม่บันทึกรายการนี้',
      helper: null,
      nextAction: null,
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    }
  }

  if (action === 'create_material_needed') {
    return {
      key: 'create_material_needed',
      label: 'รอสร้างวัสดุใหม่',
      helper: hasPendingMaterialDraft(item) ? 'กดตรวจ Draft วัสดุ แล้วอนุมัติสร้างวัสดุก่อนบันทึกราคา' : null,
      nextAction: hasPendingMaterialDraft(item) ? 'ตรวจ Draft วัสดุ' : 'สร้าง Draft วัสดุ',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  if (action === 'update_price') {
    if (item.material_id && (!supplierId || item.material_supplier_id !== supplierId)) {
      return {
        key: 'needs_review', label: 'ต้องยืนยันวัสดุของร้าน',
        helper: 'รายการนี้ยังไม่ได้ตรวจให้ตรงกับร้านปัจจุบัน', nextAction: 'กดเปลี่ยนและเลือกวัสดุใหม่',
        className: 'border-amber-200 bg-amber-50 text-amber-800',
      }
    }
    if (!item.material_id) {
      return {
        key: 'missing_material',
        label: 'ยังไม่ได้เลือกวัสดุ',
        helper: 'ต้องเลือกวัสดุก่อนอัปเดตราคา',
        nextAction: 'จับคู่วัสดุอัตโนมัติ หรือค้นหาเอง',
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (!item.uom_id) {
      return {
        key: 'missing_uom',
        label: 'ยังไม่มีหน่วย',
        helper: 'ต้องมีหน่วยก่อนบันทึกราคา',
        nextAction: 'เติมหน่วยอัตโนมัติ หรือเลือกหน่วยเอง',
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (!item.unit_price || Number(item.unit_price) <= 0) {
      return {
        key: 'missing_price',
        label: 'ยังไม่มีราคา',
        helper: 'ต้องมีราคา/หน่วยมากกว่า 0',
        nextAction: 'ใส่ราคา/หน่วย',
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (item.review_status === 'reviewed') {
      return {
        key: 'ready',
        label: 'พร้อมบันทึก',
        helper: 'ข้อมูลครบและตรวจแล้ว',
        nextAction: 'กดบันทึกราคาที่พร้อมทั้งหมด',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    }
  }

  return {
    key: 'needs_review',
    label: 'ต้องตรวจสอบ',
    helper: 'ยังไม่ได้เลือก action หรือยังไม่ได้ตรวจรายการ',
    nextAction: 'เลือก action แล้วกดบันทึกรายการ',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  }
}

function buildReadinessSummary(items: PurchaseReceiptItem[], isPosted: boolean, supplierId: string | null) {
  const summary = {
    total: items.length,
    ready: 0,
    needsReview: 0,
    missingMaterial: 0,
    missingUom: 0,
    missingPrice: 0,
    createMaterialNeeded: 0,
    ignored: 0,
    posted: 0,
  }

  if (isPosted) {
    summary.posted = items.length
    return summary
  }

  for (const item of items) {
    const readiness = getReceiptItemReadiness(item, supplierId)
    if (readiness.key === 'posted') {
      summary.posted += 1
      continue
    }
    if (readiness.key === 'ignored') {
      summary.ignored += 1
      continue
    }
    if (readiness.key === 'ready') {
      summary.ready += 1
    } else if (readiness.key === 'missing_material') {
      summary.missingMaterial += 1
    } else if (readiness.key === 'missing_uom') {
      summary.missingUom += 1
    } else if (readiness.key === 'missing_price') {
      summary.missingPrice += 1
    } else if (readiness.key === 'create_material_needed') {
      summary.createMaterialNeeded += 1
    } else {
      summary.needsReview += 1
    }
  }

  return summary
}

function buildReceiptFlowStatus(
  receiptStatus: PurchaseReceipt['status'],
  hasSupplier: boolean,
  itemCount: number,
  readiness: ReturnType<typeof buildReadinessSummary>,
  blockerCount: number,
) {
  if (receiptStatus === 'posted') {
    return {
      label: 'บันทึกเข้าระบบแล้ว',
      helper: 'ราคาถูกบันทึกแล้ว รายการนี้ล็อกเพื่อกันบันทึกซ้ำ',
      nextSteps: [] as string[],
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    }
  }

  if (itemCount === 0) {
    return {
      label: 'ยังไม่มีรายการจากสลิป',
      helper: 'อ่านสลิปด้วย AI หรือเพิ่มรายการเองก่อนเริ่มตรวจ',
      nextSteps: ['อ่านสลิปด้วย AI', 'เพิ่มรายการจากสลิป', 'เลือกซัพพลายเออร์ถ้ายังไม่ได้เลือก'],
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }

  const nextSteps: string[] = []
  if (!hasSupplier) nextSteps.push('เลือกซัพพลายเออร์ของสลิป')
  if (readiness.missingMaterial > 0) nextSteps.push(`ผูกวัสดุให้ครบ ${readiness.missingMaterial} รายการ`)
  if (readiness.createMaterialNeeded > 0) nextSteps.push(`ตรวจ Draft วัสดุใหม่ ${readiness.createMaterialNeeded} รายการ`)
  if (readiness.missingUom > 0) nextSteps.push(`เติมหน่วย ${readiness.missingUom} รายการ`)
  if (readiness.missingPrice > 0) nextSteps.push(`ใส่ราคา ${readiness.missingPrice} รายการ`)
  if (readiness.needsReview > 0) nextSteps.push(`ตรวจ action ที่ค้าง ${readiness.needsReview} รายการ`)
  if (readiness.ready === 0 && nextSteps.length === 0 && blockerCount > 0) {
    nextSteps.push('เลือกอย่างน้อยหนึ่งรายการเป็นอัปเดตราคา หรือข้ามรายการที่ไม่ต้องบันทึก')
  }

  if (readiness.ready > 0 && nextSteps.length > 0) {
    return {
      label: `พร้อมบันทึกบางรายการ (${readiness.ready})`,
      helper: 'กดบันทึกราคาที่พร้อมทั้งหมดได้ ส่วนที่เหลือยังค้างตามขั้นถัดไป',
      nextSteps,
      className: 'border-blue-200 bg-blue-50 text-blue-900',
    }
  }

  if (readiness.ready > 0 && blockerCount === 0) {
    return {
      label: 'พร้อมบันทึกราคาเข้าระบบ',
      helper: 'ทุกรายการที่ต้องอัปเดตราคามีวัสดุ หน่วย ราคา และผ่านการตรวจแล้ว',
      nextSteps: [] as string[],
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    }
  }

  return {
    label: 'ยังต้องตรวจรายการ',
    helper: 'ยังมีรายการที่ต้องผูกวัสดุ สร้างวัสดุใหม่ เติมหน่วย หรือใส่ราคา',
    nextSteps,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  }
}

function buildPostBlockers(receipt: PurchaseReceipt, items: PurchaseReceiptItem[]) {
  const blockers: string[] = []
  if (receipt.status === 'posted') return blockers
  if (!receipt.supplier_id) blockers.push('ต้องเลือกซัพพลายเออร์')
  if (!items.some((item) => getReceiptItemAction(item) === 'update_price')) blockers.push('ยังไม่มีรายการที่เลือก "อัปเดตราคา"')
  for (const item of items) {
    const label = item.line_no ? `บรรทัด ${item.line_no}` : item.item_name_raw || item.id
    const action = getReceiptItemAction(item)
    if (action === 'update_price') {
      if (!item.material_id) blockers.push(`${label} ยังไม่ได้เลือกวัสดุ`)
      if (item.review_status !== 'posted' && item.material_id && item.material_supplier_id !== receipt.supplier_id) blockers.push(`${label} ต้องยืนยันวัสดุให้ตรงกับร้านปัจจุบัน`)
      if (!item.uom_id) blockers.push(`${label} ต้องมีหน่วยก่อนบันทึก`)
      if (!item.unit_price || item.unit_price <= 0) blockers.push(`${label} ราคา/หน่วยไม่ถูกต้อง`)
      if (getClientReviewStatus(item) !== 'reviewed') blockers.push(`${label} ยังต้องตรวจสอบ`)
    } else if (action === 'create_material_needed') {
      blockers.push(`${label} รอสร้างหรืออนุมัติ Draft วัสดุ`)
    } else if (!action || action === 'needs_review') {
      blockers.push(`${label} ยังต้องตรวจสอบ`)
    }
  }
  return blockers
}

function getReceiptItemMaterialFlow(item: PurchaseReceiptItem) {
  if (item.material_id) {
    const code = item.material?.material_code
    return {
      label: code ? `ผูกวัสดุแล้ว: ${code}` : 'ผูกวัสดุแล้ว',
      className: 'text-emerald-700',
    }
  }

  if (hasPendingMaterialDraft(item)) {
    return {
      label: 'มี Draft วัสดุรออนุมัติ',
      className: 'text-amber-700',
    }
  }

  if (item.suggested_material_id || (item.match_candidates?.length ?? 0) > 0) {
    return {
      label: 'พบวัสดุใกล้เคียง ให้เลือกก่อนบันทึกราคา',
      className: 'text-blue-700',
    }
  }

  if (getReceiptItemAction(item) === 'ignore') {
    return {
      label: 'รายการนี้ถูกข้าม ไม่ต้องผูกวัสดุ',
      className: 'text-slate-500',
    }
  }

  return {
    label: 'ยังไม่ผูกวัสดุ',
    className: 'text-red-700',
  }
}

function hasPendingMaterialDraft(item: PurchaseReceiptItem) {
  return Boolean(item.material_candidate_id && !item.material_id && item.material_candidate?.status !== 'created' && item.action !== 'ignore')
}

function getReceiptItemAction(item: PurchaseReceiptItem): ReceiptItemAction {
  if (item.action === 'ignore') return 'ignore'
  if (hasPendingMaterialDraft(item)) return 'create_material_needed'
  return item.action ?? 'needs_review'
}

const inputClass = styles.input
