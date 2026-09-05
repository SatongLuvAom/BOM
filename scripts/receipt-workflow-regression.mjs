// Runs production functions against deterministic fixtures; no network or database writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import ts from 'typescript'
import * as zod from 'zod'

function compile(source, dependencies, globals = {}) {
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)(
    (name) => dependencies[name] ?? {}, module, module.exports, ...Object.values(globals),
  )
  return module.exports
}
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
class ReceiptError extends Error {
  constructor(message, status) { super(message); this.status = status }
}
function aiFixture(responder) {
  let now = 0
  const calls = []
  const timeouts = []
  const module = compile(source('lib/server/receipt-ai.ts') + '\nexport { callGemini };', {
    zod, '@/lib/server/receipt-import': { ReceiptImportError: ReceiptError },
  }, {
    process: { env: { GEMINI_API_KEY: 'fixture-only', GEMINI_RECEIPT_MODELS: 'gemini-a,gemini-b,gemini-c,gemini-d,gemini-e' } },
    performance: { now: () => now },
    setTimeout: (fn, ms) => { timeouts.push(ms); return 1 },
    clearTimeout: () => {},
    fetch: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET' })
      return responder(url, options, (ms) => { now += ms })
    },
  })
  return { run: () => module.callGemini({ buffer: Buffer.from('fixture'), mimeType: 'image/png' }), calls, timeouts }
}
const response = (status, body) => ({ ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(body), json: async () => body })
test('AI stops after a total 90 seconds, even with five configured models', async () => {
  const fixture = aiFixture((_url, _options, advance) => { advance(30000); return response(503, {}) })
  await assert.rejects(fixture.run(), (error) => error.status === 504)
  assert.equal(fixture.calls.length, 3)
  assert.deepEqual(fixture.timeouts, [30000, 30000, 30000])
})
test('AI gives the last attempt only the remaining total budget', async () => {
  const fixture = aiFixture((_url, _options, advance) => { advance(25000); return response(503, {}) })
  await assert.rejects(fixture.run(), (error) => error.status === 504)
  assert.deepEqual(fixture.timeouts, [30000, 30000, 30000, 15000])
})
test('AI skips unsupported models before transmitting the document', async () => {
  const fixture = aiFixture((url, options) => {
    if (url.includes('gemini-a')) return response(404, {})
    if (url.includes('gemini-b')) return response(200, { supportedGenerationMethods: ['embedContent'] })
    if (!options.method) return response(200, { supportedGenerationMethods: ['generateContent'] })
    return response(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] })
  })
  assert.equal(await fixture.run(), '{}')
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 1)
  assert.match(fixture.calls.at(-1).url, /gemini-c:generateContent/)
})
test('AI permission failure stops without retrying every model', async () => {
  const fixture = aiFixture(() => response(403, { error: 'permission denied' }))
  await assert.rejects(fixture.run())
  assert.equal(fixture.calls.length, 1)
})

class JsonResponse {
  constructor(value, init = {}) { this.value = value; this.status = init.status ?? 200 }
  static json(value, init) { return new JsonResponse(value, init) }
}
const materials = Array.from({ length: 1600 }, (_, index) => ({
  material_id: `MDF-${String(index).padStart(5, '0')}`, mat_name_th: 'MDF board',
  status: 'ACTIVE', is_deleted: false, note: 'preserve me', created_at: '2026-01-01',
}))
function searchFixture(routeSource) {
  const metrics = { requests: 0, rows: 0, maxDetailIds: 0 }
  const db = {
    rpc: async (name, args) => {
      assert.equal(name, 'list_materials')
      metrics.requests++
      const rows = materials.slice(args.p_offset, args.p_offset + args.p_limit)
      metrics.rows += rows.length
      return { data: { materials: rows, total: materials.length }, error: null }
    },
    from(table) {
      let rows = table === 'mat_master' ? materials : []
      let max = Infinity
      let start = 0
      const query = {
        select() { return query }, eq() { return query }, or() { return query }, order() { return query },
        limit(value) { max = value; return query },
        range(from, to) { start = from; max = to - from + 1; return query },
        in(_field, ids) { metrics.maxDetailIds = Math.max(metrics.maxDetailIds, ids.length); rows = rows.filter((row) => ids.includes(row.material_id)); return query },
        then(resolve) {
          metrics.requests++
          const data = rows.slice(start, start + max)
          metrics.rows += data.length
          return Promise.resolve({ data, count: rows.length, error: null }).then(resolve)
        },
      }
      return query
    },
  }
  const dependencies = {
    'next/server': { NextResponse: JsonResponse },
    '@/lib/auth/owner': { requireOwnerApi: async () => ({ id: 'fixture-user' }) },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/utils': { getPaginationRange: (page, limit) => ({ from: (page - 1) * limit, to: page * limit - 1 }) },
    '@/lib/supabase/filters': { normalizeSearchTerm: (value) => value ?? '', buildOrIlikeFilter: () => '' },
    '@/lib/material-master': { normalizeMaterialSearchText: (value) => (value ?? '').toLowerCase() },
    '@/lib/api/responses': { databaseError: (message) => JsonResponse.json({ error: message }, { status: 500 }) },
  }
  dependencies['@/lib/server/material-search'] = compile(source('lib/server/material-search.ts'), dependencies)
  const { GET } = compile(routeSource, dependencies)
  return { metrics, run: async (page = 1) => (await GET({ nextUrl: new URL(`http://fixture/api/materials?search=MDF&status=ACTIVE&limit=20&page=${page}`) })).value }
}
test('search beyond row 1000 returns a complete total and preserves API fields', async () => {
  const fixture = searchFixture(source('app/api/materials/route.ts'))
  const result = await fixture.run(76)
  assert.equal(result.total, 1600)
  assert.equal(result.data.length, 20)
  assert.equal(result.data[0].material_id, 'MDF-01500')
  assert.equal(result.data[0].note, 'preserve me')
  assert.equal(result.data[0].created_at, '2026-01-01')
  assert.equal(fixture.metrics.maxDetailIds, 20)
})
test('compare transferred rows and request count against committed API on the same fixture', async () => {
  const oldSource = execFileSync('git', ['show', '4fd0768:app/api/materials/route.ts'], { encoding: 'utf8' })
  const before = searchFixture(oldSource)
  const after = searchFixture(source('app/api/materials/route.ts'))
  const oldResult = await before.run()
  const newResult = await after.run()
  assert.deepEqual(newResult.data, oldResult.data)
  assert.equal(oldResult.total, 1000)
  assert.equal(newResult.total, 1600)
  assert.ok(after.metrics.rows < before.metrics.rows)
  console.log(JSON.stringify({ fixture: '1600 matching materials, NOT production latency', before: before.metrics, after: after.metrics }))
})
test('an empty duplicate candidate set never queries the full material table', async () => {
  let calls = 0
  const module = compile(source('lib/server/material-duplicates.ts') + '\nexport { fetchDuplicateMaterials };', {})
  assert.deepEqual(await module.fetchDuplicateMaterials({ from() { calls++; throw Error('unexpected full scan') } }, []), [])
  assert.equal(calls, 0)
})

test('duplicate query metrics preserve rows, count each read once and expose no payload', async () => {
  for (const fallback of [false, true]) {
    const calls = []
    const logs = []
    const db = { from(table) {
      const result = table === 'mat_master'
        ? { data: [{ material_id: 'private-id', mat_name_th: 'private-name' }], error: null }
        : table === 'material_latest_prices' && fallback
          ? { data: null, error: { code: '42P01', message: 'material_latest_prices does not exist' } }
          : { data: [], error: null }
      const query = { select() { return query }, eq() { return query }, in() { return query },
        limit() { return query }, then(resolve, reject) {
          calls.push(table)
          return Promise.resolve(result).then(resolve, reject)
        } }
      return query
    } }
    const prices = compile(source('lib/server/material-quality-data.ts'), {})
    const module = compile(source('lib/server/material-duplicates.ts') + '\nexport { fetchDuplicateMaterials };', {
      '@/lib/server/material-quality-data': prices,
    }, { console: { info: (value) => logs.push(JSON.parse(value)) } })
    const rows = await module.fetchDuplicateMaterials(db, ['private-id'])
    assert.equal(rows[0].mat_name_th, 'private-name')
    assert.equal(rows[0].bom_usage_count, 0)
    assert.equal(logs.length, 1)
    assert.equal(calls.length, fallback ? 7 : 6)
    assert.equal(new Set(calls).size, calls.length)
    assert.equal(logs[0].queries.length, calls.length)
    assert.equal(logs[0].queries.find((m) => m.query === 'mat_master').row_count, 1)
    assert.equal(logs[0].queries.find((m) => m.query === 'material_latest_prices').error_code, fallback ? '42P01' : null)
    assert.ok(logs[0].queries.every((m) => m.duration_ms >= 0))
    assert.doesNotMatch(JSON.stringify(logs), /private-id|private-name/)
  }
})
