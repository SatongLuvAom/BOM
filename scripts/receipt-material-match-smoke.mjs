import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as zod from 'zod'

// Execute the real server modules in memory, without loading Next.js or opening database connections.
const modules = new Map([
  ['zod', zod],
  ['@/lib/server-utils', { writeAuditLog: async () => {} }],
  ['@/lib/server/material-search', {
    resolveMaterialSearchMatches: () => { throw new Error('Unexpected global search') },
  }],
])

function loadSource(relativePath) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  })
  const module = { exports: {} }
  const require = (specifier) => {
    assert.ok(modules.has(specifier), `Unexpected dependency: ${specifier}`)
    return modules.get(specifier)
  }
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

for (const name of ['material-master', 'material-code', 'receipt-calculations', 'server/receipt-import']) {
  modules.set(`@/lib/${name}`, loadSource(`../lib/${name}.ts`))
}
const { ReceiptImportError } = modules.get('@/lib/server/receipt-import')
const materialMatch = loadSource('../lib/server/receipt-material-match.ts')
const { autoMatchReceiptItemMaterials, enrichReceiptItemsWithMaterialCandidates } = materialMatch
modules.set('@/lib/server/receipt-material-match', materialMatch)
const materialCandidates = loadSource('../lib/server/receipt-material-candidates.ts')
modules.set('@/lib/server/receipt-material-candidates', materialCandidates)
modules.set('node:crypto', crypto)
modules.set('@/lib/server/receipt-uom', { fillMissingReceiptItemUoms: async () => {} })
const { applyExtractionToReceiptDraft } = loadSource('../lib/server/receipt-ai.ts')

const supplierA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const supplierB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const supplierReason = 'ซัพพลายเออร์ตรงกับสลิป'

function fixture(supplierId = null) {
  const materials = ['A', 'B'].map((suffix) => ({
    id: `material-uuid-${suffix}`,
    material_id: `MAT-${suffix}`,
    material_code: `WOOD-HMR-GEN-000${suffix === 'A' ? 1 : 2}`,
    mat_name_th: 'HMR board',
    base_uom_id: 'uom-sheet',
    base_uom: 'SHEET',
    is_deleted: false,
    status: 'ACTIVE',
  }))
  return {
    mat_master: materials,
    mat_alias: [],
    mat_supplier_map: materials.map((material, index) => ({
      material_id: material.material_id,
      material_uuid: material.id,
      supplier_id: index === 0 ? 'SUP-A' : 'SUP-B',
      supplier_uuid: index === 0 ? supplierA : supplierB,
      is_deleted: false,
      is_active: true,
      material,
    })),
    purchase_receipts: [{ id: 'receipt-1', supplier_id: supplierId, status: 'needs_review' }],
    purchase_receipt_items: [{
      id: 'item-1', receipt_id: 'receipt-1', line_no: 1,
      item_name_raw: 'HMR board', raw_text: 'HMR board',
      material_id: null, suggested_material_id: null,
      action: 'needs_review', review_status: 'needs_review',
      uom_id: null, uom_raw: null, unit_price: 500, match_reason: null,
    }],
  }
}

// Apply filters to separate legacy IDs and UUIDs just as the real tables do.
function fakeSupabase(tables, errors = {}, beforeUpdate = () => {}) {
  return {
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`)
      const filters = []
      let maxRows = Infinity
      let offset = 0
      let patch = null
      let inserted = null
      let single = false
      const query = {
        select() { return query },
        eq(key, value) { filters.push((row) => row[key] === value); return query },
        neq(key, value) { filters.push((row) => row[key] !== value); return query },
        is(key, value) { filters.push((row) => row[key] === value); return query },
        in(key, values) { filters.push((row) => values.includes(key.split('.').reduce((value, part) => value?.[part], row))); return query },
        limit(value) { maxRows = value; return query },
        range(start, end) { offset = start; maxRows = end - start + 1; return query },
        order() { return query },
        update(value) { patch = value; return query },
        insert(value) { inserted = value; return query },
        single() { single = true; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const updateError = patch ? beforeUpdate(table, patch) : null
            if (updateError) return { data: null, error: updateError }
            if (errors[table]) return { data: null, error: errors[table] }
            if (inserted) {
              tables[table].push(...structuredClone(inserted).map((row) => ({
                ...row, id: row.id ?? crypto.randomUUID(),
              })))
            }
            const rows = tables[table].filter((row) => filters.every((filter) => filter(row))).slice(offset, offset + maxRows)
            if (patch) rows.forEach((row) => Object.assign(row, patch))
            if (single) assert.ok(rows.length <= 1, 'Expected at most one row')
            return { data: structuredClone(single ? rows[0] ?? null : rows), error: null }
          }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

async function candidates(tables, supplierId) {
  const [item] = await enrichReceiptItemsWithMaterialCandidates(
    fakeSupabase(tables), tables.purchase_receipt_items, supplierId,
  )
  return item.match_candidates
}

for (const [label, supplierId, materialId] of [
  ['A', supplierA, 'material-uuid-A'],
  ['B', supplierB, 'material-uuid-B'],
]) {
  test(`supplier ${label}: suggest its mapped material first when names are identical`, async () => {
    const results = await candidates(fixture(supplierId), supplierId)
    assert.equal(results[0].id, materialId)
    assert.equal(results[0].match_confidence, 98)
    assert.ok(results[0].match_reason.includes(supplierReason))
    assert.equal(results.length, 1, 'never suggest materials from another supplier')
  })

  test(`supplier ${label}: automatic matching uses the receipt supplier UUID`, async () => {
    const tables = fixture(supplierId)
    const result = await autoMatchReceiptItemMaterials(fakeSupabase(tables), 'receipt-1', 'test-user')
    assert.equal(result.autoSelected, 1)
    assert.equal(result.items[0].material_id, materialId)
    assert.equal(result.items[0].material_supplier_id, supplierId)
    assert.equal(result.items[0].review_status, 'reviewed')
    assert.equal(result.items[0].uom_id, 'uom-sheet')
    assert.equal(result.items[0].unit_price, 500)
  })
}

test('no selected supplier returns no material suggestions', async () => {
  const results = await candidates(fixture(), null)
  assert.deepEqual(results, [])
})

test('a supplier with no mappings returns no global material suggestions', async () => {
  const results = await candidates(fixture(), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  assert.deepEqual(results, [])
})

test('another supplier legacy ID cannot masquerade as the selected supplier UUID', async () => {
  const tables = fixture(supplierB)
  tables.mat_supplier_map[0].supplier_id = supplierB
  const results = await candidates(tables, supplierB)
  assert.equal(results[0].id, 'material-uuid-B')
  assert.ok(!results.find((row) => row.id === 'material-uuid-A'))
})

test('deleted supplier mappings are excluded', async () => {
  const tables = fixture(supplierB)
  tables.mat_supplier_map[1].is_deleted = true
  const results = await candidates(tables, supplierB)
  assert.deepEqual(results, [])
})

test('inactive supplier mappings are excluded', async () => {
  const tables = fixture(supplierA)
  tables.mat_supplier_map[0].is_active = false
  assert.deepEqual(await candidates(tables, supplierA), [])
})

test('supplier-specific SKU and names match without using another supplier aliases', async () => {
  const tables = fixture(supplierB)
  tables.mat_supplier_map[1].supplier_material_name = 'Panel special'
  tables.purchase_receipt_items[0].item_name_raw = 'Panel special'
  tables.purchase_receipt_items[0].raw_text = null
  const results = await candidates(tables, supplierB)
  assert.equal(results[0]?.id, 'material-uuid-B')
  assert.ok(results[0].match_confidence >= 90)
})

test('manual search scopes by supplier and accepts shop SKU', async () => {
  const tables = fixture(supplierB)
  tables.mat_supplier_map[1].supplier_sku = 'SKU-B'
  const results = await materialMatch.searchSupplierMaterialCandidates(fakeSupabase(tables), supplierB, 'SKU-B')
  assert.deepEqual(results.map(row => row.id), ['material-uuid-B'])
  assert.deepEqual(await materialMatch.searchSupplierMaterialCandidates(fakeSupabase(tables), supplierA, 'SKU-B'), [])
})

test('manual search still finds mapped materials beyond the first database page', async () => {
  const tables = fixture(supplierB)
  const mapping = tables.mat_supplier_map[1]
  tables.mat_supplier_map = Array.from({ length: 501 }, (_, i) => ({
    ...mapping, supplier_sku: `sku-${i}`, material: { ...mapping.material, id: `material-${i}` },
  }))
  const results = await materialMatch.searchSupplierMaterialCandidates(fakeSupabase(tables), supplierB, 'sku-500')
  assert.deepEqual(results.map(row => row.id), ['material-500'])
})

test('item API requires expected supplier and rejects stale supplier before writing', async () => {
  const receiptImport = modules.get('@/lib/server/receipt-import')
  assert.equal(receiptImport.updateReceiptItemSchema.safeParse({ material_id: supplierA }).success, false)
  assert.equal(receiptImport.updateReceiptItemSchema.safeParse({ expected_supplier_id: supplierA, confirm_supplier_link: 'true' }).success, false)
  const tables = fixture(supplierB)
  const before = structuredClone(tables)
  await assert.rejects(receiptImport.updateReceiptItem(fakeSupabase(tables), 'receipt-1', 'item-1', { expected_supplier_id: supplierA }, 'user'), /ร้าน.*เปลี่ยน/)
  assert.deepEqual(tables, before)
})

for (const situation of ['stale', 'unlinked', 'linked', 'legacy-linked']) {
  test(`posting ${situation}: validate without silently creating supplier mappings`, async () => {
    const tables = fixture(supplierA)
    Object.assign(tables.purchase_receipt_items[0], {
      material_id: 'material-uuid-A', material_supplier_id: situation === 'stale' ? supplierB : supplierA,
      uom_id: 'uom-sheet', action: 'update_price', review_status: 'reviewed',
    })
    if (situation === 'unlinked') tables.mat_supplier_map = []
    if (situation === 'legacy-linked') tables.mat_supplier_map[0].material_uuid = null
    const before = structuredClone(tables)
    const db = fakeSupabase(tables)
    let posted = false
    db.rpc = async () => { posted = true; return { data: { ok: true }, error: null } }
    const run = modules.get('@/lib/server/receipt-import').postReadyReceiptItemsToPriceHistory(db, 'receipt-1', 'user')
    if (situation === 'linked' || situation === 'legacy-linked') await run
    else await assert.rejects(run, (error) => error instanceof ReceiptImportError && error.code === 'VALIDATION_ERROR')
    assert.equal(posted, situation === 'linked' || situation === 'legacy-linked')
    assert.deepEqual(tables, before)
  })
}

test('legacy material IDs still work when a mapping has no material UUID', async () => {
  const tables = fixture(supplierB)
  tables.mat_supplier_map[1].material_uuid = null
  const results = await candidates(tables, supplierB)
  assert.equal(results[0].id, 'material-uuid-B')
  assert.equal(results[0].match_confidence, 98)
})

test('matching a supplier does not override a conflicting material specification', async () => {
  const tables = fixture(supplierA)
  tables.purchase_receipt_items[0].item_name_raw = 'HMR board 18MM'
  tables.mat_master[0].spec = '9MM'
  tables.mat_master[1].spec = '18MM'
  const results = await candidates(tables, supplierA)
  const conflict = results.find((row) => row.id === 'material-uuid-A')
  assert.equal(conflict.match_confidence, 80)
  assert.equal(conflict.match_reason, 'ชื่อใกล้เคียงแต่สเปกต่างกัน')
})

test('automatic matching preserves already selected and posted receipt items', async () => {
  const tables = fixture(supplierB)
  const item = tables.purchase_receipt_items[0]
  tables.purchase_receipt_items = [
    { ...item, id: 'selected', material_id: 'material-uuid-A' },
    { ...item, id: 'posted', review_status: 'posted' },
  ]
  const before = structuredClone(tables.purchase_receipt_items)
  const result = await autoMatchReceiptItemMaterials(fakeSupabase(tables), 'receipt-1', 'test-user')
  assert.equal(result.autoSelected, 0)
  assert.deepEqual(result.items, before)
})

test('equally good materials in the same shop remain suggestions, never an arbitrary auto-selection', async () => {
  const tables = fixture(supplierA)
  tables.mat_supplier_map[1].supplier_uuid = supplierA
  tables.mat_supplier_map[1].supplier_id = 'SUP-A'
  const result = await autoMatchReceiptItemMaterials(fakeSupabase(tables), 'receipt-1', 'test-user')
  assert.equal(result.autoSelected, 0)
  assert.equal(result.items[0].material_id, null)
  assert.equal(result.items[0].match_candidates.length, 2)
})

test('supplier lookup errors are surfaced instead of silently ignoring the supplier', async () => {
  const tables = fixture(supplierA)
  await assert.rejects(
    enrichReceiptItemsWithMaterialCandidates(
      fakeSupabase(tables, { mat_supplier_map: { message: 'Supplier mapping lookup failed' } }),
      tables.purchase_receipt_items, supplierA,
    ),
    (error) => error instanceof ReceiptImportError && error.status === 500 && error.message === 'Supplier mapping lookup failed',
  )
})

test('automatic matching rejects an unconfirmed supplier without changing any items', async () => {
  const tables = fixture()
  const before = structuredClone(tables)
  await assert.rejects(
    autoMatchReceiptItemMaterials(fakeSupabase(tables), 'receipt-1', 'test-user'),
    (error) => error instanceof ReceiptImportError && error.status === 400 && error.code === 'VALIDATION_ERROR',
  )
  assert.deepEqual(tables, before)
})

test('opening an unconfirmed receipt leaves its items unchanged without generating material drafts', async () => {
  const tables = fixture()
  const before = structuredClone(tables)
  const items = await materialCandidates.ensureReceiptMaterialCandidatesForReview(fakeSupabase(tables), 'receipt-1', 'test-user', null)
  assert.deepEqual(items, before.purchase_receipt_items)
  assert.deepEqual(tables, before)
})

test('material draft generation rejects an unconfirmed supplier', async () => {
  const tables = fixture()
  const before = structuredClone(tables)
  await assert.rejects(
    materialCandidates.generateReceiptMaterialCandidates(fakeSupabase(tables), 'receipt-1', 'test-user'),
    (error) => error instanceof ReceiptImportError && error.code === 'VALIDATION_ERROR',
  )
  assert.deepEqual(tables, before)
})

function candidateGenerationFixture() {
  const tables = fixture(supplierA)
  tables.receipt_material_candidates = []
  tables.mat_category = []
  tables.material_types = []
  Object.assign(tables.purchase_receipt_items[0], {
    material_candidate_id: null,
    material_supplier_id: null,
    material_resolution_status: 'unresolved',
  })
  return tables
}

test('candidate generator links a draft when no other writer changes the item', async () => {
  const tables = candidateGenerationFixture()
  const result = await materialCandidates.generateReceiptMaterialCandidates(
    fakeSupabase(tables), 'receipt-1', 'test-user',
  )
  assert.equal(result.created, 1)
  const [candidate] = tables.receipt_material_candidates
  assert.ok(candidate.id)
  assert.equal(candidate.receipt_item_id, 'item-1')
  assert.equal(candidate.proposed_supplier_id, supplierA)
  assert.equal(tables.purchase_receipt_items[0].material_candidate_id, candidate.id)
  assert.equal(result.items[0].action, 'create_material_needed')
})

for (const writerStatus of ['reviewed', 'posted']) {
  test(`candidate generator preserves an item another writer selected and ${writerStatus} before its final UPDATE`, async () => {
    const tables = candidateGenerationFixture()
    const item = tables.purchase_receipt_items[0]
    let concurrentItem = null
    const db = fakeSupabase(tables, {}, (table) => {
      if (table !== 'purchase_receipt_items' || concurrentItem) return
      // The generator has read an unmatched item and inserted its draft already.
      // Commit the competing selection/post before evaluating the UPDATE filters.
      assert.equal(tables.receipt_material_candidates.length, 1)
      Object.assign(item, {
        material_id: 'material-uuid-A',
        suggested_material_id: 'material-uuid-A',
        material_supplier_id: supplierA,
        material_candidate_id: null,
        material_resolution_status: 'matched_existing',
        uom_id: 'uom-sheet', uom_raw: 'SHEET', unit_price: 725,
        action: 'update_price', review_status: writerStatus,
        match_reason: 'Selected by another writer',
      })
      concurrentItem = structuredClone(item)
    })

    const result = await materialCandidates.generateReceiptMaterialCandidates(db, 'receipt-1', 'test-user')
    assert.ok(concurrentItem, 'the competing writer must run before the final item UPDATE')
    assert.equal(result.created, 0)
    assert.equal(result.skipped, 1)
    assert.equal(item.review_status, writerStatus, 'stale candidate generation must preserve the committed review status')
    assert.equal(item.action, 'update_price', 'stale generation must not reopen material creation')
    assert.deepEqual(item, concurrentItem, 'all fields committed by the other writer must remain untouched')
    const returnedItem = result.items.find((row) => row.id === item.id)
    for (const [key, value] of Object.entries(concurrentItem)) {
      assert.deepEqual(returnedItem[key], value, `returned item must retain ${key}`)
    }
  })
}

test('candidate generator surfaces final item UPDATE errors instead of reporting success', async () => {
  const tables = candidateGenerationFixture()
  const before = structuredClone(tables.purchase_receipt_items)
  const updateError = { code: '42501', message: 'Candidate item update denied' }
  const db = fakeSupabase(tables, {}, (table) => {
    if (table === 'purchase_receipt_items') return updateError
  })

  await assert.rejects(
    materialCandidates.generateReceiptMaterialCandidates(db, 'receipt-1', 'test-user'),
    (error) => error instanceof ReceiptImportError
      && error.code === 'DATABASE_ERROR'
      && error.message === updateError.message
      && error.details === updateError,
  )
  assert.equal(tables.receipt_material_candidates.length, 1, 'the failure must occur after draft insertion')
  assert.deepEqual(tables.purchase_receipt_items, before)
})

for (const selectedSupplier of [null, supplierA]) {
  test(`AI extraction preserves supplier ${selectedSupplier ? 'already selected' : 'not selected'} and waits for material review`, async (t) => {
    const originalKey = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'local-test-placeholder'
    t.after(() => {
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = originalKey
    })
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.ok(body.contents[0].parts.some((part) => part.text?.includes('ห้ามนำข้อมูลผู้ซื้อ')))
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        supplier: { name: 'ร้านทดสอบ', taxId: '0105551234567', phone: '0812345678', address: '10 ถนนผู้ขาย', email: 'seller@example.test' },
        buyer: { address: '99 ถนนผู้ซื้อ', email: 'buyer@example.test' },
        receipt: { receiptNo: 'TEST-1', date: '2026-09-04', subtotal: 500, grandTotal: 500 },
        items: [{ name: 'HMR board', qty: 1, unitPrice: 500, lineTotal: 500 }],
      }) }] } }] })
    })
    const tables = fixture(selectedSupplier)
    tables.purchase_receipts[0].file_storage_path = 'test-only.jpg'
    tables.purchase_receipt_items = []
    const supabase = fakeSupabase(tables)
    supabase.storage = { from: () => ({ download: async () => ({ data: new Blob(['fixture'], { type: 'image/jpeg' }), error: null }) }) }
    const result = await applyExtractionToReceiptDraft(supabase, 'receipt-1', { replaceItems: false, userId: 'test-user' })
    assert.equal(result.receipt.supplier_id, selectedSupplier)
    assert.equal(result.receipt.supplier_name_raw, 'ร้านทดสอบ')
    assert.equal(result.receipt.ai_raw_json.supplier.phone, '0812345678')
    assert.equal(result.receipt.ai_raw_json.supplier.address, '10 ถนนผู้ขาย')
    assert.equal(result.receipt.ai_raw_json.supplier.email, 'seller@example.test')
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].material_id, null)
    assert.equal(result.items[0].review_status, 'needs_review')
    assert.equal(result.items[0].action, 'needs_review')
  })
}
