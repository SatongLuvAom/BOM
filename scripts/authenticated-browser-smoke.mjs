import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'

const root = process.cwd()
const smokeKeys = [
  'SMOKE_BASE_URL',
  'SMOKE_EMAIL',
  'SMOKE_PASSWORD',
  'SMOKE_RECEIPT_ID',
  'SMOKE_DUPLICATE_FILE',
  'SMOKE_RELOADS',
  'SMOKE_AGENT_BROWSER_PATH',
  'SMOKE_BROWSER_PATH',
]

loadLocalSmokeEnvironment()

const baseUrl = parseBaseUrl(process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000')
const email = process.env.SMOKE_EMAIL?.trim() ?? ''
const password = process.env.SMOKE_PASSWORD ?? ''
const receiptId = process.env.SMOKE_RECEIPT_ID?.trim() ?? ''
const duplicateFile = process.env.SMOKE_DUPLICATE_FILE?.trim() ?? ''
const reloadRounds = parseReloadRounds(process.env.SMOKE_RELOADS)
const secrets = [email, password].filter(Boolean)
const childEnvironment = buildChildEnvironment()
const routes = [
  { path: '/dashboard', heading: /dashboard|แดชบอร์ด/i },
  { path: '/materials', heading: /materials|วัสดุ/i },
  { path: '/settings/material-code', heading: /material code settings|ตั้งค่ารหัสวัสดุ/i },
  { path: '/receipts', heading: /นำเข้าราคาจากสลิป/i },
  ...(receiptId ? [{
    path: `/receipts/${encodeURIComponent(receiptId)}`,
    heading: /สลิปซื้อวัสดุ/i,
    requiredText: [/เอกสารต้นฉบับ/i, /ตรวจความถูกต้องของยอด/i],
    requiredSelector: 'img[src*="/file"], iframe[src*="/file"]',
  }] : []),
]

let agentBrowserPath = ''
let agentEnvironment
let browserProcess
let browserLaunchError
let browserProfilePath = ''
let cdpMetadata

function loadLocalSmokeEnvironment() {
  const localEnvPath = path.join(root, '.env.local')
  if (!existsSync(localEnvPath)) return

  const localEnvironment = parseEnv(readFileSync(localEnvPath, 'utf8'))
  for (const key of smokeKeys) {
    if (process.env[key] === undefined && localEnvironment[key] !== undefined) {
      process.env[key] = localEnvironment[key]
    }
  }
}

function parseBaseUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('SMOKE_BASE_URL must be an http(s) URL without embedded credentials')
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  url.search = ''
  url.hash = ''
  return url
}

function parseReloadRounds(value) {
  const rounds = Number.parseInt(value ?? '1', 10)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
    throw new Error('SMOKE_RELOADS must be an integer from 1 to 10')
  }
  return rounds
}

function buildChildEnvironment() {
  const allowedKeys = [
    'APPDATA', 'COMSPEC', 'HOME', 'LANG', 'LC_ALL', 'LOCALAPPDATA', 'PATH', 'Path',
    'PATHEXT', 'SystemRoot', 'TEMP', 'TERM', 'TMP', 'TMPDIR', 'USERPROFILE', 'WINDIR',
  ]
  return Object.fromEntries(
    allowedKeys
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  )
}

function redact(value) {
  let output = String(value ?? '')
  for (const secret of secrets) output = output.replaceAll(secret, '<redacted>')
  return output
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function resolveAgentBrowser() {
  if (process.env.SMOKE_AGENT_BROWSER_PATH) {
    const explicitPath = path.resolve(process.env.SMOKE_AGENT_BROWSER_PATH)
    if (isFile(explicitPath)) return explicitPath
    throw new Error(`SMOKE_AGENT_BROWSER_PATH does not point to a file: ${explicitPath}`)
  }
  if (process.platform !== 'win32') return 'agent-browser'

  const architecture = process.arch === 'arm64' ? 'arm64' : 'x64'
  const binary = `agent-browser-win32-${architecture}.exe`
  const candidates = [
    path.join(root, 'node_modules', 'agent-browser', 'bin', binary),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'agent-browser', 'bin', binary)
      : '',
  ]
  const candidate = candidates.find((item) => item && isFile(item))
  if (candidate) return candidate
  throw new Error('agent-browser was not found. Run: npm install -g agent-browser@0.34.0')
}

function resolveBrowser() {
  if (process.env.SMOKE_BROWSER_PATH) {
    const explicitPath = path.resolve(process.env.SMOKE_BROWSER_PATH)
    if (isFile(explicitPath)) return explicitPath
    throw new Error(`SMOKE_BROWSER_PATH does not point to a file: ${explicitPath}`)
  }

  const browserRoot = path.join(homedir(), '.agent-browser', 'browsers')
  if (existsSync(browserRoot)) {
    const versions = readdirSync(browserRoot)
      .filter((name) => name.startsWith('chrome-'))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    for (const version of versions) {
      const versionRoot = path.join(browserRoot, version)
      const bundled = process.platform === 'win32'
        ? path.join(versionRoot, 'chrome.exe')
        : process.platform === 'darwin'
          ? path.join(versionRoot, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
          : path.join(versionRoot, 'chrome')
      if (isFile(bundled)) return bundled
    }
  }

  const systemCandidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  const candidate = systemCandidates.find(isFile)
  if (candidate) return candidate
  throw new Error('Chrome was not found. Run `agent-browser install` or set SMOKE_BROWSER_PATH.')
}

function runAgent(args, { input, quiet = false, timeout = 45_000 } = {}) {
  const result = spawnSync(agentBrowserPath, args, {
    cwd: root,
    env: agentEnvironment,
    encoding: 'utf8',
    input,
    shell: false,
    stdio: quiet ? 'ignore' : ['pipe', 'pipe', 'pipe'],
    timeout,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || `agent-browser exited ${result.status}`))
  }
  return result.stdout ?? ''
}

function runAgentJson(args) {
  const result = JSON.parse(runAgent(['--json', ...args]).trim())
  if (result?.success === false) {
    throw new Error(redact(result.error?.message ?? result.error ?? 'agent-browser failed'))
  }
  return result
}

function runBatch(commands) {
  const results = JSON.parse(runAgent(
    ['batch', '--bail', '--json'],
    { input: JSON.stringify(commands) },
  ).trim())
  const failed = Array.isArray(results) && results.find((result) => result?.success === false)
  if (!Array.isArray(results) || failed) {
    throw new Error(redact(failed?.error?.message ?? failed?.error ?? 'agent-browser batch failed'))
  }
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(typeof address === 'object' && address ? address.port : 0)
      })
    })
  })
}

async function waitForCdp(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (browserLaunchError) throw browserLaunchError
    if (browserProcess?.exitCode !== null) {
      throw new Error(`Chrome exited before CDP was ready (code ${browserProcess.exitCode})`)
    }
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(750) })
      if (response.ok) return response.json()
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Chrome CDP endpoint did not become ready within 15 seconds')
}

async function closeCdpBrowser(webSocketDebuggerUrl) {
  if (!webSocketDebuggerUrl || typeof WebSocket === 'undefined') return
  await new Promise((resolve) => {
    const socket = new WebSocket(webSocketDebuggerUrl)
    const timer = setTimeout(resolve, 2_000)
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
    })
    socket.addEventListener('message', finish, { once: true })
    socket.addEventListener('close', finish, { once: true })
    socket.addEventListener('error', finish, { once: true })
  })
}

async function removeBrowserProfile() {
  if (!browserProfilePath) return
  const profile = path.resolve(browserProfilePath)
  const tempRoot = path.resolve(tmpdir())
  if (!profile.startsWith(`${tempRoot}${path.sep}`) || !path.basename(profile).startsWith('boq-browser-smoke-')) {
    throw new Error(`Refusing to remove unexpected browser profile: ${profile}`)
  }
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Could not remove temporary browser profile: ${redact(error.message)}`)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
  }
}

function consoleErrors(messages) {
  return messages.filter((message) => {
    if (typeof message === 'string') return /^\s*(error|assert)\b/i.test(message)
    return ['error', 'assert'].includes(String(message?.type ?? message?.level ?? '').toLowerCase())
  })
}

function issueText(issue) {
  const value = typeof issue === 'string'
    ? issue
    : issue?.message ?? issue?.text ?? JSON.stringify(issue)
  return redact(value).replace(/\s+/g, ' ').slice(0, 240)
}

function login() {
  runAgentJson(['--pin-tab', 'open', new URL('/login', baseUrl).toString()])
  runBatch([
    ['wait', 'input[type="email"]'],
    ['snapshot', '-i'],
    ['fill', 'input[type="email"]', email],
    ['fill', 'input[type="password"]', password],
    ['click', 'button[type="submit"]'],
    ['wait', '--url', '**/dashboard'],
  ])
  const currentUrl = new URL(runAgentJson(['get', 'url']).data.url)
  if (currentUrl.pathname !== '/dashboard') {
    throw new Error(`Login did not reach /dashboard (received ${currentUrl.pathname})`)
  }
}

function checkRoute(route, round) {
  runAgentJson(['errors', '--clear'])
  runAgentJson(['console', '--clear'])
  if (round === 1) runAgentJson(['open', new URL(route.path, baseUrl).toString()])
  else runAgentJson(['reload'])
  runAgentJson(['wait', 'h1'])
  runAgentJson(['snapshot', '-i'])

  const currentUrl = new URL(runAgentJson(['get', 'url']).data.url)
  const heading = runAgentJson(['get', 'text', 'h1']).data.text.trim()
  const pageText = route.requiredText?.length
    ? runAgentJson(['get', 'text', 'body']).data.text
    : ''
  const pageErrors = runAgentJson(['errors']).data.errors ?? []
  const browserErrors = consoleErrors(runAgentJson(['console']).data.messages ?? [])
  if (currentUrl.origin !== baseUrl.origin || currentUrl.pathname !== route.path) {
    throw new Error(`${route.path} redirected to ${currentUrl.pathname}`)
  }
  if (!route.heading.test(heading)) throw new Error(`${route.path} rendered unexpected heading: ${heading}`)
  for (const expectedText of route.requiredText ?? []) {
    if (!expectedText.test(pageText)) {
      throw new Error(`${route.path} is missing expected content: ${expectedText}`)
    }
  }
  if (route.requiredSelector) {
    const count = runAgentJson(['get', 'count', route.requiredSelector]).data.count
    if (count < 1) throw new Error(`${route.path} is missing document preview media`)
  }
  if (pageErrors.length) throw new Error(`${route.path} page error: ${issueText(pageErrors[0])}`)
  if (browserErrors.length) throw new Error(`${route.path} console error: ${issueText(browserErrors[0])}`)
  return heading
}

function checkDuplicateFileImport() {
  if (!duplicateFile) return
  if (!isFile(duplicateFile)) throw new Error(`SMOKE_DUPLICATE_FILE does not point to a file: ${duplicateFile}`)

  runAgentJson(['errors', '--clear'])
  runAgentJson(['console', '--clear'])
  runAgentJson(['open', new URL('/receipts/new', baseUrl).toString()])
  runAgentJson(['wait', 'input[type="file"]'])
  runAgentJson(['upload', 'input[type="file"]', duplicateFile])
  runAgentJson(['click', 'button.btn-primary'])

  let pageText = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    runAgentJson(['wait', '250'])
    pageText = runAgentJson(['get', 'text', 'body']).data.text
    if (pageText.includes('เปิดสลิปเดิม')) break
  }

  const currentUrl = new URL(runAgentJson(['get', 'url']).data.url)
  const pageErrors = runAgentJson(['errors']).data.errors ?? []
  const browserErrors = consoleErrors(runAgentJson(['console']).data.messages ?? [])
  if (currentUrl.pathname !== '/receipts/new') {
    throw new Error(`duplicate receipt import unexpectedly navigated to ${currentUrl.pathname}`)
  }
  if (!pageText.includes('พบไฟล์สลิปนี้ในระบบแล้ว') || !pageText.includes('เปิดสลิปเดิม')) {
    throw new Error('duplicate receipt import did not show the existing receipt warning/link')
  }
  if (pageErrors.length) throw new Error(`duplicate import page error: ${issueText(pageErrors[0])}`)
  if (browserErrors.length) throw new Error(`duplicate import console error: ${issueText(browserErrors[0])}`)
  console.log('✓ Duplicate receipt file blocked before draft creation')
}

async function main() {
  if (!email || !password) {
    throw new Error('Missing SMOKE_EMAIL or SMOKE_PASSWORD. Add an authorized Supabase user to .env.local.')
  }

  agentBrowserPath = resolveAgentBrowser()
  const browserPath = resolveBrowser()
  const port = await reservePort()
  const runId = `${process.pid}-${Date.now()}`
  browserProfilePath = mkdtempSync(path.join(tmpdir(), 'boq-browser-smoke-'))
  agentEnvironment = {
    ...childEnvironment,
    AGENT_BROWSER_NAMESPACE: `boq-smoke-${runId}`,
    AGENT_BROWSER_SESSION: 'authenticated-routes',
    AGENT_BROWSER_IDLE_TIMEOUT_MS: '60000',
    AGENT_BROWSER_DEFAULT_TIMEOUT: '30000',
    AGENT_BROWSER_CONTENT_BOUNDARIES: 'true',
  }

  browserProcess = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${browserProfilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ], { env: childEnvironment, stdio: 'ignore', windowsHide: true })
  browserProcess.once('error', (error) => {
    browserLaunchError = error
  })

  cdpMetadata = await waitForCdp(port)
  runAgent(['connect', `http://127.0.0.1:${port}`], { quiet: true })
  console.log(`Authenticated browser smoke: ${baseUrl.origin}`)
  login()
  console.log('✓ Login')

  const failures = []
  for (const route of routes) {
    for (let round = 1; round <= reloadRounds; round += 1) {
      try {
        const heading = checkRoute(route, round)
        console.log(`✓ ${route.path} (${round}/${reloadRounds}) — ${heading}`)
      } catch (error) {
        failures.push(redact(error.message))
        console.error(`✗ ${redact(error.message)}`)
        break
      }
    }
  }
  checkDuplicateFileImport()
  if (failures.length) throw new Error(`Browser smoke failed (${failures.length}/${routes.length} routes)`)
  console.log(`Browser smoke passed (${routes.length} routes, ${reloadRounds} round(s) each).`)
}

try {
  await main()
} catch (error) {
  console.error(`Browser smoke failed: ${redact(error.message)}`)
  process.exitCode = 1
} finally {
  if (agentBrowserPath && agentEnvironment) {
    try {
      runAgent(['close'], { quiet: true, timeout: 5_000 })
    } catch {
      // The isolated CDP browser is closed below.
    }
  }
  await closeCdpBrowser(cdpMetadata?.webSocketDebuggerUrl)
  if (browserProcess?.exitCode === null) browserProcess.kill()
  await removeBrowserProfile()
}
