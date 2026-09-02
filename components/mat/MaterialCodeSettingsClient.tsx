'use client'

import { useState } from 'react'
import type { MatCategory, MaterialType } from '@/types/mat'
import { useI18n } from '@/lib/i18n/client'
import { sanitizeCategoryPrefix, sanitizeTypePrefix } from '@/lib/material-code'

type SequenceGroup = {
  id: string
  category_prefix: string
  type_prefix: string
  spec_key: string
  last_no: number
  updated_at: string
}

interface MaterialCodeSettingsClientProps {
  categories: MatCategory[]
  materialTypes: MaterialType[]
  sequences: SequenceGroup[]
}

export function MaterialCodeSettingsClient({
  categories,
  materialTypes,
  sequences,
}: MaterialCodeSettingsClientProps) {
  const { text } = useI18n()
  const [typeRows, setTypeRows] = useState(materialTypes)
  const [categoryPrefixes, setCategoryPrefixes] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((category) => [category.id, category.code_prefix ?? category.cat_code])),
  )
  const [newType, setNewType] = useState({
    category_id: categories[0]?.id ?? '',
    name: '',
    code_prefix: '',
    description: '',
  })
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function post(body: Record<string, unknown>) {
    setError('')
    setMessage('')
    const res = await fetch('/api/material-code/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error ?? 'Save failed')
    }
    return json.data
  }

  async function updateCategoryPrefix(category: MatCategory) {
    setSavingKey(`cat-${category.id}`)
    try {
      await post({
        action: 'update_category_prefix',
        category_id: category.id,
        code_prefix: categoryPrefixes[category.id],
      })
      setMessage('Category prefix updated.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingKey('')
    }
  }

  async function createType() {
    setSavingKey('new-type')
    try {
      const created = await post({
        action: 'create_type',
        ...newType,
      })
      setTypeRows((current) => [
        {
          ...created,
          category: categories.find((category) => category.id === created.category_id) ?? null,
        },
        ...current,
      ])
      setNewType({ ...newType, name: '', code_prefix: '', description: '' })
      setMessage('Material type created.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingKey('')
    }
  }

  async function toggleType(type: MaterialType) {
    setSavingKey(`type-${type.id}`)
    try {
      const updated = await post({
        action: 'update_type',
        id: type.id,
        is_active: !type.is_active,
      })
      setTypeRows((current) => current.map((row) => row.id === type.id ? { ...row, ...updated, category: row.category } : row))
      setMessage('Material type updated.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingKey('')
    }
  }

  return (
    <div className="space-y-6" data-i18n-managed>
      {(message || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {text(error || message)}
        </div>
      )}

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{text('Validation rules')}</h2>
          <p className="mt-1 text-sm text-slate-500">{text('CATEGORY-TYPE-SPEC-SEQ · uppercase English letters, numbers, and hyphen only.')}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 text-sm text-slate-600 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">{text('Regex')}</p>
            <p className="mt-1 font-mono text-xs text-slate-800">^[A-Z0-9]{'{2,5}'}-[A-Z0-9]{'{2,8}'}-[A-Z0-9]{'{2,12}'}-[0-9]{'{4}'}$</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">{text('Spec examples')}</p>
            <p className="mt-1 font-mono text-xs text-slate-800">006 · 030W · 24V · W1000 · CLR · GEN</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">{text('Code lock')}</p>
            <p className="mt-1 text-xs text-slate-800">{text('Changes require a reason and are stored in code history.')}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{text('Category prefixes')}</h2>
          <p className="mt-1 text-sm text-slate-500">{text('Used as the CATEGORY segment in generated material codes.')}</p>
        </div>
        <div className="divide-y divide-stone-100">
          {categories.map((category) => (
            <div key={category.id} className="grid grid-cols-1 gap-3 px-5 py-3 md:grid-cols-[1fr_160px_auto] md:items-center">
              <div>
                <p className="font-semibold text-slate-900">[{category.cat_code}] {text(category.cat_name_th)}</p>
                <p className="text-xs text-slate-400">{text(category.cat_name_en ?? category.cat_id)}</p>
              </div>
              <input
                value={categoryPrefixes[category.id] ?? ''}
                onChange={(e) => setCategoryPrefixes((current) => ({
                  ...current,
                  [category.id]: sanitizeCategoryPrefix(e.target.value),
                }))}
                className="rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => updateCategoryPrefix(category)}
                disabled={savingKey === `cat-${category.id}`}
                className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {text('Save')}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{text('Material types')}</h2>
          <p className="mt-1 text-sm text-slate-500">{text('Used as the TYPE segment and filtered by category.')}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 border-b border-stone-100 p-5 md:grid-cols-[1.2fr_1fr_120px_1.4fr_auto]">
          <select
            value={newType.category_id}
            onChange={(e) => setNewType((current) => ({ ...current, category_id: e.target.value }))}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                [{category.code_prefix ?? category.cat_code}] {text(category.cat_name_th)}
              </option>
            ))}
          </select>
          <input
            value={newType.name}
            onChange={(e) => setNewType((current) => ({ ...current, name: e.target.value }))}
            placeholder={text('Type name')}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            value={newType.code_prefix}
            onChange={(e) => setNewType((current) => ({ ...current, code_prefix: sanitizeTypePrefix(e.target.value) }))}
            placeholder={text('HMR')}
            className="rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
          />
          <input
            value={newType.description}
            onChange={(e) => setNewType((current) => ({ ...current, description: e.target.value }))}
            placeholder={text('Description')}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createType}
            disabled={savingKey === 'new-type' || !newType.name || !newType.code_prefix}
            className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {text('Add type')}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3">{text('Category')}</th>
                <th className="px-3 py-3">{text('Type')}</th>
                <th className="px-3 py-3">{text('Prefix')}</th>
                <th className="px-3 py-3">{text('Status')}</th>
                <th className="px-5 py-3 text-right">{text('Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
      {typeRows.map((type) => (
                <tr key={type.id}>
                  <td className="px-5 py-3 text-slate-600">{text(type.category?.cat_name_th ?? type.category_id)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{text(type.name)}</td>
                  <td className="px-3 py-3 font-mono text-slate-700">{type.code_prefix}</td>
                  <td className="px-3 py-3 text-slate-500">{text(type.is_active ? 'Active' : 'Inactive')}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleType(type)}
                      disabled={savingKey === `type-${type.id}`}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-stone-50"
                    >
                      {text(type.is_active ? 'Disable' : 'Enable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">{text('Sequence groups')}</h2>
          <p className="mt-1 text-sm text-slate-500">{text('Read-only running numbers per CATEGORY + TYPE + SPEC.')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3">{text('Group')}</th>
                <th className="px-3 py-3">{text('Last no')}</th>
                <th className="px-3 py-3">{text('Updated')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sequences.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-sm text-slate-400">{text('No sequence groups yet.')}</td>
                </tr>
              ) : sequences.map((sequence) => (
                <tr key={sequence.id}>
                  <td className="px-5 py-3 font-mono text-slate-900">
                    {sequence.category_prefix}-{sequence.type_prefix}-{sequence.spec_key}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{sequence.last_no}</td>
                  <td className="px-3 py-3 text-slate-500">{new Date(sequence.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
