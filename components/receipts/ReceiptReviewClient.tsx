'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge'
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
  suppliers,
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
  const [items, setItems] = useState(initialItems)
  const [header, setHeader] = useState<HeaderForm>(() => toHeaderForm(initialReceipt))
  const [newItem, setNewItem] = useState<NewItemForm>(emptyNewItem)
  const [savingHeader, setSavingHeader] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postingReady, setPostingReady] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [readingAi, setReadingAi] = useState(false)
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

  const isPosted = receipt.status === 'posted'
  const hasReceiptFile = Boolean(receipt.file_name || receipt.file_url || receipt.file_storage_path)
  const hasAiExtraction = Boolean(receipt.ai_raw_json || receipt.ai_raw_text)
  const effectiveSupplierId = header.supplier_id || receipt.supplier_id || null
  const postBlockers = useMemo(() => buildPostBlockers({ ...receipt, supplier_id: effectiveSupplierId }, items), [effectiveSupplierId, receipt, items])
  const readiness = useMemo(() => buildReadinessSummary(items, isPosted), [items, isPosted])

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
      setMessage('บันทึก Draft แล้ว')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'บันทึก Draft ไม่สำเร็จ')
    } finally {
      setSavingHeader(false)
    }
  }

  async function saveHeaderDraft() {
    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toHeaderPayload(header)),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error ?? 'บันทึก Draft ไม่สำเร็จ')
    }
    if (!json.data) {
      throw new Error('บันทึก Draft แล้วแต่ระบบไม่ส่งข้อมูลกลับ กรุณารีเฟรชหน้าแล้วลองใหม่')
    }
    setReceipt(json.data)
    setHeader(toHeaderForm(json.data))
    return json.data as PurchaseReceipt
  }

  async function ensureHeaderSavedBeforePosting() {
    if (!header.supplier_id) {
      throw new Error('ต้องเลือกซัพพลายเออร์ก่อนบันทึกราคา')
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

  async function saveItem(item: PurchaseReceiptItem, patch?: Partial<PurchaseReceiptItem>) {
    if (item.review_status === 'posted') return
    clearMessages()
    setItemBusy(item.id, true)
    try {
    const payload = toItemPayload({ ...item, ...patch })
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
    if (isPosted || !hasReceiptFile) return
    let replaceItems = false
    if (items.length > 0) {
      replaceItems = confirm('สลิปนี้มีรายการอยู่แล้ว ต้องการแทนที่ด้วยผลจาก AI หรือไม่')
      if (!replaceItems) return
    }

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
    } finally {
      setReadingAi(false)
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
        body: JSON.stringify({ ...toCandidatePayload(nextDraft), confirmDuplicate }),
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
    <div className="space-y-5">
      {(message || warning || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
          error
            ? 'border-red-200 bg-red-50 text-red-700'
            : warning
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {error || warning || message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-blue-950">ข้อมูลหัวสลิป</h2>
              <p className="text-sm text-slate-500">กรอกข้อมูลจากสลิปก่อนตรวจรายการ</p>
            </div>
            <ReceiptStatusBadge status={receipt.status} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Supplier">
              <select disabled={isPosted} value={header.supplier_id} onChange={(e) => setHeaderField('supplier_id', e.target.value)} className={inputClass}>
                <option value="">- เลือกซัพพลายเออร์ -</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name_th} ({supplier.supplier_code || supplier.supplier_id})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ชื่อ Supplier จากสลิป">
              <input disabled={isPosted} value={header.supplier_name_raw} onChange={(e) => setHeaderField('supplier_name_raw', e.target.value)} className={inputClass} />
            </Field>
            <Field label="วันที่สลิป">
              <input disabled={isPosted} type="date" value={header.receipt_date} onChange={(e) => setHeaderField('receipt_date', e.target.value)} className={inputClass} />
            </Field>
            <Field label="เลขที่เอกสาร">
              <input disabled={isPosted} value={header.receipt_no} onChange={(e) => setHeaderField('receipt_no', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Tax ID จากสลิป">
              <input disabled={isPosted} value={header.supplier_tax_id_raw} onChange={(e) => setHeaderField('supplier_tax_id_raw', e.target.value)} className={inputClass} />
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

          <div className="mt-4">
            <Field label="Notes">
              <textarea disabled={isPosted} rows={3} value={header.notes} onChange={(e) => setHeaderField('notes', e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <button disabled={isPosted || savingHeader} type="button" onClick={saveHeader} className="btn-secondary">
              {savingHeader ? 'กำลังบันทึก...' : 'บันทึก Draft'}
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
                <label className={`inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 ${uploadingFile ? 'pointer-events-none opacity-50' : ''}`}>
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
                className="rounded-xl bg-blue-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {readingAi ? 'กำลังอ่านสลิปด้วย AI...' : 'อ่านสลิปด้วย AI อีกครั้ง'}
              </button>
            </div>
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
            {postBlockers.length === 0 ? (
              <p className="mt-2 text-sm font-semibold text-emerald-700">พร้อมบันทึกราคาเข้าระบบ</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-amber-700">
                {postBlockers.slice(0, 6).map((blocker) => (
                  <li key={blocker}>- {blocker}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-blue-950">รายการจากสลิป</h2>
            <p className="text-sm text-slate-500">เพิ่มรายการเอง เลือกวัสดุ แล้วกำหนด action ต่อรายการ</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!isPosted && (
              <button disabled={matchingMaterials || fillingUoms || posting || postingReady || repairingReceipt} type="button" onClick={autoMatchMaterials} className="btn-secondary">
                {matchingMaterials ? 'กำลังจับคู่วัสดุ...' : 'จับคู่วัสดุอัตโนมัติ'}
              </button>
            )}
            {!isPosted && (
              <button disabled={creatingCandidates || matchingMaterials || fillingUoms || posting || postingReady || repairingReceipt} type="button" onClick={() => createMaterialCandidates()} className="btn-secondary">
                {creatingCandidates ? 'กำลังสร้าง Draft วัสดุ...' : 'สร้าง Draft วัสดุจากรายการที่ไม่พบ'}
              </button>
            )}
            {!isPosted && (
              <button disabled={repairingReceipt || fillingUoms || matchingMaterials || posting || postingReady} type="button" onClick={repairReceiptState} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                {repairingReceipt ? 'กำลังซ่อมสถานะ...' : 'ซ่อมสถานะสลิปนี้'}
              </button>
            )}
            {!isPosted && (
              <button disabled={fillingUoms || matchingMaterials || posting || postingReady || repairingReceipt} type="button" onClick={fillMissingUoms} className="btn-secondary">
                {fillingUoms ? 'กำลังเติมหน่วย...' : 'เติมหน่วยอัตโนมัติ'}
              </button>
            )}
            {!isPosted && (
              <button disabled={postingReady || posting || matchingMaterials || repairingReceipt || savingHeader || readiness.ready === 0 || !effectiveSupplierId} type="button" onClick={postReadyItems} className="btn-primary">
                {postingReady ? 'กำลังบันทึก...' : `บันทึกราคาที่พร้อมทั้งหมด (${readiness.ready})`}
              </button>
            )}
            <button disabled={isPosted || posting || postingReady || matchingMaterials || repairingReceipt || savingHeader || postBlockers.length > 0} type="button" onClick={postReceipt} className="btn-primary">
              {posting ? 'กำลังบันทึกราคา...' : isPosted ? 'สลิปนี้ถูกบันทึกเข้าระบบแล้ว' : 'บันทึกราคาเข้าระบบ'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 text-xs font-bold text-slate-700 md:grid-cols-5">
          <SummaryPill label="พร้อมบันทึก" value={readiness.ready} tone="green" />
          <SummaryPill label="ต้องตรวจสอบ" value={readiness.needsReview} tone="amber" />
          <SummaryPill label="ไม่มีวัสดุที่เลือก" value={readiness.missingMaterial} tone="red" />
          <SummaryPill label="ไม่มีหน่วย" value={readiness.missingUom} tone="red" />
          <SummaryPill label="ไม่มีราคา" value={readiness.missingPrice} tone="red" />
        </div>

        {!isPosted && (
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-[1.4fr_90px_110px_120px_120px_auto]">
            <input placeholder="รายการจากสลิป" value={newItem.item_name_raw} onChange={(e) => setNewItem((current) => ({ ...current, item_name_raw: e.target.value }))} className={inputClass} />
            <input placeholder="จำนวน" type="number" step="0.0001" value={newItem.qty} onChange={(e) => setNewItem((current) => ({ ...current, qty: e.target.value }))} className={inputClass} />
            <select value={newItem.uom_id} onChange={(e) => {
              const selected = uoms.find((uom) => uom.id === e.target.value)
              setNewItem((current) => ({ ...current, uom_id: e.target.value, uom_raw: selected?.uom_code ?? current.uom_raw }))
            }} className={inputClass}>
              <option value="">หน่วย</option>
              {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code}</option>)}
            </select>
            <input placeholder="ราคา/หน่วย" type="number" step="0.0001" value={newItem.unit_price} onChange={(e) => setNewItem((current) => ({ ...current, unit_price: e.target.value }))} className={inputClass} />
            <input placeholder="รวม" type="number" step="0.01" value={newItem.line_total} onChange={(e) => setNewItem((current) => ({ ...current, line_total: e.target.value }))} className={inputClass} />
            <button type="button" onClick={addItem} disabled={addingItem || !newItem.item_name_raw.trim()} className="btn-secondary whitespace-nowrap">
              {addingItem ? 'กำลังเพิ่ม...' : '+ เพิ่มรายการ'}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table min-w-[1320px]">
            <thead>
              <tr>
                <th>รายการจากสลิป</th>
                <th>จำนวน</th>
                <th>หน่วย</th>
                <th className="text-right">ราคา/หน่วย</th>
                <th className="text-right">รวม</th>
                <th>วัสดุที่เลือก</th>
                <th>Action</th>
                <th>สถานะตรวจสอบ</th>
                <th className="text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center text-sm text-slate-400">
                    ยังไม่พบรายการ
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const rowLocked = isPosted || item.review_status === 'posted'
                const rowBusy = savingItemIds.has(item.id)
                const readinessDetail = getReceiptItemReadiness(item)
                const pendingMaterialDraft = hasPendingMaterialDraft(item)
                const actionValue = getReceiptItemAction(item)
                return (
                <tr key={item.id}>
                  <td className="min-w-[260px]">
                    <input disabled={rowLocked || rowBusy} value={item.item_name_raw ?? ''} onChange={(e) => setItemField(item.id, 'item_name_raw', e.target.value)} className={inputClass} />
                  </td>
                  <td>
                    <input disabled={rowLocked || rowBusy} type="number" step="0.0001" value={item.qty ?? ''} onChange={(e) => setItemField(item.id, 'qty', e.target.value === '' ? null : Number(e.target.value))} className={inputClass} />
                  </td>
                  <td>
                    <div className="space-y-1">
                      <select disabled={rowLocked || rowBusy} value={item.uom_id ?? ''} onChange={(e) => setItemUom(item.id, e.target.value)} className={inputClass}>
                        <option value="">-</option>
                        {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code}</option>)}
                      </select>
                      <p className={`text-[11px] font-semibold ${item.uom_id ? 'text-slate-500' : 'text-amber-600'}`}>
                        {getUomHelperText(item)}
                      </p>
                    </div>
                  </td>
                  <td>
                    <input disabled={rowLocked || rowBusy} type="number" step="0.0001" value={item.unit_price ?? ''} onChange={(e) => setItemField(item.id, 'unit_price', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                  </td>
                  <td>
                    <input disabled={rowLocked || rowBusy} type="number" step="0.01" value={item.line_total ?? ''} onChange={(e) => setItemField(item.id, 'line_total', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                  </td>
                  <td className="min-w-[280px]">
                    <MaterialPicker
                      item={item}
                      disabled={rowLocked || rowBusy}
                      onReviewCandidate={(candidate) => {
                        setCandidateDraft(candidate)
                        setCandidateNeedsConfirm(false)
                      }}
                      onCreateCandidate={() => createMaterialCandidates([item.id])}
                      onSelect={(candidate) => saveItem(item, {
                        ...buildMaterialSelectionPatch(item, candidate),
                        material_id: candidate.id,
                        material_candidate_id: null,
                        material_resolution_status: 'matched_existing',
                        match_confidence: 100,
                        action: !item.action || item.action === 'needs_review' || item.action === 'create_material_needed' ? 'update_price' : item.action,
                      } as any)}
                      onCreateMaterialNeeded={() => saveItem(item, {
                        action: 'create_material_needed',
                        material_resolution_status: 'create_material_needed',
                      } as any)}
                      onIgnore={() => saveItem(item, { action: 'ignore' } as any)}
                    />
                  </td>
                  <td>
                    <select disabled={rowLocked || rowBusy || pendingMaterialDraft} value={actionValue} onChange={(e) => setItemField(item.id, 'action', e.target.value as ReceiptItemAction)} className={inputClass}>
                      {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {pendingMaterialDraft && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        ต้องอนุมัติ Draft วัสดุก่อนอัปเดตราคา
                      </p>
                    )}
                  </td>
                  <td>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${readinessDetail.className}`}>
                      {readinessDetail.label}
                    </span>
                    {readinessDetail.helper && (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{readinessDetail.helper}</p>
                    )}
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {!rowLocked && (
                        <>
                          <button type="button" onClick={() => saveItem(item)} disabled={rowBusy} className="rounded-lg px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50 disabled:opacity-50">
                            {rowBusy ? 'กำลังบันทึก...' : 'บันทึก'}
                          </button>
                          <button type="button" onClick={() => deleteItem(item)} disabled={rowBusy} className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {candidateDraft && (
        <CandidateReviewModal
          candidate={candidateDraft}
          categories={categories}
          materialTypes={materialTypes}
          uoms={uoms}
          saving={approvingCandidate}
          savingText={candidateApproveStage}
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

function CandidateReviewModal({
  candidate,
  categories,
  materialTypes,
  uoms,
  saving,
  savingText,
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
  needsConfirm: boolean
  onChange: (candidate: ReceiptMaterialCandidate) => void
  onSave: () => void
  onApprove: (confirmDuplicate: boolean) => void
  onClose: () => void
}) {
  const availableTypes = materialTypes.filter((type) => !candidate.proposed_category_id || type.category_id === candidate.proposed_category_id)
  const duplicateMatches = candidate.duplicate_warning?.matches ?? []

  function set<K extends keyof ReceiptMaterialCandidate>(key: K, value: ReceiptMaterialCandidate[K]) {
    onChange({ ...candidate, [key]: value })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xl font-bold text-blue-950">ตรวจ Draft วัสดุ</h3>
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
          <Field label="สเปก">
            <input value={candidate.proposed_spec ?? ''} onChange={(e) => set('proposed_spec', e.target.value)} className={inputClass} />
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

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-bold text-slate-800">Alias จากสลิป</p>
          <p className="mt-1">{(candidate.proposed_aliases ?? []).join(', ') || '-'}</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onSave} disabled={saving} className="btn-secondary">
            {saving ? 'กำลังบันทึก...' : 'บันทึก Draft'}
          </button>
          <button type="button" onClick={() => onApprove(false)} disabled={saving} className="btn-primary">
            {saving ? 'กำลังสร้างวัสดุ...' : 'อนุมัติและสร้างวัสดุ'}
          </button>
          {needsConfirm && (
            <button type="button" onClick={() => onApprove(true)} disabled={saving} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">
              ยืนยันสร้างใหม่แม้พบวัสดุคล้ายกัน
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MaterialPicker({
  item,
  disabled,
  onReviewCandidate,
  onCreateCandidate,
  onSelect,
  onCreateMaterialNeeded,
  onIgnore,
}: {
  item: PurchaseReceiptItem
  disabled?: boolean
  onReviewCandidate: (candidate: ReceiptMaterialCandidate) => void
  onCreateCandidate: () => void
  onSelect: (candidate: MaterialCandidate) => void
  onCreateMaterialNeeded: () => void
  onIgnore: () => void
}) {
  const [query, setQuery] = useState(item.item_name_raw ?? '')
  const [loading, setLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [candidates, setCandidates] = useState<MaterialCandidate[]>([])
  const selected = item.material
  const suggested = item.suggested_material
  const materialCandidate = item.material_candidate
  const matchCandidates = (item.match_candidates?.length
    ? item.match_candidates
    : suggested
      ? [{ ...suggested, match_confidence: item.match_confidence, match_reason: item.match_reason } as MaterialCandidate]
      : []
  ).slice(0, 3)
  const autoSelected = Boolean(selected && item.match_reason?.includes('เลือกให้อัตโนมัติ'))

  async function search() {
    if (query.trim().length < 2) return
    setLoading(true)
    try {
      const res = await fetch(`/api/receipts/material-candidates?search=${encodeURIComponent(query)}&limit=8`)
      const json = await res.json()
      setCandidates(res.ok ? json.data ?? [] : [])
    } finally {
      setLoading(false)
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
              <p className="truncate text-xs text-emerald-700">{selected.mat_name_th}</p>
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
          <p className="truncate text-xs font-bold text-blue-950">{materialCandidate.proposed_mat_name_th || item.item_name_raw}</p>
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
                    <p className="truncate text-xs text-amber-800">{candidate.mat_name_th}</p>
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
          <p className="text-xs font-bold text-slate-500">ไม่พบวัสดุในระบบ</p>
          <p className="mt-1 text-[11px] text-slate-400">ค้นหาเอง หรือสร้างวัสดุใหม่ภายหลัง</p>
          {!disabled && (
            <button type="button" onClick={onCreateCandidate} className="mt-2 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-50">
              สร้าง Draft วัสดุ
            </button>
          )}
        </div>
      )}
      {!disabled && (
        searchOpen ? (
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} placeholder="ค้นหาวัสดุ" />
            <button type="button" onClick={search} disabled={loading || query.trim().length < 2} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {loading ? '...' : 'ค้นหา'}
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
      {candidates.length > 0 && !disabled && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                onSelect(candidate)
                setCandidates([])
                setSearchOpen(false)
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
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-red-200 bg-red-50 text-red-700'

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

function getReceiptItemReadiness(item: PurchaseReceiptItem) {
  if (item.review_status === 'posted') {
    return {
      key: 'posted',
      label: 'บันทึกแล้ว',
      helper: null,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }

  const action = getReceiptItemAction(item)

  if (action === 'ignore') {
    return {
      key: 'ignored',
      label: 'ไม่บันทึกรายการนี้',
      helper: null,
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    }
  }

  if (action === 'create_material_needed') {
    return {
      key: 'create_material_needed',
      label: 'รอสร้างวัสดุใหม่',
      helper: hasPendingMaterialDraft(item) ? 'กดตรวจ Draft วัสดุ แล้วอนุมัติสร้างวัสดุก่อนบันทึกราคา' : null,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  if (action === 'update_price') {
    if (!item.material_id) {
      return {
        key: 'missing_material',
        label: 'ยังไม่ได้เลือกวัสดุ',
        helper: 'ต้องเลือกวัสดุก่อนอัปเดตราคา',
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (!item.uom_id) {
      return {
        key: 'missing_uom',
        label: 'ยังไม่มีหน่วย',
        helper: null,
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (!item.unit_price || Number(item.unit_price) <= 0) {
      return {
        key: 'missing_price',
        label: 'ยังไม่มีราคา',
        helper: null,
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    }
    if (item.review_status === 'reviewed') {
      return {
        key: 'ready',
        label: 'พร้อมบันทึก',
        helper: null,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    }
  }

  return {
    key: 'needs_review',
    label: 'ต้องตรวจสอบ',
    helper: null,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  }
}

function buildReadinessSummary(items: PurchaseReceiptItem[], isPosted: boolean) {
  const summary = {
    ready: 0,
    needsReview: 0,
    missingMaterial: 0,
    missingUom: 0,
    missingPrice: 0,
  }

  if (isPosted) return summary

  for (const item of items) {
    const readiness = getReceiptItemReadiness(item)
    if (readiness.key === 'posted' || readiness.key === 'ignored') continue
    if (readiness.key === 'ready') {
      summary.ready += 1
    } else if (readiness.key === 'missing_material') {
      summary.missingMaterial += 1
    } else if (readiness.key === 'missing_uom') {
      summary.missingUom += 1
    } else if (readiness.key === 'missing_price') {
      summary.missingPrice += 1
    } else {
      summary.needsReview += 1
    }
  }

  return summary
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
      if (!item.uom_id) blockers.push(`${label} ต้องมีหน่วยก่อนบันทึก`)
      if (!item.unit_price || item.unit_price <= 0) blockers.push(`${label} ราคา/หน่วยไม่ถูกต้อง`)
      if (getClientReviewStatus(item) !== 'reviewed') blockers.push(`${label} ยังต้องตรวจสอบ`)
    } else if (!action || action === 'needs_review') {
      blockers.push(`${label} ยังต้องตรวจสอบ`)
    }
  }
  return blockers
}

function hasPendingMaterialDraft(item: PurchaseReceiptItem) {
  return Boolean(item.material_candidate_id && !item.material_id && item.material_candidate?.status !== 'created' && item.action !== 'ignore')
}

function getReceiptItemAction(item: PurchaseReceiptItem): ReceiptItemAction {
  if (item.action === 'ignore') return 'ignore'
  if (hasPendingMaterialDraft(item)) return 'create_material_needed'
  return item.action ?? 'needs_review'
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-950/10'
