'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

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

const progressSteps: Array<{ stage: ImportStage; label: string }> = [
  { stage: 'creating_draft', label: 'กำลังสร้าง Draft...' },
  { stage: 'uploading_file', label: 'กำลังอัปโหลดไฟล์...' },
  { stage: 'extracting_ai', label: 'กำลังอ่านสลิปด้วย AI...' },
  { stage: 'redirecting', label: 'กำลังเปิดหน้าตรวจสอบ...' },
]

export function ReceiptCreateDraftForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [creating, setCreating] = useState<'ai' | 'blank' | null>(null)
  const [stage, setStage] = useState<ImportStage>('idle')
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function validateFile(nextFile: File | null) {
    if (!nextFile) return 'กรุณาเลือกไฟล์สลิปก่อน'
    if (!SUPPORTED_MIME_TYPES.has(nextFile.type)) return 'รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF'
    if (nextFile.size > MAX_FILE_SIZE) return 'ไฟล์ใหญ่เกิน 10 MB'
    return null
  }

  function selectFile(nextFile: File | null) {
    const fileError = validateFile(nextFile)
    setError(fileError)
    setSuccess(null)
    setStage(fileError ? 'error' : 'file_selected')
    setFile(fileError ? null : nextFile)
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  async function createBlankDraft() {
    setCreating('blank')
    setStage('creating_draft')
    setSuccess(null)
    setError(null)
    let didRedirect = false
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        setStage('error')
        setError(json.error ?? 'สร้าง Draft ไม่สำเร็จ')
        return
      }
      setStage('redirecting')
      didRedirect = true
      router.push(`/receipts/${json.data.id}`)
    } catch {
      setStage('error')
      setError('สร้าง Draft ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      if (!didRedirect) setCreating(null)
    }
  }

  async function createDraftAndReadAi() {
    const fileError = validateFile(file)
    if (fileError) {
      setStage('error')
      setError(fileError)
      return
    }

    setCreating('ai')
    setStage('creating_draft')
    setSuccess(null)
    setError(null)
    let didRedirect = false
    const timers = [
      window.setTimeout(() => setStage((current) => current === 'creating_draft' ? 'uploading_file' : current), 350),
      window.setTimeout(() => setStage((current) => current === 'uploading_file' || current === 'creating_draft' ? 'extracting_ai' : current), 900),
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
        setStage('error')
        setError(`${json.error ?? 'สร้าง Draft และอ่านด้วย AI ไม่สำเร็จ'} กรุณาลองใหม่ หรือกดสร้าง Draft เปล่าเพื่อกรอกข้อมูลเอง`)
        return
      }

      const receiptId = json.receiptId ?? json.data?.receipt?.id
      if (!receiptId) {
        setStage('error')
        setError('สร้าง Draft แล้วแต่ไม่พบเลขอ้างอิงสลิป')
        return
      }

      const aiStatus = json.aiStatus ?? (json.data?.warning ? 'failed' : 'success')
      const message = json.message ?? json.data?.warning ?? null
      setStage('success')
      setSuccess(message ?? 'สร้าง Draft สำเร็จ')

      const query = buildReviewQuery(aiStatus, message)
      didRedirect = true
      window.setTimeout(() => {
        setStage('redirecting')
        router.push(`/receipts/${receiptId}${query}`)
      }, 250)
    } catch {
      setStage('error')
      setError('ไม่สามารถอ่านสลิปได้ กรุณาลองใหม่หรือสร้าง Draft เปล่า')
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer))
      if (!didRedirect) setCreating(null)
    }
  }

  const isBusy = Boolean(creating)
  const currentStageIndex = progressSteps.findIndex((step) => step.stage === stage)

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
        stage === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : stage === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-blue-100 bg-blue-50 text-blue-900'
      }`}>
        {error || success || stageText[stage]}
      </div>

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
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`mt-5 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${
                dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/60'
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-2xl text-white">
                ↑
              </div>
              <h3 className="mt-4 text-lg font-bold text-blue-950">ลากไฟล์มาวาง หรือเลือกไฟล์</h3>
              <p className="mt-2 text-sm text-slate-500">รองรับ JPG, PNG, PDF ขนาดไม่เกิน 10 MB</p>
              {file && (
                <div className="mt-5 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-left shadow-sm">
                  <p className="text-xs font-bold text-emerald-700">เลือกไฟล์แล้ว</p>
                  <p className="max-w-md truncate text-sm font-bold text-blue-950">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  <p className="mt-2 text-xs font-semibold text-blue-700">พร้อมสร้าง Draft</p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
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
              <p className="text-sm font-bold text-blue-950">สถานะการนำเข้า</p>
              <div className="mt-3 space-y-2">
                {progressSteps.map((step, index) => {
                  const isDone = currentStageIndex > index || stage === 'success' || stage === 'redirecting'
                  const isActive = step.stage === stage
                  return (
                    <div key={step.stage} className="flex items-center gap-2 text-sm">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isDone ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-blue-950 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isDone ? '✓' : index + 1}
                      </span>
                      <span className={isActive ? 'font-bold text-blue-950' : isDone ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={() => router.push('/receipts')} className="btn-secondary">
            ยกเลิก
          </button>
          <button type="button" onClick={createBlankDraft} disabled={isBusy} className="btn-secondary">
            {creating === 'blank' ? 'กำลังสร้าง...' : 'สร้าง Draft เปล่า'}
          </button>
          <button type="button" onClick={createDraftAndReadAi} disabled={isBusy || !file} className="btn-primary">
            {creating === 'ai' ? 'กำลังอ่านสลิปด้วย AI...' : 'สร้าง Draft และอ่านด้วย AI'}
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

function buildReviewQuery(aiStatus: string, message: string | null) {
  if (aiStatus === 'success') return '?ai=success'
  if (aiStatus === 'missing_config') return '?ai=missing_config'
  if (aiStatus === 'failed') return `?ai=failed${message ? `&warning=${encodeURIComponent(message)}` : ''}`
  return ''
}
