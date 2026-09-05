import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as zod from 'zod'
import { readSpecDetails, writeSpecDetails, specDetailError } from '../lib/receipt-spec-fields.ts'
test('real candidate save path preserves spec through database adapter and re-read', async () => {
  const output=ts.transpileModule(readFileSync(new URL('../lib/server/receipt-material-candidates.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const deps={zod,'@/lib/receipt-spec-fields':{readSpecDetails,specDetailError},'@/lib/material-master':{normalizeMaterialSearchText:v=>String(v??'').toLowerCase()},'@/lib/server-utils':{writeAuditLog:async()=>{}},'@/lib/server/receipt-import':{ReceiptImportError:Error}}
  const module={exports:{}}
  new Function('require','module','exports',output)(name=>deps[name]??{},module,module.exports)
  let row={id:'candidate',receipt_id:'receipt',status:'needs_review',proposed_spec:'007'}
  const db={from(table){
    let patch=null
    const chain={select(){return chain},eq(){return chain},update(value){patch=value;return chain},limit(){return Promise.resolve({data:[],error:null})},async maybeSingle(){return {data:table==='purchase_receipts'?{id:'receipt',status:'needs_review'}:{...row},error:null}},async single(){row={...row,...patch};return {data:{...row},error:null}}}
    return chain
  }}
  const detail={profile:'laminate',notes:'007',values:{'รหัสสี / ลาย':'0012-M','ความหนา (มม.)':'0.7'}}
  const input=module.exports.receiptMaterialCandidateUpdateSchema.parse({proposed_spec:writeSpecDetails(detail)})
  await module.exports.updateReceiptMaterialCandidate(db,'receipt','candidate',input,'tester')
  const reloaded=await db.from('receipt_material_candidates').select().eq('id','candidate').maybeSingle()
  assert.deepEqual(readSpecDetails(reloaded.data.proposed_spec),detail)
  assert.equal(module.exports.receiptMaterialCandidateUpdateSchema.safeParse({proposed_spec:writeSpecDetails({...detail,values:{'ความหนา (มม.)':'-1'}})}).success,false)
})
test('legacy spec is preserved, never inferred', () => {
  assert.deepEqual(readSpecDetails('007 สีพื้น'),{profile:'',notes:'007 สีพื้น',values:{}})
})
test('save and reopen preserves profile, decimals, leading zeros and newlines', () => {
  const draft={profile:'laminate',notes:'007\noriginal',values:{'รหัสสี / ลาย':'0012-M','ความหนา (มม.)':'0.7'}}
  assert.deepEqual(readSpecDetails(writeSpecDetails(draft)),draft)
})
test('unknown serialized data stays intact as legacy text', () => {
  const text='[รายละเอียดวัสดุ v1]\nunknown'
  assert.equal(readSpecDetails(text).notes,text)
})
test('reject overflow and invalid positive dimensions; allow partial draft', () => {
  assert.equal(specDetailError({profile:'laminate',notes:'',values:{}}),null)
  assert.ok(specDetailError({profile:'laminate',notes:'',values:{'ความหนา (มม.)':'-1'}}))
  assert.ok(specDetailError({profile:'paint',notes:'x'.repeat(501),values:{}}))
})
test('different profiles never serialize stale fields', () => {
  const parsed=readSpecDetails(writeSpecDetails({profile:'paint',notes:'',values:{'ความหนา (มม.)':'18','รหัสสี / สูตรผสม':'0099'}}))
  assert.equal(parsed.values['ความหนา (มม.)'],undefined)
  assert.equal(parsed.values['รหัสสี / สูตรผสม'],'0099')
})
