import assert from 'node:assert/strict'
import test from 'node:test'
import * as supplierMatching from '../lib/receipt-supplier-match.ts'
const { matchReceiptSuppliers } = supplierMatching

const shop = {
  id: 'supplier-a', supplier_id: 'SUP-A', supplier_code: 'SHOP-A',
  supplier_name_th: 'บริษัท แสงทองวัสดุ จำกัด', supplier_name_en: 'Saengthong Material Co., Ltd.',
  tax_id: '0105551234567', phone: '081-234-5678', status: 'ACTIVE',
}
const receipt = (name = '', taxId = '', phone = null) => ({
  supplier_name_raw: name, supplier_tax_id_raw: taxId,
  ai_raw_json: { supplier: { phone } },
})

test('new supplier draft uses edited seller fields and seller contact details only', () => {
  const input = { ...receipt(' ร้านใหม่ ', '๐-๑๐๕๕-๕๑๒๓๔-๕๖-๗'), ai_raw_json: {
    supplier: { name: 'old OCR name', phone: ' 0812345678 ', address: ' 10 ถนนทดสอบ ', email: ' shop@example.test ' },
    buyer: { name: 'ผู้ซื้อ', address: 'ห้ามใช้ที่อยู่นี้', email: 'buyer@example.test' },
  } }
  assert.deepEqual(supplierMatching.getReceiptSupplierDraft(input), {
    supplier_name_th: 'ร้านใหม่', tax_id: '0105551234567', phone: '0812345678',
    address: '10 ถนนทดสอบ', email: 'shop@example.test',
  })
})

test('new supplier draft leaves missing details blank and does not invent codes or contacts', () => {
  for (const raw of [null, [], 'bad data', { buyer: { phone: '0812345678', address: 'ผู้ซื้อ' } }, { supplier: { address: {}, email: [] } }]) {
    assert.deepEqual(supplierMatching.getReceiptSupplierDraft({ ...receipt(), ai_raw_json: raw }), {
      supplier_name_th: '', tax_id: '', phone: '', address: '', email: '',
    })
  }
})

test('duplicate detection includes inactive suppliers and normalizes name/tax formatting', () => {
  const inactive = { ...shop, status: 'INACTIVE', tax_id: '๐-๑๐๕๕-๕๑๒๓๔-๕๖-๗' }
  assert.equal(supplierMatching.findReceiptSupplierDuplicates({ supplier_name_th: 'new name', tax_id: shop.tax_id }, [inactive])[0].id, shop.id)
  assert.equal(supplierMatching.findReceiptSupplierDuplicates({ supplier_name_th: 'แสงทองวัสดุ', tax_id: '' }, [inactive])[0].id, shop.id)
})

test('duplicate detection does not merge shops merely sharing a phone or part of a name', () => {
  assert.deepEqual(supplierMatching.findReceiptSupplierDuplicates({ supplier_name_th: 'แสงทองวัสดุ สาขา 2', tax_id: '', phone: shop.phone }, [shop]), [])
})

test('exact seller tax ID ranks above a similar name with a conflicting tax ID', () => {
  const other = { ...shop, id: 'supplier-b', tax_id: '0105557654321' }
  const results = matchReceiptSuppliers(receipt('แสงทองวัสดุ', '0105551234567'), [other, shop])
  assert.equal(results[0].supplier.id, shop.id)
  assert.ok(results[0].reasons.includes('เลขผู้เสียภาษีตรงกัน'))
  assert.equal(results[0].conflicts.length, 0)
  assert.ok(results[1].conflicts.includes('เลขผู้เสียภาษีไม่ตรงกัน กรุณาตรวจต้นฉบับ'))
})

test('Thai digits and tax ID formatting do not prevent an exact match', () => {
  const results = matchReceiptSuppliers(receipt('', '๐-๑๐๕๕-๕๑๒๓๔-๕๖-๗'), [shop])
  assert.equal(results[0].supplier.id, shop.id)
  assert.ok(results[0].reasons.includes('เลขผู้เสียภาษีตรงกัน'))
})

test('legal name punctuation and wrappers can match without a tax ID', () => {
  const results = matchReceiptSuppliers(receipt('แสงทองวัสดุ'), [shop])
  assert.ok(results[0].reasons.includes('ชื่อร้านตรงกัน'))
  assert.ok(!results[0].reasons.includes('เลขผู้เสียภาษีตรงกัน'))
})

test('English names are matched without case or company suffix differences', () => {
  const results = matchReceiptSuppliers(receipt('SAENGTHONG MATERIAL'), [shop])
  assert.ok(results[0].reasons.includes('ชื่อร้านตรงกัน'))
})

test('a similar name is only a suggestion, not an exact name match', () => {
  const results = matchReceiptSuppliers(receipt('แสงทองวัสดุก่อสร้าง'), [shop])
  assert.ok(results[0].reasons.includes('ชื่อร้านคล้ายกัน ต้องตรวจสอบ'))
  assert.ok(!results[0].reasons.includes('ชื่อร้านตรงกัน'))
})

test('branch names and numbers are not discarded during name matching', () => {
  const branch = { ...shop, supplier_name_th: 'แสงทองวัสดุ สาขา 1' }
  const results = matchReceiptSuppliers(receipt('แสงทองวัสดุ สาขา 2'), [branch])
  assert.ok(results.every((result) => !result.reasons.includes('ชื่อร้านตรงกัน')))
})

test('matching seller phone supports the +66 prefix', () => {
  const results = matchReceiptSuppliers(receipt('', '', '+66 81 234 5678'), [shop])
  assert.ok(results[0].reasons.includes('เบอร์โทรตรงกัน'))
})

test('phone disagreement is visible even when the tax ID matches', () => {
  const results = matchReceiptSuppliers(receipt('', shop.tax_id, '0899999999'), [shop])
  assert.ok(results[0].conflicts.includes('เบอร์โทรไม่ตรงกัน กรุณาตรวจต้นฉบับ'))
})

test('buyer and arbitrary raw text never supply seller matching evidence', () => {
  const input = receipt()
  input.ai_raw_json = { buyer: { name: shop.supplier_name_th, taxId: shop.tax_id, phone: shop.phone } }
  input.ai_raw_text = JSON.stringify(shop)
  assert.deepEqual(matchReceiptSuppliers(input, [shop]), [])
})

test('malformed AI output and missing values do not create a match or throw', () => {
  for (const raw of [null, 'text', [], { supplier: null }, { supplier: { phone: { value: shop.phone } } }]) {
    assert.deepEqual(matchReceiptSuppliers({ ...receipt(), ai_raw_json: raw }, [shop]), [])
  }
})

test('short names and partial tax IDs are not sufficient evidence', () => {
  assert.deepEqual(matchReceiptSuppliers(receipt('แส', '1234567'), [shop]), [])
})

test('inactive suppliers are not suggested', () => {
  assert.deepEqual(matchReceiptSuppliers(receipt('', shop.tax_id), [{ ...shop, status: 'INACTIVE' }]), [])
})

test('ambiguous exact matches remain separate choices and inputs are not modified', () => {
  const input = receipt('', shop.tax_id)
  const suppliers = [shop, { ...shop, id: 'supplier-branch', supplier_code: 'SHOP-BRANCH' }]
  const before = structuredClone({ input, suppliers })
  const results = matchReceiptSuppliers(input, suppliers)
  assert.equal(results.length, 2)
  assert.deepEqual(new Set(results.map((result) => result.supplier.id)), new Set(suppliers.map((supplier) => supplier.id)))
  assert.deepEqual({ input, suppliers }, before)
})

test('unrelated shops are not suggested and the result list is limited', () => {
  assert.deepEqual(matchReceiptSuppliers(receipt('ร้านไม้คนละร้าน', '9999999999999'), [shop]), [])
  const suppliers = Array.from({ length: 8 }, (_, i) => ({ ...shop, id: `supplier-${i}`, supplier_code: `SHOP-${i}` }))
  assert.equal(matchReceiptSuppliers(receipt('', shop.tax_id), suppliers).length, 5)
})
