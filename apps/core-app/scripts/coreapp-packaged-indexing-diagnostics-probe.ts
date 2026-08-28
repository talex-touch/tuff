#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { IndexedSourceDiagnosticsSnapshot } from '@talex-touch/utils/search'
import packageJson from '../package.json'
import { RAW_MAIN_PROCESS_CHANNEL } from '../src/shared/ipc/raw-channel'
import {
  applySettingsIndexingDiagnosticsEnvelopeGate,
  verifySettingsIndexingDiagnosticsEvidence
} from './settings-indexing-diagnostics-verify'
import type {
  SettingsIndexingDiagnosticsAuditField,
  SettingsIndexingDiagnosticsVerificationResult
} from './settings-indexing-diagnostics-verify'

interface CliOptions {
  appBundle: string
  cdpPort: number
  remoteDebuggingUrl?: string
  userDataDir: string
  outputDir: string
  dateStamp: string
  sourceId: string
  keepUserData: boolean
  pretty: boolean
  launchTimeoutMs: number
  attachOnly: boolean
  seedRecentTaskEvidence: boolean
  fixtureRoot?: string
  runMaintenanceAction?: IndexingDiagnosticsMaintenanceAction
}

export type IndexingDiagnosticsMaintenanceAction = 'scan' | 'reconcile' | 'reset'

export interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

export interface IndexingDiagnosticsDomSnapshot {
  href: string
  title: string
  readyState: string
  text: string
  hasSettingsShell: boolean
  hasFileIndexPage: boolean
  hasSourceDiagnosticsGroup: boolean
  targetSourceVisible: boolean
  sourceRows: Array<{
    title: string
    description: string
    hasDetailAction: boolean
  }>
  dialog: {
    visible: boolean
    animationStable: boolean
    title: string
    text: string
    sections: string[]
    recentTaskText: string
    recentTaskChips: string[]
    recentTaskChipGeometry: Array<{
      text: string
      clientWidth: number
      scrollWidth: number
      clientHeight: number
      scrollHeight: number
      rectWidth: number
      rectHeight: number
      display: string
      visibility: string
      opacity: number
      withinSection: boolean
      withinDialog: boolean
      withinOverlayContent: boolean
      withinViewport: boolean
      intrinsicTruncated: boolean
      fullyVisible: boolean
      truncated: boolean
    }>
    hasRecentTasks: boolean
  }
}

export interface IndexingDiagnosticsProbeArtifacts {
  output: string
  diagnostics: string
  verification: string
  settingsScreenshot: string
  detailScreenshot: string
  settingsDom: string
  detailDom: string
}

export interface FixtureRootBundlePreflightResult {
  checkedPath: string
  marker: string
  passed: boolean
  reason?: string
}

export interface IndexingDiagnosticsProbeLaunchFailure {
  phase: 'wait-for-cdp'
  message: string
  remoteDebuggingUrl: string
  attachOnly: boolean
  childPid: number | null
  exitCode: number | null
  signalCode: string | null
}

export interface IndexingDiagnosticsProbeResult {
  ok: boolean
  checkedAt: string
  mode: 'attach-only' | 'isolated-launch'
  profileMutationPolicy: 'read-only' | 'isolated-controlled'
  packageVersion: string
  appBundle: string
  executablePath: string
  cdpPort: number
  remoteDebuggingUrl: string
  userDataDir: string
  sourceId: string
  seededRecentTaskEvidence: boolean
  fixtureRoot?: string
  fixtureRootPreflight?: FixtureRootBundlePreflightResult
  maintenanceAction?: IndexingDiagnosticsMaintenanceAction
  maintenanceResult?: unknown
  launchFailure?: IndexingDiagnosticsProbeLaunchFailure
  artifactPaths: IndexingDiagnosticsProbeArtifacts
  selectedTargetId?: string
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  diagnostics?: IndexedSourceDiagnosticsSnapshot
  verification?: SettingsIndexingDiagnosticsVerificationResult
  settingsDom?: IndexingDiagnosticsDomSnapshot
  detailDom?: IndexingDiagnosticsDomSnapshot
  failures: string[]
}

type CdpResponse = {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

const INDEXED_SOURCE_DIAGNOSTICS_EVENT = 'app:indexed-source:diagnostics'
const INDEXED_SOURCE_RESET_EVENT = 'app:indexed-source:reset'
const INDEXED_SOURCE_RECONCILE_EVENT = 'app:indexed-source:reconcile'
const INDEXED_SOURCE_SCAN_EVENT = 'app:indexed-source:scan'
const FILE_PROVIDER_BASE_WATCH_PATHS_ENV = 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS'
const DEFAULT_REQUIRED_AUDIT_FIELDS: SettingsIndexingDiagnosticsAuditField[] = [
  'duration',
  'trigger',
  'reason',
  'attempt',
  'errorCode'
]
const MAINTENANCE_REQUIRED_AUDIT_FIELDS: SettingsIndexingDiagnosticsAuditField[] = [
  'duration',
  'trigger',
  'reason'
]

export function validateSeedRecentTaskEvidenceMode(input: {
  remoteDebuggingUrl?: string
  attachOnly?: boolean
  seedRecentTaskEvidence: boolean
  fixtureRoot?: string
  runMaintenanceAction?: IndexingDiagnosticsMaintenanceAction
}): void {
  if (input.attachOnly && !input.remoteDebuggingUrl) {
    throw new Error('--attachOnly requires --remoteDebuggingUrl')
  }
  if (input.remoteDebuggingUrl) {
    validateRemoteDebuggingUrl(input.remoteDebuggingUrl)
  }
  if (input.remoteDebuggingUrl && input.seedRecentTaskEvidence) {
    throw new Error('--seedRecentTaskEvidence is only allowed with isolated launch mode')
  }
  if (input.remoteDebuggingUrl && input.fixtureRoot) {
    throw new Error('--fixtureRoot is only allowed with isolated launch mode')
  }
  if (input.remoteDebuggingUrl && input.runMaintenanceAction) {
    throw new Error('--runMaintenanceAction is only allowed with isolated launch mode')
  }
  if (input.seedRecentTaskEvidence && input.runMaintenanceAction) {
    throw new Error('--seedRecentTaskEvidence cannot be combined with --runMaintenanceAction')
  }
  if (input.fixtureRoot && !input.runMaintenanceAction) {
    throw new Error('--fixtureRoot requires --runMaintenanceAction')
  }
}

export function validateRemoteDebuggingUrl(remoteDebuggingUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(remoteDebuggingUrl)
  } catch {
    throw new Error('--remoteDebuggingUrl must be a valid URL')
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error('--remoteDebuggingUrl must point at a loopback CDP endpoint')
  }
}

export function resolveProbeEvidencePolicy(input: {
  remoteDebuggingUrl?: string
  attachOnly?: boolean
}): Pick<IndexingDiagnosticsProbeResult, 'mode' | 'profileMutationPolicy'> {
  const attachOnly = input.attachOnly === true || Boolean(input.remoteDebuggingUrl)
  return attachOnly
    ? {
        mode: 'attach-only',
        profileMutationPolicy: 'read-only'
      }
    : {
        mode: 'isolated-launch',
        profileMutationPolicy: 'isolated-controlled'
      }
}

function buildSeededTaskState(now = Date.now()) {
  const completedAt = now - 1_000
  return {
    recentTasks: [
      {
        kind: 'scan',
        status: 'failed',
        queuedAt: completedAt - 2_000,
        startedAt: completedAt - 1_500,
        completedAt,
        jobId: 'file-provider:scan:seeded-evidence',
        durationMs: 1234,
        trigger: 'manual',
        reason: 'packaged-evidence-seed',
        attempt: 2,
        errorCode: 'SEEDED_EVIDENCE',
        errorMessage: 'Seeded low-sensitive packaged evidence task',
        summary: {
          batches: 1,
          records: 2,
          indexedRecords: 1,
          phase: 'diagnostics-evidence'
        }
      }
    ]
  }
}

export async function seedRecentTaskEvidence(
  userDataDir: string,
  sourceId: string,
  now = Date.now()
): Promise<string> {
  const { createClient } = await import('@libsql/client')
  const dbDir = path.join(userDataDir, 'tuff', 'modules', 'database')
  await mkdir(dbDir, { recursive: true })
  const dbPath = path.join(dbDir, 'database.db')
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS indexed_source_task_state (
        source_id text PRIMARY KEY NOT NULL,
        state_json text NOT NULL,
        updated_at integer NOT NULL
      )
    `)
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_indexed_source_task_state_updated_at
      ON indexed_source_task_state (updated_at)
    `)
    await client.execute({
      sql: `
        INSERT INTO indexed_source_task_state (source_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      args: [sourceId, JSON.stringify(buildSeededTaskState(now)), now]
    })
  } finally {
    client.close()
  }
  return dbPath
}

export function resolveIndexedSourceDetailTargetText(
  sourceId: string,
  rows: Array<{ text: string; hasDetailAction: boolean }>
): string | undefined {
  const expectedTitles = resolveIndexedSourceTitles(sourceId)
  return rows
    .filter((row) => row.hasDetailAction)
    .filter((row) => expectedTitles.some((title) => row.text.includes(title)))
    .sort((left, right) => left.text.length - right.text.length)[0]?.text
}

function resolveIndexedSourceTitles(sourceId: string): string[] {
  const sourceTitles: Record<string, string[]> = {
    'file-provider': ['File Index', '文件索引'],
    'app-provider': ['Applications', 'Application Index', '应用索引'],
    everything: ['Everything']
  }
  return sourceTitles[sourceId] || [sourceId]
}

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:indexing-diagnostics-probe -- [options]

Options:
  --appBundle <path>       Packaged .app bundle. Default: dist/mac-arm64/tuff.app.
  --port <number>          CDP port. Default: auto-select from 9581.
  --remoteDebuggingUrl <url>
                           Attach to an already-running packaged app /json/list endpoint.
                           When set, the probe will not launch or clean userData.
  --attachOnly             Require --remoteDebuggingUrl and fail before any launch attempt.
                           Recommended for real packaged/profile evidence collection.
  --userDataDir <path>     Isolated userData directory. Default: /tmp/tuff-indexing-diagnostics-<timestamp>.
  --outputDir <path>       Evidence output directory. Default: ../../docs/engineering/reports/r3-indexing-runtime-evidence.
  --dateStamp <value>      Artifact date suffix. Default: 2026-06-25.
  --sourceId <id>          Indexed source to open and verify. Default: file-provider.
  --keepUserData           Keep isolated userData after the probe.
  --launchTimeoutMs <ms>   Wait time for CDP endpoint. Default: 30000.
  --seedRecentTaskEvidence Seed a low-sensitive recent task in isolated userData before launch.
                           Disabled for --remoteDebuggingUrl attach mode.
  --fixtureRoot <path>      Isolated-only small fixture root for maintenance scan/reconcile evidence.
                           Requires --runMaintenanceAction and overrides FileProvider base roots.
  --runMaintenanceAction <scan|reconcile|reset>
                           Run one typed indexed-source maintenance action in isolated mode before
                           collecting diagnostics. Disabled for --remoteDebuggingUrl attach mode and
                           mutually exclusive with --seedRecentTaskEvidence.
  --compact                Print single-line JSON.
  --help                   Show this help.

Notes:
  By default this probe only launches an isolated packaged app, reads indexed-source
  diagnostics, opens Settings File Index source detail, and captures artifacts. It does not
  run scan, reset, reconcile, FTS rebuild, or schema migration unless --runMaintenanceAction
  is explicitly set in isolated mode.
  For real durable job history evidence, prefer --remoteDebuggingUrl against a packaged
  profile that has already run scan/watch/reconcile/reset.
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
    userDataDir: `/tmp/tuff-indexing-diagnostics-${timestamp}`,
    outputDir: '../../docs/engineering/reports/r3-indexing-runtime-evidence',
    dateStamp: '2026-06-25',
    sourceId: 'file-provider',
    keepUserData: false,
    pretty: true,
    launchTimeoutMs: 30_000,
    attachOnly: false,
    seedRecentTaskEvidence: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--appBundle' && argv[index + 1]) {
      options.appBundle = argv[++index]
      continue
    }
    if (arg === '--port' && argv[index + 1]) {
      const parsed = Number(argv[++index])
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid port: ${argv[index]}`)
      options.cdpPort = parsed
      continue
    }
    if (arg === '--remoteDebuggingUrl' && argv[index + 1]) {
      options.remoteDebuggingUrl = argv[++index]
      continue
    }
    if (arg === '--attachOnly') {
      options.attachOnly = true
      continue
    }
    if (arg === '--userDataDir' && argv[index + 1]) {
      options.userDataDir = argv[++index]
      continue
    }
    if (arg === '--outputDir' && argv[index + 1]) {
      options.outputDir = argv[++index]
      continue
    }
    if (arg === '--dateStamp' && argv[index + 1]) {
      options.dateStamp = argv[++index]
      continue
    }
    if (arg === '--sourceId' && argv[index + 1]) {
      options.sourceId = argv[++index]
      continue
    }
    if (arg === '--keepUserData') {
      options.keepUserData = true
      continue
    }
    if (arg === '--launchTimeoutMs' && argv[index + 1]) {
      const parsed = Number(argv[++index])
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid launch timeout: ${argv[index]}`)
      }
      options.launchTimeoutMs = Math.floor(parsed)
      continue
    }
    if (arg === '--seedRecentTaskEvidence') {
      options.seedRecentTaskEvidence = true
      continue
    }
    if (arg === '--fixtureRoot' && argv[index + 1]) {
      options.fixtureRoot = argv[++index]
      continue
    }
    if (arg === '--runMaintenanceAction' && argv[index + 1]) {
      const value = argv[++index]
      if (!isMaintenanceAction(value)) {
        throw new Error(`Invalid maintenance action: ${value}`)
      }
      options.runMaintenanceAction = value
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  validateSeedRecentTaskEvidenceMode(options)

  return options
}

function isMaintenanceAction(value: string): value is IndexingDiagnosticsMaintenanceAction {
  return value === 'scan' || value === 'reconcile' || value === 'reset'
}

function resolveCoreAppPath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath)
}

function resolveExecutablePath(appBundle: string): string {
  return path.resolve(appBundle, 'Contents', 'MacOS', 'tuff')
}

function resolveAppAsarPath(appBundle: string): string {
  return path.resolve(appBundle, 'Contents', 'Resources', 'app.asar')
}

export async function verifyFixtureRootBundlePreflight(
  appBundle: string
): Promise<FixtureRootBundlePreflightResult> {
  const checkedPath = resolveAppAsarPath(appBundle)
  try {
    const appAsar = await readFile(checkedPath)
    const passed = appAsar.includes(Buffer.from(FILE_PROVIDER_BASE_WATCH_PATHS_ENV))
    return {
      checkedPath,
      marker: FILE_PROVIDER_BASE_WATCH_PATHS_ENV,
      passed,
      reason: passed
        ? undefined
        : `Packaged app.asar does not include ${FILE_PROVIDER_BASE_WATCH_PATHS_ENV}; rebuild the bundle before fixture-root maintenance evidence.`
    }
  } catch (error) {
    return {
      checkedPath,
      marker: FILE_PROVIDER_BASE_WATCH_PATHS_ENV,
      passed: false,
      reason: `Unable to inspect packaged app.asar before fixture-root maintenance evidence: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }
}

function toRelativeReportPath(absolutePath: string, outputDir: string): string {
  return path.relative(outputDir, absolutePath).replace(/\\/g, '/')
}

export function buildArtifactPaths(options: Pick<CliOptions, 'outputDir' | 'dateStamp'>) {
  const outputDir = resolveCoreAppPath(options.outputDir)
  return {
    output: path.join(outputDir, `indexing-diagnostics-probe-${options.dateStamp}.json`),
    diagnostics: path.join(outputDir, `indexing-diagnostics-${options.dateStamp}.json`),
    verification: path.join(
      outputDir,
      `indexing-diagnostics-verification-${options.dateStamp}.json`
    ),
    settingsScreenshot: path.join(
      outputDir,
      `indexing-diagnostics-settings-${options.dateStamp}.png`
    ),
    detailScreenshot: path.join(
      outputDir,
      `indexing-diagnostics-source-detail-${options.dateStamp}.png`
    ),
    settingsDom: path.join(
      outputDir,
      `indexing-diagnostics-settings-${options.dateStamp}-dom.json`
    ),
    detailDom: path.join(
      outputDir,
      `indexing-diagnostics-source-detail-${options.dateStamp}-dom.json`
    )
  }
}

async function prepareIsolatedUserData(options: CliOptions): Promise<void> {
  await rm(options.userDataDir, { recursive: true, force: true })
  const configDir = path.join(options.userDataDir, 'tuff', 'modules', 'config')
  const isolatedHome = options.fixtureRoot
    ? resolveCoreAppPath(options.fixtureRoot)
    : path.resolve(options.userDataDir, 'home')
  await mkdir(configDir, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify(buildIsolatedAppSetting())
  )
  await prepareFixtureRoot(isolatedHome)
}

export function buildIsolatedAppSetting(): Record<string, unknown> {
  return {
    beginner: {
      init: true
    },
    dev: {
      developerMode: true
    }
  }
}

async function prepareFixtureRoot(fixtureRoot: string): Promise<void> {
  for (const dir of ['Documents', 'Downloads', 'Desktop', 'Music', 'Pictures', 'Movies']) {
    await mkdir(path.join(fixtureRoot, dir), { recursive: true })
  }
  await mkdir(path.join(fixtureRoot, 'Documents', 'notes'), { recursive: true })
  await writeFile(
    path.join(fixtureRoot, 'Documents', 'README.md'),
    '# R3 indexing diagnostics fixture\n'
  )
  await writeFile(
    path.join(fixtureRoot, 'Documents', 'notes', 'scan-target.txt'),
    'file index evidence\n'
  )
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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
  for (let port = 9581; port < 9681; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error('Unable to find an available CDP port in range 9581-9680')
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload))
    throw new Error('Remote debugging endpoint did not return a target list')
  return payload.filter(isDevToolsTarget)
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
  const pending = new Map<number, (value: CdpResponse) => void>()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse & { id?: number }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
  }

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`Failed to connect CDP target: ${target.id}`))
  })

  const send: CdpSend = (method, params = {}) => {
    return new Promise((resolve) => {
      const nextId = ++id
      pending.set(nextId, resolve)
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
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

async function captureScreenshot(send: CdpSend, outputPath: string): Promise<void> {
  const response = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  const data = response.result?.data
  if (!data) throw new Error('CDP screenshot response did not include data')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.from(data, 'base64'))
}

function inspectTargetExpression(): string {
  return `(() => ({
    href: location.href,
    readyState: document.readyState,
    hasRouter: Boolean(window.__VUE_ROUTER__?.push),
    // Was \`hasIpcInvoke\`, which no renderer can ever report true: the preload bridges send/on/
    // removeListener and leaves \`invoke\` off deliberately. selectSettingsTarget required it, so it
    // matched no target at all (#1775). This reports what the probe actually needs — and it must
    // be callable, not merely truthy: channelRequestPrelude refuses non-function members, so
    // selection has to apply the same gate.
    hasChannelBridge:
      typeof window.electron?.ipcRenderer?.send === 'function' &&
      typeof window.electron?.ipcRenderer?.on === 'function',
    hasSettingsShell: Boolean(document.querySelector('.AppSettings-Container')),
    text: document.body?.innerText?.slice(0, 1000) || ''
  }))()`
}

function openFileIndexSettingsExpression(): string {
  return `async () => {
    const waitFor = async (predicate, timeoutMs = 12000) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return false
    }
    if (window.__VUE_ROUTER__?.push) {
      await window.__VUE_ROUTER__.push('/setting/file-index')
    } else {
      location.hash = '#/setting/file-index'
    }
    const ready = await waitFor(
      () =>
        location.hash.startsWith('#/setting/file-index') &&
        Boolean(document.querySelector('.SettingsPage'))
    )
    document.querySelector('.SettingsPage')?.scrollIntoView({ block: 'start' })
    return {
      ready,
      href: location.href,
      text: document.body?.innerText?.slice(0, 2000) || ''
    }
  }`
}

/**
 * The renderer half of the channel request/response protocol, rebuilt for `Runtime.evaluate`.
 *
 * Both expressions below used to call `window.electron.ipcRenderer.invoke`, which does not exist:
 * the preload bridges `send` / `on` / `removeListener` over a two-channel allowlist and states that
 * `invoke` is "deliberately absent rather than allowlisted" (`src/preload/index.ts`). So every run
 * threw before reaching a single assertion (#1775).
 *
 * `send` + `on` are enough, because they are exactly what the renderer's own client uses. This
 * mirrors `renderer/src/modules/channel/channel-core.ts` — the same envelope, the same reply match
 * on `header.status === 'reply'` and `sync.id`. It is a reimplementation and will drift if that
 * protocol changes; the alternative was widening the preload surface the preload deliberately
 * narrowed, for a diagnostics script.
 *
 * `transport.on(AppEvents.indexedSource.*)` registers through `regChannel(BRIDGE_CHANNEL.MAIN, …)`
 * under the plain event name (`transport/sdk/main-transport.ts:738`), so these events are reachable
 * here without touching the MessagePort the transport prefers.
 */
function channelRequestPrelude(): string {
  return `
    const bridge = window.electron?.ipcRenderer
    if (!bridge || typeof bridge.send !== 'function' || typeof bridge.on !== 'function') {
      throw new Error('window.electron.ipcRenderer send/on are unavailable')
    }
    const channelRequest = (eventName, payload, timeoutMs, timeoutValue) =>
      new Promise((resolve) => {
        const id = Date.now() + '#' + eventName + '@probe' + Math.random().toString(16).slice(2)
        let settled = false
        let off = null
        let timer = null
        const finish = (value) => {
          if (settled) return
          settled = true
          if (timer !== null) clearTimeout(timer)
          if (typeof off === 'function') off()
          resolve(value)
        }
        off = bridge.on(${JSON.stringify(RAW_MAIN_PROCESS_CHANNEL)}, (_event, raw) => {
          if (!raw || typeof raw !== 'object') return
          if (raw.header && raw.header.status !== 'reply') return
          if (!raw.sync || raw.sync.id !== id) return
          finish(raw.data)
        })
        timer = setTimeout(() => finish(timeoutValue), timeoutMs)
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

function loadDiagnosticsExpression(sourceId: string): string {
  return `async () => {
    ${channelRequestPrelude()}
    const emptySnapshot = { sources: [], summary: { total: 0 }, timeout: true }
    const request = (payload) =>
      channelRequest(${JSON.stringify(INDEXED_SOURCE_DIAGNOSTICS_EVENT)}, payload, 12000, emptySnapshot)
    const allDiagnostics = await request(undefined)
    const sourceDiagnostics = await request({ sourceId: ${JSON.stringify(sourceId)} })
    return { allDiagnostics, sourceDiagnostics }
  }`
}

function runMaintenanceActionExpression(
  sourceId: string,
  action: IndexingDiagnosticsMaintenanceAction
): string {
  const eventName =
    action === 'scan'
      ? INDEXED_SOURCE_SCAN_EVENT
      : action === 'reconcile'
        ? INDEXED_SOURCE_RECONCILE_EVENT
        : INDEXED_SOURCE_RESET_EVENT
  const payload =
    action === 'scan'
      ? { sourceId, reason: 'manual-rebuild' }
      : action === 'reconcile'
        ? { sourceId, reason: 'manual-repair' }
        : {
            sourceId,
            reason: 'user-clear',
            clearSearchIndex: false,
            clearScanProgress: false
          }

  return `async () => {
    ${channelRequestPrelude()}
    return await channelRequest(
      ${JSON.stringify(eventName)},
      ${JSON.stringify(payload)},
      45000,
      { timeout: true }
    )
  }`
}

function clickSourceDetailExpression(sourceId: string): string {
  const expectedTitles = resolveIndexedSourceTitles(sourceId)
  return `async () => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const expectedTitles = ${JSON.stringify(expectedTitles)}
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const waitForValue = async (read, timeoutMs = 12000) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        const value = read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return null
    }
    const waitForStableGeometry = async (dialog, timeoutMs = 8000) => {
      const overlayContent = dialog.closest('.TxFlipOverlay-Content')
      const overlayCard = dialog.closest('.TxFlipOverlay-Card')
      if (!overlayContent || !overlayCard) return false

      const startedAt = performance.now()
      let previousSignature = ''
      let stableFrames = 0
      while (performance.now() - startedAt < timeoutMs) {
        await nextFrame()
        const dialogRect = dialog.getBoundingClientRect()
        const contentRect = overlayContent.getBoundingClientRect()
        const cardRect = overlayCard.getBoundingClientRect()
        const cardStyle = getComputedStyle(overlayCard)
        const animations = typeof overlayCard.getAnimations === 'function'
          ? overlayCard.getAnimations({ subtree: true })
          : []
        const hasRunningAnimation = animations.some(
          (animation) => animation.playState === 'running' || animation.playState === 'pending'
        )
        const signature = [
          dialogRect.left,
          dialogRect.top,
          dialogRect.width,
          dialogRect.height,
          contentRect.left,
          contentRect.top,
          contentRect.width,
          contentRect.height,
          cardRect.left,
          cardRect.top,
          cardRect.width,
          cardRect.height
        ]
          .map((value) => Number(value).toFixed(2))
          .concat(cardStyle.transform, cardStyle.opacity, cardStyle.filter)
          .join('|')
        const settledLongEnough = performance.now() - startedAt >= 520
        if (settledLongEnough && !hasRunningAnimation && signature === previousSignature) {
          stableFrames += 1
        } else {
          stableFrames = 0
        }
        previousSignature = signature
        if (stableFrames >= 2) return true
      }
      return false
    }
    const findTarget = () => {
      const candidates = Array.from(
        document.querySelectorAll('.source-diagnostic-detail-button')
      )
        .map((button) => {
          const row = button.closest('.TBlockSlot-Container')
          const text = textOf(row)
          if (!row || !expectedTitles.some((title) => text.includes(title))) return null
          return { row, text, button, score: text.length }
        })
        .filter(Boolean)
        .sort((left, right) => left.score - right.score)
      return candidates[0] || null
    }
    const target = await waitForValue(findTarget)
    if (!target) {
      return {
        opened: false,
        reason: 'source-detail-button-not-found',
        expectedTitles,
        candidates: Array.from(document.querySelectorAll('.source-diagnostic-detail-button'))
          .map((button) => textOf(button))
          .filter(Boolean)
          .slice(0, 20),
        text: document.body?.innerText?.slice(0, 2500) || ''
      }
    }
    target.button.click()
    const dialog = await waitForValue(() => document.querySelector('.source-diagnostic-dialog'), 8000)
    const animationStable = dialog ? await waitForStableGeometry(dialog) : false
    return {
      opened: Boolean(dialog),
      animationStable,
      targetText: target.text.slice(0, 500),
      text: document.body?.innerText?.slice(0, 2500) || ''
    }
  }`
}

function inspectSettingsDomExpression(
  sourceId: string,
  targetRecentTaskJobIds: string[] = [],
  detailAnimationStable = false
): string {
  const expectedTitles = resolveIndexedSourceTitles(sourceId)
  return `(async () => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const tokenBoundaries = new Set([' ', '\\t', '\\n', '\\r', '·', '/', '(', ')', '[', ']', '{', '}', ',', ';'])
    const isTokenBoundary = (character) => !character || tokenBoundaries.has(character)
    const containsExactToken = (text, token) => {
      let offset = 0
      while (offset <= text.length - token.length) {
        const index = text.indexOf(token, offset)
        if (index < 0) return false
        if (
          isTokenBoundary(text[index - 1]) &&
          isTokenBoundary(text[index + token.length])
        ) {
          return true
        }
        offset = index + 1
      }
      return false
    }
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const containsRect = (container, target) =>
      target.left >= container.left - 1 &&
      target.right <= container.right + 1 &&
      target.top >= container.top - 1 &&
      target.bottom <= container.bottom + 1
    const bodyText = document.body?.innerText || ''
    const expectedTitles = ${JSON.stringify(expectedTitles)}
    const targetRecentTaskJobIds = ${JSON.stringify(targetRecentTaskJobIds)}
    const detailAnimationStable = ${JSON.stringify(detailAnimationStable)}
    const detailButtons = Array.from(
      document.querySelectorAll('.source-diagnostic-detail-button')
    )
    const sourceRows = detailButtons
      .map((button) => {
        const row = button.closest('.TBlockSlot-Container')
        const title = textOf(row?.querySelector('.TBlockSlot-TitleRow, h5'))
        return {
          title,
          description: textOf(row).slice(0, 500),
          hasDetailAction: true
        }
      })
      .slice(0, 12)
    const targetSourceVisible = sourceRows.some((row) =>
      expectedTitles.some((title) => row.title.includes(title) || row.description.includes(title))
    )
    const dialog = document.querySelector('.source-diagnostic-dialog')
    const dialogText = textOf(dialog)
    const sections = Array.from(dialog?.querySelectorAll('.source-diagnostic-section-title') || [])
      .map(textOf)
      .filter(Boolean)
    const recentSection = Array.from(dialog?.querySelectorAll('.source-diagnostic-dialog-section') || [])
      .find((section) => {
        const title = textOf(section.querySelector('.source-diagnostic-section-title'))
        return title === 'Recent' || title === 'Recent Tasks' || title === '最近' || title === '最近任务'
      })
    const recentTaskText = textOf(recentSection)
    const recentTaskElements = Array.from(
      recentSection?.querySelectorAll('.source-history-chip') || []
    )
    const recentTaskChips = recentTaskElements.map(textOf).filter(Boolean)
    const overlayContent = dialog?.closest('.TxFlipOverlay-Content')
    const overlayCard = dialog?.closest('.TxFlipOverlay-Card')
    const hasRunningAnimation = Boolean(
      overlayCard &&
      typeof overlayCard.getAnimations === 'function' &&
      overlayCard
        .getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running' || animation.playState === 'pending')
    )
    const readChipGeometry = (chip) => {
      const rect = chip.getBoundingClientRect()
      const style = getComputedStyle(chip)
      const opacity = Number.parseFloat(style.opacity)
      const recentSectionRect = recentSection?.getBoundingClientRect()
      const dialogRect = dialog?.getBoundingClientRect()
      const overlayContentRect = overlayContent?.getBoundingClientRect()
      const viewportRect = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
      }
      const hasVisibleSize = rect.width > 0 && rect.height > 0
      let styleVisible = Boolean(overlayCard)
      let reachedOverlayCard = false
      let styleNode = chip
      while (styleVisible && styleNode) {
        const nodeStyle = getComputedStyle(styleNode)
        const nodeOpacity = Number.parseFloat(nodeStyle.opacity)
        styleVisible =
          nodeStyle.display !== 'none' &&
          nodeStyle.visibility !== 'hidden' &&
          nodeStyle.visibility !== 'collapse' &&
          Number.isFinite(nodeOpacity) &&
          nodeOpacity > 0
        if (styleNode === overlayCard) {
          reachedOverlayCard = true
          break
        }
        styleNode = styleNode.parentElement
      }
      styleVisible = styleVisible && reachedOverlayCard
      const withinSection = Boolean(recentSectionRect && containsRect(recentSectionRect, rect))
      const withinDialog = Boolean(dialogRect && containsRect(dialogRect, rect))
      const withinOverlayContent = Boolean(
        overlayContentRect && containsRect(overlayContentRect, rect)
      )
      const withinViewport = containsRect(viewportRect, rect)
      const intrinsicTruncated =
        chip.scrollWidth > chip.clientWidth + 1 || chip.scrollHeight > chip.clientHeight + 1
      return {
        text: textOf(chip).slice(0, 1500),
        clientWidth: chip.clientWidth,
        scrollWidth: chip.scrollWidth,
        clientHeight: chip.clientHeight,
        scrollHeight: chip.scrollHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity,
        withinSection,
        withinDialog,
        withinOverlayContent,
        withinViewport,
        intrinsicTruncated,
        fullyVisible:
          hasVisibleSize &&
          styleVisible &&
          withinSection &&
          withinDialog &&
          withinOverlayContent &&
          withinViewport,
        truncated: intrinsicTruncated
      }
    }
    const capturedTargetGeometry = new Map()
    for (const jobId of targetRecentTaskJobIds) {
      const chip = recentTaskElements.find((element) => containsExactToken(textOf(element), jobId))
      if (!chip) continue
      chip.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await nextFrame()
      await nextFrame()
      capturedTargetGeometry.set(chip, readChipGeometry(chip))
    }
    const recentTaskChipGeometry = recentTaskElements.map(
      (chip) => capturedTargetGeometry.get(chip) || readChipGeometry(chip)
    )
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: bodyText.slice(0, 5000),
      hasSettingsShell: Boolean(document.querySelector('.SettingsPage')),
      hasFileIndexPage:
        location.hash.startsWith('#/setting/file-index') &&
        Boolean(document.querySelector('.SettingsPage-Title')),
      hasSourceDiagnosticsGroup: Boolean(
        detailButtons[0]?.closest('.TGroupBlock-Container')
      ),
      targetSourceVisible,
      sourceRows,
      dialog: {
        visible: Boolean(dialog),
        animationStable: Boolean(dialog && detailAnimationStable && !hasRunningAnimation),
        title: textOf(document.querySelector('.source-diagnostic-dialog')?.parentElement?.querySelector('[class*="title"], strong')),
        text: dialogText.slice(0, 5000),
        sections,
        recentTaskText: recentTaskText.slice(0, 1500),
        recentTaskChips: recentTaskChips.slice(0, 3),
        recentTaskChipGeometry: recentTaskChipGeometry.slice(0, 3),
        hasRecentTasks: recentTaskChips.length > 0
      }
    }
  })()`
}

export function selectSettingsTarget(
  snapshots: Array<{
    target: DevToolsTarget
    snapshot: {
      hasRouter: boolean
      hasChannelBridge: boolean
      hasSettingsShell: boolean
      text: string
    }
  }>,
  options: { allowAppShell?: boolean } = {}
): DevToolsTarget | undefined {
  const interactiveTargets = snapshots.filter((entry) => {
    return (
      entry.target.type === 'page' &&
      Boolean(entry.target.webSocketDebuggerUrl) &&
      entry.snapshot.hasRouter &&
      entry.snapshot.hasChannelBridge &&
      (entry.snapshot.hasSettingsShell ||
        entry.snapshot.text.includes('应用设置') ||
        entry.snapshot.text.includes('App Settings'))
    )
  })
  const settingsTarget = interactiveTargets.find(
    (entry) =>
      entry.snapshot.hasSettingsShell ||
      entry.snapshot.text.includes('应用设置') ||
      entry.snapshot.text.includes('App Settings')
  )
  if (settingsTarget) return settingsTarget.target
  if (!options.allowAppShell) return undefined

  const excludedRoutes = [
    '#/meta-overlay',
    '#/core-box',
    '#/division-box',
    '#/assistant',
    '#/voice'
  ]
  return interactiveTargets.find(
    (entry) => !excludedRoutes.some((route) => entry.target.url.includes(route))
  )?.target
}

async function pickInteractiveSettingsTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number,
  allowAppShell: boolean
): Promise<{ target: DevToolsTarget | undefined; targets: DevToolsTarget[] }> {
  const startedAt = Date.now()
  let latestTargets: DevToolsTarget[] = []

  while (Date.now() - startedAt < timeoutMs) {
    latestTargets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const pageTargets = latestTargets.filter(
      (target) =>
        target.type === 'page' &&
        Boolean(target.webSocketDebuggerUrl) &&
        target.url.includes('/renderer/index.html')
    )

    const snapshots: Array<{
      target: DevToolsTarget
      snapshot: {
        hasRouter: boolean
        hasChannelBridge: boolean
        hasSettingsShell: boolean
        text: string
      }
    }> = []
    for (const target of pageTargets) {
      try {
        const snapshot = await withTarget(target, (send) =>
          evaluate<{
            hasRouter: boolean
            hasChannelBridge: boolean
            hasSettingsShell: boolean
            text: string
          }>(send, inspectTargetExpression(), 5000)
        )
        snapshots.push({ target, snapshot })
      } catch {
        // Skip renderer targets that are still booting or not interactive.
      }
    }

    const selected = selectSettingsTarget(snapshots, { allowAppShell })
    if (selected) return { target: selected, targets: latestTargets }
    await sleep(750)
  }

  return { target: undefined, targets: latestTargets }
}

export function buildPackagedAppLaunchEnv(
  options: Pick<CliOptions, 'userDataDir' | 'fixtureRoot'>
): NodeJS.ProcessEnv {
  const fixtureRoot = options.fixtureRoot ? resolveCoreAppPath(options.fixtureRoot) : undefined
  const isolatedHome = fixtureRoot ?? path.resolve(options.userDataDir, 'home')
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
  if (env.PATH) {
    env.PATH = env.PATH.split(path.delimiter)
      .filter((entry) => entry && path.isAbsolute(entry) && !entry.includes('node_modules/.bin'))
      .join(path.delimiter)
  }
  return {
    ...env,
    FORCE_COLOR: '0',
    HOME: isolatedHome,
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: isolatedHome,
    TUFF_STARTUP_BENCHMARK_ONCE: '1',
    TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '120000',
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir
  }
}

function launchPackagedApp(
  executablePath: string,
  options: CliOptions,
  remoteDebuggingPort: number
): ChildProcess {
  return spawn(executablePath, [`--remote-debugging-port=${remoteDebuggingPort}`], {
    cwd: process.cwd(),
    env: buildPackagedAppLaunchEnv(options),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })
}

function appendBounded(buffer: string, chunk: Buffer | string, limit = 12_000): string {
  const next = `${buffer}${String(chunk)}`
  return next.length > limit ? next.slice(next.length - limit) : next
}

function captureChildOutput(child: ChildProcess): {
  getSummary: () => string
  getProcessSnapshot: () => {
    childPid: number | null
    exitCode: number | null
    signalCode: string | null
  }
} {
  let stdout = ''
  let stderr = ''
  let childError = ''

  child.stdout?.on('data', (chunk) => {
    stdout = appendBounded(stdout, chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr = appendBounded(stderr, chunk)
  })
  child.on('error', (error) => {
    childError = appendBounded(
      childError,
      error instanceof Error ? error.stack || error.message : String(error)
    )
  })

  return {
    getProcessSnapshot: () => ({
      childPid: child.pid ?? null,
      exitCode: child.exitCode,
      signalCode: child.signalCode
    }),
    getSummary: () =>
      [
        `childPid=${child.pid ?? 'unknown'}`,
        `exitCode=${child.exitCode ?? 'null'}`,
        `signalCode=${child.signalCode ?? 'null'}`,
        childError ? `childError=${childError}` : undefined,
        stderr ? `stderrTail=${stderr}` : undefined,
        stdout ? `stdoutTail=${stdout}` : undefined
      ]
        .filter(Boolean)
        .join('\n')
  }
}

export function buildLaunchFailure(input: {
  phase: IndexingDiagnosticsProbeLaunchFailure['phase']
  message: string
  remoteDebuggingUrl: string
  attachOnly: boolean
  childSnapshot?: {
    childPid: number | null
    exitCode: number | null
    signalCode: string | null
  }
}): IndexingDiagnosticsProbeLaunchFailure {
  return {
    phase: input.phase,
    message: input.message,
    remoteDebuggingUrl: input.remoteDebuggingUrl,
    attachOnly: input.attachOnly,
    childPid: input.childSnapshot?.childPid ?? null,
    exitCode: input.childSnapshot?.exitCode ?? null,
    signalCode: input.childSnapshot?.signalCode ?? null
  }
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

function sourceHasRecentTask(
  diagnostics: IndexedSourceDiagnosticsSnapshot | undefined,
  sourceId: string
): boolean {
  const source = diagnostics?.sources?.find((entry) => entry.descriptor.id === sourceId)
  return (source?.recentTasks?.length ?? 0) > 0
}

type RecentTask = NonNullable<
  IndexedSourceDiagnosticsSnapshot['sources'][number]['recentTasks']
>[number]

interface ExpectedRecentTask {
  jobId: string
  auditMarkers: Partial<Record<SettingsIndexingDiagnosticsAuditField, string>>
}

function normalizeVisibleAuditValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return undefined
}

function resolveRecentTaskAuditMarker(
  task: RecentTask,
  field: SettingsIndexingDiagnosticsAuditField
): string | undefined {
  const summary = task.summary ?? {}
  const value = normalizeVisibleAuditValue(
    field === 'duration'
      ? (summary.durationMs ?? task.durationMs)
      : field === 'errorCode'
        ? (summary.errorCode ?? task.errorCode)
        : field === 'trigger'
          ? (summary.trigger ?? task.trigger)
          : field === 'reason'
            ? (summary.reason ?? task.reason)
            : (summary.attempt ?? task.attempt)
  )
  if (value === undefined) return undefined
  if (field === 'duration') return `duration ${value}ms`
  if (field === 'errorCode') return `code ${value}`
  return `${field} ${value}`
}

function resolveExpectedRecentTasks(
  diagnostics: IndexedSourceDiagnosticsSnapshot | undefined,
  sourceId: string,
  limit: number
): ExpectedRecentTask[] {
  const source = diagnostics?.sources?.find((entry) => entry.descriptor.id === sourceId)
  return (source?.recentTasks ?? []).slice(0, limit).flatMap((task) => {
    const jobId = typeof task.jobId === 'string' ? task.jobId.trim() : ''
    if (!jobId) return []
    const auditMarkers: ExpectedRecentTask['auditMarkers'] = {}
    for (const field of DEFAULT_REQUIRED_AUDIT_FIELDS) {
      const marker = resolveRecentTaskAuditMarker(task, field)
      if (marker) auditMarkers[field] = marker
    }
    return [{ jobId, auditMarkers }]
  })
}

const tokenBoundaries = new Set([
  ' ',
  '\t',
  '\n',
  '\r',
  '·',
  '/',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ';'
])

function containsExactVisibleToken(text: string, token: string): boolean {
  let offset = 0
  while (offset <= text.length - token.length) {
    const index = text.indexOf(token, offset)
    if (index < 0) return false
    const before = text[index - 1]
    const after = text[index + token.length]
    if ((!before || tokenBoundaries.has(before)) && (!after || tokenBoundaries.has(after))) {
      return true
    }
    offset = index + 1
  }
  return false
}

function resolveMissingVisibleAuditFields(
  detailDom: IndexingDiagnosticsDomSnapshot,
  verification: SettingsIndexingDiagnosticsVerificationResult,
  expectedTasks: ExpectedRecentTask[]
): SettingsIndexingDiagnosticsAuditField[] {
  const missingFields = new Set<SettingsIndexingDiagnosticsAuditField>()
  for (const task of expectedTasks) {
    const chip = detailDom.dialog.recentTaskChips.find((text) =>
      containsExactVisibleToken(text, task.jobId)
    )
    if (!chip) continue
    for (const field of verification.options.requiredAuditFields) {
      const marker = task.auditMarkers[field]
      if (!marker || !containsExactVisibleToken(chip, marker)) {
        missingFields.add(field)
      }
    }
  }
  return verification.options.requiredAuditFields.filter((field) => missingFields.has(field))
}

type RecentTaskChipGeometry =
  IndexingDiagnosticsDomSnapshot['dialog']['recentTaskChipGeometry'][number]

function isRecentTaskChipFullyVisible(geometry: RecentTaskChipGeometry): boolean {
  return (
    geometry.fullyVisible === true &&
    geometry.clientWidth > 0 &&
    geometry.clientHeight > 0 &&
    geometry.rectWidth > 0 &&
    geometry.rectHeight > 0 &&
    geometry.display !== 'none' &&
    geometry.visibility !== 'hidden' &&
    geometry.visibility !== 'collapse' &&
    Number.isFinite(geometry.opacity) &&
    geometry.opacity > 0 &&
    geometry.withinSection === true &&
    geometry.withinDialog === true &&
    geometry.withinOverlayContent === true &&
    geometry.withinViewport === true
  )
}

export function buildProbeFailures(input: {
  sourceId: string
  diagnostics?: IndexedSourceDiagnosticsSnapshot
  verification?: SettingsIndexingDiagnosticsVerificationResult
  settingsDom?: IndexingDiagnosticsDomSnapshot
  detailDom?: IndexingDiagnosticsDomSnapshot
  settingsScreenshotPath?: string
  detailScreenshotPath?: string
  fixtureRoot?: string
}): string[] {
  const failures: string[] = []
  if (!input.diagnostics?.sources?.length) {
    failures.push('No indexed source diagnostics were returned.')
  }
  if (!input.diagnostics?.sources?.some((source) => source.descriptor.id === input.sourceId)) {
    failures.push(`Diagnostics did not include source: ${input.sourceId}`)
  }
  if (!sourceHasRecentTask(input.diagnostics, input.sourceId)) {
    failures.push(`Diagnostics did not include recent task history for ${input.sourceId}.`)
  }
  if (!input.verification?.gate.passed) {
    failures.push(
      `Settings diagnostics verifier failed: ${input.verification?.gate.failures.join('; ') || 'missing verification'}`
    )
  }
  if (!input.settingsDom?.hasSettingsShell) {
    failures.push('Settings page shell is not visible.')
  }
  if (!input.settingsDom?.hasFileIndexPage) {
    failures.push('Canonical File Index settings page is not visible.')
  }
  if (!input.settingsDom?.hasSourceDiagnosticsGroup) {
    failures.push('Settings source diagnostics group is not visible.')
  }
  if (!input.settingsDom?.targetSourceVisible) {
    failures.push(`Settings diagnostics row is not visible for ${input.sourceId}.`)
  }
  if (!input.detailDom?.dialog.visible) {
    failures.push('Source diagnostic detail dialog is not visible.')
  }
  if (input.detailDom?.dialog.visible && input.detailDom.dialog.animationStable !== true) {
    failures.push('Source diagnostic detail dialog animation did not stabilize before capture.')
  }
  if (!input.detailDom?.dialog.hasRecentTasks) {
    failures.push('Source diagnostic detail dialog does not show recent task chips.')
  }
  if (input.detailDom?.dialog.visible && input.detailDom.dialog.hasRecentTasks) {
    const minRecentTasks = input.verification?.options.minRecentTasks ?? 1
    if (input.detailDom.dialog.recentTaskChips.length < minRecentTasks) {
      failures.push(
        `Source diagnostic detail dialog shows ${input.detailDom.dialog.recentTaskChips.length} recent task chips; expected at least ${minRecentTasks}.`
      )
    }
    const expectedTasks = resolveExpectedRecentTasks(
      input.diagnostics,
      input.sourceId,
      minRecentTasks
    )
    const missingJobIds = expectedTasks
      .filter(
        (task) =>
          !input.detailDom!.dialog.recentTaskChips.some((chip) =>
            containsExactVisibleToken(chip, task.jobId)
          )
      )
      .map((task) => task.jobId)
    if (missingJobIds.length > 0) {
      failures.push(
        `Source diagnostic detail dialog is missing recent task ids: ${missingJobIds.join(', ')}.`
      )
    }
    if (input.verification) {
      const missingAuditFields = resolveMissingVisibleAuditFields(
        input.detailDom,
        input.verification,
        expectedTasks
      )
      if (missingAuditFields.length > 0) {
        failures.push(
          `Source diagnostic detail dialog is missing visible audit fields: ${missingAuditFields.join(', ')}.`
        )
      }
    }

    const geometryEntries = Array.isArray(input.detailDom.dialog.recentTaskChipGeometry)
      ? input.detailDom.dialog.recentTaskChipGeometry
      : []
    const expectedGeometry = expectedTasks.map((task) => ({
      task,
      geometry: geometryEntries.find((geometry) =>
        containsExactVisibleToken(geometry.text, task.jobId)
      )
    }))
    const missingGeometryJobIds = expectedGeometry
      .filter((entry) => !entry.geometry)
      .map((entry) => entry.task.jobId)
    if (missingGeometryJobIds.length > 0) {
      failures.push(
        `Source diagnostic detail dialog is missing geometry for recent task ids: ${missingGeometryJobIds.join(', ')}.`
      )
    }
    const intrinsicTruncations = expectedGeometry.filter(
      (entry) => entry.geometry?.intrinsicTruncated === true || entry.geometry?.truncated === true
    )
    if (intrinsicTruncations.length > 0) {
      failures.push(
        `Source diagnostic detail dialog clips ${intrinsicTruncations.length} recent task chip(s).`
      )
    }
    const invisibleTaskChips = expectedGeometry.filter(
      (entry) => entry.geometry && !isRecentTaskChipFullyVisible(entry.geometry)
    )
    if (invisibleTaskChips.length > 0) {
      failures.push(
        `Source diagnostic detail dialog does not fully show ${invisibleTaskChips.length} required recent task chip(s).`
      )
    }
  }
  if (!input.settingsScreenshotPath) {
    failures.push('No Settings diagnostics screenshot artifact path was provided.')
  }
  if (!input.detailScreenshotPath) {
    failures.push('No source detail screenshot artifact path was provided.')
  }
  if (input.fixtureRoot && input.diagnostics?.sources?.length) {
    const expectedRoot = path.resolve(input.fixtureRoot)
    const source = input.diagnostics.sources.find((item) => item.descriptor.id === input.sourceId)
    const roots = source?.roots?.map((root) => path.resolve(root.path)) ?? []
    const invalidRoots = roots.filter(
      (rootPath) => rootPath !== expectedRoot && !rootPath.startsWith(`${expectedRoot}${path.sep}`)
    )
    if (roots.length === 0 || invalidRoots.length > 0) {
      failures.push(`Fixture root did not constrain ${input.sourceId} roots to ${expectedRoot}.`)
    }
  }
  return failures
}

async function runProbe(options: CliOptions): Promise<IndexingDiagnosticsProbeResult> {
  const appBundle = resolveCoreAppPath(options.appBundle)
  const executablePath = resolveExecutablePath(appBundle)
  const outputDir = resolveCoreAppPath(options.outputDir)
  const artifactPaths = buildArtifactPaths(options)
  const attachOnly = options.attachOnly || Boolean(options.remoteDebuggingUrl)
  const selectedCdpPort = attachOnly ? options.cdpPort : await resolveCdpPort(options.cdpPort)
  const remoteDebuggingUrl =
    options.remoteDebuggingUrl ?? `http://127.0.0.1:${selectedCdpPort}/json/list`
  const evidencePolicy = resolveProbeEvidencePolicy({
    remoteDebuggingUrl: options.remoteDebuggingUrl,
    attachOnly: options.attachOnly
  })

  const result: IndexingDiagnosticsProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    mode: evidencePolicy.mode,
    profileMutationPolicy: evidencePolicy.profileMutationPolicy,
    packageVersion: packageJson.version,
    appBundle,
    executablePath,
    cdpPort: selectedCdpPort,
    remoteDebuggingUrl,
    userDataDir: options.userDataDir,
    sourceId: options.sourceId,
    seededRecentTaskEvidence: options.seedRecentTaskEvidence,
    fixtureRoot: options.fixtureRoot ? resolveCoreAppPath(options.fixtureRoot) : undefined,
    maintenanceAction: options.runMaintenanceAction,
    artifactPaths: {
      output: toRelativeReportPath(artifactPaths.output, outputDir),
      diagnostics: toRelativeReportPath(artifactPaths.diagnostics, outputDir),
      verification: toRelativeReportPath(artifactPaths.verification, outputDir),
      settingsScreenshot: toRelativeReportPath(artifactPaths.settingsScreenshot, outputDir),
      detailScreenshot: toRelativeReportPath(artifactPaths.detailScreenshot, outputDir),
      settingsDom: toRelativeReportPath(artifactPaths.settingsDom, outputDir),
      detailDom: toRelativeReportPath(artifactPaths.detailDom, outputDir)
    },
    targets: [],
    failures: []
  }

  await mkdir(outputDir, { recursive: true })
  if (!attachOnly) {
    result.fixtureRootPreflight = await verifyFixtureRootBundlePreflight(appBundle)
    if (!result.fixtureRootPreflight.passed) {
      result.failures.push(
        result.fixtureRootPreflight.reason ??
          'Fixture-root maintenance evidence bundle preflight failed.'
      )
      return result
    }
  }
  if (!attachOnly) {
    await prepareIsolatedUserData(options)
    if (options.seedRecentTaskEvidence) {
      await seedRecentTaskEvidence(options.userDataDir, options.sourceId)
    }
  }

  let child: ChildProcess | null = null
  let childOutput: ReturnType<typeof captureChildOutput> | undefined
  try {
    if (!attachOnly) {
      child = launchPackagedApp(executablePath, options, selectedCdpPort)
      childOutput = captureChildOutput(child)
    }
    try {
      await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const childSummary = childOutput?.getSummary()
      result.launchFailure = buildLaunchFailure({
        phase: 'wait-for-cdp',
        message,
        remoteDebuggingUrl,
        attachOnly,
        childSnapshot: childOutput?.getProcessSnapshot()
      })
      result.failures.push(`Packaged diagnostics probe failed before CDP was available: ${message}`)
      if (childSummary) {
        console.error(childSummary)
      }
      return result
    }
    const targetSelection = await pickInteractiveSettingsTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs,
      !attachOnly
    )
    result.targets = targetSelection.targets.map(({ id, title, type, url }) => ({
      id,
      title,
      type,
      url
    }))
    const target = targetSelection.target
    if (!target) {
      result.failures.push('settings target was not found')
      return result
    }
    result.selectedTargetId = target.id

    await withTarget(target, async (send) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false
      })

      await evaluate(send, `(${openFileIndexSettingsExpression()})()`, 15_000)
      if (options.runMaintenanceAction) {
        result.maintenanceResult = await evaluate<unknown>(
          send,
          `(${runMaintenanceActionExpression(options.sourceId, options.runMaintenanceAction)})()`,
          60_000
        )
        await sleep(1200)
        await send('Page.reload', { ignoreCache: true })
        await sleep(2400)
        await evaluate(send, `(${openFileIndexSettingsExpression()})()`, 15_000)
      }
      const diagnosticsPayload = await evaluate<{
        allDiagnostics?: IndexedSourceDiagnosticsSnapshot
        sourceDiagnostics?: IndexedSourceDiagnosticsSnapshot
      }>(send, `(${loadDiagnosticsExpression(options.sourceId)})()`, 20_000)
      result.diagnostics = diagnosticsPayload.sourceDiagnostics ?? diagnosticsPayload.allDiagnostics
      result.verification = verifySettingsIndexingDiagnosticsEvidence(
        result.diagnostics?.sources ?? [],
        {
          sourceId: options.sourceId,
          requiredAuditFields: options.runMaintenanceAction
            ? MAINTENANCE_REQUIRED_AUDIT_FIELDS
            : DEFAULT_REQUIRED_AUDIT_FIELDS
        }
      )
      if (attachOnly) {
        applySettingsIndexingDiagnosticsEnvelopeGate(
          result.verification,
          result as unknown as Record<string, unknown>,
          {
            requireReadOnlyEnvelope: true,
            requireNaturalRecentTaskEvidence: true
          }
        )
      }
      const targetRecentTaskJobIds = resolveExpectedRecentTasks(
        result.diagnostics,
        options.sourceId,
        result.verification.options.minRecentTasks
      ).map((task) => task.jobId)
      await writeFile(artifactPaths.diagnostics, JSON.stringify(result.diagnostics, null, 2))
      await writeFile(artifactPaths.verification, JSON.stringify(result.verification, null, 2))

      await evaluate<boolean>(
        send,
        `(${waitForSourceDiagnosticsExpression(options.sourceId)})()`,
        15_000
      )
      result.settingsDom = await evaluate<IndexingDiagnosticsDomSnapshot>(
        send,
        inspectSettingsDomExpression(options.sourceId)
      )
      await writeFile(artifactPaths.settingsDom, JSON.stringify(result.settingsDom, null, 2))
      await captureScreenshot(send, artifactPaths.settingsScreenshot)

      const openResult = await evaluate<{
        opened: boolean
        animationStable: boolean
        reason?: string
        text?: string
      }>(send, `(${clickSourceDetailExpression(options.sourceId)})()`, 15_000)
      if (!openResult.opened) {
        result.failures.push(openResult.reason || 'source diagnostic detail did not open')
      }
      result.detailDom = await evaluate<IndexingDiagnosticsDomSnapshot>(
        send,
        inspectSettingsDomExpression(
          options.sourceId,
          targetRecentTaskJobIds,
          openResult.animationStable
        )
      )
      await writeFile(artifactPaths.detailDom, JSON.stringify(result.detailDom, null, 2))
      await captureScreenshot(send, artifactPaths.detailScreenshot)
    })

    result.failures.push(
      ...buildProbeFailures({
        sourceId: options.sourceId,
        diagnostics: result.diagnostics,
        verification: result.verification,
        settingsDom: result.settingsDom,
        detailDom: result.detailDom,
        settingsScreenshotPath: result.artifactPaths.settingsScreenshot,
        detailScreenshotPath: result.artifactPaths.detailScreenshot,
        fixtureRoot: options.fixtureRoot
          ? resolveCoreAppPath(options.fixtureRoot)
          : path.resolve(options.userDataDir, 'home')
      })
    )
    result.ok = result.failures.length === 0
    return result
  } finally {
    await terminateProcessAndWait(child)
    if (!attachOnly && !options.keepUserData) {
      await sleep(500)
      await rm(options.userDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const result = await runProbe(options)
  const artifactPaths = buildArtifactPaths(options)
  await writeFile(artifactPaths.output, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
