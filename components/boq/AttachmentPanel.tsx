'use client'

import { useEffect, useRef, useState } from 'react'
import { formatThaiDateShort } from '@/lib/utils'

interface Attachment {
  attachment_id: string
  file_name:     string
  file_size:     number | null
  mime_type:     string | null
  note:          string | null
  created_at:    string
}

interface Props {
  projectId: string
}

function fileIcon(mime: string | null) {
  if (!mime) return '📄'
  if (mime.startsWith('image/'))       return '🖼️'
  if (mime === 'application/pdf')      return '📕'
  if (mime.includes('word'))           return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  return '📄'
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentPanel({ projectId }: Props) {
  const [files,     setFiles]     = useState<Attachment[]>([])
  const [loading,   setLoading]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [note,      setNote]      = useState('')
  const [error,     setError]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    fetch(`/api/boq/${projectId}/attachments`)
      .then((r) => r.json())
      .then((j) => setFiles(j.data ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [projectId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('note', note)
      const res  = await fetch(`/api/boq/${projectId}/attachments`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'เกิดข้อผิดพลาด'); return }
      setNote('')
      load()
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDownload(att: Attachment) {
    const res  = await fetch(`/api/boq/${projectId}/attachments/${att.attachment_id}`)
    const json = await res.json()
    if (!res.ok) { alert(json.error); return }
    window.open(json.url, '_blank')
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`ลบไฟล์ "${att.file_name}" ?`)) return
    await fetch(`/api/boq/${projectId}/attachments/${att.attachment_id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">📎 ไฟล์แนบ ({files.length})</h3>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        {/* Upload */}
        <div className="flex items-center gap-2">
          <input
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ถ้ามี)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? 'กำลังอัพโหลด...' : '⬆ อัพโหลดไฟล์'}
            <input ref={inputRef} type="file" className="sr-only" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        <p className="text-xs text-gray-400">รองรับ: รูปภาพ, PDF, Word, Excel — สูงสุด 20 MB</p>

        {/* File list */}
        {loading ? (
          <p className="text-xs text-gray-400 py-4 text-center">กำลังโหลด...</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">ยังไม่มีไฟล์แนบ</p>
        ) : (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div key={f.attachment_id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:bg-gray-100">
                <span className="text-lg">{fileIcon(f.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{f.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(f.file_size)}
                    {f.note && <> · {f.note}</>}
                    {' · '}
                    {formatThaiDateShort(f.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(f)}
                  className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
                >
                  เปิด
                </button>
                <button
                  onClick={() => handleDelete(f)}
                  className="text-xs text-red-400 hover:text-red-600 shrink-0"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
