'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { UomList } from '@/components/mat/UomList'
import type { MatUom } from '@/types/mat'

export default function UomPage() {
  const [uoms, setUoms] = useState<MatUom[]>([])
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadUoms()
  }, [])

  async function loadUoms() {
    setError(null)
    const res = await fetch('/api/uom')
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to load UOM data')
      setUoms([])
      return
    }
    setUoms(json.data ?? [])
  }

  return (
    <div>
      <Header
        title="หน่วยนับ (UOM)"
        subtitle={`${uoms.length} หน่วย`}
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary"
          >
            + เพิ่มหน่วย
          </button>
        }
      />
      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      )}
      <div className="app-page-content"><UomList
        uoms={uoms}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onAdded={loadUoms}
      /></div>
    </div>
  )
}
