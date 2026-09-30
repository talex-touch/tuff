#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import {
  evaluateEverythingCoreBoxUiEvidence,
  EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES,
  EVERYTHING_COREBOX_UI_EVIDENCE_KIND,
  EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION,
  isRedactedCoreBoxQuery,
  resolveCoreBoxResultSource
} from '../src/main/modules/platform/everything-corebox-ui-verifier'
import type {
  EverythingCoreBoxModeEvidence,
  EverythingCoreBoxProviderSource,
  EverythingCoreBoxSearchModeId,
  EverythingCoreBoxUiEvidencePayload
} from '../src/main/modules/platform/everything-corebox-ui-verifier'
import { everythingStatusEvent } from '../src/shared/events/everything'
import type {
  EverythingBackendType,
  EverythingStatusResponse
} from '../src/shared/events/everything'
import { RAW_MAIN_PROCESS_CHANNEL } from '../src/shared/ipc/raw-channel'
import packageJson from '../package.json'
import {
  assertIsolatedFixtureRoot,
  assertIsolatedProfileDir,
  hasProfileOwnershipMarker,
  PROFILE_OWNERSHIP_MARKER,
  PROFILE_OWNERSHIP_SCHEMA
} from './search-split-app-evidence'

const SHOW_EVENT = CoreBoxEvents.ui.show.toEventName()
const VISIBILITY_EVENT = CoreBoxEvents.ui.getVisibility.toEventName()
const SEARCH_QUERY_EVENT = CoreBoxEvents.search.query.toEventName()
const STATUS_EVENT = everythingStatusEvent.toEventName()

/** Content of the marker file the CI fixture seeds; the probe seeds the same bytes into its profile. */
const MARKER_FILE_CONTENT = 'Tuff Everything Windows production gate fixture.\n'

const DEFAULT_OUTPUT_DIR = 'evidence/corebox-everything'
const DEFAULT_MARKER = 'tuff-everything-ci-marker.txt'
const DEFAULT_EMPTY_TOKEN = 'tuff-corebox-empty-state-7c41q9'
const DEFAULT_MODE_TIMEOUT_MS = 25_000
const DEFAULT_LAUNCH_TIMEOUT_MS = 150_000
const MODE_MIN_WAIT_MS = 2_000
const MODE_STABLE_MS = 1_200

interface CliOptions {
  appBundle: string
  outputDir: string
  evidencePath?: string
  cdpPort: number
  remoteDebuggingUrl?: string
  attachOnly: boolean
  userDataDir: string
  keepUserData: boolean
  launchTimeoutMs: number
  modeTimeoutMs: number
  expectBackend: EverythingBackendType
  marker: string
  emptyToken: string
  sdkDllPath?: string
  pretty: boolean
  extraLaunchArgs: string[]
}

export interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

/**
 * A redacted read of the packaged CoreBox after one query. Counts and booleans only: the renderer
 * computes `markerMatchCount` locally so no result title or path ever leaves the app.
 *
 * `rowCount` counts file result rows only — a degraded/unavailable notice (`.BoxItem--notice`,
 * `kind: 'notification'`) is not a file result and is reported separately as `noticeVisible`.
 */
export interface CoreBoxModeObservation {
  inputPresent: boolean
  rowCount: number
  markerMatchCount: number
  emptyResult: boolean
  errorVisible: boolean
  noticeVisible: boolean
  statusText: string
  resultSurfaceVisible: boolean
  visibilityState: string
  durationMs: number
}

export interface CoreBoxStatusRead {
  statusChannelAvailable: boolean
  status: EverythingStatusResponse | null
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:corebox-everything:probe -- [options]

Options:
  --app-bundle <path>          Packaged app bundle (macOS .app) or unpacked directory (win-unpacked).
  --output-dir <dir>           Artifact directory. Defaults to ${DEFAULT_OUTPUT_DIR}.
  --evidence <path>            Evidence JSON path. Defaults to <output-dir>/everything-corebox-ui-evidence.json.
  --cdp-port <port>            Remote debugging port. Defaults to the first free port in 9681-9780.
  --remote-debugging-url <url> Attach to an already running app instead of launching one.
  --attach                     Attach instead of launching (requires --remote-debugging-url).
  --user-data-dir <dir>        Isolated profile used for the launched app.
  --keep-user-data             Keep the isolated profile after the run.
  --launch-timeout-ms <ms>     CDP/target wait budget. Defaults to ${DEFAULT_LAUNCH_TIMEOUT_MS}.
  --mode-timeout-ms <ms>       Per-search settle budget. Defaults to ${DEFAULT_MODE_TIMEOUT_MS}.
  --expect-backend <backend>   Expected packaged backend: sdk-napi | cli | unavailable.
  --marker <text>              Marker filename queried through CoreBox. Defaults to ${DEFAULT_MARKER}.
  --empty-token <text>         Token that must render zero rows. Defaults to ${DEFAULT_EMPTY_TOKEN}.
  --sdk-dll-path <path>        Passed as TALEX_EVERYTHING_DLL_PATH to the launched app.
  --launch-arg <arg>           Extra argument forwarded to the packaged executable (repeatable).
  --compact                    Print single-line JSON.
  --help                       Show this help.
`)
}

function parseBackend(value: string | undefined): EverythingBackendType {
  if (value === 'sdk-napi' || value === 'cli' || value === 'unavailable') return value
  throw new Error(`Invalid --expect-backend value: ${value ?? '(missing)'}`)
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    appBundle: process.platform === 'win32' ? 'dist/win-unpacked' : 'dist/mac-arm64/tuff.app',
    outputDir: DEFAULT_OUTPUT_DIR,
    cdpPort: 0,
    attachOnly: false,
    userDataDir: '',
    keepUserData: false,
    launchTimeoutMs: DEFAULT_LAUNCH_TIMEOUT_MS,
    modeTimeoutMs: DEFAULT_MODE_TIMEOUT_MS,
    expectBackend: 'sdk-napi',
    marker: process.env.TUFF_EVERYTHING_MARKER?.trim() || DEFAULT_MARKER,
    emptyToken: DEFAULT_EMPTY_TOKEN,
    pretty: true,
    extraLaunchArgs: []
  }
  let userDataDirProvided = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--app-bundle' && argv[i + 1]) {
      options.appBundle = argv[++i]
      continue
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = argv[++i]
      continue
    }
    if (arg === '--evidence' && argv[i + 1]) {
      options.evidencePath = argv[++i]
      continue
    }
    if (arg === '--cdp-port' && argv[i + 1]) {
      options.cdpPort = parseNonNegativeInteger(argv[++i], '--cdp-port')
      continue
    }
    if (arg === '--remote-debugging-url' && argv[i + 1]) {
      options.remoteDebuggingUrl = argv[++i]
      options.attachOnly = true
      continue
    }
    if (arg === '--attach') {
      options.attachOnly = true
      continue
    }
    if (arg === '--user-data-dir' && argv[i + 1]) {
      options.userDataDir = argv[++i]
      userDataDirProvided = true
      continue
    }
    if (arg === '--keep-user-data') {
      options.keepUserData = true
      continue
    }
    if (arg === '--launch-timeout-ms' && argv[i + 1]) {
      options.launchTimeoutMs = parseNonNegativeInteger(argv[++i], '--launch-timeout-ms')
      continue
    }
    if (arg === '--mode-timeout-ms' && argv[i + 1]) {
      options.modeTimeoutMs = parseNonNegativeInteger(argv[++i], '--mode-timeout-ms')
      continue
    }
    if (arg === '--expect-backend' && argv[i + 1]) {
      options.expectBackend = parseBackend(argv[++i])
      continue
    }
    if (arg === '--marker' && argv[i + 1]) {
      options.marker = argv[++i]
      continue
    }
    if (arg === '--empty-token' && argv[i + 1]) {
      options.emptyToken = argv[++i]
      continue
    }
    if (arg === '--sdk-dll-path' && argv[i + 1]) {
      options.sdkDllPath = argv[++i]
      continue
    }
    if (arg === '--launch-arg' && argv[i + 1]) {
      options.extraLaunchArgs.push(argv[++i])
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.attachOnly && !options.remoteDebuggingUrl) {
    throw new Error('--attach requires --remote-debugging-url')
  }
  if (!options.userDataDir) {
    const stamp = Date.now().toString(36)
    options.userDataDir = path.join(
      process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp',
      `tuff-corebox-everything-${stamp}`
    )
  }
  if (userDataDirProvided && options.attachOnly) {
    throw new Error('--user-data-dir cannot be combined with --attach')
  }
  options.marker = assertMarkerFileName(options.marker)

  return options
}

/** Everything query text per CoreBox search mode. Labels the Windows manifest quotes verbatim. */
export function buildCoreBoxModeQueries(
  marker: string,
  emptyToken: string
): Record<EverythingCoreBoxSearchModeId, string> & { empty: string } {
  const stem = marker.replace(/\.[^.]+$/, '')
  return {
    normal: marker,
    'explicit-file': `@file ${marker}`,
    // `ext:` is a structural filter the local file index claims, so the orchestrator routes this
    // mode to `file-provider`, not Everything. It is recorded as a file-index mode and must never be
    // judged as an Everything row (see `EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES`).
    'structured-filter': `ext:txt ${stem}`,
    empty: emptyToken
  }
}

/**
 * The marker is both a query token and the name of the fixture file the probe seeds and the CI
 * fixture exports. Anything with a separator, drive letter, `~` or `..` would escape the fixture
 * child, so the redaction predicate the evidence gate already uses is the guard here too.
 */
function assertMarkerFileName(marker: string): string {
  if (!isRedactedCoreBoxQuery(marker) || marker === '.' || marker === '..') {
    throw new Error(
      `refusing --marker "${marker}": a marker must be a plain file name without separators, ` +
        'a drive letter, "~" or ".."'
    )
  }
  return marker
}

export function resolveExecutablePath(appBundle: string): string {
  const resolved = path.resolve(process.cwd(), appBundle)
  // electron-builder sets `executableName: tuff` for every target, so the macOS bundle and the
  // Windows unpacked directory differ only in layout, not in binary name.
  if (path.extname(resolved) === '.app') return path.join(resolved, 'Contents', 'MacOS', 'tuff')
  if (process.platform === 'win32') return path.join(resolved, 'tuff.exe')
  return path.join(resolved, 'tuff')
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

async function isPortAvailable(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const server = createServer()
  server.once('error', () => resolve(false))
  server.once('listening', () => {
    server.close(() => resolve(true))
  })
  server.listen(port, '127.0.0.1')
  return promise
}

async function resolveCdpPort(requestedPort: number): Promise<number> {
  if (requestedPort > 0) return requestedPort
  for (let port = 9681; port < 9781; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error('Unable to find an available CDP port in range 9681-9780')
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error('Remote debugging endpoint did not return a target list')
  }
  return payload.filter((entry): entry is DevToolsTarget => {
    if (!entry || typeof entry !== 'object') return false
    const target = entry as Partial<DevToolsTarget>
    return (
      typeof target.id === 'string' &&
      typeof target.title === 'string' &&
      typeof target.type === 'string' &&
      typeof target.url === 'string'
    )
  })
}

interface CdpResponse {
  result?: {
    data?: string
    result?: { value?: unknown; type?: string }
    exceptionDetails?: unknown
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

interface ChildProcessCapture {
  getSummary: () => string
  getSnapshot: () => {
    pid: number | null
    exitCode: number | null
    signalCode: NodeJS.Signals | null
  }
}

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`Target has no WebSocket URL: ${target.id}`)

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<number, (value: CdpResponse) => void>()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse & { id?: number }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
  }

  const opened = Promise.withResolvers<void>()
  socket.onopen = () => opened.resolve()
  socket.onerror = () => opened.reject(new Error(`Failed to connect CDP target: ${target.id}`))
  await opened.promise

  const send: CdpSend = (method, params = {}) => {
    const response = Promise.withResolvers<CdpResponse>()
    const nextId = ++id
    pending.set(nextId, response.resolve)
    socket.send(JSON.stringify({ id: nextId, method, params }))
    return response.promise
  }

  try {
    await send('Runtime.enable')
    await send('Page.enable')
    return await callback(send)
  } finally {
    socket.close()
  }
}

async function evaluate<T>(send: CdpSend, expression: string, timeoutMs = 30_000): Promise<T> {
  const response = await Promise.race([
    send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
    sleep(timeoutMs).then(() => {
      throw new Error('Timed out waiting for CDP Runtime.evaluate')
    })
  ])
  if (response.result?.exceptionDetails) {
    throw new Error(
      `CDP Runtime.evaluate threw: ${JSON.stringify(response.result.exceptionDetails).slice(0, 600)}`
    )
  }
  return response.result?.result?.value as T
}

export function buildScreenshotClipExpression(): string {
  return `(() => {
    const surface =
      document.querySelector('.CoreBoxRes-Main') ||
      document.querySelector('.CoreBoxRes') ||
      document.querySelector('.CoreBox')
    if (!surface) return null
    const rect = surface.getBoundingClientRect()
    const x = Math.max(0, Math.floor(rect.left))
    const y = Math.max(0, Math.floor(rect.top))
    const width = Math.min(Math.ceil(rect.width), window.innerWidth - x)
    const height = Math.min(Math.ceil(rect.height), window.innerHeight - y)
    if (width < 80 || height < 80) return null
    return { x, y, width, height, scale: 1 }
  })()`
}

async function captureScreenshot(send: CdpSend, outputPath: string): Promise<void> {
  // Clipped to the CoreBox surface: the preview pane prints an absolute path for the focused row,
  // and the uploaded artifact must stay about the packaged UI, not about whatever the machine's
  // index happens to contain. When the clip cannot be measured we fail instead of falling back to a
  // full-window capture, which would upload whatever the machine's index happens to contain.
  const clip = await evaluate<{
    x: number
    y: number
    width: number
    height: number
    scale: number
  } | null>(send, buildScreenshotClipExpression(), 10_000).catch(() => null)
  if (!clip) {
    throw new Error(
      'Could not clip the CoreBox result surface; refusing a full-window screenshot that could leak user content'
    )
  }
  const response = await send('Page.captureScreenshot', { format: 'png', clip })
  const data = response.result?.data
  if (!data) throw new Error('CDP screenshot response did not include data')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.from(data, 'base64'))
}

/**
 * The renderer half of the raw channel request/response protocol, rebuilt for `Runtime.evaluate`.
 * Same envelope the app's own client uses: the preload bridges `send`/`on` and deliberately has no
 * `invoke`, so a probe that called one would fail before reaching a single handler.
 */
export function channelRequestPrelude(): string {
  return `
    const bridge = window.electron?.ipcRenderer
    if (!bridge || typeof bridge.send !== 'function' || typeof bridge.on !== 'function') {
      throw new Error('window.electron.ipcRenderer send/on are unavailable')
    }
    const channelRequest = (eventName, payload, timeoutMs) =>
      new Promise((resolve) => {
        const id = Date.now() + '#' + eventName + '@probe' + Math.random().toString(16).slice(2)
        let settled = false
        let off = null
        const finish = (value) => {
          if (settled) return
          settled = true
          if (typeof off === 'function') off()
          resolve(value)
        }
        off = bridge.on(${JSON.stringify(RAW_MAIN_PROCESS_CHANNEL)}, (_event, raw) => {
          if (!raw || typeof raw !== 'object') return
          if (raw.header && raw.header.status !== 'reply') return
          if (!raw.sync || raw.sync.id !== id) return
          finish(raw.data)
        })
        setTimeout(() => finish({ timeout: true }), timeoutMs)
        bridge.send(${JSON.stringify(RAW_MAIN_PROCESS_CHANNEL)}, {
          code: 200,
          data: payload,
          sync: { timeStamp: Date.now(), timeout: timeoutMs, id },
          name: eventName,
          header: { status: 'request', type: 'main' }
        })
      })
  `
}

export function buildShowCoreBoxExpression(): string {
  return `(async () => {
    ${channelRequestPrelude()}
    const shown = await channelRequest(${JSON.stringify(SHOW_EVENT)}, undefined, 10000)
    const visibility = await channelRequest(${JSON.stringify(VISIBILITY_EVENT)}, undefined, 10000)
    return {
      shown: shown && shown.timeout !== true,
      visible: Boolean(visibility && visibility.visible),
      href: location.href,
      packaged: location.href.includes('app.asar'),
      hasInput: Boolean(document.querySelector('#core-box-input'))
    }
  })()`
}

/**
 * Read the live Everything status. `refresh: true` re-probes the backend (used once up front);
 * `refresh: false` is a pure read of the current backend, its diagnostics and counters, which is how
 * a query-time SDK→CLI fallback is detected without the refresh itself resetting the picture.
 */
export function buildStatusExpression(refresh = true): string {
  return `(async () => {
    ${channelRequestPrelude()}
    const status = await channelRequest(${JSON.stringify(STATUS_EVENT)}, { refresh: ${refresh} }, 25000)
    if (!status || status.timeout === true || typeof status !== 'object') {
      return { statusChannelAvailable: false, status: null }
    }
    return { statusChannelAvailable: true, status }
  })()`
}

/**
 * The observed per-mode Everything backend usage that decides the query-time fallback contract.
 *
 * `resultSource` only distinguishes file-provider from everything-provider; SDK and CLI are both
 * `everything-provider`, so it cannot tell them apart. The performance summary cannot either: it is
 * a bounded ring whose `sdkCount`/`cliCount`/`fallbackCount` saturate once the window fills, so a
 * zero delta cannot prove nothing ran. The one signal that is uniquely attributable to a single
 * query is the diagnostic stage: `diagnostics.stages['sdk-query']`/`['cli-query']` are overwritten
 * by every search with a fresh `timestamp`, so a stage whose timestamp advanced between the
 * non-refresh reads before and after the typed query *is* that query's call, and its `status`
 * records success/failure.
 *
 * The expected backend is judged per its own phase: a `sdk-napi` run must show an SDK query and no
 * CLI recovery (an SDK failure the CLI rescued is a fail); a `cli` run must show a successful CLI
 * query (the SDK failing first is the documented recovery, not a fault); an `unavailable` run must
 * show no Everything query at all. A file-index mode (`structured-filter`) is exempt.
 */
export function checkEverythingModeBackendUsage(input: {
  mode: EverythingCoreBoxSearchModeId
  everythingSourced: boolean
  expectedBackend: EverythingBackendType
  before: EverythingStatusResponse | null
  after: EverythingStatusResponse | null
}): string[] {
  const failures: string[] = []
  const afterBackend: EverythingBackendType = input.after?.backend ?? 'unavailable'
  if (afterBackend !== input.expectedBackend) {
    failures.push(
      `The ${input.mode} search left the Everything backend as ${afterBackend}, expected ${input.expectedBackend}`
    )
  }
  if (!input.everythingSourced) return failures

  const stage = (
    name: 'sdk-query' | 'cli-query'
  ): { ran: boolean; status: string | null } => {
    const after = input.after?.diagnostics?.stages?.[name]
    if (!after) return { ran: false, status: null }
    const beforeTimestamp = input.before?.diagnostics?.stages?.[name]?.timestamp
    return { ran: beforeTimestamp === undefined || after.timestamp !== beforeTimestamp, status: after.status }
  }
  const sdk = stage('sdk-query')
  const cli = stage('cli-query')

  if (input.expectedBackend === 'unavailable') {
    if (sdk.ran) failures.push(`The ${input.mode} search ran an SDK query while the backend was unavailable`)
    if (cli.ran) failures.push(`The ${input.mode} search ran a CLI query while the backend was unavailable`)
    return failures
  }
  if (input.expectedBackend === 'sdk-napi') {
    if (!sdk.ran) failures.push(`The ${input.mode} search did not run a packaged SDK query`)
    else if (sdk.status !== 'success') {
      failures.push(`The ${input.mode} search's SDK query ended as ${sdk.status}`)
    }
    if (cli.ran) {
      failures.push(
        `The ${input.mode} search recovered from a failed SDK query by falling back to the Everything CLI`
      )
    }
    return failures
  }
  // expectedBackend === 'cli': the SDK may fail first, but a successful CLI query must still answer.
  if (!cli.ran) failures.push(`The ${input.mode} search did not run an Everything CLI query`)
  else if (cli.status !== 'success') {
    failures.push(`The ${input.mode} search's CLI query ended as ${cli.status}`)
  }
  return failures
}

export interface CoreBoxSearchSourceRead {
  available: boolean
  resultCount: number
  sources: EverythingCoreBoxProviderSource[]
}

/**
 * Ask the real main-process search for the same query and read which provider actually answered.
 *
 * The DOM exposes no provider id, so attribution has to come from the orchestrator's own
 * `sources` (`TuffSearchResult.sources`). `surface: 'core-box'` keeps the caller identity the same
 * one the typed query uses, so the Everything-vs-file-index routing decision is the real one.
 */
export function buildSearchSourceExpression(query: string, timeoutMs: number): string {
  return `(async () => {
    ${channelRequestPrelude()}
    const result = await channelRequest(${JSON.stringify(SEARCH_QUERY_EVENT)}, { query: { text: ${JSON.stringify(query)} }, surface: 'core-box' }, ${timeoutMs})
    if (!result || result.timeout === true || typeof result !== 'object') {
      return { available: false, resultCount: 0, sources: [] }
    }
    const sources = Array.isArray(result.sources)
      ? result.sources.map((entry) => ({ providerId: String(entry?.providerId ?? ''), resultCount: Number(entry?.resultCount ?? 0) }))
      : []
    return {
      available: Array.isArray(result.items) || typeof result.sessionId === 'string',
      resultCount: Array.isArray(result.items) ? result.items.length : 0,
      sources
    }
  })()`
}

export function buildModeRunExpression(input: {
  query: string
  markerToken: string
  timeoutMs: number
}): string {
  return `(async () => {
    const EMPTY = { inputPresent: false, rowCount: 0, markerMatchCount: 0, emptyResult: true, errorVisible: false, noticeVisible: false, statusText: '', resultSurfaceVisible: false, visibilityState: document.visibilityState, durationMs: 0 }
    const input = document.querySelector('#core-box-input')
    if (!input) return EMPTY
    // Only real file rows: a degraded/unavailable notice (.BoxItem--notice) is not a result row.
    const resultRows = () => Array.from(document.querySelectorAll('.BoxItem')).filter((node) =>
      !node.classList.contains('BoxItem--notice') &&
      (node.offsetParent !== null || node.getClientRects().length > 0)
    )
    const noticeRows = () => Array.from(document.querySelectorAll('.BoxItem--notice')).filter((node) =>
      node.offsetParent !== null || node.getClientRects().length > 0
    )
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    setter.call(input, ${JSON.stringify(input.query)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const startedAt = Date.now()
    const markerToken = ${JSON.stringify(input.markerToken)}.toLowerCase()
    let rowCount = 0
    let markerMatchCount = 0
    let noticeVisible = false
    let signature = ''
    let stableSince = Date.now()
    while (Date.now() - startedAt < ${input.timeoutMs}) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      const rows = resultRows()
      const texts = rows.map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim())
      rowCount = rows.length
      markerMatchCount = texts.filter((text) => text.toLowerCase().includes(markerToken)).length
      noticeVisible = noticeRows().length > 0
      const nextSignature = rowCount + '|' + noticeVisible + '|' + texts.map((text) => text.length).join(',') + '|' + texts.slice(0, 3).join('~')
      if (nextSignature !== signature) {
        signature = nextSignature
        stableSince = Date.now()
      }
      const settled =
        Date.now() - startedAt >= ${MODE_MIN_WAIT_MS} && Date.now() - stableSince >= ${MODE_STABLE_MS}
      if (settled) break
    }
    const statusNode = document.querySelector('.CoreBox-SearchStatus-Live')
    return {
      inputPresent: true,
      rowCount,
      markerMatchCount,
      emptyResult: rowCount === 0,
      errorVisible: Boolean(document.querySelector('.CoreBox-SearchStatus--error')),
      noticeVisible,
      statusText: (statusNode?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      resultSurfaceVisible: Boolean(document.querySelector('.CoreBoxRes--visible')),
      visibilityState: document.visibilityState,
      durationMs: Date.now() - startedAt
    }
  })()`
}

export function buildDomSummaryExpression(): string {
  return `(() => {
    const results = document.querySelector('.CoreBoxRes')
    const rect = results ? results.getBoundingClientRect() : null
    const visible = (node) => node.offsetParent !== null || node.getClientRects().length > 0
    return {
      hasInput: Boolean(document.querySelector('#core-box-input')),
      hasResultsSurface: Boolean(results),
      resultSurfaceVisible: Boolean(document.querySelector('.CoreBoxRes--visible')),
      resultRowCount: Array.from(document.querySelectorAll('.BoxItem')).filter((node) => !node.classList.contains('BoxItem--notice') && visible(node)).length,
      noticeRowCount: Array.from(document.querySelectorAll('.BoxItem--notice')).filter(visible).length,
      statusLiveText: (document.querySelector('.CoreBox-SearchStatus-Live')?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      errorVisible: Boolean(document.querySelector('.CoreBox-SearchStatus--error')),
      visibilityState: document.visibilityState,
      resultsGeometry: rect
        ? { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top) }
        : null
    }
  })()`
}

function buildLaunchEnv(options: CliOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (
      key === 'ELECTRON_RUN_AS_NODE' ||
      key === 'INIT_CWD' ||
      key.startsWith('NODE_') ||
      key.startsWith('TSX_') ||
      key.startsWith('npm_') ||
      key.startsWith('npm_config_') ||
      key.startsWith('PNPM_')
    ) {
      delete env[key]
    }
  }
  const fixtureRoot = resolveProbeFixtureRoot(options.userDataDir)
  return {
    ...env,
    FORCE_COLOR: '0',
    HOME: fixtureRoot,
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: fixtureRoot,
    TUFF_STARTUP_BENCHMARK_ONCE: '1',
    TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '900000',
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir,
    ...(options.sdkDllPath ? { TALEX_EVERYTHING_DLL_PATH: options.sdkDllPath } : {})
  }
}

/**
 * The fixture root the launched app's `HOME`/watch root and the seeded marker both live under.
 *
 * Pure and exported so it is unit-checkable without launching anything; the guard itself is
 * `assertIsolatedFixtureRoot` from the split harness.
 */
export function resolveProbeFixtureRoot(userDataDir: string): string {
  return path.join(path.resolve(userDataDir), 'home')
}

/**
 * Reset the isolated profile. This is the only destructive step in the probe, so it re-runs the
 * split harness' hard guards on direct import (a CLI bypass does not bypass the guard):
 * `assertIsolatedProfileDir` refuses a path that is not a disposable temp dir and one a symlinked
 * ancestor points into home/the repo, and only an empty directory or one this probe marked may be
 * deleted — an existing directory we cannot account for is refused before any `rm`/`mkdir`/`write`.
 * Returns the guarded profile and fixture root so the caller passes the approved paths onward.
 */
export async function prepareIsolatedProfile(
  userDataDir: string
): Promise<{ profile: string; fixtureRoot: string }> {
  const profile = assertIsolatedProfileDir(userDataDir)
  const fixtureRoot = assertIsolatedFixtureRoot(profile, resolveProbeFixtureRoot(profile))
  if (existsSync(profile)) {
    const info = await lstat(profile)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`refusing to reset ${profile}: it is not a plain directory`)
    }
    const entries = await readdir(profile)
    if (entries.length > 0 && !(await hasProfileOwnershipMarker(profile))) {
      throw new Error(
        `refusing to reset ${profile}: it is not empty and carries no ${PROFILE_OWNERSHIP_SCHEMA} ` +
          'ownership marker (point --user-data-dir at a fresh temp directory)'
      )
    }
  }
  await rm(profile, { recursive: true, force: true })
  await mkdir(profile, { recursive: true })
  await writeFile(
    path.join(profile, PROFILE_OWNERSHIP_MARKER),
    `${JSON.stringify({ schema: PROFILE_OWNERSHIP_SCHEMA }, null, 2)}\n`,
    'utf8'
  )
  const configDir = path.join(profile, 'tuff', 'modules', 'config')
  await mkdir(configDir, { recursive: true })
  // The onboarding gate blocks CoreBox activation and the provider startup path; the probe needs the
  // same "already onboarded" profile the packaged acceptance runs use.
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({ beginner: { init: true }, dev: { developerMode: true } })
  )
  return { profile, fixtureRoot }
}

/**
 * Seed the marker file into the profile's fixture child.
 *
 * The launched app's `HOME` and file-provider watch root is this fixture child, so the marker the
 * file-index fallback answers with lives inside the probe-owned profile, never in the real home.
 * The Windows SDK backend ignores it and indexes the CI fixture that carries the same marker name.
 */
export async function seedProbeMarker(fixtureRoot: string, marker: string): Promise<void> {
  await mkdir(fixtureRoot, { recursive: true })
  await writeFile(path.join(fixtureRoot, marker), MARKER_FILE_CONTENT, 'utf8')
}

function launchPackagedApp(
  executablePath: string,
  options: CliOptions,
  remoteDebuggingPort: number
): ChildProcess {
  return spawn(
    executablePath,
    [`--remote-debugging-port=${remoteDebuggingPort}`, ...options.extraLaunchArgs],
    {
      cwd: process.cwd(),
      env: buildLaunchEnv(options),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    }
  )
}

function captureChildOutput(child: ChildProcess, limit = 12_000): ChildProcessCapture {
  let stdout = ''
  let stderr = ''
  const append = (current: string, chunk: Buffer | string): string => {
    const next = `${current}${String(chunk)}`
    return next.length > limit ? next.slice(next.length - limit) : next
  }
  child.stdout?.on('data', (chunk) => {
    stdout = append(stdout, chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr = append(stderr, chunk)
  })
  child.on('error', (error) => {
    stderr = append(stderr, error.message)
  })
  return {
    getSummary: (): string =>
      [stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`].filter(Boolean).join('\n'),
    getSnapshot: () => ({
      pid: child.pid ?? null,
      exitCode: child.exitCode,
      signalCode: child.signalCode
    })
  }
}

async function terminateProcessAndWait(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 8_000
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(200)
  }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

async function waitForCoreBoxTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target: DevToolsTarget | undefined; targets: DevToolsTarget[] }> {
  const startedAt = Date.now()
  let targets: DevToolsTarget[] = []
  while (Date.now() - startedAt < timeoutMs) {
    targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const pages = targets.filter(
      (target) => target.type === 'page' && Boolean(target.webSocketDebuggerUrl)
    )
    for (const target of pages) {
      try {
        const hasInput = await withTarget(target, (send) =>
          evaluate<boolean>(send, `Boolean(document.querySelector('#core-box-input'))`, 5_000)
        )
        if (hasInput) return { target, targets }
      } catch {
        // Renderer still booting; keep polling.
      }
    }
    await sleep(750)
  }
  return { target: undefined, targets }
}

interface ProbeResult {
  ok: boolean
  checkedAt: string
  mode: 'packaged-app' | 'attached-app'
  appBundle: string
  executablePath: string
  cdpPort: number
  remoteDebuggingUrl: string
  expectedBackend: EverythingBackendType
  observedBackend: EverythingBackendType | null
  queries: Record<string, string>
  failures: string[]
  evidencePath: string
  evidence: EverythingCoreBoxUiEvidencePayload | null
}

function buildArtifactName(options: CliOptions, suffix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `corebox-everything-${suffix}-${stamp}`
}

async function runProbe(options: CliOptions): Promise<ProbeResult> {
  const appBundle = path.resolve(process.cwd(), options.appBundle)
  const outputDir = path.resolve(process.cwd(), options.outputDir)
  const executablePath = resolveExecutablePath(options.appBundle)
  const evidencePath = options.evidencePath
    ? path.resolve(process.cwd(), options.evidencePath)
    : path.join(outputDir, 'everything-corebox-ui-evidence.json')
  const queries = buildCoreBoxModeQueries(options.marker, options.emptyToken)
  const markerToken = options.marker.replace(/\.[^.]+$/, '')

  const selectedCdpPort = options.attachOnly
    ? options.cdpPort
    : await resolveCdpPort(options.cdpPort)
  const remoteDebuggingUrl =
    options.remoteDebuggingUrl ?? `http://127.0.0.1:${selectedCdpPort}/json/list`

  const result: ProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    mode: options.attachOnly ? 'attached-app' : 'packaged-app',
    appBundle,
    executablePath,
    cdpPort: selectedCdpPort,
    remoteDebuggingUrl,
    expectedBackend: options.expectBackend,
    observedBackend: null,
    queries,
    failures: [],
    evidencePath,
    evidence: null
  }

  await mkdir(outputDir, { recursive: true })

  let child: ChildProcess | null = null
  let childOutput: ChildProcessCapture | null = null
  // Only a profile the guard approved and this probe created is ever removed, and only after the
  // launched child is gone (to avoid a delete race with the app's own writes).
  let preparedProfile: string | null = null
  try {
    if (!options.attachOnly) {
      const { profile, fixtureRoot } = await prepareIsolatedProfile(options.userDataDir)
      await seedProbeMarker(fixtureRoot, options.marker)
      // Keep the guarded, canonical spelling for buildLaunchEnv so HOME equals the approved path.
      options.userDataDir = profile
      preparedProfile = profile
      child = launchPackagedApp(executablePath, options, selectedCdpPort)
      childOutput = captureChildOutput(child)
    }

    const { target, targets } = await waitForCoreBoxTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    if (!target) {
      const summary = childOutput?.getSummary()
      if (summary) console.error(summary)
      result.failures.push(
        `Packaged CoreBox renderer target was not found. Targets: ${
          targets.map((entry) => `${entry.type}:${entry.url}`).join(', ') || 'none'
        }`
      )
      return result
    }
    const probeTarget =
      targets.find(
        (entry) =>
          entry.type === 'page' && entry.id !== target.id && Boolean(entry.webSocketDebuggerUrl)
      ) ?? target

    const show = await withTarget(probeTarget, (send) =>
      evaluate<{ shown: boolean; visible: boolean; packaged: boolean; href: string }>(
        send,
        buildShowCoreBoxExpression(),
        25_000
      )
    )

    const statusRead = await withTarget(probeTarget, (send) =>
      evaluate<CoreBoxStatusRead>(send, buildStatusExpression(), 30_000)
    )
    const status = statusRead.status
    const observedBackend: EverythingBackendType = statusRead.statusChannelAvailable
      ? (status?.backend ?? 'unavailable')
      : 'unavailable'
    result.observedBackend = observedBackend
    if (observedBackend !== options.expectBackend) {
      result.failures.push(
        `Packaged Everything backend is ${observedBackend}, expected ${options.expectBackend}`
      )
    }
    if (show.packaged !== true) {
      result.failures.push('Renderer was not served from a packaged app bundle (app.asar)')
    }

    const modes: EverythingCoreBoxModeEvidence[] = []
    const screenshots: string[] = []
    const domSnapshots: string[] = []
    for (const mode of ['normal', 'explicit-file', 'structured-filter'] as const) {
      await withTarget(probeTarget, (send) =>
        evaluate<unknown>(send, buildShowCoreBoxExpression(), 25_000)
      )
      // Non-refresh reads before and after the typed query: the query is the only thing that runs an
      // Everything search in between, so the `sdk-query`/`cli-query` diagnostic stage it writes is
      // uniquely attributable to this mode.
      const preStatusRead = await withTarget(probeTarget, (send) =>
        evaluate<CoreBoxStatusRead>(send, buildStatusExpression(false), 25_000)
      )
      const observation = await withTarget(target, (send) =>
        evaluate<CoreBoxModeObservation>(
          send,
          buildModeRunExpression({
            query: queries[mode],
            markerToken,
            timeoutMs: options.modeTimeoutMs
          }),
          options.modeTimeoutMs + 20_000
        )
      )
      const postStatusRead = await withTarget(probeTarget, (send) =>
        evaluate<CoreBoxStatusRead>(send, buildStatusExpression(false), 25_000)
      )
      // Which provider actually answered, from the orchestrator's own `sources`, not from the
      // global Everything status. `ext:txt` is a file-index filter, so this mode must never be
      // recorded as an Everything row.
      const sourceRead = await withTarget(target, (send) =>
        evaluate<CoreBoxSearchSourceRead>(
          send,
          buildSearchSourceExpression(queries[mode], options.modeTimeoutMs),
          options.modeTimeoutMs + 20_000
        )
      )
      const resultSource = sourceRead.available ? resolveCoreBoxResultSource(sourceRead.sources) : 'none'
      const domName = `${buildArtifactName(options, mode)}-dom.json`
      const screenshotName = `${buildArtifactName(options, mode)}.png`
      const domSummary = await withTarget(target, (send) =>
        evaluate<Record<string, unknown>>(send, buildDomSummaryExpression(), 15_000)
      )
      await writeFile(
        path.join(outputDir, domName),
        `${JSON.stringify(
          { mode, query: queries[mode], observation, sourceRead, domSummary },
          null,
          2
        )}\n`
      )
      await withTarget(target, (send) =>
        captureScreenshot(send, path.join(outputDir, screenshotName))
      )
      screenshots.push(screenshotName)
      domSnapshots.push(domName)
      modes.push({
        mode,
        query: queries[mode],
        attempted: observation.inputPresent,
        resultSource,
        rowCount: observation.rowCount,
        markerMatchCount: observation.markerMatchCount,
        emptyResult: observation.rowCount === 0,
        noticeVisible: observation.noticeVisible,
        durationMs: observation.durationMs,
        screenshot: screenshotName,
        domSnapshot: domName
      })
      if (!observation.inputPresent) {
        result.failures.push(`CoreBox input was missing during the ${mode} search`)
      }
      if (observation.errorVisible) {
        result.failures.push(`CoreBox reported a search error during the ${mode} search`)
      }
      const everythingSourced = EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES.includes(mode)
      if (!status?.available && everythingSourced && resultSource === 'everything-provider') {
        result.failures.push(
          `The ${mode} search reported Everything as its source while the backend was unavailable`
        )
      }
      if (observedBackend !== 'unavailable' && observation.markerMatchCount === 0) {
        result.failures.push(`The ${mode} search did not render the probe marker result`)
      }
      if (everythingSourced && observedBackend !== 'unavailable' && resultSource !== 'everything-provider') {
        result.failures.push(
          `The ${mode} search was answered by ${resultSource}, not Everything; the packaged Everything route is not proven`
        )
      }
      if (!everythingSourced && resultSource === 'everything-provider') {
        result.failures.push(
          `The ${mode} search was attributed to Everything, but the orchestrator routes it to the local file index`
        )
      }
      // The SDK→CLI recovery contract lives in the diagnostics, not in `resultSource` (SDK and CLI
      // are both `everything-provider`) and not in the bounded performance ring (its counts saturate
      // once full, so a zero delta proves nothing). The `sdk-query`/`cli-query` stage timestamp is
      // uniquely attributable to the single query between the two non-refresh reads.
      result.failures.push(
        ...checkEverythingModeBackendUsage({
          mode,
          everythingSourced,
          expectedBackend: options.expectBackend,
          before: preStatusRead.status,
          after: postStatusRead.status
        })
      )
    }

    await withTarget(probeTarget, (send) =>
      evaluate<unknown>(send, buildShowCoreBoxExpression(), 25_000)
    )
    const emptyObservation = await withTarget(target, (send) =>
      evaluate<CoreBoxModeObservation>(
        send,
        buildModeRunExpression({
          query: queries.empty,
          markerToken: options.emptyToken,
          timeoutMs: options.modeTimeoutMs
        }),
        options.modeTimeoutMs + 20_000
      )
    )
    const emptyScreenshot = `${buildArtifactName(options, 'empty')}.png`
    await withTarget(target, (send) =>
      captureScreenshot(send, path.join(outputDir, emptyScreenshot))
    )
    screenshots.push(emptyScreenshot)
    if (emptyObservation.rowCount !== 0) {
      result.failures.push(
        `The empty-state query rendered ${emptyObservation.rowCount} rows; an empty result was expected`
      )
    }

    const backendReason = status?.healthReason ?? status?.error ?? status?.errorCode ?? null
    const degradedObserved = observedBackend === 'unavailable'
    // Only the modes Everything is expected to answer; `structured-filter` (`ext:txt`) is answered
    // by the local file index, a legitimate fallback rather than a fabricated Everything row.
    const everythingModes = modes.filter((entry) =>
      EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES.includes(entry.mode)
    )
    const evidence: EverythingCoreBoxUiEvidencePayload = {
      schemaVersion: EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION,
      kind: EVERYTHING_COREBOX_UI_EVIDENCE_KIND,
      createdAt: new Date().toISOString(),
      runtime: {
        packaged: show.packaged === true,
        mode: options.attachOnly ? 'attached-app' : 'packaged-app',
        platform: process.platform,
        appVersion: options.attachOnly ? null : packageJson.version,
        profileIsolated: !options.attachOnly
      },
      backend: {
        expected: options.expectBackend,
        observed: observedBackend,
        available: Boolean(status?.available),
        health: status?.health ?? 'unsupported',
        version: status?.version ?? null,
        errorCode: status?.errorCode ?? status?.error ?? null,
        fallbackChain: status?.fallbackChain ?? [],
        statusChannelAvailable: statusRead.statusChannelAvailable
      },
      window: {
        coreBoxVisible: show.visible,
        visibilityState: emptyObservation.visibilityState,
        resultSurfaceVisible: emptyObservation.resultSurfaceVisible,
        screenshotCount: screenshots.length
      },
      emptyState: {
        query: queries.empty,
        observed: emptyObservation.rowCount === 0,
        rowCount: emptyObservation.rowCount,
        reason: status?.available ? null : backendReason
      },
      degradedState: {
        observed: degradedObserved,
        zeroResultRows: everythingModes.every((entry) => entry.rowCount === 0),
        coreBoxInteractive: modes.every((entry) => entry.attempted),
        backend: observedBackend,
        backendReason,
        noticeVisible: modes.some((entry) => entry.noticeVisible)
      },
      redaction: {
        queryIncluded: false,
        resultPathsIncluded: false,
        resultTitlesIncluded: false,
        userHomeIncluded: false
      },
      modes,
      artifacts: { screenshots, domSnapshots }
    }

    const gate = evaluateEverythingCoreBoxUiEvidence(evidence, {
      requirePackaged: true,
      requireModes: ['normal', 'explicit-file', 'structured-filter']
    })
    result.evidence = evidence
    result.failures.push(...gate.failures)
    result.ok = result.failures.length === 0
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    return result
  } finally {
    await terminateProcessAndWait(child)
    if (preparedProfile && !options.keepUserData) {
      await rm(preparedProfile, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const result = await runProbe(options)
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0))
  if (!result.ok) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
