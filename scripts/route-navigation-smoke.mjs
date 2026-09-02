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
  ['Categories list', ['app/(mat)/categories/page.tsx']],
  ['UOM list', ['app/(mat)/uom/page.tsx']],
  ['Prices list', ['app/(mat)/prices/page.tsx']],
  ['Settings', ['app/(mat)/settings/material-code/page.tsx', 'app/(mat)/settings/setup/page.tsx']],
  ['System status', ['app/(mat)/settings/system/page.tsx']],
]

const scanRoots = [
  'app/(mat)',
  'components/mat',
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

const materialRoute = read('app/api/materials/[id]/route.ts')
const materialDeleteMigration = read('supabase/migrations/20260824_material_delete_atomic.sql')
const materialListMigration = read('supabase/migrations/20260824_material_list_query_rpc.sql')
const materialListPageMigration = read('supabase/migrations/20260902_material_list_page_payload.sql')
const materialsPage = read('app/(mat)/materials/page.tsx')
if (materialRoute.includes("supabase.rpc('delete_material_atomic'")) {
  pass('material delete route uses the atomic database RPC')
} else {
  fail('material delete route does not use the atomic database RPC')
}
if (!materialRoute.includes('.delete()')) {
  pass('material route does not issue direct table deletes')
} else {
  fail('material route still issues a direct table delete')
}
if (
  materialDeleteMigration.includes('CREATE OR REPLACE FUNCTION public.delete_material_atomic')
  && materialDeleteMigration.includes('REVOKE DELETE ON TABLE public.mat_master FROM authenticated')
) {
  pass('material delete migration defines and enforces the RPC boundary')
} else {
  fail('material delete migration is missing the function or direct-delete revoke')
}
const atomicDeleteRequirements = [
  'DELETE FROM public.mat_price_base',
  'DELETE FROM public.mat_supplier_map',
  'DELETE FROM public.mat_alias',
  'DELETE FROM public.mat_uom_conv',
  'DELETE FROM public.mat_master',
  'WHEN foreign_key_violation',
  'INSERT INTO public.mat_audit_log',
]
if (atomicDeleteRequirements.every((snippet) => materialDeleteMigration.includes(snippet))) {
  pass('material delete RPC contains child deletes, rollback handling, and atomic audit')
} else {
  fail('material delete RPC is missing a required transactional operation')
}

if (
  materialsPage.includes("supabase.rpc('list_materials_page'")
  && !materialsPage.includes('IN_MEMORY_SORT_LIMIT')
  && !materialsPage.includes('resolveMaterialSearchMatches')
  && !materialsPage.includes('sortMaterialRows(')
) {
  pass('materials list delegates search, filters, sorting, and pagination to PostgreSQL')
} else {
  fail('materials list still performs full-set search or sorting in Next.js')
}

const materialListPageRpcRequirements = [
  'CREATE OR REPLACE FUNCTION public.list_materials_page',
  'SELECT public.list_materials(',
  'SECURITY INVOKER',
  "'latest_price'",
  "'quality_context'",
  'GRANT EXECUTE ON FUNCTION public.list_materials_page',
]
if (materialListPageRpcRequirements.every((snippet) => materialListPageMigration.includes(snippet))) {
  pass('material list page RPC includes latest price and quality inputs in the paginated payload')
} else {
  fail('material list page RPC is missing a required payload or security contract')
}
const materialListRpcRequirements = [
  'CREATE OR REPLACE FUNCTION public.list_materials',
  'SECURITY INVOKER',
  "'total', (SELECT count(*) FROM filtered)",
  'p_supplier_id text DEFAULT NULL',
  'p_has_price text DEFAULT NULL',
  'p_stale_price text DEFAULT NULL',
  'p_sort_by text DEFAULT NULL',
  'row_number() OVER',
  'GRANT EXECUTE ON FUNCTION public.list_materials',
]
if (materialListRpcRequirements.every((snippet) => materialListMigration.includes(snippet))) {
  pass('material list RPC preserves RLS and implements server-side filters, sorting, count, and pagination')
} else {
  fail('material list RPC is missing a required query or security contract')
}

const i18nClient = read('lib/i18n/client.tsx')
const enDictionary = read('lib/i18n/dictionaries/en.ts')
const thDictionary = read('lib/i18n/dictionaries/th.ts')
const materialList = read('components/mat/MaterialList.tsx')
const materialFilterChips = read('components/mat/FilterChips.tsx')
const pagination = read('components/ui/Pagination.tsx')
const sidebar = read('components/layout/Sidebar.tsx')
const materialExportRoute = read('app/api/materials/export/route.ts')
const materialExportHelper = read('lib/server/material-export.ts')
if (
  materialList.includes('<Link href={href} prefetch={false}')
  && materialList.includes('<Link href={detailHref ?? routes.materials.list()} prefetch={false}')
) {
  pass('material row detail and edit links disable automatic route prefetch')
} else {
  fail('material row detail or edit links still allow automatic route prefetch')
}
if (
  !i18nClient.includes('localStorage.getItem(localeCookieName)')
  && i18nClient.includes('useState<Locale>(initialLocale)')
  && i18nClient.includes('setLocaleState(nextLocale)')
  && i18nClient.includes('router.refresh()')
) {
  pass('i18n hydration starts from the server cookie and synchronizes explicit locale changes')
} else {
  fail('i18n hydration can diverge from the server cookie during a locale change')
}
if (read('app/(mat)/layout.tsx').includes('<I18nProvider key={locale} initialLocale={locale}>')) {
  pass('i18n provider remounts when the server locale changes')
} else {
  fail('i18n provider can preserve stale state across a server locale change')
}
if (
  materialsPage.includes("const { t } = await getDictionary()")
  && materialsPage.includes("{t('materialsPage.title')}")
  && enDictionary.includes("materialsPage: {")
  && thDictionary.includes("materialsPage: {")
) {
  pass('materials page renders explicit server translations before hydration')
} else {
  fail('materials page leaves server labels to DOM mutation during hydration')
}
if (
  i18nClient.includes("const managedSelector = '[data-i18n-managed]'")
  && i18nClient.includes('NodeFilter.FILTER_REJECT')
  && materialsPage.includes('data-i18n-managed="true"')
) {
  pass('legacy i18n rejects the React-managed materials subtree during hydration')
} else {
  fail('legacy i18n can mutate the materials subtree during hydration')
}
const explicitMaterialsClientTranslations = [
  ['material list', materialList, "t('materialsPage.list.noMaterials')"],
  ['material filters', materialFilterChips, "t('materialsPage.filters.clearAll')"],
  ['shared pagination', pagination, "t('common.pagination.summary'"],
]
for (const [label, source, translationCall] of explicitMaterialsClientTranslations) {
  if (source.includes("from '@/lib/i18n/client'") && source.includes(translationCall)) {
    pass(`${label} uses explicit React translations`)
  } else {
    fail(`${label} still depends on legacy DOM translation`)
  }
}

const materialExportHeaders = [
  'Material_Code',
  'Category',
  'Material_Name',
  'Thickness_mm',
  'Width_m',
  'Length_m',
  'Purchase_Unit',
  'Supplier_ID',
  'Current_Rate',
  'Active',
  'Notes',
]
if (
  materialExportHeaders.every((header) => materialExportRoute.includes(`'${header}'`))
  && materialExportRoute.includes('fetchLatestPriceMap(supabase)')
  && materialExportRoute.includes('parseMaterialDimensions(')
  && materialExportHelper.includes("(?:ft|feet|foot|ฟุต)")
) {
  pass('materials CSV follows the requested purchasing-table contract')
} else {
  fail('materials CSV contract or current-price mapping is incomplete')
}

const retiredFeatureRoots = [
  'app/(mat)/boq',
  'app/(mat)/customers',
  'app/(mat)/templates',
  'app/(mat)/reports',
  'app/api/boq',
  'app/api/customers',
  'app/api/templates',
  'app/api/reports',
  'components/boq',
  'components/customer',
  'components/templates',
  'components/reports',
]
const retiredFeatureFiles = retiredFeatureRoots.flatMap((dir) => listFiles(dir))
if (retiredFeatureFiles.length === 0) {
  pass('retired BOQ, customer, template, and report source trees are absent')
} else {
  fail(`retired feature source remains: ${retiredFeatureFiles.join(', ')}`)
}

const retiredNavigation = ["href: '/boq'", "href: '/customers'", "href: '/templates'", "href: '/reports'"]
if (
  retiredNavigation.every((snippet) => !sidebar.includes(snippet))
  && !sidebar.includes("t('nav.boqProjects')")
) {
  pass('sidebar omits retired feature navigation')
} else {
  fail('sidebar still exposes retired feature navigation')
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
