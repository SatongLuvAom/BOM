import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { updateMaterialSchema } from '@/lib/validations/material'
import { buildNormalizedMaterialName } from '@/lib/material-master'
import { analyzeMaterialQuality } from '@/lib/material-quality'
import { fetchLatestPriceMap } from '@/lib/server/material-quality-data'
import { databaseError, notFoundError, relationInUseError, validationError } from '@/lib/api/responses'
import { resolveMaterialReference } from '@/lib/server/material-resolver'
import { inferSpecKeyFromMaterialText, sanitizeSpecKey } from '@/lib/material-code'

type Params = { params: Promise<{ id: string }> }
type AtomicMaterialDeleteResult = {
  deleted?: boolean
  reason?: 'NOT_FOUND' | 'RELATION_IN_USE'
  constraint?: string | null
  counts?: {
    bom_items?: number
    boq_items?: number
  }
}

const MATERIAL_WRITE_SELECT = `
  id, material_id, material_code, cat_id, category_id, material_type_id, code_spec_key,
  mat_name_th, mat_name_en, normalized_name, spec, brand, model, base_uom, base_uom_id,
  status, note, code_locked, code_generated_at, code_rule_version, created_at, updated_at
`

export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const resolved = await resolveMaterialReference(supabase, id)

  if (!resolved) {
    return notFoundError('Material not found')
  }

  const { data, error } = await supabase
    .from('mat_master')
    .select(`
      *,
      category:mat_category!mat_master_cat_id_fkey(cat_id, cat_code, cat_name_th),
      uom:mat_uom!mat_master_base_uom_fkey(uom_code, uom_name_th),
      material_type:material_types!mat_master_material_type_id_v1_fkey(id, name, code_prefix),
      aliases:mat_alias!mat_alias_material_id_fkey(
        id, alias_id, material_id, material_uuid, alias_name, normalized_alias, alias_type, lang, note, is_deleted, deleted_at, created_at, updated_at
      ),
      supplier_maps:mat_supplier_map!mat_supplier_map_material_id_fkey(
        id, material_id, material_uuid, supplier_id, supplier_uuid, supplier_material_name, supplier_sku, is_preferred, lead_time_days, min_order_qty, is_active, note, is_deleted, deleted_at, created_at, updated_at,
        supplier:supplier!mat_supplier_map_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th, status)
      ),
      prices:mat_price_base!mat_price_base_material_id_fkey(
        id, material_id, material_uuid, supplier_id, supplier_uuid, effective_date, quote_date, valid_until, price_uom, price_uom_id, unit_price, currency_code, min_order_qty, lead_time_days, is_tax_included, vat_included, delivery_included, source_type, source_note, attachment_url, is_deleted, deleted_at, created_at, updated_at,
        supplier:supplier!mat_price_base_supplier_id_fkey(supplier_id, supplier_code, supplier_name_th),
        uom:mat_uom!mat_price_base_price_uom_fkey(uom_code, uom_name_th)
      ),
      uom_conversions:mat_uom_conv!mat_uom_conv_material_id_fkey(
        id, material_id, material_uuid, from_uom, from_uom_id, to_uom, to_uom_id, factor, formula_note, is_deleted, created_at, updated_at,
        from_uom_data:mat_uom!mat_uom_conv_from_uom_fkey(uom_code, uom_name_th),
        to_uom_data:mat_uom!mat_uom_conv_to_uom_fkey(uom_code, uom_name_th)
      )
    `)
    .eq('material_id', resolved.material_id)
    .eq('is_deleted', false)
    .eq('aliases.is_deleted', false)
    .eq('supplier_maps.is_deleted', false)
    .eq('prices.is_deleted', false)
    .eq('uom_conversions.is_deleted', false)
    .single()

  if (error) {
    return notFoundError('Material not found')
  }

  const [latestMap, bomUsageRes, boqUsageRes, auditRes, codeHistoryRes] = await Promise.all([
    fetchLatestPriceMap(supabase, [resolved.material_id]),
    supabase
      .from('bom_item')
      .select('material_id', { count: 'exact', head: true })
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false),
    supabase
      .from('boq_item')
      .select('material_id', { count: 'exact', head: true })
      .eq('material_id', resolved.material_id)
      .eq('is_deleted', false),
    supabase
      .from('mat_audit_log')
      .select('action, created_at, created_by')
      .eq('entity_type', 'mat_master')
      .or(`entity_key.eq.${resolved.material_id},entity_key.eq.${resolved.material_code ?? resolved.material_id}`)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('material_code_history')
      .select('id, material_id, old_code, new_code, change_reason, changed_by, changed_at')
      .eq('material_id', resolved.material_id)
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  const latestPrice = latestMap[resolved.material_id] ?? null
  const quality = analyzeMaterialQuality({ material: data as any, latestPrice })

  return NextResponse.json({
    data: {
      ...data,
      latest_price: latestPrice,
      price_warning: latestPrice
        ? quality.is_price_expired
          ? 'Price expired'
          : quality.is_price_stale
          ? 'ราคาล่าสุดเกิน 30 วัน'
          : null
        : 'ยังไม่มีราคา',
      quality,
      code_history: codeHistoryRes.data ?? [],
      usage: {
        bom_items: bomUsageRes.count ?? 0,
        boq_items: boqUsageRes.count ?? 0,
      },
      audit_summary: auditRes.data ?? [],
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const body = await req.json()
  const resolved = await resolveMaterialReference(supabase, id)

  if (!resolved) {
    return notFoundError('Material not found')
  }

  const parsed = updateMaterialSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error.flatten())
  }

  const { data: before } = await supabase
    .from('mat_master')
    .select('*')
    .eq('material_id', resolved.material_id)
    .eq('is_deleted', false)
    .single()

  if (!before) {
    return notFoundError('Material not found')
  }

  const input = parsed.data
  const requestedCode = input.material_code?.trim().toUpperCase()
  const currentCode = String(before.material_code ?? '').trim().toUpperCase()

  if (requestedCode && requestedCode !== currentCode) {
    return validationError(
      { material_code: ['Material code is locked. Use Change Code / Regenerate Code and provide a reason.'] },
      'Material code is locked',
    )
  }

  const categoryChanged = Boolean(input.cat_id && before.cat_id && input.cat_id !== before.cat_id)
  const targetTypeId = input.material_type_id || (categoryChanged ? '' : before.material_type_id)
  const targetSpecKey = input.code_spec_key
    ? sanitizeSpecKey(input.code_spec_key)
    : inferSpecKeyFromMaterialText({
      spec: input.spec ?? before.spec,
      matNameEn: input.mat_name_en ?? before.mat_name_en,
      matNameTh: input.mat_name_th ?? before.mat_name_th,
      brand: input.brand ?? before.brand,
      model: input.model ?? before.model,
    })

  const beforeTypeId = String(before.material_type_id ?? '')
  const requestedTypeId = String(targetTypeId ?? '')
  const beforeSpecKey = before.code_spec_key ? sanitizeSpecKey(before.code_spec_key) : ''
  const requestedSpecKey = targetSpecKey ? sanitizeSpecKey(targetSpecKey) : ''
  const codeAffectingChanged = Boolean(before.code_locked && (
    categoryChanged
    || requestedTypeId !== beforeTypeId
    || requestedSpecKey !== beforeSpecKey
  ))

  if (codeAffectingChanged && !String(input.code_change_reason ?? '').trim()) {
    return validationError(
      { code_change_reason: ['กรุณาใส่เหตุผลเพื่อสร้างรหัสใหม่'] },
      'Material code change reason is required',
    )
  }

  if (codeAffectingChanged && !targetTypeId) {
    return validationError(
      { material_type_id: ['กรุณาเลือกชนิดวัสดุก่อนสร้างรหัสใหม่'] },
      'Material type is required for material code regeneration',
    )
  }

  const {
    material_code: _materialCode,
    material_type_id: _materialTypeId,
    code_spec_key: _codeSpecKey,
    code_change_reason: _codeChangeReason,
    cat_id: _catId,
    category_id: _categoryId,
    ...editableInput
  } = input
  const patch: Record<string, unknown> = { ...editableInput }

  if (!codeAffectingChanged && input.cat_id) {
    const { data: category } = await supabase
      .from('mat_category')
      .select('id')
      .eq('cat_id', input.cat_id)
      .eq('is_deleted', false)
      .single()
    patch.cat_id = input.cat_id
    patch.category_id = category?.id ?? null
  }

  if (input.base_uom) {
    const { data: uom } = await supabase
      .from('mat_uom')
      .select('id')
      .eq('uom_code', input.base_uom)
      .eq('is_deleted', false)
      .single()
    patch.base_uom_id = uom?.id ?? null
  }

  let codeChangeResult: { old_code?: string | null; new_code?: string | null } | null = null

  if (codeAffectingChanged) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('fn_apply_material_code_change_v1', {
      p_material_id: resolved.material_id,
      p_material_type_id: targetTypeId,
      p_code_spec_key: requestedSpecKey || 'GEN',
      p_change_reason: input.code_change_reason,
      p_changed_by: owner.id,
    })

    if (rpcError) {
      const message = /function .*fn_apply_material_code_change_v1/i.test(rpcError.message)
        ? 'ยังไม่ได้ติดตั้ง SQL สำหรับเปลี่ยนรหัสวัสดุ กรุณารัน phase2a10_material_code_standard_v1.sql และ phase2b7_material_code_rpc_rls_fix.sql'
        : 'สร้างรหัสวัสดุใหม่ไม่สำเร็จ'
      return databaseError(message, { message: rpcError.message })
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (!result?.new_code) {
      return databaseError('สร้างรหัสวัสดุใหม่ไม่สำเร็จ: ระบบไม่ส่งรหัสใหม่กลับมา')
    }
    codeChangeResult = result
  }

  patch.normalized_name = buildNormalizedMaterialName({
    material_code: String(codeChangeResult?.new_code ?? before.material_code ?? before.material_id),
    mat_name_th: String(patch.mat_name_th ?? before.mat_name_th ?? ''),
    mat_name_en: String(patch.mat_name_en ?? before.mat_name_en ?? ''),
    brand: String(patch.brand ?? before.brand ?? ''),
    model: String(patch.model ?? before.model ?? ''),
    spec: String(patch.spec ?? before.spec ?? ''),
  })

  const { data, error } = await supabase
    .from('mat_master')
    .update(patch)
    .eq('material_id', resolved.material_id)
    .eq('is_deleted', false)
    .select(MATERIAL_WRITE_SELECT)
    .single()

  if (error) {
    return databaseError('Could not update material', { message: error.message })
  }

  await writeAuditLog({
    entityType: 'mat_master',
    entityKey: resolved.material_code ?? resolved.material_id,
    action: 'UPDATE',
    payload: { before, after: data },
  })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { id } = await params
  const resolved = await resolveMaterialReference(supabase, id)

  if (!resolved) {
    return notFoundError('Material not found')
  }

  const { data, error } = await supabase.rpc('delete_material_atomic', {
    p_material_id: resolved.material_id,
  })

  if (error) {
    return databaseError('Could not delete material atomically', {
      code: error.code,
      message: error.message,
    })
  }

  const result = data as AtomicMaterialDeleteResult | null

  if (!result?.deleted) {
    if (result?.reason === 'NOT_FOUND') {
      return notFoundError('Material not found')
    }

    if (result?.reason === 'RELATION_IN_USE') {
      return relationInUseError(
        'Cannot delete this material because it is referenced by another record.',
        {
          bom_items: result.counts?.bom_items ?? 0,
          boq_items: result.counts?.boq_items ?? 0,
          constraint: result.constraint ?? null,
        },
      )
    }

    return databaseError('Atomic material delete returned an invalid result')
  }

  return NextResponse.json({ message: 'Material deleted' })
}
