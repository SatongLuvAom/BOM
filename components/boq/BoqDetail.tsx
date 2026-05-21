'use client'

import Link from 'next/link'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { BoqItemForm } from '@/components/boq/BoqItemForm'
import { PriceHistoryModal } from '@/components/boq/PriceHistoryModal'
import { AiPricePanel } from '@/components/boq/AiPricePanel'
import { ExcelImportModal } from '@/components/boq/ExcelImportModal'
import { AttachmentPanel } from '@/components/boq/AttachmentPanel'
import { ItemComments } from '@/components/boq/ItemComments'
import { BomPickerModal } from '@/components/boq/BomPickerModal'
import { formatThaiDateShort } from '@/lib/utils'
import { routes } from '@/lib/routes'
import type { BoqProject, BoqItem, BoqStatus } from '@/types/boq'

const TYPE_COLOR: Record<string, 'blue' | 'gray' | 'yellow' | 'orange'> = {
  MAT: 'blue', LABOR: 'gray', SERVICE: 'yellow', MISC: 'orange',
}
const TYPE_LABEL: Record<string, string> = {
  MAT: 'วัสดุ', LABOR: 'แรงงาน', SERVICE: 'บริการ', MISC: 'อื่นๆ',
}
const STATUS_MAP: Record<BoqStatus, { label: string; color: 'blue' | 'green' | 'red' }> = {
  DRAFT:     { label: 'Draft',      color: 'blue' },
  CONFIRMED: { label: 'ยืนยันแล้ว', color: 'green' },
  CANCELLED: { label: 'ยกเลิก',    color: 'red' },
}

export function BoqDetail({ project }: { project: BoqProject }) {
  const router = useRouter()
  const [items,         setItems]         = useState<BoqItem[]>(project.items ?? [])
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingItem,   setEditingItem]   = useState<BoqItem | undefined>()
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [cloning,       setCloning]       = useState(false)
  const [showAi,        setShowAi]        = useState(false)
  const [importOpen,    setImportOpen]    = useState(false)
  const [bomOpen,       setBomOpen]       = useState(false)
  const [savingTpl,     setSavingTpl]     = useState(false)
  const [commentItem,   setCommentItem]   = useState<BoqItem | null>(null)

  // Price history modal
  const [historyMat, setHistoryMat] = useState<{ id: string; name: string } | null>(null)

  // Drag state
  const dragIndex = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const grandTotal = items
    .filter((i) => i.item_type !== 'SECTION')
    .reduce((s, i) => s + (i.total_price ?? 0), 0)
  const { label: statusLabel, color: statusColor } = STATUS_MAP[project.status]
  const canEdit = project.status !== 'CANCELLED'

  // ── CRUD ─────────────────────────────────────────────────────

  function openAdd() { setEditingItem(undefined); setModalOpen(true) }
  function openEdit(item: BoqItem) { setEditingItem(item); setModalOpen(true) }

  function handleSaved() {
    fetch(`/api/boq/${project.project_id}/items`)
      .then((r) => r.json())
      .then((j) => { if (j.data) setItems(j.data) })
    router.refresh()
  }

  async function handleDelete(item: BoqItem) {
    if (!confirm(`ลบ "${item.item_name}" ?`)) return
    setDeletingId(item.item_id)
    try {
      await fetch(`/api/boq/${project.project_id}/items/${item.item_id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((i) => i.item_id !== item.item_id))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleStatusChange(next: BoqStatus) {
    if (!confirm(`เปลี่ยนสถานะเป็น "${STATUS_MAP[next].label}" ?`)) return
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/boq/${project.project_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) router.refresh()
    } finally {
      setStatusLoading(false)
    }
  }

  async function handleSaveTemplate() {
    const name = window.prompt('ตั้งชื่อ Template:', project.project_name)
    if (!name) return
    setSavingTpl(true)
    try {
      const res  = await fetch(`/api/boq/${project.project_id}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      alert(`บันทึก Template "${name}" เรียบร้อย (${json.items_count} รายการ)`)
    } finally {
      setSavingTpl(false)
    }
  }

  async function handleClone() {
    if (!confirm('สร้างสำเนาโปรเจกต์นี้?')) return
    setCloning(true)
    try {
      const res  = await fetch(`/api/boq/${project.project_id}/clone`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        const target = routes.boq.detail(json.data?.project_id)
        if (!target) {
          alert('ไม่สามารถเปิดหน้าถัดไปได้ เนื่องจากไม่พบรหัสรายการ')
          return
        }
        router.push(target)
      }
    } finally {
      setCloning(false)
    }
  }

  // ── Drag Reorder ──────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, idx: number) {
    dragIndex.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === idx) { setDragOverIndex(null); return }

    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(idx, 0, moved)
    const withSeq = reordered.map((item, i) => ({ ...item, seq: i + 1 }))
    setItems(withSeq)
    setDragOverIndex(null)
    dragIndex.current = null

    // Persist
    fetch(`/api/boq/${project.project_id}/items/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: withSeq.map((i) => ({ item_id: i.item_id, seq: i.seq })) }),
    })
  }

  function handleDragEnd() {
    dragIndex.current = null
    setDragOverIndex(null)
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-5 px-6 py-5">
      {/* Project header */}
      <div className="rounded-2xl border border-stone-200 bg-[var(--app-surface)] p-5 shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Badge label={statusLabel} color={statusColor} />
              <span className="font-mono text-xs font-semibold text-slate-400">{project.project_id}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">{project.project_name}</h2>
            {project.client_name  && <p className="text-sm font-medium text-slate-500">ลูกค้า: {project.client_name}</p>}
            {project.site_address && <p className="text-sm font-medium text-slate-500">สถานที่: {project.site_address}</p>}
            <p className="text-sm font-medium text-slate-500">
              วันที่: {formatThaiDateShort(project.project_date)}
            </p>
            {project.note && <p className="text-sm italic text-slate-400">{project.note}</p>}
          </div>

          <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
            {project.status === 'DRAFT' && (
              <button
                onClick={() => handleStatusChange('CONFIRMED')}
                disabled={statusLoading}
                className="btn-primary bg-emerald-700 hover:bg-emerald-800"
              >
                ✓ ยืนยัน BOQ
              </button>
            )}
            {project.status === 'CONFIRMED' && (
              <button
                onClick={() => handleStatusChange('CANCELLED')}
                disabled={statusLoading}
                className="btn-secondary border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                ยกเลิก
              </button>
            )}
            <Link
              href={`/boq/${project.project_id}/print`}
              target="_blank"
              className="btn-secondary"
            >
              🖨️ พิมพ์ PDF
            </Link>
            <button
              onClick={handleClone}
              disabled={cloning}
              className="btn-secondary disabled:opacity-50"
            >
              {cloning ? '...' : '⧉ Duplicate'}
            </button>
            <button
              onClick={handleSaveTemplate}
              disabled={savingTpl}
              className="btn-secondary disabled:opacity-50"
              title="บันทึกเป็น Template"
            >
              {savingTpl ? '...' : '🗂 Template'}
            </button>
            <Link
              href={`/boq/${project.project_id}/edit`}
              className="btn-secondary"
            >
              แก้ไข
            </Link>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-[var(--app-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h3 className="font-bold text-slate-950">รายการ BOQ ({items.length} รายการ)</h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBomOpen(true)}
                className="btn-secondary border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800 hover:bg-amber-100"
              >
                🧩 เพิ่มจาก BOM
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="btn-secondary px-3 py-1.5"
              >
                📋 นำเข้า Excel
              </button>
              <button
                onClick={openAdd}
                className="btn-primary px-4 py-1.5"
              >
                + เพิ่มรายการ
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {canEdit && <th className="w-6 px-2 py-2.5" />}
                <th className="w-8 px-3 py-2.5 text-center font-medium text-gray-500">#</th>
                <th className="px-3 py-2.5 font-medium text-gray-500">ประเภท</th>
                <th className="px-3 py-2.5 font-medium text-gray-500">รายการ</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-500">หน่วย</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-500">จำนวน</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-500">Waste%</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-500">จำนวนสุทธิ</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-500">ราคา/หน่วย</th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-500">รวม</th>
                {canEdit && <th className="px-3 py-2.5 w-20" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot; เพื่อเริ่มต้น
                  </td>
                </tr>
              )}
              {items.map((item, idx) => {
                const isOver = dragOverIndex === idx

                // ── SECTION row ───────────────────────────────
                if (item.item_type === 'SECTION') {
                  return (
                    <tr
                      key={item.item_id}
                      draggable={canEdit}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                    className={`border-y border-stone-300 bg-stone-100 transition-colors ${isOver ? 'opacity-50' : ''}`}
                    >
                      {canEdit && (
                        <td className="px-2 py-2 text-center cursor-grab text-gray-400 select-none">⠿</td>
                      )}
                      <td className="px-3 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
                      <td colSpan={canEdit ? 8 : 8} className="px-3 py-2 font-semibold text-gray-700">
                        📁 {item.item_name}
                        {item.spec && <span className="ml-2 text-xs font-normal text-gray-500">{item.spec}</span>}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(item)} className="text-xs text-blue-600 hover:text-blue-800">แก้</button>
                            <button
                              onClick={() => handleDelete(item)}
                              disabled={deletingId === item.item_id}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                            >
                              {deletingId === item.item_id ? '...' : 'ลบ'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                }

                // ── Normal item row ────────────────────────────
                return (
                  <tr
                    key={item.item_id}
                    draggable={canEdit}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`border-b border-stone-100 transition-colors hover:bg-cyan-50/35 ${isOver ? 'opacity-50 bg-cyan-50' : ''}`}
                  >
                    {canEdit && (
                      <td className="px-2 py-2.5 text-center cursor-grab text-gray-300 hover:text-gray-500 select-none" title="ลากเพื่อเรียงลำดับ">
                        ⠿
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <Badge label={TYPE_LABEL[item.item_type]} color={TYPE_COLOR[item.item_type]} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="truncate font-semibold text-slate-950">{item.item_name}</p>
                      {item.spec && <p className="truncate text-xs text-slate-400">{item.spec}</p>}
                      {item.material_id && (
                        <button
                          onClick={() => setHistoryMat({ id: item.material_id!, name: item.item_name })}
                          className="mt-0.5 font-mono text-[10px] font-semibold text-cyan-600 hover:text-cyan-800 hover:underline"
                          title="ดูประวัติราคา"
                        >
                          {item.material_id} 📈
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{item.uom}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {Number(item.qty).toLocaleString('th-TH', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {Number(item.waste_pct).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {Number(item.final_qty).toLocaleString('th-TH', { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {Number(item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                      {Number(item.total_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(item)}  className="text-xs text-blue-600 hover:text-blue-800">แก้</button>
                          <button onClick={() => setCommentItem(item)} className="text-xs text-gray-400 hover:text-gray-700" title="หมายเหตุ">💬</button>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.item_id}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                          >
                            {deletingId === item.item_id ? '...' : 'ลบ'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {items.filter((i) => i.item_type !== 'SECTION').length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-stone-300 bg-stone-100/80">
                  <td colSpan={canEdit ? 9 : 8} className="px-3 py-3 text-right font-bold text-slate-700">
                    รวมทั้งสิ้น
                  </td>
                  <td className="px-3 py-3 text-right text-lg font-black text-cyan-800">
                    {grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* AI Price Panel */}
      {canEdit && items.some((i) => i.item_type === 'MAT' && i.material_id) && (
        <AiPricePanel projectId={project.project_id} onApplied={handleSaved} />
      )}

      {/* Attachments */}
      <AttachmentPanel projectId={project.project_id} />

      {/* Modals */}
      <BoqItemForm
        projectId={project.project_id}
        item={editingItem}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      {historyMat && (
        <PriceHistoryModal
          materialId={historyMat.id}
          materialName={historyMat.name}
          open={!!historyMat}
          onClose={() => setHistoryMat(null)}
        />
      )}

      <ExcelImportModal
        projectId={project.project_id}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleSaved}
      />

      {bomOpen && (
        <BomPickerModal
          projectId={project.project_id}
          onClose={() => setBomOpen(false)}
          onAdded={handleSaved}
        />
      )}

      {commentItem && (
        <ItemComments
          projectId={project.project_id}
          itemId={commentItem.item_id}
          itemName={commentItem.item_name}
          open={!!commentItem}
          onClose={() => setCommentItem(null)}
        />
      )}
    </div>
  )
}
