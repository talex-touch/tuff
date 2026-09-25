/**
 * Shared plumbing for the docs-SSG runtime verification.
 *
 * The CDP wire protocol client is NOT reimplemented here — it is imported from
 * `apps/nexus/scripts/audit-cdp-client.mjs`, which already speaks `/json/new`,
 * the WebSocket request/response pairing and `Runtime.evaluate` unwrapping.
 * That module reads its endpoint from `TUFFEX_CDP_URL` at import time, so the
 * import is deferred until after we know which port Chrome came up on.
 *
 * What this file adds on top: launching Chrome, attaching *before* navigation
 * (so the first request of the page load is captured), and a PASS/FAIL reporter.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const AUDIT_CLIENT_PATH = new URL(
  '../../../../apps/nexus/scripts/audit-cdp-client.mjs',
  import.meta.url,
).href

/** Populated by `loadAuditClient()` once the debugging port is known. */
let auditClient = null

async function loadAuditClient(port) {
  if (auditClient)
    return auditClient
  process.env.TUFFEX_CDP_URL = `http://127.0.0.1:${port}`
  auditClient = await import(AUDIT_CLIENT_PATH)
  return auditClient
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * macOS `timeout(1)` is unavailable in this environment and tripping over it
 * swallows the real output, so every bound in this harness is enforced in-process.
 */
export function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    }),
  ])
}

export async function pollFor(fn, { timeoutMs = 10000, intervalMs = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last)
      return last
    await delay(intervalMs)
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`)
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function findChrome() {
  const explicit = process.env.CHROME_PATH
  if (explicit) {
    if (!existsSync(explicit))
      throw new Error(`CHROME_PATH is set but does not exist: ${explicit}`)
    return explicit
  }
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate))
      return candidate
  }
  throw new Error(
    `No Chrome binary found. Checked:\n  ${CHROME_CANDIDATES.join('\n  ')}\n`
    + `Set CHROME_PATH=/path/to/chrome to override.`,
  )
}

async function waitForDebugger(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok)
        return await response.json()
    }
    catch (error) {
      lastError = error
    }
    await delay(150)
  }
  throw new Error(`Chrome debugger did not come up on port ${port}: ${lastError?.message ?? 'unknown'}`)
}

export async function launchChrome({ port = 9333, timeoutMs = 30000 } = {}) {
  const binary = findChrome()
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'nexus-ssg-verify-'))
  const child = spawn(binary, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' })

  child.on('error', (error) => {
    console.error(`[harness] chrome spawn error: ${error.message}`)
  })

  try {
    const version = await waitForDebugger(port, timeoutMs)
    await loadAuditClient(port)
    return {
      port,
      binary,
      version: version.Browser,
      stop() {
        try {
          child.kill('SIGTERM')
        }
        catch {}
        try {
          rmSync(userDataDir, { recursive: true, force: true })
        }
        catch {}
      },
    }
  }
  catch (error) {
    child.kill('SIGKILL')
    rmSync(userDataDir, { recursive: true, force: true })
    throw error
  }
}

/**
 * Records everything the page does. Attached before the first navigation, which
 * is the whole point: a capture started after `Page.navigate` cannot prove the
 * absence of a request issued during load.
 */
function createCapture(client) {
  const requests = []
  const requestsById = new Map()
  const failures = []
  const consoleMessages = []
  const exceptions = []

  client.on('Network.requestWillBeSent', (params) => {
    const entry = {
      requestId: params.requestId,
      url: params.request?.url ?? '',
      method: params.request?.method ?? 'GET',
      type: params.type ?? 'Other',
      at: Date.now(),
    }
    requests.push(entry)
    requestsById.set(entry.requestId, entry)
  })
  client.on('Network.loadingFailed', (params) => {
    const entry = requestsById.get(params.requestId)
    failures.push({
      requestId: params.requestId,
      url: entry?.url ?? '(unknown)',
      errorText: params.errorText ?? '',
      blockedReason: params.blockedReason ?? null,
      at: Date.now(),
    })
  })
  client.on('Network.responseReceived', (params) => {
    const entry = requestsById.get(params.requestId)
    if (entry)
      entry.status = params.response?.status ?? null
  })
  client.on('Runtime.consoleAPICalled', (params) => {
    const text = (params.args ?? [])
      .map(arg => arg.value ?? arg.description ?? arg.unserializableValue ?? '')
      .join(' ')
    consoleMessages.push({ level: params.type, text, at: Date.now() })
  })
  client.on('Log.entryAdded', (params) => {
    consoleMessages.push({
      level: params.entry?.level ?? 'info',
      text: params.entry?.text ?? '',
      source: params.entry?.source,
      at: Date.now(),
    })
  })
  client.on('Runtime.exceptionThrown', (params) => {
    exceptions.push(
      params.exceptionDetails?.exception?.description
      || params.exceptionDetails?.text
      || 'Runtime exception',
    )
  })

  return { requests, failures, consoleMessages, exceptions }
}

/**
 * Opens a blank target, enables the domains and *then* hands it back — the
 * caller navigates. `disableScripts` gives a JS-free render of the served HTML,
 * which is how "the body is in the HTML, not painted by hydration" is proven
 * without trusting any client code.
 */
export async function openPage({ blockedUrls = [], disableScripts = false } = {}) {
  const { createClient, createTarget, closeTarget } = auditClient
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)

  const capture = createCapture(client)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (disableScripts)
    await client.send('Emulation.setScriptExecutionDisabled', { value: true })
  if (blockedUrls.length)
    await client.send('Network.setBlockedURLs', { urls: blockedUrls })

  return {
    client,
    capture,
    targetId: target.id,
    async setBlockedUrls(urls) {
      await client.send('Network.setBlockedURLs', { urls })
    },
    async close() {
      try {
        client.close()
      }
      catch {}
      await closeTarget(target.id)
    },
  }
}

export async function evaluate(page, expression) {
  return await auditClient.evaluate(page.client, expression)
}

export async function navigate(page, url, { timeoutMs = 45000 } = {}) {
  await page.client.send('Page.navigate', { url })
  await pollFor(
    async () => {
      try {
        return await evaluate(page, `document.readyState === 'complete' && location.href !== 'about:blank'`)
      }
      catch {
        // A cross-document navigation destroys the execution context mid-poll.
        return false
      }
    },
    { timeoutMs, label: `load of ${url}` },
  )
}

const STATUS_LABEL = {
  pass: 'PASS',
  fail: 'FAIL',
  pending: 'PEND',
  info: 'INFO',
}

export function createReporter() {
  const results = []

  function record(status, id, message, details) {
    results.push({ status, id, message, details })
    const line = `[${STATUS_LABEL[status]}] ${id.padEnd(22)} ${message}`
    if (status === 'fail')
      console.error(line)
    else
      console.log(line)
    if (details) {
      for (const detail of Array.isArray(details) ? details : [details])
        console.log(`         ${detail}`)
    }
  }

  return {
    results,
    pass: (id, message, details) => record('pass', id, message, details),
    fail: (id, message, details) => record('fail', id, message, details),
    pending: (id, message, details) => record('pending', id, message, details),
    info: (id, message, details) => record('info', id, message, details),
    /**
     * @returns process exit code: 0 all green, 1 a real failure, 3 only
     * not-yet-implemented checks are outstanding.
     */
    summary() {
      const failed = results.filter(r => r.status === 'fail')
      const pending = results.filter(r => r.status === 'pending')
      const passed = results.filter(r => r.status === 'pass')
      console.log('')
      console.log(`${'='.repeat(72)}`)
      console.log(`  ${passed.length} passed   ${failed.length} failed   ${pending.length} not-implemented`)
      if (failed.length) {
        console.log('  failures:')
        for (const item of failed)
          console.log(`    - ${item.id}: ${item.message}`)
      }
      if (pending.length) {
        console.log('  not implemented yet:')
        for (const item of pending)
          console.log(`    - ${item.id}: ${item.message}`)
      }
      console.log(`${'='.repeat(72)}`)
      if (failed.length)
        return 1
      if (pending.length)
        return 3
      return 0
    },
  }
}
