'use client'

import { useEffect, useState } from 'react'
import { formatThaiDateShort } from '@/lib/utils'

interface Comment {
  comment_id: string
  body:       string
  author:     string
  created_at: string
}

interface Props {
  projectId: string
  itemId:    string
  itemName:  string
  open:      boolean
  onClose:   () => void
}

export function ItemComments({ projectId, itemId, itemName, open, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [body,     setBody]     = useState('')
  const [author,   setAuthor]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [posting,  setPosting]  = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/boq/${projectId}/items/${itemId}/comments`)
      .then((r) => r.json())
      .then((j) => setComments(j.data ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    load()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, itemId])

  if (!open) return null

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`/api/boq/${projectId}/items/${itemId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), author: author.trim() || 'ผู้ใช้' }),
      })
      if (res.ok) {
        setBody('')
        load()
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(c: Comment) {
    await fetch(`/api/boq/${projectId}/items/${itemId}/comments/${c.comment_id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex h-[70vh] w-96 flex-col rounded-xl bg-white shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">หมายเหตุ</h4>
            <p className="text-xs text-gray-400 truncate max-w-[240px]" title={itemName}>{itemName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Comments */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-8">กำลังโหลด...</p>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">ยังไม่มีหมายเหตุ</p>
          ) : (
            comments.map((c) => (
              <div key={c.comment_id} className="group rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{c.author}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">
                      {formatThaiDateShort(c.created_at)}
                    </span>
                    <button
                      onClick={() => handleDelete(c)}
                      className="hidden group-hover:block text-[10px] text-red-400 hover:text-red-600"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Post form */}
        <form onSubmit={handlePost} className="border-t border-gray-100 p-3 space-y-2">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="ชื่อ (ไม่บังคับ)"
            className="block w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="เพิ่มหมายเหตุ..."
            rows={3}
            className="block w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePost(e as any)
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-400">Ctrl+Enter เพื่อส่ง</p>
            <button
              type="submit"
              disabled={posting || !body.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {posting ? '...' : 'ส่ง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
