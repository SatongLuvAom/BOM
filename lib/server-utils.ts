// Server-only utilities — ใช้ได้เฉพาะ Server Components และ API Routes
import { createClient } from '@/lib/supabase/server'

// ── Material Code Generator ───────────────────────────────────
// Format: {CAT_CODE}-{YYMMDD}-{SEQ4}  e.g. STL-260115-0001
export async function generateMaterialId(catCode: string): Promise<string> {
  const supabase = await createClient()
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `${catCode.toUpperCase()}-${yy}${mm}${dd}-`

  const { data } = await supabase
    .from('mat_master')
    .select('material_id, material_code')
    .or(`material_id.like.${prefix}%,material_code.like.${prefix}%`)
    .order('material_code', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    const lastCode = data[0].material_code || data[0].material_id
    const lastSeq = parseInt(lastCode.split('-').pop() ?? '0', 10)
    seq = lastSeq + 1
  }

  return `${prefix}${String(seq).padStart(4, '0')}`
}

// ── Category ID Generator ─────────────────────────────────────
export async function generateCategoryId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mat_category')
    .select('cat_id')
    .order('cat_id', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    seq = parseInt(data[0].cat_id.replace('C', ''), 10) + 1
  }

  return `C${String(seq).padStart(2, '0')}`
}

// ── Alias ID Generator ────────────────────────────────────────
export async function generateAliasId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mat_alias')
    .select('alias_id')
    .order('alias_id', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    seq = parseInt(data[0].alias_id.replace('ALI-', ''), 10) + 1
  }

  return `ALI-${String(seq).padStart(3, '0')}`
}

export async function generateSupplierId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('supplier')
    .select('supplier_id')
    .order('supplier_id', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    seq = parseInt(data[0].supplier_id.replace('SUP-', ''), 10) + 1
  }

  return `SUP-${String(seq).padStart(4, '0')}`
}

// ── BOM ID Generator ─────────────────────────────────────────
// Format: BOM-0001
export async function generateBomId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bom_template')
    .select('bom_id')
    .like('bom_id', 'BOM-%')
    .order('bom_id', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    seq = parseInt(data[0].bom_id.replace('BOM-', ''), 10) + 1
  }
  return `BOM-${String(seq).padStart(4, '0')}`
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | string

interface CreateAuditLogInput {
  entityType: string
  entityId?: string | null
  action: AuditAction
  oldValue?: unknown
  newValue?: unknown
  note?: string | null
}

interface WriteAuditLogInput {
  entityType: string
  entityKey: string
  action: AuditAction
  payload?: unknown
  createdBy?: string
}

export async function writeAuditLog({
  entityType,
  entityKey,
  action,
  payload,
  createdBy,
}: WriteAuditLogInput) {
  const auditPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null

  await createAuditLog({
    entityType,
    entityId: entityKey,
    action,
    oldValue: auditPayload && 'before' in auditPayload ? auditPayload.before : action === 'DELETE' ? payload : null,
    newValue: auditPayload && 'after' in auditPayload ? auditPayload.after : action === 'DELETE' ? null : payload,
    note: entityKey,
  })

  if (!['CREATE', 'UPDATE', 'DELETE', 'RESTORE'].includes(action)) {
    return
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('mat_audit_log').insert({
    entity_type: entityType,
    entity_key: entityKey,
    action,
    payload: payload ?? {},
    created_by: createdBy ?? user?.id ?? 'system',
  })

  if (error) {
    console.error('Failed to write audit log', error)
  }
}

function toUuidOrNull(value: string | null | undefined) {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

export async function createAuditLog({
  entityType,
  entityId,
  action,
  oldValue,
  newValue,
  note,
}: CreateAuditLogInput) {
  const supabase = await createClient()
  const { error } = await supabase.from('audit_logs').insert({
    entity_type: entityType,
    entity_id: toUuidOrNull(entityId),
    action,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    note: note ?? (entityId && !toUuidOrNull(entityId) ? String(entityId) : null),
  })

  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('Failed to create audit log', error)
  }
}
