import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest, NextResponse } = require('next/server')
const receiptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const shop = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', supplier_id: 'SUP-A', supplier_code: 'SHOP-A', supplier_name_th: 'บริษัท แสงทองวัสดุ จำกัด', tax_id: '0105551234567', phone: '0812345678', status: 'ACTIVE', is_deleted: false }
const input = { source_receipt_id: receiptId, confirm_supplier: true, supplier_code: 'NEW-SHOP', supplier_name_th: 'ร้านใหม่ทดสอบ', tax_id: '', phone: '', address: '10 ถนนทดสอบ', status: 'ACTIVE' }

function setup(options = {}) {
  const tables = { supplier: structuredClone(options.suppliers ?? []), purchase_receipts: [{ id: receiptId, status: options.status ?? 'draft' }] }
  const events = []
  const db = { from(table) {
    assert.ok(tables[table], `unexpected table ${table}`)
    const filters = []; let from = 0; let to = Infinity; let inserted; let single = false
    const query = {
      select() { return query }, eq(key, value) { filters.push(row => row[key] === value); return query },
      order() { return query }, range(start, end) { from = start; to = end; return query },
      limit(limit) { to = limit - 1; return query }, maybeSingle() { single = true; return query }, single() { single = true; return query },
      insert(row) { inserted = row; return query },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (options.lookupError && !inserted && (!options.lookupErrorTable || options.lookupErrorTable === table)) return { data: null, error: { message: 'lookup failed' } }
        if (inserted) {
          if (options.insertError) return { data: null, error: options.insertError }
          const created = { ...inserted, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', is_deleted: false }
          tables[table].push(created); events.push('insert'); return { data: created, error: null }
        }
        const rows = tables[table].filter(row => filters.every(fn => fn(row)))
        const page = rows.slice(from, Math.min(to + 1, from + (options.rowCap ?? Infinity)))
        return { data: single ? page[0] ?? null : page, error: null, count: rows.length }
      }).then(resolve, reject) },
    }
    return query
  } }
  const modules = new Map([
    ['next/server', { NextRequest, NextResponse }], ['zod', require('zod')],
    ['@/lib/auth/owner', { requireOwnerApi: async () => options.unauthorized ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) : { id: 'owner' } }],
    ['@/lib/supabase/server', { createClient: async () => db }],
    ['@/lib/utils', { getPaginationRange: () => ({ from: 0, to: 19 }) }],
    ['@/lib/server-utils', { generateSupplierId: async () => 'SUP-NEW', writeAuditLog: async () => events.push('audit') }],
    ['@/lib/server/master-data-cache', { invalidateActiveSuppliersCache: () => events.push('invalidate') }],
  ])
  function load(path) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    const module = { exports: {} }
    new Function('require', 'module', 'exports', outputText)(name => { assert.ok(modules.has(name), `unexpected dependency ${name}`); return modules.get(name) }, module, module.exports)
    return module.exports
  }
  for (const name of ['receipt-supplier-match', 'validations/supplier', 'supabase/filters']) modules.set(`@/lib/${name}`, load(`../lib/${name}.ts`))
  const { POST } = load('../app/api/suppliers/route.ts')
  return { tables, events, post: body => POST(new NextRequest('http://localhost/api/suppliers', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })) }
}

test('receipt supplier creation requires explicit confirmation before any write', async () => {
  for (const confirm of [undefined, false, 'true']) {
    const app = setup(); const res = await app.post({ ...input, confirm_supplier: confirm })
    assert.equal(res.status, 400); assert.equal(app.tables.supplier.length, 0)
  }
})
test('authentication and posted receipt guard prevent creating suppliers', async () => {
  for (const [options, expected] of [[{ unauthorized: true }, 401], [{ status: 'posted' }, 400]]) {
    const app = setup(options); assert.equal((await app.post(input)).status, expected); assert.equal(app.events.length, 0)
  }
})
test('missing or invalid receipt is rejected without creating a supplier', async () => {
  for (const [id, expected] of [['bad-id', 400], ['dddddddd-dddd-4ddd-8ddd-dddddddddddd', 404]]) {
    const app = setup(); assert.equal((await app.post({ ...input, source_receipt_id: id })).status, expected); assert.equal(app.events.length, 0)
  }
})
test('normalized tax duplicate returns existing supplier instead of inserting', async () => {
  const app = setup({ suppliers: [{ ...shop, tax_id: '๐-๑๐๕๕-๕๑๒๓๔-๕๖-๗' }] })
  const res = await app.post({ ...input, tax_id: shop.tax_id }); const body = await res.json()
  assert.equal(res.status, 409); assert.equal(body.existing_suppliers[0].id, shop.id); assert.equal(app.tables.supplier.length, 1)
})
test('normalized name duplicate beyond the first API page is still detected', async () => {
  const app = setup({ rowCap: 2, suppliers: [1, 2, 3].map(i => ({ ...shop, id: `id-${i}`, supplier_name_th: `different shop ${i}`, tax_id: '' })).concat({ ...shop, status: 'INACTIVE' }) })
  const res = await app.post({ ...input, supplier_name_th: 'แสงทองวัสดุ' })
  assert.equal(res.status, 409); assert.equal((await res.json()).existing_suppliers[0].status, 'INACTIVE'); assert.equal(app.events.length, 0)
})
test('duplicate lookup failures fail closed', async () => {
  const app = setup({ lookupError: true, lookupErrorTable: 'supplier' }); assert.equal((await app.post(input)).status, 500); assert.equal(app.events.length, 0)
})
test('partial tax IDs are rejected while an unknown tax ID may be left blank', async () => {
  const app = setup(); assert.equal((await app.post({ ...input, tax_id: '12345' })).status, 400); assert.equal(app.events.length, 0)
})
test('successful creation returns UUID and does not link receipt or update prices', async () => {
  const app = setup(); const res = await app.post({ ...input, tax_id: '๐-๑๐๕๕-๕๑๒๓๔-๕๖-๗' }); const body = await res.json()
  assert.equal(res.status, 201); assert.equal(body.data.tax_id, shop.tax_id); assert.equal(body.data.address, input.address)
  assert.equal(body.data.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); assert.equal(body.data.source_receipt_id, undefined)
  assert.equal(body.data.confirm_supplier, undefined); assert.equal(app.tables.purchase_receipts[0].supplier_id, undefined)
  assert.deepEqual(app.events, ['insert', 'invalidate', 'audit'])
})
test('database unique-conflict races return a retryable duplicate response', async () => {
  const app = setup({ insertError: { code: '23505', message: 'unique conflict' } }); assert.equal((await app.post(input)).status, 409)
  assert.equal(app.events.length, 0)
})
test('ordinary supplier creation retains its existing request contract', async () => {
  const app = setup(); const { source_receipt_id, confirm_supplier, ...ordinary } = input
  assert.equal((await app.post(ordinary)).status, 201)
})
test('deleted records do not block a new supplier', async () => {
  const app = setup({ suppliers: [{ ...shop, is_deleted: true }] })
  assert.equal((await app.post({ ...input, supplier_name_th: shop.supplier_name_th, tax_id: shop.tax_id })).status, 201)
})
test('invalid JSON body does not reach database writes', async () => {
  const app = setup(); assert.equal((await app.post(null)).status, 400); assert.equal(app.events.length, 0)
})
