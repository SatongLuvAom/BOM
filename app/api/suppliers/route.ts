import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { getPaginationRange } from '@/lib/utils'
import { createReceiptSupplierSchema, createSupplierSchema } from '@/lib/validations/supplier'
import { generateSupplierId, writeAuditLog } from '@/lib/server-utils'
import { buildOrIlikeFilter, normalizeSearchTerm } from '@/lib/supabase/filters'
import { invalidateActiveSuppliersCache } from '@/lib/server/master-data-cache'
import { findReceiptSupplierDuplicates } from '@/lib/receipt-supplier-match'
import type { ReceiptSupplier } from '@/types/receipt'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const search = normalizeSearchTerm(searchParams.get('search'))
  const status = searchParams.get('status') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
  const { from, to } = getPaginationRange(page, limit)

  let query = supabase
    .from('supplier')
    .select('*', { count: 'exact' })
    .eq('is_deleted', false)

  if (search) {
    query = query.or(buildOrIlikeFilter(['supplier_code', 'supplier_name_th', 'supplier_name_en', 'tax_id'], search))
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    limit,
  })
}

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid supplier payload' }, { status: 400 })
  }
  const payload = {
    ...body,
    supplier_code: typeof body.supplier_code === 'string' ? body.supplier_code.trim().toUpperCase() : body.supplier_code,
    supplier_name_th: typeof body.supplier_name_th === 'string' ? body.supplier_name_th.trim() : body.supplier_name_th,
    supplier_name_en: typeof body.supplier_name_en === 'string' ? body.supplier_name_en.trim() : body.supplier_name_en,
    tax_id: typeof body.tax_id === 'string' ? body.tax_id.trim() : body.tax_id,
  }

  const fromReceipt = body.source_receipt_id !== undefined || body.confirm_supplier !== undefined
  const parsed = (fromReceipt ? createReceiptSupplierSchema : createSupplierSchema).safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Strip receipt context before inserting into the existing supplier table.
  const input = createSupplierSchema.parse(parsed.data)

  if ('source_receipt_id' in parsed.data) {
    const { data: receipt, error } = await supabase.from('purchase_receipts')
      .select('id, status').eq('id', parsed.data.source_receipt_id).maybeSingle()
    if (error) return NextResponse.json({ error: 'ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
    if (!receipt) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 })
    if (receipt.status === 'posted') return NextResponse.json({ error: 'สลิปนี้บันทึกราคาแล้ว สร้างร้านจากสลิปนี้ไม่ได้' }, { status: 400 })

    // Legacy tax IDs/names can contain formatting. Compare normalized identities,
    // paging only identity columns at creation time rather than trusting the UI list.
    let offset = 0
    while (true) {
      const { data: rows, error: lookupError, count } = await supabase.from('supplier')
        .select('id, supplier_id, supplier_code, supplier_name_th, supplier_name_en, tax_id, phone, status', { count: 'exact' })
        .eq('is_deleted', false).order('id').range(offset, offset + 499)
      if (lookupError || count === null || !rows || (rows.length === 0 && offset < count)) {
        return NextResponse.json({ error: 'ตรวจร้านซ้ำไม่สำเร็จ ยังไม่ได้สร้างร้าน กรุณาลองใหม่' }, { status: 500 })
      }
      const duplicates = findReceiptSupplierDuplicates(input, rows as ReceiptSupplier[])
      if (duplicates.length) {
        return NextResponse.json({
          error: 'พบร้านที่มีชื่อหรือเลขผู้เสียภาษีตรงกัน กรุณาตรวจและใช้ร้านเดิมก่อนสร้างใหม่',
          existing_suppliers: duplicates,
        }, { status: 409 })
      }
      offset += rows.length
      if (offset >= count) break
    }
  }

  const { data: codeExisting, error: codeError } = await supabase
    .from('supplier')
    .select('supplier_id')
    .eq('supplier_code', input.supplier_code)
    .eq('is_deleted', false)
    .limit(1)

  if (codeError) return NextResponse.json({ error: 'ตรวจรหัสร้านซ้ำไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })

  if (codeExisting && codeExisting.length > 0) {
    return NextResponse.json(
      { error: `Supplier code "${input.supplier_code}" already exists` },
      { status: 409 },
    )
  }

  if (input.tax_id) {
    const { data: taxExisting, error: taxError } = await supabase
      .from('supplier')
      .select('supplier_id')
      .eq('tax_id', input.tax_id)
      .eq('is_deleted', false)
      .limit(1)

    if (taxError) return NextResponse.json({ error: 'ตรวจเลขผู้เสียภาษีซ้ำไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })

    if (taxExisting && taxExisting.length > 0) {
      return NextResponse.json(
        { error: `Tax ID "${input.tax_id}" already exists` },
        { status: 409 },
      )
    }
  }

  const supplier_id = await generateSupplierId()
  const { data, error } = await supabase
    .from('supplier')
    .insert({ ...input, supplier_id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.code === '23505'
      ? 'รหัสร้านหรือเลขผู้เสียภาษีซ้ำกับรายการที่มีอยู่ กรุณาตรวจร้านเดิมแล้วลองใหม่'
      : error.message }, { status: error.code === '23505' ? 409 : 500 })
  }

  invalidateActiveSuppliersCache()

  await writeAuditLog({
    entityType: 'supplier',
    entityKey: supplier_id,
    action: 'CREATE',
    payload: data,
  })

  return NextResponse.json({ data }, { status: 201 })
}
