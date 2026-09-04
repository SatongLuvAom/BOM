// Runs SQL against an isolated in-memory PostgreSQL, never Supabase.
// Set PGLITE_MODULE to an externally installed @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite')
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const material = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const legacyMaterial = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const materialCode = 'WD-MDF-18MM-9999'
const legacyCode = 'WD-MDF-LEGACY-9999'
const postingRpcs = ['fn_post_purchase_receipt_ready_items', 'fn_post_purchase_receipt_to_price_history']

function readSql(path, before) {
  const sql = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const end = before ? sql.indexOf(before) : sql.length
  assert.ok(end > 0, `SQL boundary missing in ${path}: ${before}`)
  // PGlite has core gen_random_uuid(); it does not ship the pgcrypto extension.
  // Keep repository table constraints, function bodies, triggers and grants intact.
  return sql.slice(0, end).replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*$/gm, '')
}

test('receipt supplier scope — real PostgreSQL transactions and triggers', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${a}');
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${a}'::uuid $$;
  `)
  // Load only the MAT prerequisite sections; unrelated BOQ/storage setup is excluded.
  await db.exec(readSql('supabase/setup_complete.sql', '-- PHASE 2A — BOQ Projects'))
  await db.exec(readSql('supabase/migrations/20260504_production_core_hardening.sql', '-- BOQ price snapshot fields'))
  await db.exec(readSql('sql/phase2a_material_master_hardening.sql', '-- Delete safety'))
  await db.exec(readSql('sql/phase2a9_core_foundation_hardening.sql', "SELECT public.fn_phase2a9_add_check_not_valid(\n  'public.bom_item'"))
  await db.exec(readSql('sql/phase2a10_material_code_standard_v1.sql', 'CREATE OR REPLACE FUNCTION public.fn_apply_material_code_change_v1'))
  for (const path of [
    'sql/phase2b_receipt_import_v1.sql',
    'sql/phase2b4_receipt_bulk_post_ready_items.sql',
    'sql/phase2b5_receipt_material_candidates.sql',
    'sql/phase2b8_receipt_candidate_atomic_approval_and_repair.sql',
  ]) await db.exec(readSql(path))
  await db.exec(`
    INSERT INTO supplier(id,supplier_id,supplier_code,supplier_name_th)
      VALUES ('${a}','SUP-A','SUP-A','Shop A'),('${b}','SUP-B','SUP-B','Shop B');
    INSERT INTO mat_uom(id,uom_code,uom_name_th) VALUES ('${a}','PCS','ชิ้น');
    INSERT INTO mat_master(id,material_id,cat_id,mat_name_th,base_uom)
      SELECT '${material}', '${materialCode}', cat_id, 'Existing board', 'PCS' FROM mat_category WHERE cat_code='WD';
    INSERT INTO mat_master(id,material_id,cat_id,mat_name_th,base_uom)
      SELECT '${legacyMaterial}', '${legacyCode}', cat_id, 'Legacy board', 'PCS' FROM mat_category WHERE cat_code='WD';
  `)

  let fixtureNumber = 0
  async function fixture(supplier = a) {
    const number = ++fixtureNumber
    const receiptNo = `LOCAL-SCOPE-${number}`
    const receipt = (await db.query(`INSERT INTO purchase_receipts(supplier_id,receipt_no,receipt_date)
      VALUES ($1,$2,DATE '2026-01-01' + $3::integer) RETURNING id`, [supplier, receiptNo, number])).rows[0].id
    const item = (await db.query(`INSERT INTO purchase_receipt_items(receipt_id,line_no,item_name_raw,raw_text,qty,uom_id,unit_price)
      VALUES ($1,1,'Board','Board raw',2,$2,500) RETURNING id`, [receipt, a])).rows[0].id
    return { receipt, item, receiptNo }
  }
  const select = (f, supplier = a, confirm = false, patch = {}) => db.query(
    'SELECT update_receipt_item_scoped($1,$2,$3,$4::jsonb,$5)',
    [f.receipt, f.item, supplier, JSON.stringify({ material_id: material, action: 'update_price', ...patch }), confirm],
  )
  const row = async (f) => (await db.query('SELECT * FROM purchase_receipt_items WHERE id=$1', [f.item])).rows[0]
  const receiptRow = async (f) => (await db.query('SELECT * FROM purchase_receipts WHERE id=$1', [f.receipt])).rows[0]
  const prices = async () => (await db.query('SELECT * FROM mat_price_base ORDER BY id')).rows
  const mappings = async () => (await db.query('SELECT * FROM mat_supplier_map ORDER BY material_id,supplier_id')).rows
  const audits = async () => (await db.query('SELECT * FROM mat_audit_log ORDER BY audit_id')).rows
  const post = async (f, rpc = postingRpcs[0]) => (await db.query(`SELECT public.${rpc}($1,$2) AS result`, [f.receipt, a])).rows[0].result
  const repair = async (f) => (await db.query('SELECT repair_receipt_state_v1($1,$2) AS result', [f.receipt, a])).rows[0].result
  // Expected SQL failures must not abort the enclosing per-test transaction.
  async function recoverable(run) {
    await db.exec('SAVEPOINT expected_failure')
    try {
      return await run()
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT expected_failure')
      throw error
    } finally {
      await db.exec('RELEASE SAVEPOINT expected_failure')
    }
  }
  const rejects = (run, pattern) => assert.rejects(() => recoverable(run), pattern)
  const link = (supplier = a, selectedMaterial = material) => db.query(`
    INSERT INTO mat_supplier_map(material_id,material_uuid,supplier_id,supplier_uuid)
    SELECT m.material_id,m.id,s.supplier_id,s.id FROM mat_master m CROSS JOIN supplier s WHERE m.id=$1 AND s.id=$2`,
  [selectedMaterial, supplier])
  async function candidate(f, supplier = a) {
    const result = await db.query(`INSERT INTO receipt_material_candidates(
      receipt_id,receipt_item_id,proposed_mat_name_th,proposed_category_id,proposed_material_type_id,
      proposed_code_spec_key,proposed_uom_id,proposed_supplier_id,proposed_unit_price,proposed_aliases)
      SELECT $1,$2,$3,c.id,mt.id,'18MM',$4,$5,500,ARRAY['Draft alias']
      FROM mat_category c JOIN material_types mt ON mt.category_id=c.id
      WHERE c.cat_code='WD' AND mt.code_prefix='MDF' RETURNING id`,
    [f.receipt, f.item, `New panel ${f.receiptNo}`, a, supplier])
    const id = result.rows[0].id
    await db.query(`UPDATE purchase_receipt_items SET material_candidate_id=$1,
      material_resolution_status='candidate_created',action='create_material_needed' WHERE id=$2`, [id, f.item])
    return id
  }
  const candidateRow = async (id) => (await db.query('SELECT * FROM receipt_material_candidates WHERE id=$1', [id])).rows[0]
  const approve = async (f, id, supplier = a, patch = {}) => (await db.query(
    'SELECT approve_receipt_material_candidate_scoped($1,$2,$3,false,$4,$5::jsonb) AS result',
    [f.receipt, id, supplier, a, JSON.stringify(patch)],
  )).rows[0].result
  const materialEffects = async () => ({
    materials: (await db.query('SELECT * FROM mat_master ORDER BY id')).rows,
    aliases: (await db.query('SELECT * FROM mat_alias ORDER BY alias_id')).rows,
    history: (await db.query('SELECT * FROM material_code_history ORDER BY id')).rows,
    sequences: (await db.query('SELECT * FROM material_code_sequences ORDER BY id')).rows,
    mappings: await mappings(), audit: await audits(), prices: await prices(),
  })

  // Actual pre-migration posting leaves historical rows without material_supplier_id.
  await link(a, legacyMaterial)
  const legacy = await fixture()
  const partialLegacy = await fixture()
  const reviewedLegacy = await fixture()
  for (const f of [legacy, partialLegacy, reviewedLegacy]) {
    await db.query(`UPDATE purchase_receipt_items SET material_id=$1,action='update_price',review_status='reviewed' WHERE id=$2`, [legacyMaterial, f.item])
  }
  await db.query(`INSERT INTO purchase_receipt_items(receipt_id,line_no,item_name_raw,action)
    VALUES ($1,2,'Unresolved legacy line','needs_review')`, [partialLegacy.receipt])
  await post(legacy)
  await post(partialLegacy)
  const legacyBefore = await row(legacy)
  const partialBefore = await row(partialLegacy)
  const reviewedLegacyBefore = await row(reviewedLegacy)
  const legacyPrices = await prices()
  // Capture each phase once so its repeat uses the same revision during parallel work.
  const foundation = readSql('supabase/migrations/202609040001_receipt_supplier_material_scope.sql')
  const enforcement = readSql('supabase/migrations/202609040002_receipt_supplier_material_scope_enforce.sql')
  await db.exec(foundation)
  await db.exec(foundation)
  await t.test('foundation preserves authenticated access to old approval before enforcement', async () => {
    const { rows } = await db.query(`SELECT has_function_privilege(
      'authenticated', 'public.approve_receipt_material_candidate_atomic(uuid,uuid,boolean,uuid,jsonb)',
      'EXECUTE') AS allowed`)
    assert.equal(rows[0].allowed, true)
    const triggers = await db.query(`SELECT tgname FROM pg_trigger
      WHERE tgrelid='public.purchase_receipt_items'::regclass AND tgname='trg_receipt_material_supplier'`)
    assert.deepEqual(triggers.rows, [])
  })
  await db.exec(enforcement)
  await db.exec(enforcement)
  await db.exec('CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text, public boolean, file_size_limit bigint);')
  t.beforeEach(() => db.exec('BEGIN'))
  t.afterEach(() => db.exec('ROLLBACK'))

  await t.test('schema audit verifies new functions, grants and enabled triggers', async () => {
    const audit = readSql('supabase/schema_audit.sql')
    const { rows } = await db.query(audit)
    assert.deepEqual(rows.filter(row => row.phase === 'receipt-supplier-scope' && !row.present), [])
    await db.exec('ALTER TABLE purchase_receipt_items DISABLE TRIGGER trg_receipt_material_supplier')
    const broken = await db.query(audit)
    assert.ok(broken.rows.some(row => row.object_name === 'trg_receipt_material_supplier' && !row.present))
  })

  await t.test('unlinked material is rejected without creating any mapping', async () => {
    const f = await fixture()
    const before = await mappings()
    await rejects(() => select(f), /ยืนยันผูก/)
    assert.equal((await row(f)).material_id, null)
    assert.deepEqual(await mappings(), before)
  })
  await t.test('explicit confirmation links and selects atomically without touching another supplier', async () => {
    const f = await fixture()
    await select(f, a, true)
    assert.equal((await row(f)).material_supplier_id, a)
    const maps = (await db.query('SELECT * FROM mat_supplier_map WHERE material_uuid=$1', [material])).rows
    assert.equal(maps.length, 1)
    assert.equal(maps[0].supplier_uuid, a)
    assert.equal((await row(f)).review_status, 'reviewed')
  })
  await t.test('existing link needs no extra confirmation', async () => {
    const f = await fixture()
    await link()
    await select(f)
    assert.equal((await row(f)).material_id, material)
  })
  await t.test('changing shop resets selections and stale-tab writes fail', async () => {
    const f = await fixture()
    await link()
    await select(f)
    await db.query('UPDATE purchase_receipts SET supplier_id=$1 WHERE id=$2', [b, f.receipt])
    assert.equal((await row(f)).material_id, null)
    assert.equal((await row(f)).material_supplier_id, null)
    assert.equal((await row(f)).review_status, 'needs_review')
    await rejects(() => select(f, a, true), /ร้าน.*เปลี่ยน/)
    await rejects(() => select(f, b), /ยืนยันผูก/)
  })
  await t.test('a disabled link cannot be silently restored', async () => {
    const f = await fixture()
    await link()
    await db.exec("UPDATE mat_supplier_map SET is_active=false WHERE supplier_id='SUP-A'")
    await rejects(() => select(f), /ยืนยันผูก/)
    assert.equal((await db.query("SELECT is_active FROM mat_supplier_map WHERE supplier_id='SUP-A'")).rows[0].is_active, false)
    await select(f, a, true)
  })
  await t.test('failed item update rolls back a newly confirmed link', async () => {
    const f = await fixture(b)
    const before = await mappings()
    await rejects(() => select(f, b, true, { uom_id: b }), /foreign key/)
    assert.deepEqual(await mappings(), before)
    assert.equal((await row(f)).material_id, null)
  })
  await t.test('posted items prevent supplier changes and edits', async () => {
    const f = await fixture()
    await link()
    await select(f)
    await post(f)
    await rejects(() => db.query('UPDATE purchase_receipts SET supplier_id=$1 WHERE id=$2', [b,f.receipt]), /บันทึกราคาแล้ว/)
    await rejects(() => select(f), /บันทึกราคาแล้ว/)
    assert.equal((await row(f)).material_supplier_id, a)
  })
  await t.test('candidate approval rejects stale supplier and cannot call the unscoped RPC as authenticated', async () => {
    const f = await fixture(b)
    await rejects(() => db.query('SELECT approve_receipt_material_candidate_scoped($1,$2,$3,false,$4,\'{}\')', [f.receipt,a,a,a]), /ร้าน.*เปลี่ยน/)
    const { rows } = await db.query("SELECT has_function_privilege('authenticated','approve_receipt_material_candidate_atomic(uuid,uuid,boolean,uuid,jsonb)','EXECUTE') AS allowed")
    assert.equal(rows[0].allowed, false)
  })

  await t.test('real candidate approval creates material, code history, aliases and only the receipt supplier mapping', async () => {
    const f = await fixture()
    const id = await candidate(f, b)
    const result = await approve(f, id)
    assert.equal(result.ok, true)
    const created = (await db.query('SELECT * FROM mat_master WHERE id=$1', [result.material_id])).rows[0]
    assert.equal(created.material_code, result.material_code)
    assert.equal(created.created_by, a)
    assert.equal((await candidateRow(id)).status, 'created')
    assert.equal((await candidateRow(id)).proposed_supplier_id, a)
    assert.equal((await candidateRow(id)).created_material_id, created.id)
    assert.equal((await row(f)).material_id, created.id)
    assert.equal((await row(f)).material_supplier_id, a)
    assert.equal((await row(f)).review_status, 'reviewed')
    assert.equal((await row(f)).action, 'update_price')
    assert.deepEqual((await db.query('SELECT supplier_uuid FROM mat_supplier_map WHERE material_uuid=$1', [created.id])).rows, [{ supplier_uuid: a }])
    assert.equal((await db.query('SELECT * FROM material_code_history WHERE material_id=$1', [created.material_id])).rows.length, 1)
    assert.equal((await db.query('SELECT * FROM mat_alias WHERE material_uuid=$1', [created.id])).rows.length, 3)
    assert.equal((await audits()).length, 3)
    assert.deepEqual(await prices(), legacyPrices)
  })

  await t.test('candidate approval retry does not duplicate material, mapping, price or other side effects', async () => {
    const f = await fixture()
    const id = await candidate(f)
    const first = await approve(f, id)
    assert.equal(first.ok, true)
    const before = await materialEffects()
    const itemBefore = await row(f)
    const candidateBefore = await candidateRow(id)
    const retry = await recoverable(() => approve(f, id)).catch(error => {
      assert.match(error.message, /สร้างเป็นวัสดุจริงแล้ว|เลือกวัสดุหรือบันทึกราคาแล้ว/)
      return null
    })
    if (retry) {
      assert.equal(retry.ok, true)
      assert.equal(retry.material_id, first.material_id)
    }
    assert.deepEqual(await materialEffects(), before)
    assert.deepEqual(await row(f), itemBefore)
    assert.deepEqual(await candidateRow(id), candidateBefore)
  })

  await t.test('candidate_patch cannot redirect approval to another supplier or material', async () => {
    const f = await fixture()
    const id = await candidate(f)
    const result = await approve(f, id, a, {
      proposed_supplier_id: b, material_supplier_id: b, created_material_id: material, status: 'created',
    })
    assert.equal(result.ok, true)
    assert.notEqual(result.material_id, material)
    assert.equal((await candidateRow(id)).proposed_supplier_id, a)
    assert.equal((await row(f)).material_supplier_id, a)
    assert.deepEqual((await db.query('SELECT supplier_uuid FROM mat_supplier_map WHERE material_uuid=$1', [result.material_id])).rows, [{ supplier_uuid: a }])
  })

  await t.test('failed real approval rolls back material, aliases, code sequence, mapping and audit', async () => {
    const f = await fixture()
    const id = await candidate(f)
    await db.query("UPDATE supplier SET status='INACTIVE' WHERE id=$1", [a])
    const before = await materialEffects()
    const itemBefore = await row(f)
    const candidateBefore = await candidateRow(id)
    await rejects(() => approve(f, id), /ร้าน|ใช้งาน/)
    assert.deepEqual(await materialEffects(), before)
    assert.deepEqual(await row(f), itemBefore)
    assert.deepEqual(await candidateRow(id), candidateBefore)
  })

  for (const ignored of [false, true]) {
    await t.test(`supplier change then repair must not restore a created candidate from the old supplier (ignored=${ignored})`, async () => {
      const f = await fixture()
      const id = await candidate(f)
      const created = await approve(f, id)
      assert.equal(created.ok, true)
      if (ignored) await select(f, a, false, { material_id: created.material_id, action: 'ignore' })
      await db.query('UPDATE purchase_receipts SET supplier_id=$1 WHERE id=$2', [b, f.receipt])
      assert.equal((await row(f)).material_id, null)
      assert.equal((await row(f)).material_supplier_id, null)
      const before = await materialEffects()
      const result = await repair(f)
      assert.equal(result.ok, true)
      assert.equal((await row(f)).material_id, null, 'repair restored the old supplier material')
      assert.equal((await row(f)).suggested_material_id, null)
      assert.equal((await row(f)).material_supplier_id, null)
      assert.equal((await row(f)).action, ignored ? 'ignore' : 'needs_review')
      assert.equal((await row(f)).review_status, ignored ? 'reviewed' : 'needs_review')
      assert.equal((await candidateRow(id)).created_material_id, created.material_id)
      assert.deepEqual(await mappings(), before.mappings)
      assert.deepEqual(await prices(), before.prices)
      assert.equal((await repair(f)).ok, true)
    })
  }

  await t.test('posted legacy rows and actual prices survive migration rerun and repair unchanged', async () => {
    assert.deepEqual(await row(legacy), { ...legacyBefore, material_supplier_id: null })
    assert.deepEqual(await row(partialLegacy), { ...partialBefore, material_supplier_id: null })
    await db.query('UPDATE mat_supplier_map SET is_active=false WHERE material_uuid=$1', [legacyMaterial])
    assert.equal((await repair(legacy)).ok, true)
    assert.equal((await repair(partialLegacy)).ok, true)
    assert.deepEqual(await row(legacy), { ...legacyBefore, material_supplier_id: null })
    assert.deepEqual(await row(partialLegacy), { ...partialBefore, material_supplier_id: null })
    assert.deepEqual(await prices(), legacyPrices)
    await rejects(() => db.query('UPDATE purchase_receipts SET supplier_id=$1 WHERE id=$2', [b, partialLegacy.receipt]), /บันทึกราคาแล้ว/)
  })

  await t.test('bulk ready posting skips an unconfirmed legacy selection and posts only the newly confirmed item', async () => {
    assert.equal((await row(reviewedLegacy)).material_supplier_id, null)
    const item = (await db.query(`INSERT INTO purchase_receipt_items(
      receipt_id,line_no,item_name_raw,qty,uom_id,unit_price)
      VALUES ($1,2,'New confirmed line',2,$2,750) RETURNING id`, [reviewedLegacy.receipt, a])).rows[0].id
    const confirmed = { ...reviewedLegacy, item }
    await link()
    await select(confirmed)
    assert.equal((await row(confirmed)).material_supplier_id, a)
    const beforePrices = await prices()

    const result = await post(reviewedLegacy)

    assert.equal(result.posted_count, 1)
    assert.equal(result.finalized, false)
    assert.equal((await row(confirmed)).review_status, 'posted')
    const unconfirmed = await row(reviewedLegacy)
    assert.equal(unconfirmed.review_status, 'needs_review')
    assert.equal(unconfirmed.material_supplier_id, null)
    for (const field of [
      'material_id', 'suggested_material_id', 'material_candidate_id', 'line_no', 'raw_text',
      'item_name_raw', 'item_name_normalized', 'qty', 'uom_raw', 'uom_id', 'unit_price',
      'line_total', 'vat_amount', 'discount_amount',
    ]) assert.deepEqual(unconfirmed[field], reviewedLegacyBefore[field], `legacy ${field} changed`)
    const afterPrices = await prices()
    assert.deepEqual(afterPrices.filter(price => beforePrices.some(old => old.id === price.id)), beforePrices)
    const inserted = afterPrices.filter(price => !beforePrices.some(old => old.id === price.id))
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].material_uuid, material)
    assert.equal(inserted[0].supplier_uuid, a)
    assert.equal(Number(inserted[0].unit_price), 750)
    assert.ok(inserted[0].source_note.includes(reviewedLegacy.receiptNo))
    assert.equal((await receiptRow(reviewedLegacy)).status, 'needs_review')
  })

  await t.test('repair tolerates a selected unposted legacy item without implicitly confirming its supplier', async () => {
    const before = await row(reviewedLegacy)
    assert.equal(before.material_id, legacyMaterial)
    assert.equal(before.material_supplier_id, null)
    const beforeMaps = await mappings()
    const beforePrices = await prices()

    assert.equal((await repair(reviewedLegacy)).ok, true)

    const after = await row(reviewedLegacy)
    assert.equal(after.material_id, before.material_id)
    assert.equal(after.material_supplier_id, null)
    assert.equal(after.unit_price, before.unit_price)
    assert.equal(after.qty, before.qty)
    assert.notEqual(after.review_status, 'posted')
    assert.deepEqual(await mappings(), beforeMaps)
    assert.deepEqual(await prices(), beforePrices)
  })

  await t.test('repair preserves a manual material choice made after candidate creation', async () => {
    const f = await fixture()
    const id = await candidate(f)
    const created = await approve(f, id)
    assert.equal(created.ok, true)
    assert.notEqual(created.material_id, material)
    await link()
    await select(f)
    assert.equal((await row(f)).material_id, material)
    const before = await materialEffects()

    assert.equal((await repair(f)).ok, true)

    assert.equal((await row(f)).material_id, material, 'repair overrode the manual material choice')
    assert.equal((await row(f)).material_supplier_id, a)
    assert.equal((await row(f)).review_status, 'reviewed')
    assert.equal((await candidateRow(id)).created_material_id, created.material_id)
    assert.deepEqual(await materialEffects(), before)
  })

  for (const rpc of postingRpcs) {
    await t.test(`${rpc} posts an actual price once and preserves supplier/material identifiers`, async () => {
      const f = await fixture()
      await link()
      await select(f)
      const result = await post(f, rpc)
      assert.equal(result.posted_count, 1)
      assert.equal(result.finalized, true)
      const inserted = (await prices()).filter(price => !legacyPrices.some(old => old.id === price.id))
      assert.equal(inserted.length, 1)
      assert.equal(inserted[0].material_uuid, material)
      assert.equal(inserted[0].material_id, materialCode)
      assert.equal(inserted[0].supplier_uuid, a)
      assert.equal(inserted[0].supplier_id, 'SUP-A')
      assert.equal(Number(inserted[0].unit_price), 500)
      assert.equal(inserted[0].source_type, 'receipt')
      assert.ok(inserted[0].source_note.includes(f.receiptNo))
      assert.equal((await row(f)).review_status, 'posted')
      const beforeRetry = await prices()
      await rejects(() => post(f, rpc), /already posted/)
      assert.deepEqual(await prices(), beforeRetry)
    })

    for (const invalid of ['disabled', 'wrong supplier UUID']) {
      await t.test(`${rpc} rolls back actual prices and receipt state when mapping becomes ${invalid}`, async () => {
        const f = await fixture()
        await link()
        await select(f)
        if (invalid === 'disabled') {
          await db.query('UPDATE mat_supplier_map SET is_active=false WHERE material_uuid=$1', [material])
        } else {
          await db.query('UPDATE mat_supplier_map SET supplier_uuid=$1 WHERE material_uuid=$2', [b, material])
        }
        const beforePrices = await prices()
        const beforeItem = await row(f)
        const beforeReceipt = await receiptRow(f)
        await rejects(() => post(f, rpc), /ผูก.*ร้าน|ร้าน.*เปลี่ยน/)
        assert.deepEqual(await prices(), beforePrices)
        assert.deepEqual(await row(f), beforeItem)
        assert.deepEqual(await receiptRow(f), beforeReceipt)
      })
    }
  }
})
