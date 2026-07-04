#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { IndexedSourceDiagnosticsSnapshot } from '@talex-touch/utils/search'
import packageJson from '../package.json'
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
  hasSourceDiagnosticsGroup: boolean
  sourceRows: Array<{
    title: string
    description: string
    hasDetailAction: boolean
  }>
  dialog: {
    visible: boolean
    title: string
    text: string
    sections: string[]
    recentTaskText: string
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
  const sourceTitles: Record<string, string[]> = {
    'file-provider': ['File Index', '文件索引'],
    'app-provider': ['Applications', 'Application Index', '应用索引'],
    everything: ['Everything']
  }
  const expectedTitles = sourceTitles[sourceId] || [sourceId]
  return rows
    .filter((row) => row.hasDetailAction)
    .filter((row) => expectedTitles.some((title) => row.text.includes(title)))
    .sort((left, right) => left.text.length - right.text.length)[0]?.text
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
  await mkdir(configDir, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({
      beginner: {
        init: true
      },
      dev: {
        advancedSettings: true
      }
    })
  )
  if (options.fixtureRoot) {
    await prepareFixtureRoot(resolveCoreAppPath(options.fixtureRoot))
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
    hasIpcInvoke: Boolean(window.electron?.ipcRenderer?.invoke),
    hasSettingsShell: Boolean(document.querySelector('.AppSettings-Container')),
    text: document.body?.innerText?.slice(0, 1000) || ''
  }))()`
}

function openFileIndexSettingsExpression(): string {
  return `async () => {
    if (window.__VUE_ROUTER__?.push) {
      await window.__VUE_ROUTER__.push({ path: '/setting', query: { section: 'file-index' } })
    } else {
      location.hash = '#/setting?section=file-index'
    }
    await new Promise((resolve) => setTimeout(resolve, 2400))
    document.querySelector('[data-settings-section="file-index"]')?.scrollIntoView({ block: 'start' })
    await new Promise((resolve) => setTimeout(resolve, 700))
    return {
      href: location.href,
      text: document.body?.innerText?.slice(0, 2000) || ''
    }
  }`
}

function loadDiagnosticsExpression(sourceId: string): string {
  return `async () => {
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    if (!invoke) throw new Error('window.electron.ipcRenderer.invoke is unavailable')
    const invokeWithTimeout = (payload, timeoutMs = 12000) =>
      Promise.race([
        invoke(${JSON.stringify(INDEXED_SOURCE_DIAGNOSTICS_EVENT)}, payload),
        new Promise((resolve) => setTimeout(() => resolve({ sources: [], summary: { total: 0 }, timeout: true }), timeoutMs))
      ])
    const allDiagnostics = await invokeWithTimeout(undefined)
    const sourceDiagnostics = await invokeWithTimeout({ sourceId: ${JSON.stringify(sourceId)} })
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
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    if (!invoke) throw new Error('window.electron.ipcRenderer.invoke is unavailable')
    return await Promise.race([
      invoke(${JSON.stringify(eventName)}, ${JSON.stringify(payload)}),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 45000))
    ])
  }`
}

function clickSourceDetailExpression(sourceId: string): string {
  return `async () => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const sourceId = ${JSON.stringify(sourceId)}
    const sourceTitles = {
      'file-provider': ['File Index', '文件索引'],
      'app-provider': ['Applications', 'Application Index', '应用索引'],
      'everything': ['Everything']
    }
    const expectedTitles = sourceTitles[sourceId] || [sourceId]
    const isDetailButton = (button) => {
      const text = textOf(button)
      return text.includes('Details') || text.includes('详情')
    }
    const scoreRow = (element) => {
      const text = textOf(element)
      const hasTitle = expectedTitles.some((title) => text.includes(title))
      const detailButtons = Array.from(element.querySelectorAll('button')).filter(isDetailButton)
      if (!hasTitle || detailButtons.length === 0) return null
      return { element, text, detailButton: detailButtons[0], score: text.length }
    }
    const group = Array.from(document.querySelectorAll('.tuff-group-block, [class*="TuffGroupBlock"], section, div')).find((element) => {
      const text = textOf(element)
      return text.includes('Search Source Diagnostics') || text.includes('搜索源诊断')
    })
    const candidates = Array.from((group || document).querySelectorAll('.tuff-block-slot, [class*="TuffBlock"], li, article, [role="listitem"], div'))
      .map(scoreRow)
      .filter(Boolean)
      .sort((left, right) => left.score - right.score)
    const targetRow = candidates[0]
    const targetButton = targetRow?.detailButton || null
    if (!targetButton) {
      return {
        opened: false,
        reason: 'source-detail-button-not-found',
        expectedTitles,
        candidates: Array.from((group || document).querySelectorAll('button'))
          .map((button) => textOf(button))
          .filter(Boolean)
          .slice(0, 20),
        text: document.body?.innerText?.slice(0, 2500) || ''
      }
    }
    targetButton.click()
    await new Promise((resolve) => setTimeout(resolve, 1600))
    return {
      opened: Boolean(document.querySelector('.source-diagnostic-dialog')),
      targetText: targetRow?.text?.slice(0, 500) || '',
      text: document.body?.innerText?.slice(0, 2500) || ''
    }
  }`
}

function inspectSettingsDomExpression(): string {
  return `(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const bodyText = document.body?.innerText || ''
    const sourceRows = Array.from(document.querySelectorAll('button'))
      .filter((button) => {
        const text = textOf(button)
        return text.includes('Details') || text.includes('详情')
      })
      .map((button) => {
        const row = button.closest('.tuff-block-slot, [class*="TuffBlock"], div')
        const title = textOf(row?.querySelector('strong, .title, [class*="title"]')) || textOf(row).slice(0, 120)
        return {
          title,
          description: textOf(row).slice(0, 500),
          hasDetailAction: true
        }
      })
      .slice(0, 12)
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
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: bodyText.slice(0, 5000),
      hasSettingsShell: Boolean(document.querySelector('.AppSettings-Container')) || bodyText.includes('设置') || bodyText.includes('Settings'),
      hasSourceDiagnosticsGroup: bodyText.includes('Search Source Diagnostics') || bodyText.includes('搜索源诊断'),
      sourceRows,
      dialog: {
        visible: Boolean(dialog),
        title: textOf(document.querySelector('.source-diagnostic-dialog')?.parentElement?.querySelector('[class*="title"], strong')),
        text: dialogText.slice(0, 5000),
        sections,
        recentTaskText: recentTaskText.slice(0, 1500),
        hasRecentTasks: recentTaskText.includes('Recent') || recentTaskText.includes('最近')
      }
    }
  })()`
}

export function selectSettingsTarget(
  snapshots: Array<{
    target: DevToolsTarget
    snapshot: { hasRouter: boolean; hasIpcInvoke: boolean; hasSettingsShell: boolean; text: string }
  }>
): DevToolsTarget | undefined {
  return snapshots.find((entry) => {
    return (
      entry.target.type === 'page' &&
      Boolean(entry.target.webSocketDebuggerUrl) &&
      entry.snapshot.hasRouter &&
      entry.snapshot.hasIpcInvoke &&
      (entry.snapshot.hasSettingsShell ||
        entry.snapshot.text.includes('应用设置') ||
        entry.snapshot.text.includes('App Settings'))
    )
  })?.target
}

async function pickInteractiveSettingsTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
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
        hasIpcInvoke: boolean
        hasSettingsShell: boolean
        text: string
      }
    }> = []
    for (const target of pageTargets) {
      try {
        const snapshot = await withTarget(target, (send) =>
          evaluate<{
            hasRouter: boolean
            hasIpcInvoke: boolean
            hasSettingsShell: boolean
            text: string
          }>(send, inspectTargetExpression(), 5000)
        )
        snapshots.push({ target, snapshot })
      } catch {
        // Skip renderer targets that are still booting or not interactive.
      }
    }

    const selected = selectSettingsTarget(snapshots)
    if (selected) return { target: selected, targets: latestTargets }
    await sleep(750)
  }

  return { target: undefined, targets: latestTargets }
}

export function buildPackagedAppLaunchEnv(
  options: Pick<CliOptions, 'userDataDir' | 'fixtureRoot'>
): NodeJS.ProcessEnv {
  const fixtureRoot = options.fixtureRoot ? resolveCoreAppPath(options.fixtureRoot) : undefined
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
    TUFF_STARTUP_BENCHMARK_ONCE: '1',
    TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '120000',
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir,
    ...(fixtureRoot
      ? {
          HOME: fixtureRoot,
          TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: fixtureRoot
        }
      : {})
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

function sourceHasRecentTask(diagnostics: IndexedSourceDiagnosticsSnapshot | undefined): boolean {
  return Boolean(diagnostics?.sources?.some((source) => (source.recentTasks?.length ?? 0) > 0))
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
  if (!sourceHasRecentTask(input.diagnostics)) {
    failures.push('Diagnostics did not include recent task history.')
  }
  if (!input.verification?.gate.passed) {
    failures.push(
      `Settings diagnostics verifier failed: ${input.verification?.gate.failures.join('; ') || 'missing verification'}`
    )
  }
  if (!input.settingsDom?.hasSourceDiagnosticsGroup) {
    failures.push('Settings source diagnostics group is not visible.')
  }
  if (!input.detailDom?.dialog.visible) {
    failures.push('Source diagnostic detail dialog is not visible.')
  }
  if (!input.detailDom?.dialog.hasRecentTasks) {
    failures.push('Source diagnostic detail dialog does not show recent task chips.')
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
  if (options.fixtureRoot) {
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
      options.launchTimeoutMs
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
      await writeFile(artifactPaths.diagnostics, JSON.stringify(result.diagnostics, null, 2))
      await writeFile(artifactPaths.verification, JSON.stringify(result.verification, null, 2))

      result.settingsDom = await evaluate<IndexingDiagnosticsDomSnapshot>(
        send,
        inspectSettingsDomExpression()
      )
      await writeFile(artifactPaths.settingsDom, JSON.stringify(result.settingsDom, null, 2))
      await captureScreenshot(send, artifactPaths.settingsScreenshot)

      const openResult = await evaluate<{ opened: boolean; reason?: string; text?: string }>(
        send,
        `(${clickSourceDetailExpression(options.sourceId)})()`,
        15_000
      )
      if (!openResult.opened) {
        result.failures.push(openResult.reason || 'source diagnostic detail did not open')
      }
      result.detailDom = await evaluate<IndexingDiagnosticsDomSnapshot>(
        send,
        inspectSettingsDomExpression()
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
        fixtureRoot: options.fixtureRoot ? resolveCoreAppPath(options.fixtureRoot) : undefined
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
