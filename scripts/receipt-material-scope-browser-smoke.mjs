// Isolated UI test: renders the real ReceiptReviewClient with local HTTP fixtures.
// No real credentials, Supabase calls, or persisted business data are used.
// Optional ESBUILD_MODULE and PLAYWRIGHT_MODULE point to externally installed packages.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const load = (env, name) => import(process.env[env] ? pathToFileURL(process.env[env]).href : name)
const { build } = await load('ESBUILD_MODULE', 'esbuild')
const { chromium } = await load('PLAYWRIGHT_MODULE', 'playwright')
const root = path.resolve(import.meta.dirname, '..')
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const uom = { id: a, uom_code: 'SHEET', uom_name_th: 'แผ่น' }
const materials = [a,b].map((id,i) => ({ id, material_id: `MAT-${i+1}`, material_code: `BOARD-${i+1}`, mat_name_th: `Board ${i+1}`, base_uom: 'SHEET', base_uom_id: a, uom }))
const initialItem = { id: a, receipt_id: id, line_no: 1, item_name_raw: 'Board', qty: 1, unit_price: 500, line_total: 500, uom_id: a, uom_raw: 'SHEET', material_id: null, material_supplier_id: null, material_candidate_id: null, suggested_material_id: null, review_status: 'needs_review', action: 'needs_review' }
const props = {
  initialReceipt: { id, supplier_id: a, supplier_name_raw: 'ร้าน A', status: 'needs_review', receipt_no: 'TEST-ONLY', subtotal: 500, grand_total: 500, vat: 0, discount: 0 },
  initialItems: [initialItem], uoms: [uom], categories: [], materialTypes: [],
  suppliers: [a,b].map((id,i) => ({ id, supplier_id: `SUP-${i+1}`, supplier_code: `SHOP-${i+1}`, supplier_name_th: `ร้าน ${i === 0 ? 'A' : 'B'}`, status: 'ACTIVE' })),
}
let item = structuredClone(initialItem)
let receipt = structuredClone(props.initialReceipt)
let searchFailure = false
let staleSearch = false
const requests = []
const { outputFiles } = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client'; import {ReceiptReviewClient} from './components/receipts/ReceiptReviewClient'; const props=${JSON.stringify(props)}; if(location.search==='?legacy') props.initialItems=[{...props.initialItems[0],material_id:'${a}',material:${JSON.stringify(materials[0])},review_status:'reviewed',action:'update_price'}]; if(location.search==='?unconfirmed'){props.initialReceipt.supplier_id=null;props.initialItems[0].suggested_material=${JSON.stringify(materials[0])};} createRoot(document.getElementById('root')).render(<ReceiptReviewClient {...props}/>);`, resolveDir: root, loader: 'tsx' },
  absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': root },
  plugins: [{ name: 'next-router-test-boundary', setup(build) {
    build.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'test-next' }))
    build.onLoad({ filter: /.*/, namespace: 'test-next' }, ({path}) => ({
      contents: path.endsWith('link') ? "import {createElement} from 'react';export default function Link(p){return createElement('a',p)}" : 'export function useRouter(){return {push(){},refresh(){}}}',
      resolveDir: root, loader: 'js',
    }))
  } }],
})
const css = await require('postcss')([require('tailwindcss')({ content: [
  path.join(root, 'components/receipts/ReceiptReviewClient.tsx'), path.join(root, 'components/mat/SupplierForm.tsx'),
] })]).process(readFileSync(path.join(root,'app/globals.css'),'utf8'), { from: undefined })
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost')
  const send = (body,status=200) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(body)) }
  if (url.pathname === '/fixture.js') { res.writeHead(200,{'Content-Type':'text/javascript'}); res.end(outputFiles[0].text); return }
  if (url.pathname === '/fixture.css') { res.writeHead(200,{'Content-Type':'text/css'}); res.end(css.css); return }
  if (url.pathname === '/') { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end('<html lang="th"><head><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>'); return }
  let body = ''; for await (const chunk of req) body += chunk
  const payload = body ? JSON.parse(body) : null
  requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), method: req.method, payload })
  if (url.pathname === '/api/receipts/material-candidates') {
    if (searchFailure) return send({ error: 'ค้นหาวัสดุไม่สำเร็จ (ทดสอบ)' },500)
    return send({ data: url.searchParams.get('scope') === 'all' ? [materials[1]] : [materials[0]], supplier_id: staleSearch ? b : receipt.supplier_id })
  }
  if (url.pathname === `/api/receipts/${id}/items/${a}` && req.method === 'PATCH') {
    if (payload.expected_supplier_id !== receipt.supplier_id) return send({error:'ร้านของสลิปเปลี่ยนแล้ว'},409)
    if (payload.material_id === b && !payload.confirm_supplier_link) return send({error:'ต้องยืนยันผูกก่อน'},409)
    item = {...item,...payload,material:materials.find(m=>m.id===payload.material_id), material_supplier_id:receipt.supplier_id,review_status:'reviewed'}
    return send({data:item})
  }
  if (url.pathname === `/api/receipts/${id}` && req.method === 'PATCH') {
    receipt = {...receipt,...payload}; item = {...initialItem}
    return send({data:receipt,items:[item]})
  }
  return send({error:'Unexpected fixture request'},404)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({viewport:{width:1600,height:1100}})
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror',error=>errors.push(error.message))
  page.on('dialog',dialog=>dialog.accept())
  await page.goto(base)
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).click()
  await page.getByRole('button',{name:'ค้นหา',exact:true}).click()
  await page.getByRole('button',{name:/BOARD-1/}).waitFor()
  assert.equal(requests.at(-1).params.scope,'supplier')
  assert.equal(requests.at(-1).params.receipt_id,id)
  assert.equal(await page.getByRole('button',{name:/BOARD-2/}).count(),0)
  console.log('PASS: default search sends receipt context and only supplier results')

  await page.getByRole('button',{name:/ไม่พบในร้าน.*ค้นหาคลังกลาง/}).click()
  await page.getByRole('button',{name:/BOARD-2/}).click()
  if (process.env.RECEIPT_SCOPE_SCREENSHOT) await page.screenshot({path:process.env.RECEIPT_SCOPE_SCREENSHOT,fullPage:true})
  assert.equal(requests.filter(r=>r.method==='PATCH').length,0)
  await page.getByRole('button',{name:'ยกเลิก',exact:true}).click()
  assert.equal(requests.filter(r=>r.method==='PATCH').length,0)
  console.log('PASS: opening/cancelling global confirmation writes nothing')
  await page.getByRole('button',{name:/BOARD-2/}).click()
  await page.getByRole('button',{name:'ยืนยันผูกกับร้านนี้และเลือก',exact:true}).click()
  await page.getByText('บันทึกรายการแล้ว',{exact:true}).waitFor()
  assert.equal(requests.find(r=>r.method==='PATCH').payload.confirm_supplier_link,true)
  assert.equal(requests.find(r=>r.method==='PATCH').payload.expected_supplier_id,a)
  console.log('PASS: explicit confirmation includes supplier and link intent')

  await page.getByRole('button',{name:'เปลี่ยน',exact:true}).click()
  await page.getByRole('button',{name:'กลับไปค้นหาเฉพาะร้านนี้',exact:true}).click()
  await page.getByRole('button',{name:/BOARD-1/}).click()
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).waitFor()
  assert.equal(requests.filter(r=>r.method==='PATCH').at(-1).payload.confirm_supplier_link,false)
  console.log('PASS: supplier-linked selection needs no global-link confirmation')

  await page.getByRole('button',{name:'เปลี่ยน',exact:true}).click()
  staleSearch = true
  await page.getByRole('button',{name:'ค้นหา',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'ร้านของสลิปเปลี่ยนแล้ว'}).waitFor()
  assert.equal(await page.getByRole('button',{name:/BOARD-1/}).count(),0)
  staleSearch = false
  searchFailure = true
  await page.getByRole('button',{name:'ค้นหา',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'ค้นหาวัสดุไม่สำเร็จ (ทดสอบ)'}).waitFor()
  console.log('PASS: stale supplier/error responses are shown, never treated as empty success')

  await page.locator('select').filter({has:page.locator(`option[value="${b}"]`)}).selectOption(b)
  assert.equal(await page.getByRole('button',{name:'ค้นหา',exact:true}).count(),0)
  await page.getByRole('button',{name:'ยืนยันร้านและบันทึก Draft',exact:true}).click()
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).waitFor()
  assert.equal(await page.getByText('BOARD-1',{exact:true}).count(),0)
  console.log('PASS: changing supplier requires confirmation and clears material selection')
  assert.deepEqual(errors,[])
  await page.goto(base+'?legacy')
  await page.getByRole('button',{name:'เปลี่ยน',exact:true}).waitFor()
  const readyButton = page.getByRole('button',{name:/บันทึกราคาที่พร้อมทั้งหมด/})
  assert.ok(await readyButton.isDisabled(), 'legacy selection without supplier review must not be shown as ready')
  console.log('PASS: legacy selections without supplier context require review')
  await page.goto(base+'?unconfirmed')
  await page.getByRole('button',{name:'สร้างร้านใหม่จากสลิป',exact:true}).waitFor()
  assert.equal(await page.getByText('พบวัสดุใกล้เคียง',{exact:true}).count(),0,'unconfirmed shop must not show old global suggestions')
  assert.deepEqual(errors,[])
  console.log('PASS: an unconfirmed shop never displays a legacy global material suggestion')
  console.log('PASS: zero browser runtime errors')
} finally {
  await browser?.close()
  await new Promise(resolve=>server.close(resolve))
}
