'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getReceiptDuplicateNotice,
  type ReceiptDuplicateNotice,
} from '@/lib/receipt-duplicate-response'
import { routes } from '@/lib/routes'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
])

type ImportStage =
  | 'idle'
  | 'file_selected'
  | 'creating_draft'
  | 'uploading_file'
  | 'extracting_ai'
  | 'redirecting'
  | 'success'
  | 'error'

type ProgressStage = 'creating_draft' | 'uploading_file' | 'extracting_ai' | 'redirecting'

const stageText: Record<ImportStage, string> = {
  idle: 'เลือกไฟล์สลิปเพื่อเริ่มนำเข้า',
  file_selected: 'เลือกไฟล์แล้ว พร้อมสร้าง Draft',
  creating_draft: 'กำลังสร้าง Draft...',
  uploading_file: 'กำลังอัปโหลดไฟล์...',
  extracting_ai: 'กำลังอ่านสลิปด้วย AI...',
  redirecting: 'กำลังเปิดหน้าตรวจสอบ...',
  success: 'สร้าง Draft สำเร็จ',
  error: 'ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือสร้าง Draft เปล่า',
}

const progressSteps: Array<{ stage: ProgressStage; plannedLabel: string; activeLabel: string }> = [
  { stage: 'creating_draft', plannedLabel: 'สร้าง Draft', activeLabel: 'กำลังสร้าง Draft...' },
  { stage: 'uploading_file', plannedLabel: 'อัปโหลดไฟล์', activeLabel: 'กำลังอัปโหลดไฟล์...' },
  { stage: 'extracting_ai', plannedLabel: 'อ่านสลิปด้วย AI', activeLabel: 'กำลังอ่านสลิปด้วย AI...' },
  { stage: 'redirecting', plannedLabel: 'เปิดหน้าตรวจสอบ', activeLabel: 'กำลังเปิดหน้าตรวจสอบ...' },
]

const missingReceiptIdMessage = 'สร้าง Draft แล้ว แต่ไม่พบรหัสสลิปสำหรับเปิดหน้าตรวจสอบ'

type ReceiptImportNotice = {
  type: 'message' | 'warning'
  text: string
}

export function ReceiptCreateDraftForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const activeImportStageRef = useRef<ProgressStage>('creating_draft')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [creating, setCreating] = useState<'ai' | 'blank' | null>(null)
  const [stage, setStage] = useState<ImportStage>('idle')
  const [failedStage, setFailedStage] = useState<ProgressStage | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duplicateReceipt, setDuplicateReceipt] = useState<ReceiptDuplicateNotice | null>(null)

  function validateFile(nextFile: File | null) {
    if (!nextFile) return 'กรุณาเลือกไฟล์สลิปก่อน'
    if (!SUPPORTED_MIME_TYPES.has(nextFile.type)) return 'รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF'
    if (nextFile.size > MAX_FILE_SIZE) return 'ไฟล์ใหญ่เกิน 10 MB'
    return null
  }

  function selectFile(nextFile: File | null) {
    if (creating) return
    const fileError = validateFile(nextFile)
    setError(fileError)
    setSuccess(null)
    setFailedStage(null)
    setDuplicateReceipt(null)
    setStage(fileError ? 'idle' : 'file_selected')
    setFile(fileError ? null : nextFile)
  }

  function clearSelectedFile() {
    setFile(null)
    setError(null)
    setSuccess(null)
    setFailedStage(null)
    setDuplicateReceipt(null)
    setStage('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  function setImportStage(nextStage: ProgressStage) {
    activeImportStageRef.current = nextStage
    setStage(nextStage)
  }

  function failImport(message: string, failedAt: ProgressStage = activeImportStageRef.current) {
    setStage('error')
    setFailedStage(failedAt)
    setError(message)
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (creating) return
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  async function createBlankDraft(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    if (creating) return
    setCreating('blank')
    setImportStage('creating_draft')
    setFailedStage(null)
    setSuccess(null)
    setError(null)
    setDuplicateReceipt(null)
    let didRedirect = false
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        failImport(json.error ?? 'สร้าง Draft ไม่สำเร็จ', 'creating_draft')
        return
      }
      const targetPath = getReceiptReviewPath(getReceiptId(json))
      if (!targetPath) {
        failImport(missingReceiptIdMessage, 'creating_draft')
        return
      }
      setImportStage('redirecting')
      didRedirect = true
      router.push(targetPath)
    } catch {
      failImport('สร้าง Draft ไม่สำเร็จ กรุณาลองใหม่', 'creating_draft')
    } finally {
      if (!didRedirect) setCreating(null)
    }
  }

  async function createDraftAndReadAi(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    if (creating) return
    const fileError = validateFile(file)
    if (fileError) {
      setFailedStage(null)
      setStage('idle')
      setError(fileError)
      return
    }

    setCreating('ai')
    setImportStage('creating_draft')
    setFailedStage(null)
    setSuccess(null)
    setError(null)
    setDuplicateReceipt(null)
    let didRedirect = false
    const timers = [
      window.setTimeout(() => {
        if (activeImportStageRef.current === 'creating_draft') setImportStage('uploading_file')
      }, 350),
      window.setTimeout(() => {
        if (activeImportStageRef.current === 'uploading_file' || activeImportStageRef.current === 'creating_draft') {
          setImportStage('extracting_ai')
        }
      }, 900),
    ]
    try {
      const form = new FormData()
      form.append('file', file!)
      form.append('readAi', 'true')

      const res = await fetch('/api/receipts/import', {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) {
        setDuplicateReceipt(getReceiptDuplicateNotice(json))
        failImport(`${json.error ?? 'สร้าง Draft และอ่านด้วย AI ไม่สำเร็จ'} กรุณาลองใหม่ หรือกดสร้าง Draft เปล่าเพื่อกรอกข้อมูลเอง`)
        return
      }

      const receiptId = getReceiptId(json)
      const targetPath = getReceiptReviewPath(receiptId)
      if (!targetPath) {
        failImport(missingReceiptIdMessage)
        return
      }

      const aiStatus = json.aiStatus ?? (json.data?.warning ? 'failed' : 'success')
      const message = json.message ?? json.data?.warning ?? null
      const notice = buildReviewNotice(aiStatus, message)
      setSuccess(notice?.text ?? 'สร้าง Draft สำเร็จ')
      storeReceiptImportNotice(receiptId, notice)
      setImportStage('redirecting')
      didRedirect = true
      router.push(targetPath)
    } catch {
      failImport('ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือสร้าง Draft เปล่า')
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer))
      if (!didRedirect) setCreating(null)
    }
  }

  const isBusy = Boolean(creating)
  const hasStartedImport = isBusy || Boolean(failedStage) || stage === 'success'
  const currentStageIndex = progressSteps.findIndex((step) => step.stage === stage)
  const failedStageIndex = failedStage ? progressSteps.findIndex((step) => step.stage === failedStage) : -1
  const progressIndex = failedStageIndex >= 0 ? failedStageIndex : currentStageIndex

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-bold text-blue-700">Step 1</p>
            <h2 className="mt-2 text-2xl font-bold text-blue-950">อัปโหลดสลิป</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              อัปโหลดสลิปซื้อวัสดุ แล้วให้ระบบช่วยอ่านข้อมูลเพื่อสร้าง Draft สำหรับตรวจสอบก่อนบันทึกราคา
            </p>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                if (isBusy) return
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`mt-5 flex min-h-72 flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
                isBusy ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-80' : dragging ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
              onClick={() => {
                if (!isBusy) inputRef.current?.click()
              }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-2xl text-white">
                ↑
              </div>
              <h3 className="mt-4 text-lg font-bold text-blue-950">ลากไฟล์มาวาง หรือเลือกไฟล์</h3>
              <p className="mt-2 text-sm text-slate-500">รองรับ JPG, PNG, PDF ขนาดไม่เกิน 10 MB</p>
              {file && (
                <div className="mt-5 w-full max-w-lg rounded-2xl border border-blue-100 bg-white px-4 py-3 text-left shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-700">พร้อมสร้าง Draft</p>
                      <p className="max-w-md truncate text-sm font-bold text-blue-950">{file.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (inputRef.current) inputRef.current.value = ''
                          inputRef.current?.click()
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        เปลี่ยนไฟล์
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation()
                          clearSelectedFile()
                        }}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        ลบไฟล์
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
                disabled={isBusy}
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <aside className="space-y-4 rounded-3xl border border-blue-100 bg-blue-50 p-5 text-blue-950">
            <div>
              <p className="text-sm font-bold text-blue-700">Step 2</p>
              <h3 className="mt-1 text-lg font-bold">AI ช่วยอ่านข้อมูล</h3>
              <p className="mt-2 text-sm leading-6">
                AI จะช่วยกรอกข้อมูลหัวสลิปและรายการสินค้า แต่ต้องตรวจสอบก่อนบันทึกราคาเข้าระบบ
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm leading-6 text-slate-700">
              <p className="font-bold text-blue-950">Step 3: ตรวจสอบ Draft</p>
              <p className="mt-1">
                หลังอ่านเสร็จ ระบบจะพาไปหน้าตรวจสอบ คุณยังแก้ Supplier, วันที่, ยอดรวม, รายการสินค้า และเลือกวัสดุได้เหมือนเดิม
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              ถ้ายังไม่ต้องการใช้ AI สามารถสร้าง Draft เปล่า แล้วกรอกข้อมูลเองในหน้าตรวจสอบได้
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
              <p className="text-sm font-bold text-blue-950">
                {hasStartedImport ? 'สถานะการนำเข้า' : 'ขั้นตอนหลังจากกดนำเข้า'}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {hasStartedImport ? stageText[stage] : 'ระบบจะทำตามขั้นตอนนี้ แล้วพาไปหน้าตรวจสอบ Draft'}
              </p>
              <div className="mt-3 space-y-2">
                {progressSteps.map((step, index) => {
                  const isFailed = failedStage === step.stage
                  const isDone = hasStartedImport && !isFailed && (progressIndex > index || stage === 'success')
                  const isActive = hasStartedImport && !isFailed && step.stage === stage
                  const label = hasStartedImport && isActive ? step.activeLabel : step.plannedLabel
                  return (
                    <div key={step.stage} className="flex items-center gap-2 text-sm">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isFailed ? 'bg-red-100 text-red-700' : isDone ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-blue-950 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isFailed ? '!' : isDone ? '✓' : index + 1}
                      </span>
                      <span className={isFailed ? 'font-bold text-red-700' : isActive ? 'font-bold text-blue-950' : isDone ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>

        {(error || success) && (
          <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            {error ? (
              <>
                <p>สร้าง Draft ไม่สำเร็จ</p>
                <p className="mt-1 font-medium">{error}</p>
                {duplicateReceipt && routes.receipts.detail(duplicateReceipt.id) && (
                  <Link href={routes.receipts.detail(duplicateReceipt.id)!} className="mt-2 inline-flex font-bold underline">
                    เปิดสลิปเดิม{duplicateReceipt.receiptNo ? ` เลขที่ ${duplicateReceipt.receiptNo}` : ''}
                  </Link>
                )}
              </>
            ) : success}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <div className="text-sm font-semibold text-slate-500 sm:mr-auto">
            {isBusy ? stageText[stage] : file ? 'พร้อมสร้าง Draft' : 'กรุณาเลือกไฟล์สลิปก่อน'}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              if (!isBusy) router.push(routes.receipts.list())
            }}
            disabled={isBusy}
            className="btn-secondary"
          >
            ยกเลิก
          </button>
          <button type="button" onClick={createBlankDraft} disabled={isBusy} className="btn-secondary">
            {creating === 'blank' ? 'กำลังสร้าง...' : 'สร้าง Draft เปล่า'}
          </button>
          <button type="button" onClick={createDraftAndReadAi} disabled={isBusy || !file} className="btn-primary">
            {creating === 'ai' ? 'กำลังนำเข้า...' : 'สร้าง Draft และอ่านด้วย AI'}
          </button>
        </div>
      </section>
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getReceiptId(response: any) {
  return response?.receiptId ?? response?.data?.id ?? response?.data?.receipt?.id ?? null
}

function getReceiptReviewPath(receiptId: unknown) {
  const targetPath = routes.receipts.detail(receiptId)
  return targetPath?.startsWith('/receipts/') ? targetPath : null
}

function buildReviewNotice(aiStatus: string, message: string | null): ReceiptImportNotice | null {
  if (aiStatus === 'success') {
    return { type: 'message', text: message || 'อ่านสลิปสำเร็จ กรุณาตรวจสอบข้อมูลก่อนบันทึก' }
  }
  if (aiStatus === 'missing_config') {
    return { type: 'warning', text: message || 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณากรอกข้อมูลเอง' }
  }
  if (aiStatus === 'failed') {
    return { type: 'warning', text: message || 'ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือกรอกข้อมูลเอง' }
  }
  return message ? { type: 'message', text: message } : null
}

function storeReceiptImportNotice(receiptId: string, notice: ReceiptImportNotice | null) {
  if (!notice) return
  try {
    window.sessionStorage.setItem(`receipt-import-notice:${receiptId}`, JSON.stringify(notice))
  } catch {
    // Navigation must not fail just because browser storage is unavailable.
  }
}
