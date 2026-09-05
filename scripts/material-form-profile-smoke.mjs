import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMaterialFormProfile } from '../lib/material-form-profile.ts'

// Read-only DOM observations from authenticated Production on 2026-09-05.
// /materials/new: type option values filtered by category; /settings/material-code: category option UUIDs.
// Snapshot evidence only, never imported by runtime. Active states were displayed by settings.
const observedCategories = {
  "WD": "3d6d9e74-0069-4c2f-b0e2-ea26ca754cde",
  "STR": "226e0409-8a60-4474-ad7d-3859c734dbf4",
  "FNR": "ff3a434f-ea18-4a99-aa51-24ff86307b33",
  "PNT": "424a238b-d06d-48b4-91b4-4bb6f1229a61"
}
const observedTypes = [
  [
    "WD",
    "HMR",
    "eaf2ad02-3c6f-4c6b-9fb7-832cb1065457",
    "board"
  ],
  [
    "WD",
    "MDF",
    "20894d89-d7d6-43b7-8999-33afa1c85162",
    "board"
  ],
  [
    "WD",
    "PLY",
    "e5b2fb3a-99a4-40b8-9652-1321308e9a89",
    "board"
  ],
  [
    "WD",
    "PB",
    "e6cc3d5d-6358-4ffe-84df-b62dd51d0f14",
    "board"
  ],
  [
    "STR",
    "HMR",
    "6af55fa2-ddc5-4ae6-b5cc-7fb3fde6cbd8",
    "board"
  ],
  [
    "STR",
    "MDF",
    "835aa93f-41a6-424c-afcb-bec1b36b9921",
    "board"
  ],
  [
    "STR",
    "PLY",
    "ae5c10ad-c47c-413a-a6b0-06325ad92045",
    "board"
  ],
  [
    "FNR",
    "HPL",
    "b5a454e0-8fdc-41b8-ae63-6daae2c34693",
    "laminate"
  ],
  [
    "FNR",
    "LAM",
    "b8616c23-3196-416a-809e-68af1bba1844",
    "laminate"
  ],
  [
    "FNR",
    "PAINT",
    "39cf95c7-129a-4675-99e8-3d29c34aca6e",
    "paint"
  ],
  [
    "FNR",
    "PRM",
    "c8b75ea3-b990-419c-8791-f2b8ee139f05",
    "paint"
  ],
  [
    "FNR",
    "TOP",
    "a35d4b6c-93a3-4c43-98f1-98438213c4ee",
    "paint"
  ],
  [
    "PNT",
    "ACR",
    "eb102e72-198f-48db-9b67-5c6e5706b2e8",
    "paint"
  ],
  [
    "PNT",
    "OIL",
    "3011cc7b-e134-42e8-9648-a28528fe8988",
    "paint"
  ],
  [
    "PNT",
    "PRM",
    "6b7ac6cf-9711-4a01-b8cb-df8874112cb1",
    "paint"
  ],
  [
    "PNT",
    "TOP",
    "386cdfaf-872f-4c18-b706-068cc04966c7",
    "paint"
  ],
  [
    "PNT",
    "CLEAR",
    "dcda7863-d4b5-4001-b156-edca4a7da6da",
    "paint"
  ]
]
test('17 observed Production UUIDs resolve without changing IDs or categories', () => {
  const categories = Object.entries(observedCategories).map(([cat_code,id])=>({id,cat_code,is_active:true}))
  const types = observedTypes.map(([code,code_prefix,id])=>({id,category_id:observedCategories[code],code_prefix,is_active:true}))
  for (const [code,prefix,id,expected] of observedTypes) {
    const result = resolveMaterialFormProfile(id,observedCategories[code],types,categories)
    assert.equal(result.profile,expected,code+':'+prefix)
    assert.equal(result.materialTypeId,id)
  }
})


const category = (code = 'PNT') => ({ id: 'cat', cat_code: code, is_active: true })
const type = (prefix = 'ACR') => ({ id: 'type', category_id: 'cat', code_prefix: prefix, is_active: true })
const resolve = (code, prefix) => resolveMaterialFormProfile('type', 'cat', [type(prefix)], [category(code)])

for (const [code, prefixes, profile] of [
  ['FNR', ['HPL', 'LAM'], 'laminate'], ['WD', ['MDF', 'HMR', 'PLY', 'PB'], 'board'],
  ['STR', ['MDF', 'HMR', 'PLY'], 'board'], ['PNT', ['ACR', 'OIL', 'PRM', 'TOP', 'CLEAR'], 'paint'],
  ['FNR', ['PAINT', 'PRM', 'TOP'], 'paint'],
]) for (const prefix of prefixes) test(`${code}:${prefix} maps to ${profile}`, () => assert.equal(resolve(code, prefix).profile, profile))

for (const [code, prefix] of [['GLS','ACR'],['GPM','VIN'],['FAB','VINYL'],['PLB','PVC'],['FNR','PVC'],['FNR','TILE'],['WD','OSB'],['PNT','THN'],['PNT','SPR'],['LAM','HPL'],['PT','ACR']]) {
  test(`${code}:${prefix} does not guess a profile`, () => assert.equal(resolve(code, prefix).profile, null))
}
test('missing selection remains unknown', () => assert.equal(resolveMaterialFormProfile(null, 'cat', [type()], [category()]).reason, 'missing_selection'))
test('unknown ID cannot fall back to prefix', () => assert.equal(resolveMaterialFormProfile('other', 'cat', [type()], [category()]).profile, null))
test('wrong category cannot resolve', () => assert.equal(resolveMaterialFormProfile('type', 'other', [type()], [category()]).profile, null))
test('inactive type cannot resolve', () => assert.equal(resolveMaterialFormProfile('type', 'cat', [{...type(),is_active:false}], [category()]).profile, null))
test('inactive or deleted category cannot resolve', () => {
  for (const c of [{...category(),is_active:false},{...category(),is_deleted:true}]) assert.equal(resolveMaterialFormProfile('type','cat',[type()],[c]).profile,null)
})
test('duplicate ID or category-prefix pair is ambiguous', () => {
  for (const rows of [[type(),type()], [type(),{...type(),id:'other'}]]) assert.equal(resolveMaterialFormProfile('type','cat',rows,[category()]).reason,'ambiguous_type')
})
test('duplicate category ID or code is ambiguous', () => {
  for (const rows of [[category(),category()], [category(),{...category(),id:'other'}]]) assert.equal(resolveMaterialFormProfile('type','cat',[type()],rows).reason,'ambiguous_category')
})
test('labels do not affect mapping and inputs are unchanged', () => {
  const types = [Object.freeze({...type(),name:'แผ่นอะคริลิค misleading label'})]
  const categories = [Object.freeze({...category(),code_prefix:'PT'})]
  const before=JSON.stringify({types,categories})
  const result=resolveMaterialFormProfile('type','cat',types,categories)
  assert.equal(result.profile,'paint')
  assert.equal(JSON.stringify({types,categories}),before)
  assert.equal(result.materialTypeId,'type')
})
