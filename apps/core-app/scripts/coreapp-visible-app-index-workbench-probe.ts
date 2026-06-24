#!/usr/bin/env tsx
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import packageJson from '../package.json'

type AppIndexLaunchKind = 'path' | 'shortcut' | 'uwp' | 'protocol'
type AppIndexDiagnosticStageKey = 'precise' | 'phrase' | 'prefix' | 'fts' | 'ngram' | 'subsequence'
type SourceKind = 'steam' | 'uwp' | 'shortcut' | 'protocol' | 'appref' | 'path'

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

interface ManagedEntrySeed {
  id: string
  sourceKind: SourceKind
  diagnosticPlan: 'found' | 'not-run' | 'disabled' | 'attention'
  path: string
  displayName: string
  launchKind: AppIndexLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  displayPath?: string
  description?: string
  enabled: boolean
}

interface SqliteSeedResult {
  success: boolean
  dbPath?: string
  seededEntryIds: string[]
  skippedEntryIds: string[]
  error?: string
}

interface AppIndexDomSnapshot {
  href: string
  title: string
  readyState: string
  text: string
  hasManager: boolean
  summary: Record<string, string>
  sourceFilterLabels: string[]
  diagnosticFilterLabels: string[]
  activeFilterLabels: string[]
  entries: Array<{
    title: string
    path: string
    badges: string[]
    diagnosticText: string
  }>
  emptyState: {
    visible: boolean
    title: string
    detail: string
    action: string
  }
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
  artifactPaths: {
    output: string
    summaryScreenshot: string
    summaryDom: string
    filteredEmptyScreenshot: string
    filteredEmptyDom: string
    diagnosticEvidence?: string
  }
  selectedTargetId?: string
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  seedEntries: ManagedEntrySeed[]
  seedResults: unknown[]
  sqliteSeed?: SqliteSeedResult
  diagnostics: Record<string, unknown>
  reindexResults: Record<string, unknown>
  summaryDom?: AppIndexDomSnapshot
  filteredEmptyDom?: AppIndexDomSnapshot
  evidenceChecks: Record<string, boolean>
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

const APP_INDEX_DIAGNOSTIC_STAGE_KEYS: AppIndexDiagnosticStageKey[] = [
  'precise',
  'phrase',
  'prefix',
  'fts',
  'ngram',
  'subsequence'
]

const APP_INDEX_EVENTS = {
  upsertEntry: 'app:app-index:entry.upsert',
  setEntryEnabled: 'app:app-index:entry.set-enabled',
  listEntries: 'app:app-index:entries.list',
  diagnose: 'app:app-index:diagnose',
  reindex: 'app:app-index:reindex'
} as const

const APP_INDEX_PROVIDER_ID = 'app-provider'

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:app-index-workbench-probe -- [options]

Options:
  --appBundle <path>       Packaged .app bundle. Default: dist/mac-arm64/tuff.app.
  --port <number>          CDP port. Default: auto-select from 9481.
  --userDataDir <path>     Isolated userData directory. Default: /tmp/tuff-app-index-workbench-<timestamp>.
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
    userDataDir: `/tmp/tuff-app-index-workbench-${timestamp}`,
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
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid launch timeout: ${argv[i]}`)
      }
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
    output: path.join(outputDir, `app-index-workbench-probe-${options.dateStamp}.json`),
    summaryScreenshot: path.join(outputDir, `app-index-workbench-summary-${options.dateStamp}.png`),
    summaryDom: path.join(outputDir, `app-index-workbench-summary-${options.dateStamp}-dom.json`),
    filteredEmptyScreenshot: path.join(
      outputDir,
      `app-index-workbench-filtered-empty-${options.dateStamp}.png`
    ),
    filteredEmptyDom: path.join(
      outputDir,
      `app-index-workbench-filtered-empty-${options.dateStamp}-dom.json`
    ),
    diagnosticEvidence: path.join(
      outputDir,
      `app-index-workbench-diagnostic-${options.dateStamp}.json`
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

  for (let port = 9481; port < 9581; port += 1) {
    if (await isPortAvailable(port)) return port
  }

  throw new Error('Unable to find an available CDP port in range 9481-9580')
}

function buildSeedEntries(userDataDir: string): ManagedEntrySeed[] {
  const fixtureDir = path.join(userDataDir, 'app-index-workbench-fixtures')
  const shortcutPath = path.join(fixtureDir, 'Tuff Evidence Shortcut.lnk')
  const shortcutTarget = path.join(fixtureDir, 'Tuff Evidence Shortcut Target')
  const appRefPath = path.join(fixtureDir, 'Tuff Evidence ClickOnce.appref-ms')
  const pathEntry = path.join(fixtureDir, 'Tuff Evidence PathApp')

  return [
    {
      id: 'uwp-found',
      sourceKind: 'uwp',
      diagnosticPlan: 'found',
      path: 'shell:AppsFolder\\TuffEvidence.Uwp!App',
      displayName: 'Tuff Evidence UWP',
      launchKind: 'uwp',
      launchTarget: 'shell:AppsFolder\\TuffEvidence.Uwp!App',
      displayPath: 'Windows Store',
      description: 'Visible evidence UWP sample',
      enabled: true
    },
    {
      id: 'steam-not-run',
      sourceKind: 'steam',
      diagnosticPlan: 'not-run',
      path: 'steam://rungameid/424242',
      displayName: 'Tuff Evidence Steam',
      launchKind: 'protocol',
      launchTarget: 'steam://rungameid/424242',
      displayPath: 'Steam app manifests',
      description: 'Visible evidence Steam sample',
      enabled: true
    },
    {
      id: 'shortcut-disabled',
      sourceKind: 'shortcut',
      diagnosticPlan: 'disabled',
      path: shortcutPath,
      displayName: 'Tuff Evidence Shortcut',
      launchKind: 'shortcut',
      launchTarget: shortcutTarget,
      launchArgs: '--from-shortcut',
      workingDirectory: fixtureDir,
      displayPath: 'C:\\Users\\Public\\Desktop\\Tuff Evidence Shortcut.lnk',
      description: 'Visible evidence shortcut sample',
      enabled: false
    },
    {
      id: 'protocol-attention',
      sourceKind: 'protocol',
      diagnosticPlan: 'attention',
      path: 'tuff-evidence://open/protocol-attention',
      displayName: 'Tuff Evidence Protocol',
      launchKind: 'protocol',
      launchTarget: 'tuff-evidence://open/protocol-attention',
      displayPath: 'tuff-evidence://open/protocol-attention',
      description: 'Visible evidence protocol sample',
      enabled: true
    },
    {
      id: 'appref-not-run',
      sourceKind: 'appref',
      diagnosticPlan: 'not-run',
      path: appRefPath,
      displayName: 'Tuff Evidence AppRef',
      launchKind: 'path',
      launchTarget: appRefPath,
      displayPath: 'C:\\Users\\Public\\Desktop\\Tuff Evidence ClickOnce.appref-ms',
      description: 'Visible evidence AppRef sample',
      enabled: true
    },
    {
      id: 'path-not-run',
      sourceKind: 'path',
      diagnosticPlan: 'not-run',
      path: pathEntry,
      displayName: 'Tuff Evidence Path',
      launchKind: 'path',
      launchTarget: pathEntry,
      displayPath: 'C:\\Program Files\\Tuff Evidence\\PathApp.exe',
      description: 'Visible evidence path sample',
      enabled: true
    }
  ]
}

async function prepareFixtureFiles(seedEntries: ManagedEntrySeed[]): Promise<void> {
  const filePaths = new Set<string>()
  for (const entry of seedEntries) {
    if (path.isAbsolute(entry.path)) filePaths.add(entry.path)
    if (path.isAbsolute(entry.launchTarget)) filePaths.add(entry.launchTarget)
  }
  for (const filePath of filePaths) {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, `app-index-workbench fixture for ${path.basename(filePath)}\n`)
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

async function findSqliteDatabasePath(userDataDir: string): Promise<string | null> {
  const candidates = [
    path.join(userDataDir, 'tuff', 'modules', 'database', 'database.db'),
    path.join(userDataDir, 'database.db')
  ]
  const { access } = await import('node:fs/promises')
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next known profile layout.
    }
  }
  return null
}

function sqliteString(value: string | null | undefined): string {
  if (!value) return 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}

function buildSqliteFallbackScript(seedEntries: ManagedEntrySeed[]): string {
  const now = Date.now()
  const extensionKeys = [
    'appIdentity',
    'launchKind',
    'launchTarget',
    'launchArgs',
    'workingDirectory',
    'displayPath',
    'description',
    'alternateNames',
    'identityKind',
    'displayNameSource',
    'displayNameQuality',
    'entrySource',
    'entryEnabled',
    'bundleId',
    'icon'
  ]
  const statements: string[] = ['PRAGMA busy_timeout = 5000;', 'BEGIN IMMEDIATE;']

  for (const entry of seedEntries) {
    const name =
      path.basename(
        entry.displayPath || entry.path,
        path.extname(entry.displayPath || entry.path)
      ) || entry.displayName
    const extension = path.extname(entry.displayPath || entry.path)
    const appIdentity = `app-index-workbench:${entry.id}`
    const alternateNames = JSON.stringify([entry.displayName, entry.sourceKind, entry.id])
    const extensions: Record<string, string | undefined> = {
      appIdentity,
      launchKind: entry.launchKind,
      launchTarget: entry.launchTarget,
      launchArgs: entry.launchArgs,
      workingDirectory: entry.workingDirectory,
      displayPath: entry.displayPath,
      description: entry.description,
      alternateNames,
      identityKind:
        entry.sourceKind === 'uwp' ? 'uwp' : entry.sourceKind === 'protocol' ? 'protocol' : 'path',
      displayNameSource: 'manual',
      displayNameQuality: 'manifest',
      entrySource: 'manual',
      entryEnabled: entry.enabled ? '1' : '0',
      bundleId: `com.tuff.visible.${entry.id}`,
      icon: 'visible-fixture-icon'
    }
    const keywords = [
      entry.displayName,
      entry.displayName.toLowerCase(),
      ...entry.displayName.toLowerCase().split(/\s+/).filter(Boolean),
      entry.path,
      entry.launchTarget,
      appIdentity,
      entry.id,
      entry.sourceKind
    ]

    statements.push(
      `INSERT INTO files (path, name, display_name, extension, size, mtime, ctime, last_indexed_at, is_dir, type, content, embedding_status)
       VALUES (${sqliteString(entry.path)}, ${sqliteString(name)}, ${sqliteString(entry.displayName)}, ${sqliteString(extension)}, 0, ${now}, ${now}, 0, 0, 'app', NULL, 'none')
       ON CONFLICT(path) DO UPDATE SET name = excluded.name, display_name = excluded.display_name, extension = excluded.extension, mtime = excluded.mtime, ctime = excluded.ctime, type = 'app';`
    )

    statements.push(
      `DELETE FROM file_extensions WHERE file_id = (SELECT id FROM files WHERE path = ${sqliteString(entry.path)}) AND key IN (${extensionKeys.map(sqliteString).join(', ')});`
    )
    for (const [key, value] of Object.entries(extensions)) {
      if (!value) continue
      statements.push(
        `INSERT OR REPLACE INTO file_extensions (file_id, key, value)
         VALUES ((SELECT id FROM files WHERE path = ${sqliteString(entry.path)}), ${sqliteString(key)}, ${sqliteString(value)});`
      )
    }

    statements.push(
      `DELETE FROM keyword_mappings WHERE provider_id = ${sqliteString(APP_INDEX_PROVIDER_ID)} AND item_id IN (${[
        appIdentity,
        entry.path,
        entry.launchTarget
      ]
        .map(sqliteString)
        .join(', ')});`
    )
    for (const keyword of Array.from(new Set(keywords.filter(Boolean)))) {
      statements.push(
        `INSERT INTO keyword_mappings (keyword, item_id, provider_id, priority)
         VALUES (${sqliteString(keyword)}, ${sqliteString(appIdentity)}, ${sqliteString(APP_INDEX_PROVIDER_ID)}, 1.5);`
      )
    }
  }

  statements.push('COMMIT;')
  return statements.join('\n')
}

async function seedEntriesWithSqliteFallback(
  userDataDir: string,
  seedEntries: ManagedEntrySeed[],
  seedResults: unknown[]
): Promise<SqliteSeedResult> {
  const failedSeedIds = new Set(
    seedResults
      .filter((value): value is { id: string; result?: { success?: boolean } } => {
        return Boolean(
          value &&
          typeof value === 'object' &&
          typeof (value as { id?: unknown }).id === 'string' &&
          (value as { result?: { success?: boolean } }).result?.success !== true
        )
      })
      .map((value) => value.id)
  )
  const entriesToSeed = seedEntries.filter((entry) => failedSeedIds.has(entry.id))
  if (entriesToSeed.length === 0) {
    return {
      success: true,
      seededEntryIds: [],
      skippedEntryIds: seedEntries.map((entry) => entry.id)
    }
  }

  const dbPath = await findSqliteDatabasePath(userDataDir)
  if (!dbPath) {
    return {
      success: false,
      seededEntryIds: [],
      skippedEntryIds: seedEntries
        .filter((entry) => !failedSeedIds.has(entry.id))
        .map((entry) => entry.id),
      error: 'database-not-found'
    }
  }

  const sqlite = spawn('/usr/bin/sqlite3', [dbPath], { stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  sqlite.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })
  sqlite.stdin?.end(buildSqliteFallbackScript(entriesToSeed))
  const code = await new Promise<number | null>((resolve) => {
    sqlite.once('exit', (exitCode) => resolve(exitCode))
  })

  return {
    success: code === 0,
    dbPath,
    seededEntryIds: code === 0 ? entriesToSeed.map((entry) => entry.id) : [],
    skippedEntryIds: seedEntries
      .filter((entry) => !failedSeedIds.has(entry.id))
      .map((entry) => entry.id),
    error: code === 0 ? undefined : stderr.trim() || `sqlite3 exited with ${code}`
  }
}

function waitForAppIndexReadyExpression(timeoutMs = 18_000): string {
  return `async () => {
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    if (!invoke) throw new Error('window.electron.ipcRenderer.invoke is unavailable')
    const invokeWithTimeout = (eventName, payload, timeoutMs = 2500) =>
      Promise.race([
        invoke(eventName, payload),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, status: 'timeout', reason: 'ipc-timeout' }), timeoutMs))
      ])
    const startedAt = Date.now()
    let lastResult = null
    while (Date.now() - startedAt < ${timeoutMs}) {
      try {
        const listedEntries = await invokeWithTimeout(${JSON.stringify(APP_INDEX_EVENTS.listEntries)})
        lastResult = { ready: true, listedEntries }
        return lastResult
      } catch (error) {
        lastResult = {
          ready: false,
          reason: error instanceof Error ? error.message : String(error)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
    return lastResult || { ready: false, reason: 'timeout' }
  }`
}

function buildSeedExpression(seedEntries: ManagedEntrySeed[]): string {
  return `async () => {
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    if (!invoke) throw new Error('window.electron.ipcRenderer.invoke is unavailable')
    const entries = ${JSON.stringify(seedEntries)}
    const results = []
    const diagnostics = {}
    const reindexResults = {}
    const invokeWithTimeout = (eventName, payload, timeoutMs = 2500) =>
      Promise.race([
        invoke(eventName, payload),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, status: 'timeout', reason: 'ipc-timeout' }), timeoutMs))
      ])
    const invokeWithRetry = async (eventName, payload, accepts) => {
      let lastResult = null
      for (let attempt = 0; attempt < 10; attempt += 1) {
        lastResult = await invokeWithTimeout(eventName, payload)
        if (accepts(lastResult)) return lastResult
        if (lastResult?.reason !== 'db-not-ready' && lastResult?.error !== 'db-not-ready') {
          return lastResult
        }
        await new Promise((resolve) => setTimeout(resolve, 750))
      }
      return lastResult
    }
    for (const entry of entries) {
      const payload = {
        path: entry.path,
        displayName: entry.displayName,
        launchKind: entry.launchKind,
        launchTarget: entry.launchTarget,
        launchArgs: entry.launchArgs,
        workingDirectory: entry.workingDirectory,
        displayPath: entry.displayPath,
        description: entry.description,
        enabled: entry.enabled
      }
      const result = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.upsertEntry)},
        payload,
        (value) => value?.success === true
      )
      results.push({ id: entry.id, result })
    }

    const foundEntry = entries.find((entry) => entry.diagnosticPlan === 'found')
    if (foundEntry) {
      reindexResults[foundEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.reindex)},
        {
          target: foundEntry.path,
          mode: 'keywords',
          force: true
        },
        (value) => value?.success === true
      )
      diagnostics[foundEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        {
          target: foundEntry.path,
          query: foundEntry.displayName
        },
        (value) => value?.success === true
      )
    }

    const attentionEntry = entries.find((entry) => entry.diagnosticPlan === 'attention')
    if (attentionEntry) {
      diagnostics[attentionEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        {
          target: attentionEntry.path,
          query: 'definitely missing app index evidence query'
        },
        (value) => value?.status !== 'error'
      )
    }

    const disabledEntry = entries.find((entry) => entry.diagnosticPlan === 'disabled')
    if (disabledEntry) {
      diagnostics[disabledEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        {
          target: disabledEntry.path,
          query: disabledEntry.displayName
        },
        (value) => value?.status !== 'error'
      )
    }

    return {
      results,
      diagnostics,
      reindexResults,
      listedEntries: await invokeWithTimeout(${JSON.stringify(APP_INDEX_EVENTS.listEntries)})
    }
  }`
}

function buildDiagnosticRefreshExpression(seedEntries: ManagedEntrySeed[]): string {
  return `async () => {
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    if (!invoke) throw new Error('window.electron.ipcRenderer.invoke is unavailable')
    const entries = ${JSON.stringify(seedEntries)}
    const diagnostics = {}
    const reindexResults = {}
    const invokeWithTimeout = (eventName, payload, timeoutMs = 3500) =>
      Promise.race([
        invoke(eventName, payload),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, status: 'timeout', reason: 'ipc-timeout' }), timeoutMs))
      ])
    const invokeWithRetry = async (eventName, payload, accepts) => {
      let lastResult = null
      for (let attempt = 0; attempt < 10; attempt += 1) {
        lastResult = await invokeWithTimeout(eventName, payload)
        if (accepts(lastResult)) return lastResult
        if (lastResult?.reason !== 'db-not-ready' && lastResult?.error !== 'db-not-ready') {
          return lastResult
        }
        await new Promise((resolve) => setTimeout(resolve, 750))
      }
      return lastResult
    }

    const foundEntry = entries.find((entry) => entry.diagnosticPlan === 'found')
    if (foundEntry) {
      reindexResults[foundEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.reindex)},
        { target: foundEntry.path, mode: 'keywords', force: true },
        (value) => value?.success === true
      )
      diagnostics[foundEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        { target: foundEntry.path, query: foundEntry.displayName },
        (value) => value?.success === true
      )
    }

    const attentionEntry = entries.find((entry) => entry.diagnosticPlan === 'attention')
    if (attentionEntry) {
      diagnostics[attentionEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        { target: attentionEntry.path, query: 'definitely missing app index evidence query' },
        (value) => value?.status !== 'error'
      )
    }

    const disabledEntry = entries.find((entry) => entry.diagnosticPlan === 'disabled')
    if (disabledEntry) {
      diagnostics[disabledEntry.id] = await invokeWithRetry(
        ${JSON.stringify(APP_INDEX_EVENTS.diagnose)},
        { target: disabledEntry.path, query: disabledEntry.displayName },
        (value) => value?.status !== 'error'
      )
    }

    return {
      diagnostics,
      reindexResults,
      listedEntries: await invokeWithTimeout(${JSON.stringify(APP_INDEX_EVENTS.listEntries)})
    }
  }`
}

function openManagerExpression(): string {
  return `async () => {
    if (window.__VUE_ROUTER__?.push) {
      await window.__VUE_ROUTER__.push({ path: '/setting', query: { section: 'file-index' } })
    } else {
      location.hash = '#/setting?section=file-index'
    }
    await new Promise((resolve) => setTimeout(resolve, 2200))
    document.querySelector('[data-settings-section="file-index"]')?.scrollIntoView({ block: 'start' })
    await new Promise((resolve) => setTimeout(resolve, 600))
    const buttons = Array.from(document.querySelectorAll('button'))
    const managerButton = buttons.find((button) => {
      const text = (button.textContent || '').trim()
      return text.includes('Open Manager') || text.includes('打开管理')
    })
    if (!managerButton) {
      return { opened: false, reason: 'manager-button-not-found', text: document.body?.innerText?.slice(0, 2000) || '' }
    }
    managerButton.click()
    await new Promise((resolve) => setTimeout(resolve, 1800))
    return {
      opened: Boolean(document.querySelector('.app-index-manager')),
      text: document.body?.innerText?.slice(0, 2000) || ''
    }
  }`
}

function diagnoseManagerEntryExpression(entryId: string, timeoutMs = 12_000): string {
  return `async () => {
    const entries = ${JSON.stringify(buildSeedEntries('__USER_DATA_PLACEHOLDER__'))}
    const targetEntry = entries.find((entry) => entry.id === ${JSON.stringify(entryId)})
    const targetTitle = targetEntry?.displayName || ${JSON.stringify(entryId)}
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    let row = null
    const startedAt = Date.now()
    while (Date.now() - startedAt < ${timeoutMs}) {
      row = Array.from(document.querySelectorAll('.app-index-entry')).find((entry) => {
        const title = textOf(entry.querySelector('.app-index-entry-title-row strong'))
        return title === targetTitle
      })
      if (row) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!row) {
      return { diagnosed: false, reason: 'entry-row-not-found', targetTitle }
    }
    const buttons = Array.from(row.querySelectorAll('button'))
    const diagnoseButton = buttons.find((button) => {
      const text = textOf(button)
      return text === 'Diagnose' || text === '诊断' || text === '运行诊断'
    })
    if (!diagnoseButton) {
      return {
        diagnosed: false,
        reason: 'diagnose-button-not-found',
        targetTitle,
        buttonTexts: buttons.map(textOf)
      }
    }
    diagnoseButton.click()
    const diagnosticStartedAt = Date.now()
    while (Date.now() - diagnosticStartedAt < ${timeoutMs}) {
      const summary = textOf(row.querySelector('.app-index-entry-diagnostic-summary'))
      if (
        summary.includes('Found') ||
        summary.includes('已命中')
      ) {
        return { diagnosed: true, targetTitle, summary }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return {
      diagnosed: false,
      reason: 'diagnostic-summary-timeout',
      targetTitle,
      summary: textOf(row.querySelector('.app-index-entry-diagnostic-summary'))
    }
  }`
}

function inspectManagerExpression(): string {
  return `(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const manager = document.querySelector('.app-index-manager')
    const summary = {}
    document.querySelectorAll('.app-index-manager-summary-item').forEach((item) => {
      const label = textOf(item.querySelector('span'))
      const value = textOf(item.querySelector('strong'))
      if (label) summary[label] = value
    })
    const sourceGroup = Array.from(document.querySelectorAll('.app-index-manager-filter-group')).find((group) => textOf(group).includes('Source') || textOf(group).includes('来源'))
    const diagnosticGroup = Array.from(document.querySelectorAll('.app-index-manager-filter-group')).find((group) => textOf(group).includes('Diagnostic') || textOf(group).includes('诊断'))
    const readLabels = (root) => root ? Array.from(root.querySelectorAll('button')).map(textOf).filter(Boolean) : []
    const entries = Array.from(document.querySelectorAll('.app-index-entry')).map((entry) => ({
      title: textOf(entry.querySelector('.app-index-entry-title-row strong')),
      path: textOf(entry.querySelector('.app-index-entry-path')),
      badges: Array.from(entry.querySelectorAll('.app-index-entry-title-row span')).map(textOf).filter(Boolean),
      diagnosticText: textOf(entry.querySelector('.app-index-entry-diagnostic-summary'))
    }))
    const empty = document.querySelector('.app-index-manager-empty')
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: document.body?.innerText?.slice(0, 5000) || '',
      hasManager: Boolean(manager),
      summary,
      sourceFilterLabels: readLabels(sourceGroup),
      diagnosticFilterLabels: readLabels(diagnosticGroup),
      activeFilterLabels: Array.from(document.querySelectorAll('.app-index-manager-filter-chip.is-active')).map(textOf).filter(Boolean),
      entries,
      emptyState: {
        visible: Boolean(empty),
        title: textOf(empty?.querySelector('strong')),
        detail: textOf(empty?.querySelector('span')),
        action: textOf(empty?.querySelector('button'))
      }
    }
  })()`
}

function applyFilteredEmptyExpression(): string {
  return `async () => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const chips = Array.from(document.querySelectorAll('.app-index-manager-filter-chip'))
    const steam = chips.find((chip) => textOf(chip) === 'Steam')
    const disabled = chips.find((chip) => {
      const text = textOf(chip)
      return text === 'Disabled' || text === '已禁用'
    })
    steam?.click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    disabled?.click()
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      clickedSteam: Boolean(steam),
      clickedDisabled: Boolean(disabled),
      text: document.body?.innerText?.slice(0, 2000) || ''
    }
  }`
}

function pickSettingsTarget(targets: DevToolsTarget[]): DevToolsTarget | undefined {
  return targets.find(
    (target) =>
      target.type === 'page' &&
      Boolean(target.webSocketDebuggerUrl) &&
      (target.url.includes('#/setting') || target.url.includes('/renderer/index.html'))
  )
}

interface TargetProbeSnapshot {
  href: string
  readyState: string
  hasRouter: boolean
  hasIpcInvoke: boolean
  hasSettingsShell: boolean
  text: string
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

    for (const target of pageTargets) {
      try {
        const snapshot = await withTarget(target, (send) =>
          evaluate<TargetProbeSnapshot>(send, inspectTargetExpression(), 5000)
        )
        if (
          snapshot.hasRouter &&
          snapshot.hasIpcInvoke &&
          (snapshot.hasSettingsShell ||
            snapshot.text.includes('应用设置') ||
            snapshot.text.includes('App Settings'))
        ) {
          return { target, targets: latestTargets }
        }
      } catch {
        // Skip renderer targets that are still booting or not interactive.
      }
    }

    await sleep(750)
  }

  return {
    target: pickSettingsTarget(latestTargets),
    targets: latestTargets
  }
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
  summaryDom?: AppIndexDomSnapshot,
  filteredDom?: AppIndexDomSnapshot
) {
  const sourceText = (summaryDom?.sourceFilterLabels ?? []).join(' | ').toLowerCase()
  const diagnosticText = (summaryDom?.diagnosticFilterLabels ?? []).join(' | ').toLowerCase()
  const entryText =
    `${summaryDom?.text ?? ''} ${JSON.stringify(summaryDom?.summary ?? {})}`.toLowerCase()
  const filteredText =
    `${filteredDom?.emptyState.title ?? ''} ${filteredDom?.emptyState.detail ?? ''}`.toLowerCase()

  return {
    summaryCountsVisible:
      Boolean(summaryDom?.summary) &&
      Object.keys(summaryDom?.summary ?? {}).length >= 5 &&
      /total|entries|总|条目/.test(entryText),
    sourceFiltersVisible:
      sourceText.includes('uwp') &&
      sourceText.includes('steam') &&
      (sourceText.includes('shortcut') || sourceText.includes('快捷方式')) &&
      (sourceText.includes('protocol') || sourceText.includes('协议')) &&
      sourceText.includes('appref') &&
      (sourceText.includes('path') || sourceText.includes('路径')),
    diagnosticFiltersVisible:
      (diagnosticText.includes('attention') ||
        diagnosticText.includes('需要处理') ||
        diagnosticText.includes('注意') ||
        diagnosticText.includes('排查')) &&
      (diagnosticText.includes('found') ||
        diagnosticText.includes('已找到') ||
        diagnosticText.includes('已命中')) &&
      (diagnosticText.includes('not checked') ||
        diagnosticText.includes('未检查') ||
        diagnosticText.includes('未诊断')) &&
      (diagnosticText.includes('disabled') || diagnosticText.includes('禁用')),
    filteredEmptyVisible:
      filteredDom?.emptyState.visible === true &&
      (filteredText.includes('no entries match') ||
        filteredText.includes('no entries') ||
        filteredText.includes('没有') ||
        filteredText.includes('无')) &&
      !filteredText.includes('start managing search recall')
  }
}

function summarizeDiagnosticStage(stage: unknown) {
  const value = stage && typeof stage === 'object' ? (stage as Record<string, unknown>) : {}
  const matches = Array.isArray(value.matches) ? value.matches : []
  return {
    ran: value.ran === true,
    targetHit: value.targetHit === true,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    matchCount: matches.length,
    matches
  }
}

function buildDiagnosticEvidence(
  seedEntries: ManagedEntrySeed[],
  diagnostics: Record<string, unknown>,
  reindexResults: Record<string, unknown>
) {
  const foundEntry = seedEntries.find((entry) => entry.diagnosticPlan === 'found')
  if (!foundEntry) return null
  const diagnosis = diagnostics[foundEntry.id] as Record<string, unknown> | undefined
  if (!diagnosis || typeof diagnosis !== 'object') return null
  const query = diagnosis.query as { stages?: Record<string, unknown> } | undefined
  const stages = query?.stages
    ? APP_INDEX_DIAGNOSTIC_STAGE_KEYS.reduce(
        (result, stageKey) => {
          result[stageKey] = summarizeDiagnosticStage(query.stages?.[stageKey])
          return result
        },
        {} as Record<AppIndexDiagnosticStageKey, ReturnType<typeof summarizeDiagnosticStage>>
      )
    : undefined
  const matchedStages = stages
    ? APP_INDEX_DIAGNOSTIC_STAGE_KEYS.filter((stageKey) => stages[stageKey]?.targetHit)
    : []
  const app = diagnosis.app as Record<string, unknown> | undefined
  const reindex = reindexResults[foundEntry.id] as Record<string, unknown> | undefined

  return {
    schemaVersion: 1,
    kind: 'app-index-diagnostic-evidence',
    createdAt: new Date().toISOString(),
    input: {
      target: foundEntry.path,
      query: foundEntry.displayName
    },
    diagnosis: {
      success: diagnosis.success === true,
      status: diagnosis.status,
      target: diagnosis.target,
      reason: diagnosis.reason,
      matchedStages
    },
    app: diagnosis.app,
    index: diagnosis.index,
    query: diagnosis.query,
    stages,
    reindex,
    manualRegression: {
      reusableCaseIds: ['app-index-workbench-managed-ui'],
      suggestedEvidenceFields: {
        target: foundEntry.path,
        query: foundEntry.displayName,
        launchKind: app?.launchKind,
        launchTarget: app?.launchTarget,
        launchArgs: app?.launchArgs,
        workingDirectory: app?.workingDirectory,
        bundleOrIdentity: app?.bundleId || app?.appIdentity,
        displayNameStatus: app?.displayNameStatus,
        iconPresent: app?.iconPresent,
        matchedStages,
        reindexStatus: reindex?.status
      }
    }
  }
}

async function runProbe(options: CliOptions): Promise<ProbeResult> {
  const appBundle = resolveCoreAppPath(options.appBundle)
  const executablePath = resolveExecutablePath(appBundle)
  const outputDir = resolveCoreAppPath(options.outputDir)
  const artifactPaths = buildArtifactPaths(options)
  const selectedCdpPort = await resolveCdpPort(options.cdpPort)
  const remoteDebuggingUrl = `http://127.0.0.1:${selectedCdpPort}/json/list`
  const seedEntries = buildSeedEntries(options.userDataDir)

  const result: ProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    appBundle,
    executablePath,
    cdpPort: selectedCdpPort,
    remoteDebuggingUrl,
    userDataDir: options.userDataDir,
    artifactPaths: {
      output: toRelativeReportPath(artifactPaths.output, outputDir),
      summaryScreenshot: toRelativeReportPath(artifactPaths.summaryScreenshot, outputDir),
      summaryDom: toRelativeReportPath(artifactPaths.summaryDom, outputDir),
      filteredEmptyScreenshot: toRelativeReportPath(
        artifactPaths.filteredEmptyScreenshot,
        outputDir
      ),
      filteredEmptyDom: toRelativeReportPath(artifactPaths.filteredEmptyDom, outputDir),
      diagnosticEvidence: toRelativeReportPath(artifactPaths.diagnosticEvidence!, outputDir)
    },
    targets: [],
    seedEntries,
    seedResults: [],
    sqliteSeed: undefined,
    diagnostics: {},
    reindexResults: {},
    evidenceChecks: {},
    failures: []
  }

  await mkdir(outputDir, { recursive: true })
  await prepareIsolatedUserData(options)
  await prepareFixtureFiles(seedEntries)

  let child: ChildProcess | null = null
  try {
    child = launchPackagedApp(executablePath, options, selectedCdpPort)
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk)
      if (text.includes('spawn EBADF')) result.failures.push('app scanner logged spawn EBADF')
    })

    await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)
    const targetSelection = await pickInteractiveSettingsTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    const targets = targetSelection.targets
    result.targets = targets.map(({ id, title, type, url }) => ({ id, title, type, url }))
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

      await evaluate(send, `(${waitForAppIndexReadyExpression()})()`, 22_000)

      await evaluate(send, `(${buildSeedExpression(seedEntries)})()`, 110_000).then(
        (seedResult: any) => {
          result.seedResults = seedResult?.results ?? []
          result.diagnostics = seedResult?.diagnostics ?? {}
          result.reindexResults = seedResult?.reindexResults ?? {}
        }
      )

      result.sqliteSeed = await seedEntriesWithSqliteFallback(
        options.userDataDir,
        seedEntries,
        result.seedResults
      )
      if (!result.sqliteSeed.success) {
        result.failures.push(`sqlite fallback seed failed: ${result.sqliteSeed.error || 'unknown'}`)
      } else if (result.sqliteSeed.seededEntryIds.length > 0) {
        const refreshed = await evaluate<{
          diagnostics?: Record<string, unknown>
          reindexResults?: Record<string, unknown>
        }>(send, `(${buildDiagnosticRefreshExpression(seedEntries)})()`, 110_000)
        result.diagnostics = {
          ...result.diagnostics,
          ...(refreshed?.diagnostics ?? {})
        }
        result.reindexResults = {
          ...result.reindexResults,
          ...(refreshed?.reindexResults ?? {})
        }
      }

      const openResult = await evaluate<{ opened: boolean; reason?: string; text?: string }>(
        send,
        `(${openManagerExpression()})()`
      )
      if (!openResult.opened) {
        result.failures.push(openResult.reason || 'app index manager did not open')
      }

      const managerDiagnoseResult = await evaluate<{
        diagnosed: boolean
        reason?: string
        summary?: string
      }>(send, `(${diagnoseManagerEntryExpression('uwp-found')})()`, 20_000)
      if (!managerDiagnoseResult.diagnosed) {
        result.failures.push(
          `manager diagnose did not update found sample: ${
            managerDiagnoseResult.reason || managerDiagnoseResult.summary || 'unknown'
          }`
        )
      }

      result.summaryDom = await evaluate<AppIndexDomSnapshot>(send, inspectManagerExpression())
      await writeFile(artifactPaths.summaryDom, JSON.stringify(result.summaryDom, null, 2))
      await captureScreenshot(send, artifactPaths.summaryScreenshot)

      const filterResult = await evaluate<{ clickedSteam: boolean; clickedDisabled: boolean }>(
        send,
        `(${applyFilteredEmptyExpression()})()`
      )
      if (!filterResult.clickedSteam) result.failures.push('Steam source filter was not clickable')
      if (!filterResult.clickedDisabled)
        result.failures.push('Disabled diagnostic filter was not clickable')

      result.filteredEmptyDom = await evaluate<AppIndexDomSnapshot>(
        send,
        inspectManagerExpression()
      )
      await writeFile(
        artifactPaths.filteredEmptyDom,
        JSON.stringify(result.filteredEmptyDom, null, 2)
      )
      await captureScreenshot(send, artifactPaths.filteredEmptyScreenshot)
    })

    const diagnosticEvidence = buildDiagnosticEvidence(
      seedEntries,
      result.diagnostics,
      result.reindexResults
    )
    if (diagnosticEvidence) {
      await writeFile(
        artifactPaths.diagnosticEvidence!,
        JSON.stringify(diagnosticEvidence, null, 2)
      )
    }

    result.evidenceChecks = evaluateEvidenceChecks(result.summaryDom, result.filteredEmptyDom)
    for (const [key, passed] of Object.entries(result.evidenceChecks)) {
      if (!passed) result.failures.push(`evidence check failed: ${key}`)
    }

    result.ok =
      result.failures.filter((failure) => failure !== 'app scanner logged spawn EBADF').length === 0
    return result
  } finally {
    await terminateProcessAndWait(child)
    if (!options.keepUserData) {
      await sleep(500)
      await rm(options.userDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const result = await runProbe(options)
  const outputDir = resolveCoreAppPath(options.outputDir)
  const artifactPaths = buildArtifactPaths(options)
  await writeFile(artifactPaths.output, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0))
  if (!result.ok) process.exitCode = 1
  void outputDir
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
