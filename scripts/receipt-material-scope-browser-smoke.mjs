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
const candidate = { id: b, receipt_id: id, receipt_item_id: a, status: 'needs_review', proposed_mat_name_th: 'แผ่นไม้สำหรับงานก่อสร้าง', proposed_unit_price: 500, proposed_uom_id: a, proposed_aliases: ['Board'] }
const props = {
  initialReceipt: { id, supplier_id: a, supplier_name_raw: 'ร้าน A', status: 'needs_review', receipt_no: 'TEST-ONLY', subtotal: 500, grand_total: 500, vat: 0, discount: 0 },
  initialItems: [initialItem], uoms: [uom], categories: [], materialTypes: [],
  suppliers: [a,b].map((id,i) => ({ id, supplier_id: `SUP-${i+1}`, supplier_code: `SHOP-${i+1}`, supplier_name_th: `ร้าน ${i === 0 ? 'A' : 'B'}`, status: 'ACTIVE' })),
}
let item = structuredClone(initialItem)
let receipt = structuredClone(props.initialReceipt)
let searchFailure = false
let staleSearch = false
let candidateFailure = false
const requests = []
const unexpectedRequests = []
const screenshotDirectory = process.env.RECEIPT_SCOPE_SCREENSHOT_DIR
const { outputFiles } = await build({
  stdin: { contents: `
    import {createRoot} from 'react-dom/client';
    import {ReceiptReviewClient} from './components/receipts/ReceiptReviewClient';
    import {ReceiptCreateDraftForm} from './components/receipts/ReceiptCreateDraftForm';
    import {ReceiptListTable} from './components/receipts/ReceiptListTable';
    import {I18nProvider} from './lib/i18n/client';
    import styles from './components/receipts/receipts.module.css';
    const props=${JSON.stringify(props)};
    const scenario=location.search.slice(1);
    if(scenario==='legacy') props.initialItems=[{...props.initialItems[0],material_id:'${a}',material:${JSON.stringify(materials[0])},review_status:'reviewed',action:'update_price'}];
    if(scenario==='unconfirmed'){props.initialReceipt.supplier_id=null;props.initialItems[0].suggested_material=${JSON.stringify(materials[0])};}
    if(scenario==='candidate') props.initialItems=[{...props.initialItems[0],material_candidate_id:'${b}',material_candidate:${JSON.stringify(candidate)},action:'create_material_needed'}];
    if(scenario==='posted'){props.initialReceipt.status='posted';props.initialItems[0].review_status='posted';}
    if(scenario==='preview') Object.assign(props.initialReceipt,{file_name:'fixture.svg',file_mime_type:'image/svg+xml'});
    const content=scenario==='create' ? <ReceiptCreateDraftForm/> : scenario==='list' ? <I18nProvider initialLocale="th"><ReceiptListTable receipts={[{...props.initialReceipt,item_count:1},{...props.initialReceipt,id:'${b}',status:'posted',receipt_no:'POSTED-ONLY',supplier_name_raw:'ร้านวัสดุก่อสร้างสำหรับทดสอบชื่อยาว'}]}/></I18nProvider> : <ReceiptReviewClient {...props}/>;
    createRoot(document.getElementById('root')).render(<div className={styles.page}><header className={styles.pageHeader}><h1 className="text-2xl">นำเข้าราคาจากสลิป</h1></header><div className={styles.pageContent}>{content}</div></div>);
  `, resolveDir: root, loader: 'tsx' },
  absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  outfile: 'fixture.js', loader: { '.module.css': 'local-css' },
  define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': root },
  plugins: [{ name: 'next-router-test-boundary', setup(build) {
    build.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'test-next' }))
    build.onLoad({ filter: /.*/, namespace: 'test-next' }, ({path}) => ({
      contents: path.endsWith('link') ? "import {createElement} from 'react';export default function Link(p){return createElement('a',p)}" : 'const router={push(){},replace(){},refresh(){}};const params=new URLSearchParams();export function useRouter(){return router}export function usePathname(){return "/receipts"}export function useSearchParams(){return params}',
      resolveDir: root, loader: 'js',
    }))
  } }],
})
const javascript = outputFiles.find(file => file.path.endsWith('.js'))
const moduleCss = outputFiles.find(file => file.path.endsWith('.css'))
assert.ok(javascript && moduleCss, 'bundle must contain real JavaScript and CSS module output')
const tailwindConfig = require('tailwindcss/loadConfig')(path.join(root, 'tailwind.config.ts'))
const css = await require('postcss')([
  require('tailwindcss')({ ...tailwindConfig, content: [
    path.join(root, 'components/receipts/**/*.tsx'), path.join(root, 'components/mat/SupplierForm.tsx'),
    path.join(root, 'components/ui/SearchInput.tsx'), path.join(root, 'app/(mat)/receipts/**/*.tsx'),
  ] }),
  require('autoprefixer'),
]).process(readFileSync(path.join(root,'app/globals.css'),'utf8'), { from: path.join(root,'app/globals.css') })
// Remote font imports are excluded so the fixture never depends on external network.
css.root.walkAtRules('import', rule => rule.remove())
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost')
  const send = (body,status=200) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(body)) }
  if (url.pathname === '/fixture.js') { res.writeHead(200,{'Content-Type':'text/javascript'}); res.end(javascript.text); return }
  if (url.pathname === '/fixture.css') { res.writeHead(200,{'Content-Type':'text/css'}); res.end(css.root.toString()+'\n'+moduleCss.text); return }
  if (url.pathname === '/') {
    receipt = structuredClone(props.initialReceipt); item = structuredClone(initialItem)
    if (url.search === '?unconfirmed') receipt.supplier_id = null
    searchFailure = false; staleSearch = false; candidateFailure = false
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
    res.end('<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>'); return
  }
  if (url.pathname === `/api/receipts/${id}/file`) {
    res.writeHead(200,{'Content-Type':'image/svg+xml'})
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><rect width="500" height="700" fill="white"/><g fill="#1d1d1f" font-family="sans-serif"><text x="45" y="80" font-size="28">RECEIPT / TEST ONLY</text><text x="45" y="135" font-size="18">SHOP A</text><text x="45" y="240" font-size="18">Board       1 x 500.00</text><text x="45" y="400" font-size="24">TOTAL           500.00</text></g></svg>'); return
  }
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
  if (url.pathname === `/api/receipts/${id}/items` && req.method === 'POST') return send({data:{...initialItem,...payload,id:b}})
  if (url.pathname === `/api/receipts/${id}/items/${b}` && req.method === 'DELETE') return send({data:{id:b}})
  if (url.pathname === `/api/receipts/${id}/material-candidates/${b}` && req.method === 'PATCH') {
    return candidateFailure ? send({error:'บันทึก Draft วัสดุไม่สำเร็จ (ทดสอบ)'},500) : send({data:{...candidate,...payload}})
  }
  if (url.pathname === `/api/receipts/${id}/material-candidates/${b}/approve` && req.method === 'POST') {
    if (!payload.confirmDuplicate) return send({code:'DUPLICATE',error:'พบวัสดุคล้ายกัน (ทดสอบ)',details:{requiresConfirmation:true,duplicateWarning:{matches:[materials[0]]}}},409)
    return send({data:{items:[{...initialItem,material_id:a,material:materials[0],material_supplier_id:a,action:'update_price',review_status:'reviewed'}],material:materials[0]}})
  }
  unexpectedRequests.push(`${req.method} ${url.pathname}`)
  return send({error:'Unexpected fixture request'},404)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base = `http://127.0.0.1:${server.address().port}`
let browser
let page
let width
async function screenshot(name, locator) {
  if (!screenshotDirectory) return
  const target = path.join(screenshotDirectory, `receipts-${width}-${name}.png`)
  if (locator) await locator.screenshot({path:target})
  else {
    await page.evaluate(()=>window.scrollTo(0,0))
    await page.screenshot({path:target,fullPage:await page.locator('dialog[open]').count()===0})
  }
  console.log(`SCREENSHOT: ${target}`)
}
async function noOverflow(label) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    return {
      viewport,
      scroll: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('body *')].filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.width && rect.right > viewport + 1 && getComputedStyle(element).position !== 'absolute'
      }).slice(0,5).map(element => `${element.tagName}.${element.className}`),
    }
  })
  assert.ok(result.scroll <= result.viewport + 1, `${label}: page overflow ${JSON.stringify(result)}`)
  console.log(`PASS: ${width}px ${label}: scrollWidth=${result.scroll}, viewport=${result.viewport}`)
}
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true })
  for (width of [1600,390]) {
  requests.length = 0
  const context = await browser.newContext({viewport:{width,height:width===390 ? 844 : 1100},deviceScaleFactor:1})
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  const consoleErrors = []
  page.on('console',message => { if (message.type()==='error') consoleErrors.push(message.text()) })
  page.on('pageerror',error=>errors.push(error.message))
  page.on('dialog',dialog=>dialog.accept())
  await page.goto(base)
  await page.getByRole('article').waitFor()
  assert.equal(await page.getByRole('article').getByLabel('จำนวน',{exact:true}).evaluate(element=>getComputedStyle(element).borderRadius),'12px','real scoped input CSS must be loaded')
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim()),'#0071e3','real global theme must be loaded')
  await noOverflow('initial review')
  await screenshot('review')
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).click()
  await page.getByRole('button',{name:'ค้นหา',exact:true}).click()
  await page.getByRole('button',{name:/BOARD-1/}).waitFor()
  assert.equal(requests.at(-1).params.scope,'supplier')
  assert.equal(requests.at(-1).params.receipt_id,id)
  assert.equal(await page.getByRole('button',{name:/BOARD-2/}).count(),0)
  console.log('PASS: default search sends receipt context and only supplier results')

  await page.getByRole('button',{name:/ไม่พบในร้าน.*ค้นหาคลังกลาง/}).click()
  await page.getByRole('button',{name:/BOARD-2/}).click()
  if (process.env.RECEIPT_SCOPE_SCREENSHOT && width===1600) await page.screenshot({path:process.env.RECEIPT_SCOPE_SCREENSHOT,fullPage:true})
  await noOverflow('global material confirmation')
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

  await page.getByRole('combobox',{name:'ร้านค้าของสลิป',exact:true}).selectOption(b)
  assert.equal(await page.getByRole('button',{name:'ค้นหา',exact:true}).count(),0)
  await page.getByRole('button',{name:'ยืนยันร้านและบันทึก Draft',exact:true}).click()
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).waitFor()
  assert.equal(await page.getByText('BOARD-1',{exact:true}).count(),0)
  console.log('PASS: changing supplier requires confirmation and clears material selection')
  assert.deepEqual(errors,[])
  await page.goto(base+'?legacy')
  await page.getByRole('button',{name:'เปลี่ยน',exact:true}).waitFor()
  assert.ok(await page.getByRole('navigation',{name:'ขั้นตอนตรวจสลิป'}).isVisible())
  const toolsMenu = page.locator('details').filter({has:page.locator('summary').filter({hasText:'เครื่องมือเพิ่มเติม'})})
  assert.equal(await toolsMenu.getAttribute('open'), null)
  assert.equal(await page.getByRole('button',{name:'ซ่อมสถานะสลิปนี้',exact:true}).isVisible(), false)
  await toolsMenu.locator('summary').focus()
  await page.keyboard.press('Enter')
  assert.ok(await page.getByRole('button',{name:'ซ่อมสถานะสลิปนี้',exact:true}).isVisible())
  console.log('PASS: three workflow steps are visible; keyboard opens collapsed secondary tools')
  const readyButton = page.getByRole('button',{name:/บันทึกราคาที่พร้อมทั้งหมด/})
  assert.ok(await readyButton.isDisabled(), 'legacy selection without supplier review must not be shown as ready')
  console.log('PASS: legacy selections without supplier context require review')
  await page.goto(base+'?unconfirmed')
  await page.getByRole('button',{name:'สร้างร้านใหม่จากสลิป',exact:true}).waitFor()
  assert.equal(await page.getByText('พบวัสดุใกล้เคียง',{exact:true}).count(),0,'unconfirmed shop must not show old global suggestions')
  assert.deepEqual(errors,[])
  console.log('PASS: an unconfirmed shop never displays a legacy global material suggestion')
  const writesBeforeDialog = requests.filter(request=>request.method!=='GET').length
  await page.getByRole('button',{name:'สร้างร้านใหม่จากสลิป',exact:true}).click()
  const supplierDialog = page.getByRole('dialog',{name:'สร้างร้านใหม่จากสลิป',exact:true})
  await supplierDialog.waitFor()
  assert.ok(await supplierDialog.evaluate(element=>element.matches(':modal')))
  assert.ok(await supplierDialog.getByRole('button',{name:'ยืนยันสร้างร้านใหม่',exact:true}).isDisabled())
  assert.ok(await page.locator('select[aria-label="ร้านค้าของสลิป"]').isDisabled(),'supplier selection must remain locked while native dialog is open')
  await page.keyboard.press('Tab')
  assert.ok(await supplierDialog.evaluate(element=>element.contains(document.activeElement)),'native supplier dialog keeps keyboard focus inside')
  await noOverflow('supplier dialog')
  await screenshot('supplier-dialog')
  await supplierDialog.getByRole('button',{name:'ยกเลิก',exact:true}).click()
  await supplierDialog.waitFor({state:'detached'})
  assert.equal(requests.filter(request=>request.method!=='GET').length,writesBeforeDialog,'opening/cancelling supplier dialog must not write')
  await page.getByRole('combobox',{name:'ร้านค้าของสลิป',exact:true}).selectOption(a)
  assert.ok(await page.getByRole('button',{name:'จับคู่วัสดุอัตโนมัติ',exact:true}).isDisabled(),'selecting a shop is not confirmation')
  await page.getByRole('button',{name:'ยืนยันร้านและบันทึก Draft',exact:true}).click()
  await page.getByRole('button',{name:'ค้นหาเอง',exact:true}).waitFor()
  console.log('PASS: supplier modal locks selection; cancel writes nothing; explicit confirmation still required')

  await page.goto(base)
  const row = page.getByRole('article')
  await row.waitFor()
  await row.getByLabel('จำนวน',{exact:true}).fill('1.2345')
  await row.getByLabel('ราคา/หน่วย',{exact:true}).fill('12.3456')
  await row.getByLabel('รวม',{exact:true}).fill('15.24')
  await row.getByRole('button',{name:'บันทึก',exact:true}).click()
  await page.getByText('บันทึกรายการแล้ว',{exact:true}).waitFor()
  let saved = requests.filter(request=>request.method==='PATCH').at(-1).payload
  assert.equal(saved.qty,1.2345); assert.equal(saved.unit_price,12.3456); assert.equal(saved.line_total,15.24)
  await row.getByLabel('จำนวน',{exact:true}).fill('')
  await row.getByRole('button',{name:'บันทึก',exact:true}).click()
  await page.getByText('บันทึกรายการแล้ว',{exact:true}).waitFor()
  assert.equal(requests.filter(request=>request.method==='PATCH').at(-1).payload.qty,null)
  const notes = page.locator('details').filter({has:page.locator('summary').filter({hasText:'หมายเหตุเพิ่มเติม'})})
  await notes.locator('summary').focus(); await page.keyboard.press('Enter')
  await notes.getByLabel('Notes',{exact:true}).fill('หมายเหตุทดสอบ')
  await notes.locator('summary').press('Enter'); await notes.locator('summary').press('Enter')
  assert.equal(await notes.getByLabel('Notes',{exact:true}).inputValue(),'หมายเหตุทดสอบ')
  const addForm = page.locator('details').filter({has:page.locator('summary').filter({hasText:'เพิ่มรายการจากสลิปด้วยตัวเอง'})})
  await addForm.locator('summary').focus(); await page.keyboard.press('Space')
  await addForm.getByLabel('รายการจากสลิป',{exact:true}).fill('รายการเพิ่มด้วยตัวเอง')
  await addForm.getByLabel('จำนวน',{exact:true}).fill('2.0001')
  await addForm.getByRole('combobox',{name:'หน่วย',exact:true}).selectOption(a)
  await addForm.getByLabel('ราคา/หน่วย',{exact:true}).fill('10')
  await addForm.getByLabel('รวม',{exact:true}).fill('20')
  await addForm.getByRole('button',{name:'+ เพิ่มรายการ',exact:true}).click()
  await page.getByRole('article',{name:/รายการเพิ่มด้วยตัวเอง/}).waitFor()
  assert.equal(requests.findLast(request=>request.path.endsWith('/items')&&request.method==='POST').payload.qty,2.0001)
  await page.getByRole('article',{name:/รายการเพิ่มด้วยตัวเอง/}).getByRole('button',{name:'ลบ',exact:true}).click()
  await page.getByRole('article',{name:/รายการเพิ่มด้วยตัวเอง/}).waitFor({state:'detached'})
  await noOverflow('edited rows and open add form')
  console.log('PASS: decimal precision, blank-to-null, keyboard disclosures, add and delete preserve payloads')

  await page.goto(base+'?preview')
  const preview = page.locator('#receipt-original-preview')
  const image = preview.getByRole('img')
  await image.waitFor()
  assert.ok(await image.evaluate(element=>element.complete&&element.naturalWidth>0),'original file must load')
  const readsBefore = requests.filter(request=>request.method!=='GET').length
  await page.getByRole('button',{name:'ซ่อนเอกสารต้นฉบับ',exact:true}).focus()
  await page.keyboard.press('Enter')
  assert.ok(await preview.isHidden())
  await noOverflow('preview hidden')
  await screenshot('items',page.getByRole('article'))
  await page.getByRole('button',{name:'แสดงเอกสารต้นฉบับ',exact:true}).click()
  assert.ok(await image.isVisible())
  assert.equal(requests.filter(request=>request.method!=='GET').length,readsBefore)
  await noOverflow('preview shown')
  await screenshot('preview')

  await page.goto(base+'?candidate')
  assert.ok(await page.getByRole('article').getByLabel('Action',{exact:true}).isDisabled())
  await page.getByRole('button',{name:'ตรวจ Draft วัสดุ',exact:true}).click()
  const candidateDialog = page.getByRole('dialog',{name:'ตรวจ Draft วัสดุ',exact:true})
  await candidateDialog.waitFor()
  assert.ok(await candidateDialog.evaluate(element=>element.matches(':modal')))
  for (let tab=0;tab<18;tab++) {
    await page.keyboard.press('Tab')
    // Native dialogs may tab into browser chrome (activeElement becomes body),
    // but must never focus a background page control while remaining modal.
    assert.ok(await candidateDialog.evaluate(element=>element.matches(':modal') && (element.contains(document.activeElement) || document.activeElement===document.body)),'candidate modal must keep background page controls inert')
  }
  candidateFailure = true
  await candidateDialog.getByRole('button',{name:'บันทึก Draft',exact:true}).click()
  await candidateDialog.getByRole('alert').filter({hasText:'บันทึก Draft วัสดุไม่สำเร็จ (ทดสอบ)'}).waitFor()
  assert.ok(await candidateDialog.getByRole('alert').evaluate(element=>{
    const rect=element.getBoundingClientRect()
    return document.activeElement===element && rect.top>=0 && rect.bottom<=innerHeight
  }),'candidate failure must receive focus and be visible in the viewport')
  await noOverflow('candidate error dialog')
  assert.ok(await candidateDialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'candidate dialog must not overflow horizontally')
  await screenshot('candidate-error')
  await page.keyboard.press('Escape')
  await candidateDialog.waitFor({state:'detached'})
  assert.ok(await page.getByRole('button',{name:'ตรวจ Draft วัสดุ',exact:true}).evaluate(element=>element===document.activeElement),'Escape restores focus to candidate trigger')
  candidateFailure = false
  await page.getByRole('button',{name:'ตรวจ Draft วัสดุ',exact:true}).click()
  await candidateDialog.getByRole('button',{name:'อนุมัติและสร้างวัสดุ',exact:true}).click()
  await candidateDialog.getByRole('button',{name:'ยืนยันสร้างใหม่แม้พบวัสดุคล้ายกัน',exact:true}).waitFor()
  assert.equal(requests.findLast(request=>request.path.endsWith('/approve')).payload.confirmDuplicate,false)
  await candidateDialog.getByRole('button',{name:'ยืนยันสร้างใหม่แม้พบวัสดุคล้ายกัน',exact:true}).click()
  await candidateDialog.waitFor({state:'detached'})
  const approval = requests.findLast(request=>request.path.endsWith('/approve')).payload
  assert.equal(approval.confirmDuplicate,true); assert.equal(approval.expected_supplier_id,a)
  assert.equal(requests.filter(request=>request.path.endsWith('/post')||request.path.endsWith('/post-ready-items')).length,0)
  console.log('PASS: candidate lock, native focus trap, visible errors, Escape and explicit duplicate approval without posting prices')

  await page.goto(base+'?posted')
  await page.getByRole('article').waitFor()
  for (const control of await page.getByRole('article').locator('input,select').all()) assert.ok(await control.isDisabled())
  assert.equal(await page.getByRole('article').getByRole('button').count(),0)
  assert.equal(await page.locator('summary').filter({hasText:'เพิ่มรายการจากสลิปด้วยตัวเอง'}).count(),0)
  assert.ok(await page.getByRole('button',{name:'สลิปนี้ถูกบันทึกเข้าระบบแล้ว',exact:true}).isDisabled())
  await noOverflow('posted receipt')

  await page.goto(base+'?create')
  await page.getByRole('button',{name:'เลือกไฟล์สลิป',exact:true}).waitFor()
  assert.ok(await page.getByRole('button',{name:'สร้าง Draft และอ่านด้วย AI',exact:true}).isDisabled())
  const chooserReady = page.waitForEvent('filechooser')
  await page.getByRole('button',{name:'เลือกไฟล์สลิป',exact:true}).focus(); await page.keyboard.press('Enter')
  const chooser = await chooserReady
  await chooser.setFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1cAAAAASUVORK5CYII=','base64')})
  assert.ok(await page.getByRole('button',{name:'สร้าง Draft และอ่านด้วย AI',exact:true}).isEnabled())
  await noOverflow('create with selected file')
  await screenshot('create')
  await page.getByRole('button',{name:'ลบไฟล์',exact:true}).click()
  assert.ok(await page.getByRole('button',{name:'สร้าง Draft และอ่านด้วย AI',exact:true}).isDisabled())
  await page.goto(base+'?list')
  await page.getByRole('table').waitFor()
  assert.equal(await page.getByRole('button',{name:'ลบ Draft',exact:true}).count(),1,'posted list row must not offer deletion')
  await noOverflow('receipt list')
  await screenshot('list')
  console.log('PASS: posted controls, keyboard file selection/removal and receipt list actions')
  assert.deepEqual(errors,[])
  const unexpectedConsole = consoleErrors.filter(message=>!/^Failed to load resource: the server responded with a status of (500|409) \(/.test(message))
  assert.deepEqual(unexpectedConsole,[],'only deliberately injected API failures may appear in the console')
  assert.deepEqual(unexpectedRequests,[])
  console.log('PASS: zero browser runtime errors')
  await context.close()
  }
} catch (error) {
  await screenshot('failure').catch(()=>{})
  throw error
} finally {
  await browser?.close()
  await new Promise(resolve=>server.close(resolve))
}
