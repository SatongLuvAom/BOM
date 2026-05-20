'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ReceiptStatusBadge } from '@/components/receipts/ReceiptStatusBadge'
import type {
  MaterialCandidate,
  PurchaseReceipt,
  PurchaseReceiptItem,
  ReceiptItemAction,
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
  initialMessage = null,
  initialWarning = null,
}: {
  initialReceipt: PurchaseReceipt
  initialItems: PurchaseReceiptItem[]
  suppliers: ReceiptSupplier[]
  uoms: ReceiptUom[]
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
  const [uploadingFile, setUploadingFile] = useState(false)
  const [readingAi, setReadingAi] = useState(false)
  const [message, setMessage] = useState<string | null>(initialMessage)
  const [warning, setWarning] = useState<string | null>(initialWarning)
  const [error, setError] = useState<string | null>(null)

  const isPosted = receipt.status === 'posted'
  const hasReceiptFile = Boolean(receipt.file_name || receipt.file_url || receipt.file_storage_path)
  const postBlockers = useMemo(() => buildPostBlockers(receipt, items), [receipt, items])

  function setHeaderField<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setHeader((current) => ({ ...current, [key]: value }))
    clearMessages()
  }

  function setItemField<K extends keyof PurchaseReceiptItem>(id: string, key: K, value: PurchaseReceiptItem[K]) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
    clearMessages()
  }

  function clearMessages() {
    setMessage(null)
    setWarning(null)
    setError(null)
  }

  async function saveHeader() {
    setSavingHeader(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toHeaderPayload(header)),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'บันทึก Draft ไม่สำเร็จ')
        return
      }
      setReceipt(json.data)
      setHeader(toHeaderForm(json.data))
      setMessage('บันทึก Draft แล้ว')
    } finally {
      setSavingHeader(false)
    }
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
    clearMessages()
    const payload = toItemPayload({ ...item, ...patch })
    const res = await fetch(`/api/receipts/${receipt.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'บันทึกรายการไม่สำเร็จ')
      return
    }
    setItems((current) => current.map((row) => row.id === item.id ? json.data : row))
    setMessage('บันทึกรายการแล้ว')
  }

  async function deleteItem(item: PurchaseReceiptItem) {
    if (!confirm(`ลบรายการ "${item.item_name_raw || item.id}" ?`)) return
    clearMessages()
    const res = await fetch(`/api/receipts/${receipt.id}/items/${item.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'ลบรายการไม่สำเร็จ')
      return
    }
    setItems((current) => current.filter((row) => row.id !== item.id))
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

  async function readReceiptWithAi() {
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
        setError(json.error ?? 'ไม่สามารถอ่านไฟล์นี้ได้ กรุณากรอกข้อมูลเอง')
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

  async function postReceipt() {
    if (postBlockers.length > 0 || isPosted) return
    if (!confirm('บันทึกราคาเข้าระบบ Material Master จากสลิปนี้?')) return
    setPosting(true)
    clearMessages()
    try {
      const res = await fetch(`/api/receipts/${receipt.id}/post`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'บันทึกราคาเข้าระบบไม่สำเร็จ')
        return
      }
      setReceipt(json.data.receipt)
      setItems(json.data.items)
      setMessage(`บันทึกราคาเข้าระบบแล้ว ${json.data.result?.inserted_prices ?? 0} รายการ`)
    } finally {
      setPosting(false)
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
                {readingAi ? 'กำลังอ่านสลิปด้วย AI...' : 'อ่านสลิปด้วย AI'}
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
          <button disabled={isPosted || posting || postBlockers.length > 0} type="button" onClick={postReceipt} className="btn-primary">
            {posting ? 'กำลังบันทึกราคา...' : isPosted ? 'สลิปนี้ถูกบันทึกเข้าระบบแล้ว' : 'บันทึกราคาเข้าระบบ'}
          </button>
        </div>

        {!isPosted && (
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-[1.4fr_90px_110px_120px_120px_auto]">
            <input placeholder="รายการจากสลิป" value={newItem.item_name_raw} onChange={(e) => setNewItem((current) => ({ ...current, item_name_raw: e.target.value }))} className={inputClass} />
            <input placeholder="จำนวน" type="number" step="0.0001" value={newItem.qty} onChange={(e) => setNewItem((current) => ({ ...current, qty: e.target.value }))} className={inputClass} />
            <select value={newItem.uom_id} onChange={(e) => setNewItem((current) => ({ ...current, uom_id: e.target.value }))} className={inputClass}>
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="min-w-[260px]">
                    <input disabled={isPosted} value={item.item_name_raw ?? ''} onChange={(e) => setItemField(item.id, 'item_name_raw', e.target.value)} className={inputClass} />
                  </td>
                  <td>
                    <input disabled={isPosted} type="number" step="0.0001" value={item.qty ?? ''} onChange={(e) => setItemField(item.id, 'qty', e.target.value === '' ? null : Number(e.target.value))} className={inputClass} />
                  </td>
                  <td>
                    <select disabled={isPosted} value={item.uom_id ?? ''} onChange={(e) => setItemField(item.id, 'uom_id', e.target.value || null)} className={inputClass}>
                      <option value="">-</option>
                      {uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uom_code}</option>)}
                    </select>
                  </td>
                  <td>
                    <input disabled={isPosted} type="number" step="0.0001" value={item.unit_price ?? ''} onChange={(e) => setItemField(item.id, 'unit_price', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                  </td>
                  <td>
                    <input disabled={isPosted} type="number" step="0.01" value={item.line_total ?? ''} onChange={(e) => setItemField(item.id, 'line_total', e.target.value === '' ? null : Number(e.target.value))} className={`${inputClass} text-right`} />
                  </td>
                  <td className="min-w-[280px]">
                    <MaterialPicker
                      item={item}
                      disabled={isPosted}
                      onSelect={(candidate) => saveItem(item, {
                        material_id: candidate.id,
                        match_confidence: 100,
                        match_reason: 'manual',
                      } as any)}
                    />
                  </td>
                  <td>
                    <select disabled={isPosted} value={item.action ?? 'needs_review'} onChange={(e) => setItemField(item.id, 'action', e.target.value as ReceiptItemAction)} className={inputClass}>
                      {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${item.review_status === 'needs_review' ? 'border-amber-200 bg-amber-50 text-amber-700' : item.review_status === 'posted' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                      {item.review_status === 'needs_review' ? 'ต้องตรวจสอบ' : item.review_status === 'posted' ? 'บันทึกแล้ว' : item.review_status === 'ignored' ? 'ข้ามแล้ว' : 'ตรวจแล้ว'}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {!isPosted && (
                        <>
                          <button type="button" onClick={() => saveItem(item)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-50">
                            บันทึก
                          </button>
                          <button type="button" onClick={() => deleteItem(item)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-between">
        <Link href="/receipts" className="btn-secondary">กลับรายการสลิป</Link>
      </div>
    </div>
  )
}

function MaterialPicker({
  item,
  disabled,
  onSelect,
}: {
  item: PurchaseReceiptItem
  disabled?: boolean
  onSelect: (candidate: MaterialCandidate) => void
}) {
  const [query, setQuery] = useState(item.item_name_raw ?? '')
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<MaterialCandidate[]>([])
  const selected = item.material

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
          <p className="truncate text-xs font-bold text-emerald-800">{selected.material_code || selected.material_id}</p>
          <p className="truncate text-xs text-emerald-700">{selected.mat_name_th}</p>
        </div>
      ) : (
        <p className="text-xs font-semibold text-slate-400">ยังไม่ได้เลือกวัสดุ</p>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} placeholder="ค้นหาวัสดุ" />
          <button type="button" onClick={search} disabled={loading || query.trim().length < 2} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {loading ? '...' : 'ค้นหา'}
          </button>
        </div>
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
    match_confidence: item.match_confidence,
    match_reason: item.match_reason,
    action: item.action ?? 'needs_review',
    review_status: item.action && item.action !== 'needs_review' ? 'reviewed' : item.review_status,
  }
}

function buildPostBlockers(receipt: PurchaseReceipt, items: PurchaseReceiptItem[]) {
  const blockers: string[] = []
  if (receipt.status === 'posted') return blockers
  if (!receipt.supplier_id) blockers.push('ต้องเลือกซัพพลายเออร์')
  if (!items.some((item) => item.action === 'update_price')) blockers.push('ยังไม่มีรายการที่เลือก "อัปเดตราคา"')
  for (const item of items) {
    const label = item.line_no ? `บรรทัด ${item.line_no}` : item.item_name_raw || item.id
    if (!item.action || item.action === 'needs_review' || item.review_status === 'needs_review') {
      blockers.push(`${label} ยังต้องตรวจสอบ`)
    }
    if (item.action === 'update_price') {
      if (!item.material_id) blockers.push(`${label} ยังไม่ได้เลือกวัสดุ`)
      if (!item.unit_price || item.unit_price <= 0) blockers.push(`${label} ราคา/หน่วยไม่ถูกต้อง`)
    }
  }
  return blockers
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-950/10'
