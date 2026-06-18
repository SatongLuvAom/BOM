import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []
const passed = []

const routeFiles = [
  ['Dashboard', ['app/(mat)/dashboard/page.tsx']],
  ['Materials list', ['app/(mat)/materials/page.tsx']],
  ['Create material', ['app/(mat)/materials/create/page.tsx', 'app/(mat)/materials/new/page.tsx']],
  ['Material detail', ['app/(mat)/materials/[id]/page.tsx']],
  ['Edit material', ['app/(mat)/materials/[id]/edit/page.tsx']],
  ['Material cleanup', ['app/(mat)/materials/cleanup/page.tsx']],
  ['Material duplicates', ['app/(mat)/materials/duplicates/page.tsx']],
  ['Receipt list', ['app/(mat)/receipts/page.tsx']],
  ['Create receipt draft', ['app/(mat)/receipts/new/page.tsx']],
  ['Receipt review', ['app/(mat)/receipts/[id]/page.tsx']],
  ['Supplier list', ['app/(mat)/suppliers/page.tsx']],
  ['Supplier create', ['app/(mat)/suppliers/create/page.tsx', 'app/(mat)/suppliers/new/page.tsx']],
  ['Supplier detail', ['app/(mat)/suppliers/[id]/page.tsx']],
  ['Supplier edit', ['app/(mat)/suppliers/[id]/edit/page.tsx']],
  ['BOM list', ['app/(mat)/bom/page.tsx']],
  ['BOM create', ['app/(mat)/bom/create/page.tsx', 'app/(mat)/bom/new/page.tsx']],
  ['BOM detail', ['app/(mat)/bom/[id]/page.tsx']],
  ['BOM edit', ['app/(mat)/bom/[id]/edit/page.tsx']],
  ['BOQ list', ['app/(mat)/boq/page.tsx']],
  ['BOQ create', ['app/(mat)/boq/create/page.tsx', 'app/(mat)/boq/new/page.tsx']],
  ['BOQ detail', ['app/(mat)/boq/[id]/page.tsx']],
  ['BOQ edit', ['app/(mat)/boq/[id]/edit/page.tsx']],
  ['Customers list', ['app/(mat)/customers/page.tsx']],
  ['Customers create', ['app/(mat)/customers/create/page.tsx', 'app/(mat)/customers/new/page.tsx']],
  ['Customers detail', ['app/(mat)/customers/[id]/page.tsx']],
  ['Customers edit', ['app/(mat)/customers/[id]/edit/page.tsx']],
  ['Categories list', ['app/(mat)/categories/page.tsx']],
  ['UOM list', ['app/(mat)/uom/page.tsx']],
  ['Prices list', ['app/(mat)/prices/page.tsx']],
  ['Reports list', ['app/(mat)/reports/page.tsx']],
  ['Settings', ['app/(mat)/settings/material-code/page.tsx', 'app/(mat)/settings/setup/page.tsx']],
  ['System status', ['app/(mat)/settings/system/page.tsx']],
]

const scanRoots = [
  'app/(mat)',
  'components/mat',
  'components/boq',
  'components/bom',
  'components/receipts',
  'app/api/receipts',
]

const receiptScanRoots = [
  'app/(mat)/receipts',
  'components/receipts',
  'app/api/receipts',
]

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function fileExists(relativePath) {
  return existsSync(path.join(root, relativePath))
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function listFiles(relativeDir, extensions = new Set(['.ts', '.tsx'])) {
  const fullDir = path.join(root, relativeDir)
  if (!existsSync(fullDir)) return []

  const files = []
  const walk = (currentDir) => {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue
        walk(fullPath)
        continue
      }
      if (extensions.has(path.extname(entry))) {
        files.push(normalizePath(path.relative(root, fullPath)))
      }
    }
  }

  walk(fullDir)
  return files
}

function pass(label) {
  passed.push(label)
}

function fail(label) {
  failures.push(label)
}

function warn(label) {
  warnings.push(label)
}

for (const [label, alternatives] of routeFiles) {
  if (alternatives.some(fileExists)) pass(`route exists: ${label}`)
  else fail(`missing route file: ${label} (${alternatives.join(' or ')})`)
}

const routesFile = read('lib/routes.ts')
const requiredRouteSnippets = [
  "list: () => '/materials'",
  "create: () => '/materials/create'",
  "detailRoute('/materials', id)",
  "list: () => '/receipts'",
  "new: () => '/receipts/new'",
  "detailRoute('/receipts', id)",
  "list: () => '/suppliers'",
  "list: () => '/bom'",
  "list: () => '/boq'",
  "list: () => '/customers'",
]

for (const snippet of requiredRouteSnippets) {
  if (routesFile.includes(snippet)) pass(`route helper includes: ${snippet}`)
  else fail(`route helper missing expected snippet: ${snippet}`)
}

const allFiles = [...new Set(scanRoots.flatMap((dir) => listFiles(dir)))]
const receiptFiles = [...new Set(receiptScanRoots.flatMap((dir) => listFiles(dir)))]
const forbiddenReceiptTargets = [
  '/status',
  '/system-status',
  '/settings/status',
  '/settings/system',
  '/dashboard',
]

for (const file of receiptFiles) {
  const source = read(file)
  for (const target of forbiddenReceiptTargets) {
    const quotedTarget = new RegExp(`['"\`]${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/?#][^'"\`]*)?['"\`]`)
    if (quotedTarget.test(source)) {
      fail(`receipt flow references forbidden navigation target ${target}: ${file}`)
    }
  }
}
pass('receipt files do not reference status/system/dashboard routes')

for (const file of allFiles) {
  const source = read(file)
  const unsafeRedirect = /router\.(?:push|replace)\(\s*(?:data|json|response|result)(?:\?|\.)*\.redirectTo\s*\)/g
  const unsafeLocation = /window\.location(?:\.href)?\s*=\s*(?:data|json|response|result)(?:\?|\.)*\.redirectTo/g
  if (unsafeRedirect.test(source) || unsafeLocation.test(source)) {
    fail(`trusts API redirectTo directly: ${file}`)
  }

  const relativeRouter = /router\.(?:push|replace)\(\s*['"`]\.\.?\//g
  const relativeHref = /href\s*=\s*(?:{)?\s*['"`]\.\.?\//g
  if (relativeRouter.test(source) || relativeHref.test(source)) {
    fail(`uses relative navigation path: ${file}`)
  }

  const linkWrappingButton = /<Link\b[^>]*>\s*<button\b/g
  if (linkWrappingButton.test(source)) {
    fail(`Link appears to wrap an action button: ${file}`)
  }
}
pass('no direct API redirectTo trust, relative route navigation, or Link-wrapped buttons found')

for (const file of receiptFiles.filter((item) => item.endsWith('.tsx'))) {
  const source = read(file)
  const buttons = getOpeningTags(source, 'button')
  for (const button of buttons) {
    if (!/\btype\s*=/.test(button)) {
      fail(`receipt button missing explicit type in ${file}: ${button.slice(0, 120)}`)
    }
  }
}
pass('all receipt buttons declare explicit type')

const receiptCreate = read('components/receipts/ReceiptCreateDraftForm.tsx')
if (receiptCreate.includes('router.push(targetPath)') && receiptCreate.includes('getReceiptReviewPath')) {
  pass('receipt create redirects through validated receipt detail path')
} else {
  fail('receipt create flow does not use validated receipt detail redirect')
}

const receiptRoute = read('app/api/receipts/route.ts')
const receiptImportRoute = read('app/api/receipts/import/route.ts')
if (receiptRoute.includes('redirectTo: getReceiptRedirectPath(data.id)')) {
  pass('blank receipt API returns receipt detail redirect')
} else {
  fail('blank receipt API redirect shape is not deterministic')
}
if (receiptImportRoute.includes('redirectTo: receiptId ? getReceiptRedirectPath(receiptId) : null')) {
  pass('receipt import API returns receipt detail redirect')
} else {
  fail('receipt import API redirect shape is not deterministic')
}

function getOpeningTags(source, tagName) {
  const tags = []
  const token = `<${tagName}`
  let index = 0

  while (index < source.length) {
    const start = source.indexOf(token, index)
    if (start === -1) break

    let cursor = start + token.length
    let quote = null
    let braceDepth = 0

    while (cursor < source.length) {
      const char = source[cursor]
      const previous = source[cursor - 1]

      if (quote) {
        if (char === quote && previous !== '\\') quote = null
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char
      } else if (char === '{') {
        braceDepth += 1
      } else if (char === '}') {
        braceDepth = Math.max(0, braceDepth - 1)
      } else if (char === '>' && braceDepth === 0) {
        tags.push(source.slice(start, cursor + 1))
        index = cursor + 1
        break
      }

      cursor += 1
    }

    if (cursor >= source.length) break
  }

  return tags
}

if (warnings.length > 0) {
  console.log('\nWarnings')
  for (const message of warnings) console.log(`- ${message}`)
}

if (failures.length > 0) {
  console.error('\nRoute/navigation smoke test failed')
  for (const message of failures) console.error(`- ${message}`)
  process.exit(1)
}

console.log(`Route/navigation smoke test passed (${passed.length} checks).`)
