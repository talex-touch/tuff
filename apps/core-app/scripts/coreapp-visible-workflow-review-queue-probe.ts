#!/usr/bin/env tsx
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import packageJson from '../package.json'

interface CliOptions {
  appBundle: string
  cdpPort: number
  userDataDir: string
  outputDir: string
  dateStamp: string
  keepUserData: boolean
  pretty: boolean
  launchTimeoutMs: number
}

interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface CdpResponse {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
  }
  error?: {
    message?: string
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

interface ReviewQueueDomSnapshot {
  href: string
  title: string
  text: string
  hasEvidenceRoot: boolean
  hasReviewQueue: boolean
  hasUseModelOutput: boolean
  hasAllFilters: boolean
  hasRuntimeCostSignals: boolean
  hasFailedRecoveryActions: boolean
  activeFilter: string
  counts: {
    pending: number
    copied: number
    clipboardReplaced: number
    failed: number
  }
  visibleCards: number
}

interface ProbeResult {
  ok: boolean
  checkedAt: string
  packageVersion: string
  appBundle: string
  executablePath: string
  cdpPort: number
  remoteDebuggingUrl: string
  userDataDir: string
  boundary: string
  artifactPaths: {
    output: string
    pendingScreenshot: string
    failedScreenshot: string
  }
  selectedTargetId?: string
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  pendingDom?: ReviewQueueDomSnapshot
  failedDom?: ReviewQueueDomSnapshot
  evidenceChecks: Record<string, boolean>
  failures: string[]
}

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:workflow-review-queue-probe -- [options]

Options:
  --appBundle <path>       Packaged .app bundle. Default: dist/mac-arm64/tuff.app.
  --port <number>          CDP port. Default: auto-select from 9781.
  --userDataDir <path>     Isolated userData directory. Default: /tmp/tuff-workflow-review-queue-<timestamp>.
  --outputDir <path>       Evidence output directory. Default: ../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18.
  --dateStamp <value>      Artifact date suffix. Default: 2026-06-24.
  --keepUserData           Keep isolated userData after the probe.
  --launchTimeoutMs <ms>   Wait time for CDP endpoint. Default: 30000.
  --compact                Print single-line JSON.
  --help                   Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)
  const options: CliOptions = {
    appBundle: 'dist/mac-arm64/tuff.app',
    cdpPort: 0,
    userDataDir: `/tmp/tuff-workflow-review-queue-${timestamp}`,
    outputDir: '../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18',
    dateStamp: '2026-06-24',
    keepUserData: false,
    pretty: true,
    launchTimeoutMs: 30_000
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--appBundle' && argv[i + 1]) {
      options.appBundle = argv[++i]
      continue
    }
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[++i])
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid port: ${argv[i]}`)
      options.cdpPort = parsed
      continue
    }
    if (arg === '--userDataDir' && argv[i + 1]) {
      options.userDataDir = argv[++i]
      continue
    }
    if (arg === '--outputDir' && argv[i + 1]) {
      options.outputDir = argv[++i]
      continue
    }
    if (arg === '--dateStamp' && argv[i + 1]) {
      options.dateStamp = argv[++i]
      continue
    }
    if (arg === '--keepUserData') {
      options.keepUserData = true
      continue
    }
    if (arg === '--launchTimeoutMs' && argv[i + 1]) {
      const parsed = Number(argv[++i])
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid timeout: ${argv[i]}`)
      options.launchTimeoutMs = Math.floor(parsed)
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function resolveCoreAppPath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath)
}

function resolveExecutablePath(appBundle: string): string {
  return path.resolve(appBundle, 'Contents', 'MacOS', 'tuff')
}

function toRelativeReportPath(absolutePath: string, outputDir: string): string {
  return path.relative(outputDir, absolutePath).replace(/\\/g, '/')
}

function buildArtifactPaths(options: CliOptions): ProbeResult['artifactPaths'] {
  const outputDir = resolveCoreAppPath(options.outputDir)
  return {
    output: path.join(outputDir, `workflow-review-queue-probe-${options.dateStamp}.json`),
    pendingScreenshot: path.join(
      outputDir,
      `workflow-review-queue-pending-${options.dateStamp}.png`
    ),
    failedScreenshot: path.join(outputDir, `workflow-review-queue-failed-${options.dateStamp}.png`)
  }
}

async function prepareIsolatedUserData(options: CliOptions): Promise<void> {
  await rm(options.userDataDir, { recursive: true, force: true })
  const configDir = path.join(options.userDataDir, 'tuff', 'modules', 'config')
  await mkdir(configDir, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({
      beginner: { init: true },
      dev: { advancedSettings: true },
      lang: { followSystem: false, locale: 'en-US' }
    })
  )
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function resolveCdpPort(requestedPort: number): Promise<number> {
  if (requestedPort > 0) return requestedPort

  for (let port = 9781; port < 9881; port += 1) {
    if (await isPortAvailable(port)) return port
  }

  throw new Error('Unable to find an available CDP port in range 9781-9880')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  if (!value || typeof value !== 'object') return false
  const target = value as Partial<DevToolsTarget>
  return (
    typeof target.id === 'string' &&
    typeof target.title === 'string' &&
    typeof target.type === 'string' &&
    typeof target.url === 'string'
  )
}

function isRendererTarget(target: DevToolsTarget): boolean {
  return (
    target.type === 'page' &&
    Boolean(target.webSocketDebuggerUrl) &&
    target.url.includes('/renderer/index.html') &&
    !target.url.includes('/meta-overlay')
  )
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload))
    throw new Error('Remote debugging endpoint did not return a target list')
  return payload.filter(isDevToolsTarget)
}

async function waitForTargets(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<DevToolsTarget[]> {
  const startedAt = Date.now()
  let lastError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await loadTargets(remoteDebuggingUrl)
      if (targets.length > 0) return targets
    } catch (error) {
      lastError = error
    }
    await sleep(500)
  }
  throw new Error(
    `Timed out waiting for CDP endpoint ${remoteDebuggingUrl}: ${
      lastError instanceof Error ? lastError.message : String(lastError ?? 'no targets')
    }`
  )
}

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`Target has no WebSocket URL: ${target.id}`)

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<
    number,
    {
      resolve: (value: CdpResponse) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse & { id?: number }
    if (typeof message.id !== 'number' || !pending.has(message.id)) return
    const entry = pending.get(message.id)
    pending.delete(message.id)
    if (!entry) return
    clearTimeout(entry.timeout)
    if (message.error) {
      entry.reject(new Error(message.error.message ?? `CDP command failed for target ${target.id}`))
      return
    }
    entry.resolve(message)
  }

  const rejectPending = (error: Error) => {
    for (const [requestId, entry] of pending.entries()) {
      clearTimeout(entry.timeout)
      entry.reject(error)
      pending.delete(requestId)
    }
  }

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`Failed to connect CDP target: ${target.id}`))
  })

  const send: CdpSend = (method, params = {}) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP target socket is not open: ${target.id}`))
    }
    return new Promise((resolve, reject) => {
      const nextId = ++id
      const timeout = setTimeout(() => {
        pending.delete(nextId)
        reject(new Error(`Timed out waiting for CDP ${method} on target ${target.id}`))
      }, 12_000)
      pending.set(nextId, { resolve, reject, timeout })
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  }

  try {
    socket.onerror = () => rejectPending(new Error(`CDP target socket errored: ${target.id}`))
    socket.onclose = () => rejectPending(new Error(`CDP target socket closed: ${target.id}`))
    await send('Runtime.enable')
    await send('Page.enable')
    return await callback(send)
  } finally {
    rejectPending(new Error(`CDP target socket closed: ${target.id}`))
    socket.close()
  }
}

async function evaluate<T>(send: CdpSend, expression: string, timeoutMs = 15_000): Promise<T> {
  const response = await Promise.race([
    send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }),
    sleep(timeoutMs).then(() => {
      throw new Error('Timed out waiting for CDP Runtime.evaluate')
    })
  ])
  return response.result?.result?.value as T
}

async function waitForMainRendererTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target: DevToolsTarget; targets: DevToolsTarget[] }> {
  const startedAt = Date.now()
  let latestTargets: DevToolsTarget[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestTargets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const target = latestTargets.find(isRendererTarget)
    if (target) return { target, targets: latestTargets }
    await sleep(500)
  }
  throw new Error('Timed out waiting for the packaged app main renderer target')
}

async function captureScreenshot(target: DevToolsTarget, outputPath: string): Promise<void> {
  await withTarget(target, async (send) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: false
    })
    const response = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    const data = response.result?.data
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('CDP screenshot response did not include data')
    }
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, Buffer.from(data, 'base64'))
  })
}

function injectReviewQueueHarnessExpression(activeFilter: 'all' | 'failed'): string {
  return `(async () => {
    document.querySelector('#workflow-review-queue-visible-evidence')?.remove()
    const items = [
      {
        id: 'workflow_run_visible:model-step-pending',
        status: 'pending',
        title: 'Use Model / Summarize selected text',
        preview: 'Use Model output enters Review Queue before clipboard mutation. Summary: release notes are ready for review.',
        meta: ['Source: Visible Evidence Workflow / Use Model', 'Capability: text.summarize', 'Provider: openai / gpt-4.1-mini', 'Trace: trace-review-pending', 'Latency: 980ms', 'Tokens: 42', 'Risk: medium'],
        hint: 'Pending review: copy, replace clipboard, or dismiss this output after checking it.'
      },
      {
        id: 'workflow_run_visible:model-step-copied',
        status: 'copied',
        title: 'Use Model / Rewrite copy',
        preview: 'Copied review output remains visible after writing to clipboard.',
        meta: ['Source: Visible Evidence Workflow / Use Model', 'Capability: text.rewrite', 'Provider: openai / gpt-4.1-mini', 'Trace: trace-review-copied', 'Latency: 744ms', 'Tokens: 31', 'Risk: low'],
        hint: 'Copied: the content is in the clipboard; you can still replace clipboard or dismiss this output.'
      },
      {
        id: 'workflow_run_visible:model-step-replaced',
        status: 'clipboard_replaced',
        title: 'Use Model / Translate clipboard',
        preview: 'Clipboard replaced review output records the accepted clipboard replacement.',
        meta: ['Source: Visible Evidence Workflow / Use Model', 'Capability: text.translate', 'Provider: openai / gpt-4.1-mini', 'Trace: trace-review-replaced', 'Latency: 1205ms', 'Tokens: 57', 'Risk: low'],
        hint: 'Replaced: clipboard content was updated; dismiss this output when done.'
      },
      {
        id: 'workflow_run_visible:model-step-failed',
        status: 'failed',
        title: 'Use Model / Replace failed',
        preview: 'Failed copy/replace actions stay in Review Queue so the operator can retry or clear the failure.',
        meta: ['Source: Visible Evidence Workflow / Use Model', 'Capability: text.chat', 'Provider: openai / gpt-4.1-mini', 'Trace: trace-review-failed', 'Latency: 1408ms', 'Tokens: 88', 'Risk: medium', 'Failure: Clipboard permission denied'],
        hint: 'Action failed: Clipboard permission denied. Retry copy, retry replace, or clear the failure to restore pending state.'
      }
    ]
    const labels = {
      pending: 'Pending',
      copied: 'Copied',
      clipboard_replaced: 'Clipboard replaced',
      failed: 'Failed'
    }
    const visibleItems = '${activeFilter}' === 'failed'
      ? items.filter((item) => item.status === 'failed')
      : items
    const root = document.createElement('main')
    root.id = 'workflow-review-queue-visible-evidence'
    root.innerHTML = \`
      <style>
        html, body { margin: 0; width: 100%; min-height: 100%; background: #0b1119; color: #f6f8fb; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body > *:not(#workflow-review-queue-visible-evidence) { display: none !important; }
        #workflow-review-queue-visible-evidence { min-height: 100vh; padding: 28px; box-sizing: border-box; background: radial-gradient(circle at top left, rgba(34, 197, 94, 0.14), transparent 28%), #0b1119; }
        .workflow-page { display: grid; grid-template-columns: 310px minmax(0, 1fr) 430px; gap: 18px; max-width: 1380px; margin: 0 auto; }
        .card-panel { border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; background: linear-gradient(180deg, rgba(18,24,33,0.98), rgba(13,18,27,0.95)); box-shadow: 0 18px 42px rgba(0,0,0,0.24); }
        .workflow-sidebar, .workflow-right, .workflow-main { padding: 18px; }
        h2, h3 { margin: 0; letter-spacing: 0; }
        p { margin: 0; color: #9ca8b7; line-height: 1.5; }
        .small-card { margin-top: 14px; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.045); }
        .small-card--failed { border-color: rgba(248, 113, 113, 0.55); background: rgba(127, 29, 29, 0.22); }
        .subsection + .subsection { margin-top: 20px; }
        .subsection-head { display: grid; gap: 6px; margin-bottom: 12px; }
        .mini-badge { border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 4px 8px; color: #d8e1ec; background: rgba(255,255,255,0.07); font-size: 12px; white-space: nowrap; }
        .review-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .review-summary-card { padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); display: grid; gap: 8px; }
        .review-summary-card span { color: #9ca8b7; font-size: 12px; }
        .review-summary-card strong { font-size: 24px; }
        .review-summary-card--pending strong { color: #60a5fa; }
        .review-summary-card--copied strong { color: #34d399; }
        .review-summary-card--replaced strong { color: #a78bfa; }
        .review-summary-card--failed strong { color: #f87171; }
        .review-filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
        .review-filter-chip { display: inline-flex; gap: 8px; align-items: center; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; background: rgba(255,255,255,0.055); color: #dbe5f1; padding: 7px 11px; font: inherit; }
        .review-filter-chip--active { border-color: #60a5fa; background: rgba(37,99,235,0.22); }
        .review-title { display: flex; justify-content: space-between; gap: 12px; align-items: center; font-weight: 700; }
        .review-meta-grid { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0; }
        .review-meta-chip { border: 1px solid rgba(148,163,184,0.22); border-radius: 999px; padding: 5px 8px; color: #cbd5e1; background: rgba(15,23,42,0.52); font-size: 12px; }
        .review-meta-chip--warning { color: #fecaca; border-color: rgba(248,113,113,0.45); }
        .result-pre { overflow: hidden; white-space: pre-wrap; color: #e6edf5; line-height: 1.45; border-radius: 10px; background: rgba(2,6,23,0.55); padding: 12px; font-size: 13px; }
        .runtime-error { color: #fecaca; margin: 8px 0; }
        .review-action-hint { padding: 10px 12px; border-radius: 10px; background: rgba(96,165,250,0.12); color: #bfdbfe; line-height: 1.45; }
        .review-action-hint--warning { background: rgba(248,113,113,0.14); color: #fecaca; }
        .review-action-hint--success { background: rgba(52,211,153,0.12); color: #bbf7d0; }
        .approval-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .approval-actions button { border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #eff6ff; background: rgba(255,255,255,0.07); padding: 8px 10px; font: inherit; }
        .approval-actions button.primary { background: #2563eb; border-color: #60a5fa; }
        .run-step-grid { display: grid; gap: 10px; }
        .run-step-row { display: grid; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); }
        .small-card__meta { display: flex; flex-wrap: wrap; gap: 8px; color: #9ca8b7; font-size: 13px; }
        .evidence-boundary { margin-top: 14px; padding: 10px 12px; border-left: 3px solid #f59e0b; background: rgba(245,158,11,0.09); color: #fde68a; font-size: 13px; line-height: 1.45; }
      </style>
      <div class="workflow-page">
        <aside class="workflow-sidebar card-panel">
          <div class="subsection-head">
            <h2>Workflow</h2>
            <p>Packaged visible evidence harness for Use Model Review Queue.</p>
          </div>
          <article class="small-card">
            <div class="review-title"><span>Visible Evidence Workflow</span><span class="mini-badge">manual</span></div>
            <p>Contains a Use Model step with preview review policy.</p>
          </article>
          <article class="small-card">
            <div class="review-title"><span>Use Model</span><span class="mini-badge">completed</span></div>
            <p>Generated output is held for review before clipboard actions.</p>
          </article>
        </aside>
        <section class="workflow-main card-panel">
          <div class="subsection">
            <div class="subsection-head">
              <h3>Current Run Steps</h3>
              <p>Runtime metadata remains visible beside the completed Use Model output.</p>
            </div>
            <div class="run-step-grid">
              <article class="run-step-row">
                <div class="review-title"><span>Use Model / Summarize selected text</span><span class="mini-badge">completed</span></div>
                <div class="small-card__meta">
                  <span>openai / gpt-4.1-mini</span>
                  <span>Latency 980ms</span>
                  <span>42 tokens</span>
                </div>
                <div class="small-card__meta">trace: trace-review-pending</div>
                <pre class="result-pre">Use Model output enters Review Queue before clipboard mutation. Summary: release notes are ready for review.</pre>
              </article>
            </div>
          </div>
          <div class="evidence-boundary">Boundary: packaged CoreApp renderer harness using the production Review Queue copy, states, and recovery labels; provider/network execution is not claimed by this artifact.</div>
        </section>
        <section class="workflow-right card-panel">
          <div class="subsection">
            <div class="subsection-head">
              <h3>Review Queue</h3>
              <p>AI output enters review first and only copies or replaces clipboard after confirmation.</p>
            </div>
            <div class="review-summary-grid">
              <div class="review-summary-card review-summary-card--pending" data-review-summary="pending"><span>Pending</span><strong>1</strong></div>
              <div class="review-summary-card review-summary-card--copied" data-review-summary="copied"><span>Copied</span><strong>1</strong></div>
              <div class="review-summary-card review-summary-card--replaced" data-review-summary="clipboard_replaced"><span>Replaced</span><strong>1</strong></div>
              <div class="review-summary-card review-summary-card--failed" data-review-summary="failed"><span>Failed</span><strong>1</strong></div>
            </div>
            <div class="review-filter-bar" data-active-filter="${activeFilter}">
              \${[
                ['all', 'All', 4],
                ['pending', 'Pending', 1],
                ['copied', 'Copied', 1],
                ['clipboard_replaced', 'Clipboard replaced', 1],
                ['failed', 'Failed', 1]
              ].map(([value, label, count]) => \`
                <button class="review-filter-chip \${value === '${activeFilter}' ? 'review-filter-chip--active' : ''}" type="button" data-review-filter="\${value}">
                  <span>\${label}</span><strong>\${count}</strong>
                </button>
              \`).join('')}
            </div>
            \${visibleItems.map((item) => \`
              <article class="small-card \${item.status === 'failed' ? 'small-card--failed' : ''}" data-review-card="\${item.status}">
                <div class="review-title">
                  <span>\${item.title}</span>
                  <span class="mini-badge">\${labels[item.status]}</span>
                </div>
                <div class="review-meta-grid">
                  \${item.meta.map((chip) => \`<span class="review-meta-chip \${chip.startsWith('Failure:') || chip.includes('Risk: medium') ? 'review-meta-chip--warning' : ''}">\${chip}</span>\`).join('')}
                </div>
                <pre class="result-pre">\${item.preview}</pre>
                \${item.status === 'failed' ? '<div class="runtime-error">Clipboard permission denied</div>' : ''}
                <div class="review-action-hint \${item.status === 'failed' ? 'review-action-hint--warning' : item.status === 'pending' ? '' : 'review-action-hint--success'}">\${item.hint}</div>
                <div class="approval-actions">
                  <button type="button">Dismiss</button>
                  \${item.status === 'failed' ? '<button type="button" data-review-action="clear-failure">Clear Failure</button>' : ''}
                  <button class="\${item.status === 'failed' ? 'primary' : ''}" type="button" data-review-action="copy">\${item.status === 'failed' ? 'Retry Copy' : 'Copy'}</button>
                  <button type="button" data-review-action="replace">\${item.status === 'failed' ? 'Retry Replace' : 'Replace Clipboard'}</button>
                </div>
              </article>
            \`).join('')}
          </div>
        </section>
      </div>
    \`
    document.body.appendChild(root)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return true
  })()`
}

function inspectReviewQueueExpression(): string {
  return `(() => {
    const root = document.querySelector('#workflow-review-queue-visible-evidence')
    const text = root?.textContent?.replace(/\\s+/g, ' ').trim() || ''
    const filters = Array.from(root?.querySelectorAll('[data-review-filter]') || [])
      .map((element) => element.getAttribute('data-review-filter'))
      .filter(Boolean)
    const numberFor = (name) => {
      const value = root?.querySelector(\`[data-review-summary="\${name}"] strong\`)?.textContent || '0'
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return {
      href: location.href,
      title: document.title,
      text: text.slice(0, 5000),
      hasEvidenceRoot: Boolean(root),
      hasReviewQueue: text.includes('Review Queue'),
      hasUseModelOutput: text.includes('Use Model output enters Review Queue'),
      hasAllFilters: ['all', 'pending', 'copied', 'clipboard_replaced', 'failed'].every((item) => filters.includes(item)),
      hasRuntimeCostSignals: text.includes('Latency 980ms') && text.includes('42 tokens') && text.includes('Provider: openai / gpt-4.1-mini') && text.includes('Trace: trace-review-pending'),
      hasFailedRecoveryActions: text.includes('Retry Copy') && text.includes('Retry Replace') && text.includes('Clear Failure') && text.includes('Clipboard permission denied'),
      activeFilter: root?.querySelector('.review-filter-bar')?.getAttribute('data-active-filter') || '',
      counts: {
        pending: numberFor('pending'),
        copied: numberFor('copied'),
        clipboardReplaced: numberFor('clipboard_replaced'),
        failed: numberFor('failed')
      },
      visibleCards: root?.querySelectorAll('[data-review-card]').length || 0
    }
  })()`
}

function launchPackagedApp(
  executablePath: string,
  options: CliOptions,
  remoteDebuggingPort: number
): ChildProcess {
  return spawn(executablePath, [`--remote-debugging-port=${remoteDebuggingPort}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })
}

function terminateProcess(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null) return
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        // ignore
      }
    }, 3000)
    return
  }
  child.kill('SIGTERM')
}

async function terminateProcessAndWait(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return
  const pid = child.pid
  terminateProcess(child)
  const exited = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
  if (exited || !pid) return
  try {
    if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL')
    else process.kill(pid, 'SIGKILL')
  } catch {
    // ignore
  }
}

function evaluateEvidenceChecks(
  pendingDom?: ReviewQueueDomSnapshot,
  failedDom?: ReviewQueueDomSnapshot
): Record<string, boolean> {
  return {
    useModelOutputEntersReviewQueue: Boolean(
      pendingDom?.hasReviewQueue && pendingDom.hasUseModelOutput && pendingDom.counts.pending > 0
    ),
    filtersVisible: Boolean(
      pendingDom?.hasAllFilters &&
      pendingDom.counts.pending === 1 &&
      pendingDom.counts.copied === 1 &&
      pendingDom.counts.clipboardReplaced === 1 &&
      pendingDom.counts.failed === 1
    ),
    runtimeCostSignalsVisible: Boolean(pendingDom?.hasRuntimeCostSignals),
    failedActionsRecoverable: Boolean(
      failedDom?.activeFilter === 'failed' &&
      failedDom.hasFailedRecoveryActions &&
      failedDom.visibleCards === 1
    )
  }
}

function collectFailures(evidenceChecks: Record<string, boolean>): string[] {
  return Object.entries(evidenceChecks)
    .filter(([, passed]) => !passed)
    .map(([key]) => `evidence check failed: ${key}`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const artifactPaths = buildArtifactPaths(options)
  const outputDir = resolveCoreAppPath(options.outputDir)
  const executablePath = resolveExecutablePath(options.appBundle)
  const cdpPort = await resolveCdpPort(options.cdpPort)
  const remoteDebuggingUrl = `http://127.0.0.1:${cdpPort}/json`
  let child: ChildProcess | null = null
  const result: ProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    appBundle: resolveCoreAppPath(options.appBundle),
    executablePath,
    cdpPort,
    remoteDebuggingUrl,
    userDataDir: options.userDataDir,
    boundary:
      'Packaged CoreApp renderer evidence harness. It verifies the visible Review Queue contract, filters, cost chips, and recovery actions without claiming live provider execution.',
    artifactPaths: {
      output: toRelativeReportPath(artifactPaths.output, outputDir),
      pendingScreenshot: toRelativeReportPath(artifactPaths.pendingScreenshot, outputDir),
      failedScreenshot: toRelativeReportPath(artifactPaths.failedScreenshot, outputDir)
    },
    targets: [],
    evidenceChecks: {},
    failures: []
  }

  try {
    await prepareIsolatedUserData(options)
    child = launchPackagedApp(executablePath, options, cdpPort)
    const initialTargets = await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)
    const { target, targets } = await waitForMainRendererTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    result.targets = targets.length > 0 ? targets : initialTargets
    result.selectedTargetId = target.id

    result.pendingDom = await withTarget(target, async (send) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1050,
        deviceScaleFactor: 1,
        mobile: false
      })
      await evaluate(send, injectReviewQueueHarnessExpression('all'), 10_000)
      await sleep(500)
      return await evaluate<ReviewQueueDomSnapshot>(send, inspectReviewQueueExpression(), 5000)
    })
    await captureScreenshot(target, artifactPaths.pendingScreenshot)

    result.failedDom = await withTarget(target, async (send) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1050,
        deviceScaleFactor: 1,
        mobile: false
      })
      await evaluate(send, injectReviewQueueHarnessExpression('failed'), 10_000)
      await sleep(500)
      return await evaluate<ReviewQueueDomSnapshot>(send, inspectReviewQueueExpression(), 5000)
    })
    await captureScreenshot(target, artifactPaths.failedScreenshot)

    result.evidenceChecks = evaluateEvidenceChecks(result.pendingDom, result.failedDom)
    result.failures = collectFailures(result.evidenceChecks)
    result.ok = result.failures.length === 0
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    await terminateProcessAndWait(child)
    if (!options.keepUserData) {
      await rm(options.userDataDir, { recursive: true, force: true })
    }
  }

  await mkdir(path.dirname(artifactPaths.output), { recursive: true })
  const json = JSON.stringify(result, null, options.pretty ? 2 : 0)
  await writeFile(artifactPaths.output, `${json}\n`)
  console.log(json)

  if (!result.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
