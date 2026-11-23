#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreAppRoot = path.resolve(__dirname, '..')
const defaultRepoRoot = path.resolve(coreAppRoot, '..', '..')

export const SCHEMA_VERSION = 'coreapp-energy-baseline-probe/v1'
export const DEFAULT_IDLE_SECONDS = 600
export const DEFAULT_SAMPLE_INTERVAL_MS = 5_000
export const DEFAULT_LAUNCH_TIMEOUT_MS = 90_000
export const DEFAULT_POWERMETRICS_INTERVAL_MS = 5_000
export const DEFAULT_CDP_PORT = 9712
export const DEFAULT_VITE_DEV_PORT = 5173
export const DEFAULT_PROCESS_FILTER = 'tuff|talex'
export const RAW_MAIN_PROCESS_CHANNEL = '@main-process-message'
export const PERFORMANCE_GET_REPORT_EVENT = 'app:performance:get-report'
export const ISOLATED_PROFILE_ROOT_NAMES = ['tuff', 'tuff-dev']
export const ISOLATED_APP_SETTINGS = Object.freeze({
  beginner: Object.freeze({ init: true }),
  dev: Object.freeze({ developerMode: true })
})

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const PROCESS_ROLES = ['Browser', 'GPU', 'Renderer', 'Utility', 'Other']
const STATIC_AUDIT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.vue'])
const STATIC_AUDIT_IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  '.nuxt',
  '.output',
  '.turbo',
  'coverage',
  '.git'
])
const STATIC_AUDIT_PATTERNS = {
  setInterval: /\bsetInterval\s*\(/g,
  powerMonitor: /\bpowerMonitor\b/g,
  requestAnimationFrame: /\brequestAnimationFrame\s*\(/g
}

function defaultPackagedAppPath() {
  if (process.platform === 'darwin') {
    return '/Applications/Tuff.app'
  }
  return path.resolve(coreAppRoot, 'dist', 'tuff')
}

export function resolveExecutablePath(appPath) {
  const resolved = path.resolve(appPath)
  if (resolved.endsWith('.app')) {
    const infoPlistPath = path.join(resolved, 'Contents', 'Info.plist')
    if (existsSync(infoPlistPath)) {
      try {
        const plistContent = readFileSync(infoPlistPath, 'utf8')
        const match = plistContent.match(
          /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/
        )
        if (match?.[1]?.trim()) {
          return path.join(resolved, 'Contents', 'MacOS', match[1].trim())
        }
      } catch {
        // Fall through to conventional executable name
      }
    }
    const bundleBase = path.basename(resolved, '.app')
    const lowerCandidate = path.join(resolved, 'Contents', 'MacOS', bundleBase.toLowerCase())
    if (existsSync(lowerCandidate)) return lowerCandidate
    return path.join(resolved, 'Contents', 'MacOS', bundleBase)
  }
  return resolved
}

function parseStrictNumber(raw, flagName) {
  const trimmed = String(raw).trim()
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new Error(`${flagName} must be a valid number, received: ${raw}`)
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    throw new Error(`${flagName} must be a finite number, received: ${raw}`)
  }
  return value
}

function parseStrictInteger(raw, flagName) {
  const trimmed = String(raw).trim()
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${flagName} must be a valid integer, received: ${raw}`)
  }
  return Number.parseInt(trimmed, 10)
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    staticAudit: false,
    attachOnly: false,
    remoteDebuggingUrl: null,
    appPath: process.env.TUFF_ENERGY_PROBE_APP_PATH || defaultPackagedAppPath(),
    userDataDir: null,
    cdpPort: DEFAULT_CDP_PORT,
    idleSeconds: DEFAULT_IDLE_SECONDS,
    sampleIntervalMs: DEFAULT_SAMPLE_INTERVAL_MS,
    launchTimeoutMs: DEFAULT_LAUNCH_TIMEOUT_MS,
    powermetricsInput: null,
    powermetricsIntervalMs: DEFAULT_POWERMETRICS_INTERVAL_MS,
    activityMonitorEnergyImpact: null,
    outputDir: null,
    repoRoot: defaultRepoRoot,
    processFilter: DEFAULT_PROCESS_FILTER,
    keepUserData: false,
    pretty: true,
    help: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]
    if (!raw.startsWith('-')) continue

    if (raw === '-h' || raw === '--help') {
      options.help = true
      continue
    }

    const eqIndex = raw.indexOf('=')
    const flag = eqIndex >= 0 ? raw.slice(0, eqIndex) : raw
    const inlineValue = eqIndex >= 0 ? raw.slice(eqIndex + 1) : null
    const readValue = () => {
      if (inlineValue !== null) return inlineValue
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`)
      }
      i += 1
      return next
    }

    switch (flag) {
      case '--dryRun':
      case '--dry-run':
        options.dryRun = true
        break
      case '--staticAudit':
      case '--static-audit':
        options.staticAudit = true
        break
      case '--attachOnly':
      case '--attach-only':
        options.attachOnly = true
        break
      case '--remoteDebuggingUrl':
      case '--remote-debugging-url':
        options.remoteDebuggingUrl = readValue()
        break
      case '--appPath':
      case '--app-path':
        options.appPath = readValue()
        break
      case '--userDataDir':
      case '--user-data-dir':
        options.userDataDir = readValue()
        break
      case '--cdpPort':
      case '--cdp-port':
        options.cdpPort = parseStrictInteger(readValue(), flag)
        break
      case '--idleSeconds':
      case '--idle-seconds':
        options.idleSeconds = parseStrictNumber(readValue(), flag)
        break
      case '--sampleIntervalMs':
      case '--sample-interval-ms':
        options.sampleIntervalMs = parseStrictInteger(readValue(), flag)
        break
      case '--launchTimeoutMs':
      case '--launch-timeout-ms':
        options.launchTimeoutMs = parseStrictInteger(readValue(), flag)
        break
      case '--powermetricsInput':
      case '--powermetrics-input':
        options.powermetricsInput = readValue()
        break
      case '--powermetricsIntervalMs':
      case '--powermetrics-interval-ms':
        options.powermetricsIntervalMs = parseStrictInteger(readValue(), flag)
        break
      case '--activityMonitorEnergyImpact':
      case '--activity-monitor-energy-impact':
        options.activityMonitorEnergyImpact = parseStrictNumber(readValue(), flag)
        break
      case '--outputDir':
      case '--output-dir':
        options.outputDir = readValue()
        break
      case '--repoRoot':
      case '--repo-root':
        options.repoRoot = readValue()
        break
      case '--processFilter':
      case '--process-filter':
        options.processFilter = readValue()
        break
      case '--keepUserData':
      case '--keep-user-data':
        options.keepUserData = true
        break
      case '--pretty':
        options.pretty = true
        break
      case '--compact':
        options.pretty = false
        break
      default:
        throw new Error(`Unknown option: ${flag}`)
    }
  }

  return options
}

export function validateRemoteDebuggingUrl(remoteDebuggingUrl) {
  let parsed
  try {
    parsed = new URL(remoteDebuggingUrl)
  } catch {
    throw new Error('--remoteDebuggingUrl must be a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('--remoteDebuggingUrl must use http or https')
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('--remoteDebuggingUrl must point at a loopback CDP endpoint')
  }
  return parsed.toString()
}

export function validateOptions(options) {
  if (options.attachOnly && !options.remoteDebuggingUrl) {
    throw new Error('--attachOnly requires --remoteDebuggingUrl')
  }
  if (options.remoteDebuggingUrl) {
    validateRemoteDebuggingUrl(options.remoteDebuggingUrl)
  }
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1 || options.cdpPort > 65535) {
    throw new Error('--cdpPort must be an integer between 1 and 65535')
  }
  if (!Number.isFinite(options.idleSeconds) || options.idleSeconds < 0) {
    throw new Error('--idleSeconds must be a finite number >= 0')
  }
  if (!Number.isInteger(options.sampleIntervalMs) || options.sampleIntervalMs < 100) {
    throw new Error('--sampleIntervalMs must be an integer >= 100')
  }
  if (!Number.isInteger(options.launchTimeoutMs) || options.launchTimeoutMs < 1000) {
    throw new Error('--launchTimeoutMs must be an integer >= 1000')
  }
  if (!Number.isInteger(options.powermetricsIntervalMs) || options.powermetricsIntervalMs < 500) {
    throw new Error('--powermetricsIntervalMs must be an integer >= 500')
  }
  if (
    options.activityMonitorEnergyImpact !== null &&
    (!Number.isFinite(options.activityMonitorEnergyImpact) ||
      options.activityMonitorEnergyImpact < 0)
  ) {
    throw new Error('--activityMonitorEnergyImpact must be a finite number >= 0')
  }
}

export function parsePsProcessList(stdout) {
  if (!stdout || typeof stdout !== 'string') return []
  const rows = []
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+([0-9]+(?:\.[0-9]+)?)\s+(.+)$/)
    if (!match) continue
    const pid = Number.parseInt(match[1], 10)
    const ppid = Number.parseInt(match[2], 10)
    const rssKb = Number.parseInt(match[3], 10)
    const cpuPercent = Number.parseFloat(match[4])
    const args = match[5].trim()
    const command = args.split(/\s+/)[0] || args
    rows.push({
      pid,
      ppid,
      rssKb,
      rssBytes: rssKb * 1024,
      cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
      args,
      command
    })
  }
  return rows
}

function extractUserDataDirArg(args) {
  const equalsMatch = args.match(/--user-data-dir=(?:"([^"]+)"|'([^']+)'|(.+?)(?=\s+--|$))/)
  if (equalsMatch) {
    const value = (equalsMatch[1] || equalsMatch[2] || equalsMatch[3] || '').trim()
    return value || null
  }
  const spaceMatch = args.match(/--user-data-dir\s+(?:"([^"]+)"|'([^']+)'|(.+?)(?=\s+--|$))/)
  if (spaceMatch) {
    const value = (spaceMatch[1] || spaceMatch[2] || spaceMatch[3] || '').trim()
    return value || null
  }
  return null
}

function isIsolatedTempProfile(userDataDir) {
  if (!userDataDir) return false
  const normalized = userDataDir.replace(/\\/g, '/')
  return (
    normalized.startsWith('/tmp/') ||
    normalized.startsWith('/private/tmp/') ||
    normalized.startsWith('/var/folders/') ||
    normalized.includes('/tuff-energy-baseline-')
  )
}

export function detectLiveDefaultInstances({
  psOutput = '',
  psFailed = false,
  psError = null,
  vitePortOpen = false,
  currentPid = process.pid
} = {}) {
  const rows = parsePsProcessList(psOutput)
  const matches = []
  const reasons = new Set()

  if (psFailed) {
    reasons.add(
      `Unable to inspect running processes via ps (failing closed${psError ? `: ${psError}` : ''})`
    )
  }

  for (const row of rows) {
    if (row.pid === currentPid) continue
    const argsLower = row.args.toLowerCase()
    const userDataDir = extractUserDataDirArg(row.args)

    if (argsLower.includes('/applications/tuff.app/')) {
      const reason = 'Live packaged /Applications/Tuff.app instance detected'
      reasons.add(reason)
      matches.push({ pid: row.pid, reason, args: row.args })
      continue
    }

    const isDefaultCoreAppProfile =
      Boolean(userDataDir) &&
      !isIsolatedTempProfile(userDataDir) &&
      (userDataDir.includes('@talex-touch/core-app') ||
        /application support\/tuff(?:$|\/)/i.test(userDataDir.replace(/\\/g, '/')))

    if (isDefaultCoreAppProfile) {
      const reason = `Live Electron/Tuff instance using default profile (${userDataDir})`
      reasons.add(reason)
      matches.push({ pid: row.pid, reason, args: row.args })
      continue
    }

    const isTuffElectronProcess =
      (argsLower.includes('electron helper') || argsLower.includes('tuff helper')) &&
      argsLower.includes('@talex-touch/core-app') &&
      !isIsolatedTempProfile(userDataDir)

    if (isTuffElectronProcess) {
      const reason = 'Live Electron Helper process for @talex-touch/core-app detected'
      reasons.add(reason)
      matches.push({ pid: row.pid, reason, args: row.args })
    }
  }

  if (vitePortOpen) {
    reasons.add(`Vite dev server listener detected on port ${DEFAULT_VITE_DEV_PORT}`)
  }

  return {
    blocked: reasons.size > 0,
    reasons: [...reasons],
    matches
  }
}

export function assertSafeToLaunchOrAttach(options, liveCheck) {
  if (options.dryRun) {
    return {
      mode: options.attachOnly ? 'attach-only' : 'isolated-launch',
      allowed: true,
      liveInstanceCheck: liveCheck
    }
  }

  if (options.attachOnly) {
    validateRemoteDebuggingUrl(options.remoteDebuggingUrl)
    return {
      mode: 'attach-only',
      allowed: true,
      liveInstanceCheck: liveCheck
    }
  }

  if (liveCheck?.blocked) {
    const details = liveCheck.reasons.join('; ')
    throw new Error(
      `Refusing to launch Electron because a live default Tuff/dev instance is running (${details}). ` +
        'Close the live instance first, or pass --attachOnly --remoteDebuggingUrl http://127.0.0.1:<port>/json/list.'
    )
  }

  return {
    mode: 'isolated-launch',
    allowed: true,
    liveInstanceCheck: liveCheck
  }
}

export function classifyElectronProcessRole(entry) {
  if (!entry || typeof entry !== 'object') return 'Other'

  const electronType = typeof entry.electronType === 'string' ? entry.electronType : entry.type
  if (electronType) {
    switch (electronType) {
      case 'Browser':
        return 'Browser'
      case 'GPU':
        return 'GPU'
      case 'Tab':
      case 'Renderer':
        return 'Renderer'
      case 'Utility':
        return 'Utility'
      default:
        break
    }
  }

  const roleHint = typeof entry.role === 'string' ? entry.role.toLowerCase() : ''
  if (roleHint === 'browser') return 'Browser'
  if (roleHint === 'gpu') return 'GPU'
  if (roleHint === 'renderer') return 'Renderer'
  if (
    roleHint === 'utility' ||
    roleHint === 'network-service' ||
    roleHint === 'plugin-runtime' ||
    roleHint === 'pi-agent-runtime' ||
    roleHint === 'ocr-runtime'
  ) {
    return 'Utility'
  }

  const text = `${entry.args ?? ''} ${entry.command ?? ''}`.toLowerCase()
  if (text.includes('--type=gpu-process') || text.includes('helper (gpu)')) return 'GPU'
  if (text.includes('--type=renderer') || text.includes('helper (renderer)')) return 'Renderer'
  if (
    text.includes('--type=utility') ||
    text.includes('helper (plugin)') ||
    text.includes('helper (alerts)')
  ) {
    return 'Utility'
  }
  if (text && !text.includes('--type=') && !text.includes('helper (')) {
    return 'Browser'
  }

  return 'Other'
}

export function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function bytesToMiB(bytes) {
  if (!Number.isFinite(bytes)) return null
  return roundNumber(bytes / (1024 * 1024), 2)
}

export function computeSummaryStats(values, digits = 2) {
  const finite = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (finite.length === 0) {
    return { count: 0, min: null, median: null, p95: null, max: null, mean: null }
  }
  const sorted = [...finite].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1))
  const mean = sorted.reduce((acc, value) => acc + value, 0) / sorted.length
  return {
    count: sorted.length,
    min: roundNumber(sorted[0], digits),
    median: roundNumber(median, digits),
    p95: roundNumber(sorted[p95Index], digits),
    max: roundNumber(sorted[sorted.length - 1], digits),
    mean: roundNumber(mean, digits)
  }
}

export function normalizeAppMetricsReport(report, capturedAt = Date.now()) {
  const rawProcesses = Array.isArray(report?.processes) ? report.processes : []
  const processes = rawProcesses.map((proc) => {
    const workingSetBytes = Number.isFinite(proc.workingSetBytes) ? proc.workingSetBytes : 0
    const rssBytes = Number.isFinite(proc.rssBytes) ? proc.rssBytes : workingSetBytes
    return {
      pid: proc.pid,
      role: classifyElectronProcessRole(proc),
      electronType: proc.electronType ?? proc.type ?? null,
      serviceName: proc.serviceName ?? null,
      rssBytes,
      workingSetBytes,
      privateBytes: Number.isFinite(proc.privateBytes) ? proc.privateBytes : null,
      cpuPercent: Number.isFinite(proc.cpuPercent) ? proc.cpuPercent : 0,
      idleWakeupsPerSecond: Number.isFinite(proc.idleWakeupsPerSecond)
        ? proc.idleWakeupsPerSecond
        : null,
      command: proc.serviceName || proc.electronType || null
    }
  })

  return {
    capturedAt: typeof report?.capturedAt === 'number' ? report.capturedAt : capturedAt,
    source: 'app.getAppMetrics',
    processes
  }
}

export function selectProcessTreeFromPs(
  rows,
  { rootPid = null, processFilter = DEFAULT_PROCESS_FILTER } = {}
) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  if (Number.isInteger(rootPid) && rootPid > 0) {
    const byParent = new Map()
    const byPid = new Map()
    for (const row of rows) {
      byPid.set(row.pid, row)
      const list = byParent.get(row.ppid)
      if (list) list.push(row)
      else byParent.set(row.ppid, [row])
    }
    const root = byPid.get(rootPid)
    if (!root) return []
    const visited = new Set()
    const selected = []
    const stack = [root]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || visited.has(current.pid)) continue
      visited.add(current.pid)
      selected.push(current)
      const children = byParent.get(current.pid) ?? []
      for (const child of children) stack.push(child)
    }
    return selected
  }

  const pattern = new RegExp(processFilter, 'i')
  return rows.filter((row) => pattern.test(row.args))
}

export function normalizePsMemorySnapshot(rows, capturedAt = Date.now()) {
  const processes = rows.map((row) => ({
    pid: row.pid,
    role: classifyElectronProcessRole(row),
    electronType: null,
    serviceName: null,
    rssBytes: row.rssBytes,
    workingSetBytes: row.rssBytes,
    privateBytes: null,
    cpuPercent: row.cpuPercent,
    idleWakeupsPerSecond: null,
    command: row.command
  }))

  return {
    capturedAt,
    source: 'ps',
    processes
  }
}

export function aggregateProcessMemorySamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      sampleCount: 0,
      sourcesUsed: [],
      totals: {
        processCount: computeSummaryStats([], 0),
        rssBytes: computeSummaryStats([], 0),
        rssMiB: computeSummaryStats([], 2),
        workingSetBytes: computeSummaryStats([], 0),
        workingSetMiB: computeSummaryStats([], 2),
        cpuPercent: computeSummaryStats([], 2)
      },
      byRole: Object.fromEntries(
        PROCESS_ROLES.slice(0, 4).map((role) => [
          role,
          {
            sampleCount: 0,
            processCount: { min: 0, max: 0 },
            rssBytes: computeSummaryStats([], 0),
            rssMiB: computeSummaryStats([], 2),
            workingSetBytes: computeSummaryStats([], 0),
            workingSetMiB: computeSummaryStats([], 2),
            cpuPercent: computeSummaryStats([], 2)
          }
        ])
      )
    }
  }

  const sourcesUsed = [...new Set(samples.map((sample) => sample.source).filter(Boolean))]
  const totalProcessCounts = []
  const totalRssBytes = []
  const totalWorkingSetBytes = []
  const totalCpuPercents = []

  const roleBuckets = new Map(
    PROCESS_ROLES.map((role) => [
      role,
      {
        processCounts: [],
        rssBytes: [],
        workingSetBytes: [],
        cpuPercent: []
      }
    ])
  )

  for (const sample of samples) {
    const procs = Array.isArray(sample.processes) ? sample.processes : []
    totalProcessCounts.push(procs.length)
    totalRssBytes.push(procs.reduce((sum, proc) => sum + (proc.rssBytes ?? 0), 0))
    totalWorkingSetBytes.push(
      procs.reduce((sum, proc) => sum + (proc.workingSetBytes ?? proc.rssBytes ?? 0), 0)
    )
    totalCpuPercents.push(procs.reduce((sum, proc) => sum + (proc.cpuPercent ?? 0), 0))

    const grouped = new Map()
    for (const proc of procs) {
      const role = PROCESS_ROLES.includes(proc.role) ? proc.role : classifyElectronProcessRole(proc)
      const list = grouped.get(role)
      if (list) list.push(proc)
      else grouped.set(role, [proc])
    }

    for (const [role, list] of grouped.entries()) {
      const bucket = roleBuckets.get(role)
      if (!bucket) continue
      bucket.processCounts.push(list.length)
      bucket.rssBytes.push(list.reduce((sum, proc) => sum + (proc.rssBytes ?? 0), 0))
      bucket.workingSetBytes.push(
        list.reduce((sum, proc) => sum + (proc.workingSetBytes ?? proc.rssBytes ?? 0), 0)
      )
      bucket.cpuPercent.push(list.reduce((sum, proc) => sum + (proc.cpuPercent ?? 0), 0))
    }
  }

  const byRole = {}
  for (const role of PROCESS_ROLES) {
    const bucket = roleBuckets.get(role)
    if (role === 'Other' && bucket.rssBytes.length === 0) continue
    const countMin = bucket.processCounts.length ? Math.min(...bucket.processCounts) : 0
    const countMax = bucket.processCounts.length ? Math.max(...bucket.processCounts) : 0
    byRole[role] = {
      sampleCount: bucket.rssBytes.length,
      processCount: { min: countMin, max: countMax },
      rssBytes: computeSummaryStats(bucket.rssBytes, 0),
      rssMiB: computeSummaryStats(bucket.rssBytes.map(bytesToMiB), 2),
      workingSetBytes: computeSummaryStats(bucket.workingSetBytes, 0),
      workingSetMiB: computeSummaryStats(bucket.workingSetBytes.map(bytesToMiB), 2),
      cpuPercent: computeSummaryStats(bucket.cpuPercent, 2)
    }
  }

  return {
    sampleCount: samples.length,
    sourcesUsed,
    totals: {
      processCount: computeSummaryStats(totalProcessCounts, 0),
      rssBytes: computeSummaryStats(totalRssBytes, 0),
      rssMiB: computeSummaryStats(totalRssBytes.map(bytesToMiB), 2),
      workingSetBytes: computeSummaryStats(totalWorkingSetBytes, 0),
      workingSetMiB: computeSummaryStats(totalWorkingSetBytes.map(bytesToMiB), 2),
      cpuPercent: computeSummaryStats(totalCpuPercents, 2)
    },
    byRole
  }
}

function parsePowermetricsTaskLine(line, columnLayout) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('***') || trimmed.startsWith('Name ')) return null
  if (/^[-=]+$/.test(trimmed)) return null

  const match = trimmed.match(
    /^(.+?)\s+(-?\d+)\s+([0-9]+(?:\.[0-9]+)?(?:\s+[0-9]+(?:\.[0-9]+)?)+)$/
  )
  if (!match) return null

  const name = match[1].trim()
  const pid = Number.parseInt(match[2], 10)
  const numbers = match[3]
    .trim()
    .split(/\s+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value))

  if (numbers.length < 2) return null

  const cpuMsPerSec = numbers[0]
  const energyImpact = columnLayout.hasEnergyImpact ? numbers[numbers.length - 1] : null
  let userPercent = null
  let idleWakeupsPerSec = null

  if (columnLayout.hasEnergyImpact && columnLayout.hasUserPercent && numbers.length >= 7) {
    // Name ID CPU_ms/s User% Deadlines(<2, 2-5) Wakeups(Intr, PkgIdle) EnergyImpact
    userPercent = numbers[1]
    idleWakeupsPerSec = numbers[numbers.length - 2]
  } else if (columnLayout.hasEnergyImpact && !columnLayout.hasUserPercent && numbers.length >= 6) {
    // Name ID CPU_ms/s Deadlines(<2, 2-5) Wakeups(Intr, PkgIdle) EnergyImpact
    idleWakeupsPerSec = numbers[numbers.length - 2]
  } else if (columnLayout.hasEnergyImpact && numbers.length >= 4) {
    idleWakeupsPerSec = numbers[numbers.length - 2]
  } else if (!columnLayout.hasEnergyImpact && numbers.length >= 2) {
    if (columnLayout.hasUserPercent) userPercent = numbers[1]
    idleWakeupsPerSec = numbers[numbers.length - 1]
  }

  return {
    name,
    pid,
    cpuMsPerSec,
    userPercent,
    idleWakeupsPerSec,
    energyImpact
  }
}

export function parsePowermetricsTasksOutput(
  rawText,
  { processFilter = DEFAULT_PROCESS_FILTER, targetPids = null } = {}
) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      sampleCount: 0,
      matchedSampleCount: 0,
      observedDurationSeconds: null,
      matchedTaskNames: [],
      matchedPids: [],
      energyImpact: computeSummaryStats([], 2),
      cpuMsPerSec: computeSummaryStats([], 2),
      idleWakeupsPerSec: computeSummaryStats([], 2),
      systemAllTasksEnergyImpact: computeSummaryStats([], 2),
      samples: []
    }
  }

  const filterPattern = new RegExp(processFilter, 'i')
  const pidSet = Array.isArray(targetPids) && targetPids.length > 0 ? new Set(targetPids) : null
  const elapsedMatches = Array.from(rawText.matchAll(/\(([0-9]+(?:\.[0-9]+)?)ms\s+elapsed\)/gi))
  const totalElapsedMs = elapsedMatches.reduce((sum, match) => sum + Number.parseFloat(match[1]), 0)
  const blocks = rawText.split(/\*\*\*\s*Running tasks\s*\*\*\*/i).slice(1)
  const effectiveBlocks = blocks.length > 0 ? blocks : [rawText]

  const matchedTaskNames = new Set()
  const matchedPids = new Set()
  const sampleEnergyTotals = []
  const sampleCpuTotals = []
  const sampleWakeupTotals = []
  const systemEnergyTotals = []
  const samples = []

  for (let blockIndex = 0; blockIndex < effectiveBlocks.length; blockIndex += 1) {
    const block = effectiveBlocks[blockIndex]
    const lines = block.split(/\r?\n/)
    let columnLayout = { hasUserPercent: true, hasEnergyImpact: false }
    let inTable = false
    const matchedTasks = []
    let allTasksRow = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        if (inTable && (matchedTasks.length > 0 || allTasksRow)) break
        continue
      }
      if (/^Name\s+ID\s+/i.test(trimmed)) {
        inTable = true
        columnLayout = {
          hasUserPercent: /\bUser%/i.test(trimmed),
          hasEnergyImpact: /\bEnergy\s+Impact\b/i.test(trimmed)
        }
        continue
      }
      if (trimmed.startsWith('***')) {
        if (inTable) break
        continue
      }

      const parsed = parsePowermetricsTaskLine(line, columnLayout)
      if (!parsed) continue
      inTable = true

      if (parsed.name === 'ALL_TASKS' || parsed.pid === -2) {
        allTasksRow = parsed
        continue
      }

      const matchesFilter = pidSet ? pidSet.has(parsed.pid) : filterPattern.test(parsed.name)
      if (matchesFilter) {
        matchedTasks.push(parsed)
        matchedTaskNames.add(parsed.name)
        matchedPids.add(parsed.pid)
      }
    }

    if (matchedTasks.length === 0 && !allTasksRow) continue

    const tasksWithEnergy = matchedTasks.filter((task) => typeof task.energyImpact === 'number')
    const totalEnergyImpact =
      tasksWithEnergy.length > 0
        ? roundNumber(
            tasksWithEnergy.reduce((sum, task) => sum + task.energyImpact, 0),
            2
          )
        : null
    const totalCpuMsPerSec =
      matchedTasks.length > 0
        ? roundNumber(
            matchedTasks.reduce((sum, task) => sum + task.cpuMsPerSec, 0),
            2
          )
        : null
    const totalIdleWakeupsPerSec =
      matchedTasks.length > 0
        ? roundNumber(
            matchedTasks.reduce((sum, task) => sum + (task.idleWakeupsPerSec ?? 0), 0),
            2
          )
        : null

    if (totalEnergyImpact !== null) sampleEnergyTotals.push(totalEnergyImpact)
    if (matchedTasks.length > 0) {
      sampleCpuTotals.push(totalCpuMsPerSec)
      sampleWakeupTotals.push(totalIdleWakeupsPerSec)
    }
    if (allTasksRow && typeof allTasksRow.energyImpact === 'number') {
      systemEnergyTotals.push(allTasksRow.energyImpact)
    }

    samples.push({
      sampleIndex: samples.length + 1,
      matchedTaskCount: matchedTasks.length,
      totalEnergyImpact,
      totalCpuMsPerSec,
      totalIdleWakeupsPerSec,
      allTasksEnergyImpact: allTasksRow?.energyImpact ?? null,
      tasks: matchedTasks
    })
  }

  return {
    sampleCount: samples.length,
    matchedSampleCount: sampleCpuTotals.length,
    observedDurationSeconds:
      elapsedMatches.length > 0 ? roundNumber(totalElapsedMs / 1000, 2) : null,
    matchedTaskNames: [...matchedTaskNames].sort(),
    matchedPids: [...matchedPids].sort((a, b) => a - b),
    energyImpact: computeSummaryStats(sampleEnergyTotals, 2),
    cpuMsPerSec: computeSummaryStats(sampleCpuTotals, 2),
    idleWakeupsPerSec: computeSummaryStats(sampleWakeupTotals, 2),
    systemAllTasksEnergyImpact: computeSummaryStats(systemEnergyTotals, 2),
    samples
  }
}

function shellQuotePath(value) {
  const str = String(value)
  if (/^[a-zA-Z0-9_./:-]+$/.test(str)) return str
  return `'${str.replace(/'/g, `'\\''`)}'`
}

export function buildManualPowermetricsCommand({
  idleSeconds = DEFAULT_IDLE_SECONDS,
  intervalMs = DEFAULT_POWERMETRICS_INTERVAL_MS,
  outputPath = '/tmp/tuff-powermetrics-tasks.txt'
} = {}) {
  const sampleCount = Math.max(1, Math.round((idleSeconds * 1000) / intervalMs))
  return `sudo powermetrics --samplers tasks -i ${intervalMs} -n ${sampleCount} > ${shellQuotePath(outputPath)}`
}

function finalizeParsedPowermetrics(parsed, { source, inputPath, manualCommand, intervalMs }) {
  const estimatedDurationSeconds =
    parsed.observedDurationSeconds ??
    (parsed.sampleCount > 0 && Number.isFinite(intervalMs)
      ? roundNumber((parsed.sampleCount * intervalMs) / 1000, 2)
      : null)
  const enrichedParsed = {
    ...parsed,
    observedDurationSeconds: estimatedDurationSeconds
  }
  if (parsed.sampleCount === 0) {
    return {
      status: 'parse-empty',
      source,
      inputPath,
      reason:
        source === 'file'
          ? 'powermetrics input file contained no parseable Running tasks blocks'
          : 'live powermetrics execution produced no parseable Running tasks blocks',
      manualCommand,
      parsed: enrichedParsed
    }
  }
  if (parsed.matchedPids.length === 0) {
    return {
      status: 'no-matching-tasks',
      source,
      inputPath,
      reason:
        'powermetrics output contained Running tasks blocks, but zero tasks matched the target process filter/PIDs',
      manualCommand,
      parsed: enrichedParsed
    }
  }
  if (parsed.energyImpact.count === 0) {
    return {
      status: 'missing-energy-impact-column',
      source,
      inputPath,
      reason:
        'powermetrics output matched target tasks, but the Running tasks header did not include an Energy Impact column',
      manualCommand,
      parsed: enrichedParsed
    }
  }
  return {
    status: 'measured',
    source,
    inputPath,
    reason: null,
    manualCommand,
    parsed: enrichedParsed
  }
}

export async function collectPowermetricsEnergy(
  options,
  {
    platform = process.platform,
    geteuid = typeof process.geteuid === 'function' ? () => process.geteuid() : () => 1000,
    readFileFn = readFile,
    execPowermetrics = runPowermetricsCommand,
    targetPids = null,
    rawLiveOutput = null
  } = {}
) {
  const outputHint = options.outputDir
    ? path.join(path.resolve(options.outputDir), 'powermetrics-tasks.txt')
    : '/tmp/tuff-powermetrics-tasks.txt'
  const manualCommand = buildManualPowermetricsCommand({
    idleSeconds: options.idleSeconds,
    intervalMs: options.powermetricsIntervalMs,
    outputPath: outputHint
  })

  if (options.dryRun) {
    return {
      status: 'skipped-dry-run',
      source: null,
      reason: 'dry-run mode does not execute powermetrics',
      manualCommand,
      parsed: null
    }
  }

  if (options.powermetricsInput) {
    const resolvedInput = path.resolve(options.powermetricsInput)
    const rawText = await readFileFn(resolvedInput, 'utf8')
    // Offline powermetrics captures come from a prior run with different PIDs, so always
    // match by processFilter rather than live child PIDs.
    const parsed = parsePowermetricsTasksOutput(rawText, {
      processFilter: options.processFilter,
      targetPids: null
    })
    return finalizeParsedPowermetrics(parsed, {
      source: 'file',
      inputPath: resolvedInput,
      manualCommand,
      intervalMs: options.powermetricsIntervalMs
    })
  }

  if (platform !== 'darwin') {
    return {
      status: 'skipped-non-macos',
      source: null,
      reason: `powermetrics is only available on macOS (current platform: ${platform})`,
      manualCommand: null,
      parsed: null
    }
  }

  const uid = geteuid()
  if (uid !== 0) {
    return {
      status: 'requires-sudo',
      source: null,
      reason:
        'powermetrics --samplers tasks requires root privileges; non-root probe skips interactive sudo and emits the exact manual command',
      manualCommand,
      parsed: null
    }
  }

  const sampleCount = Math.max(
    1,
    Math.round((options.idleSeconds * 1000) / options.powermetricsIntervalMs)
  )
  const rawText =
    typeof rawLiveOutput === 'string'
      ? rawLiveOutput
      : await execPowermetrics({
          intervalMs: options.powermetricsIntervalMs,
          sampleCount
        })
  const parsed = parsePowermetricsTasksOutput(rawText, {
    processFilter: options.processFilter,
    targetPids
  })
  return finalizeParsedPowermetrics(parsed, {
    source: 'live-powermetrics',
    inputPath: null,
    manualCommand,
    intervalMs: options.powermetricsIntervalMs
  })
}

async function runPowermetricsCommand({ intervalMs, sampleCount }) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      '/usr/bin/powermetrics',
      ['--samplers', 'tasks', '-i', String(intervalMs), '-n', String(sampleCount)],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout)
      else rejectPromise(new Error(`powermetrics exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

function isTestFilePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  return (
    /(?:^|\/)(?:__tests__|tests)\//.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  )
}

async function walkSourceFiles(rootDir, collected = [], errors = []) {
  let entries
  try {
    entries = await readdir(rootDir, { withFileTypes: true })
  } catch (error) {
    errors.push({
      path: rootDir,
      error: error instanceof Error ? error.message : String(error)
    })
    return collected
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (STATIC_AUDIT_IGNORED_DIRS.has(entry.name)) continue
      await walkSourceFiles(path.join(rootDir, entry.name), collected, errors)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name)
      if (STATIC_AUDIT_EXTENSIONS.has(ext)) {
        collected.push(path.join(rootDir, entry.name))
      }
    }
  }
  return collected
}

export async function runStaticEnergyAudit({
  repoRoot = defaultRepoRoot,
  roots = ['apps/core-app/src', 'packages/tuffex']
} = {}) {
  const resolvedRoot = path.resolve(repoRoot)
  const totals = {
    setInterval: { runtime: 0, test: 0, total: 0, filesWithMatches: 0 },
    powerMonitor: { runtime: 0, test: 0, total: 0, filesWithMatches: 0 },
    requestAnimationFrame: { runtime: 0, test: 0, total: 0, filesWithMatches: 0 }
  }
  const byRoot = {}
  const unreadablePaths = []
  const perPatternFiles = {
    setInterval: [],
    powerMonitor: [],
    requestAnimationFrame: []
  }

  let scannedFiles = 0
  for (const relRoot of roots) {
    const absRoot = path.resolve(resolvedRoot, relRoot)
    const rootErrors = []
    const files = await walkSourceFiles(absRoot, [], rootErrors)
    for (const err of rootErrors) unreadablePaths.push(err)
    const rootSummary = {
      scannedFiles: files.length,
      unreadablePaths: rootErrors,
      setInterval: { runtime: 0, test: 0, total: 0 },
      powerMonitor: { runtime: 0, test: 0, total: 0 },
      requestAnimationFrame: { runtime: 0, test: 0, total: 0 }
    }
    scannedFiles += files.length

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf8')
      const relPath = path.relative(resolvedRoot, filePath).replace(/\\/g, '/')
      const isTest = isTestFilePath(relPath)

      for (const [metricName, regex] of Object.entries(STATIC_AUDIT_PATTERNS)) {
        regex.lastIndex = 0
        const matches = content.match(regex)
        const count = matches ? matches.length : 0
        if (count === 0) continue

        totals[metricName].total += count
        totals[metricName].filesWithMatches += 1
        rootSummary[metricName].total += count
        if (isTest) {
          totals[metricName].test += count
          rootSummary[metricName].test += count
        } else {
          totals[metricName].runtime += count
          rootSummary[metricName].runtime += count
        }
        perPatternFiles[metricName].push({ file: relPath, count, isTest })
      }
    }

    byRoot[relRoot] = rootSummary
  }

  const topRuntimeFiles = {}
  for (const metricName of Object.keys(STATIC_AUDIT_PATTERNS)) {
    topRuntimeFiles[metricName] = perPatternFiles[metricName]
      .filter((entry) => !entry.isTest)
      .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
      .slice(0, 15)
  }

  return {
    scannedAt: new Date().toISOString(),
    repoRoot: resolvedRoot,
    roots,
    scannedFiles,
    incomplete: unreadablePaths.length > 0,
    unreadablePaths,
    totals,
    byRoot,
    topRuntimeFiles
  }
}

export function evaluateBaselineReadiness(report) {
  const missing = []
  if (report.mode === 'dry-run' || report.dryRun === true) {
    missing.push('dry-run plan only; no live Electron runtime measurements captured')
  }
  if (report.metrics?.coldStart?.status !== 'measured') {
    missing.push(
      `Metric 1 (coldStart) status is '${report.metrics?.coldStart?.status ?? 'missing'}', expected 'measured'`
    )
  }
  const pm = report.metrics?.idleEnergy?.powermetrics
  if (pm?.status !== 'measured') {
    missing.push(
      `Metric 2a (powermetrics) status is '${pm?.status ?? 'missing'}', expected 'measured'`
    )
  } else {
    const targetIdleSeconds = report.config?.idleSeconds ?? report.metrics?.idleEnergy?.idleSeconds
    const observedSeconds = pm.parsed?.observedDurationSeconds
    if (
      typeof targetIdleSeconds === 'number' &&
      targetIdleSeconds > 0 &&
      typeof observedSeconds === 'number' &&
      observedSeconds < targetIdleSeconds
    ) {
      missing.push(
        `Metric 2a (powermetrics) observed duration ${observedSeconds}s is shorter than target idle window ${targetIdleSeconds}s`
      )
    }
  }
  if (report.metrics?.idleEnergy?.activityMonitor?.status !== 'imported') {
    missing.push(
      `Metric 2b (activityMonitor) status is '${report.metrics?.idleEnergy?.activityMonitor?.status ?? 'missing'}', expected 'imported'`
    )
  }
  if (report.metrics?.processMemory?.status !== 'measured') {
    missing.push(
      `Metric 3 (processMemory) status is '${report.metrics?.processMemory?.status ?? 'missing'}', expected 'measured'`
    )
  }

  const liveMeasurementsCaptured =
    report.mode !== 'dry-run' &&
    report.dryRun !== true &&
    [
      report.metrics?.coldStart?.status === 'measured',
      report.metrics?.idleEnergy?.powermetrics?.status === 'measured',
      report.metrics?.processMemory?.status === 'measured'
    ].some(Boolean)

  return {
    baselineClaimable: missing.length === 0,
    liveMeasurementsCaptured,
    missingBaselineRequirements: missing
  }
}

export function renderMarkdownSummary(report) {
  const lines = []
  lines.push('# 3.0 Phase 0 Energy & Memory Baseline Probe')
  lines.push('')
  lines.push(`- Schema: \`${report.schema}\``)
  lines.push(`- Generated at: \`${report.generatedAt}\``)
  lines.push(`- Mode: \`${report.mode}\``)
  lines.push(`- Baseline claimable: \`${report.readiness.baselineClaimable}\``)
  lines.push(`- Live measurements captured: \`${report.readiness.liveMeasurementsCaptured}\``)
  lines.push(`- Idle window target: \`${report.config.idleSeconds}s\``)
  lines.push('')

  if (!report.readiness.baselineClaimable) {
    lines.push('> [!IMPORTANT]')
    lines.push(
      '> This artifact does **not** claim a complete live Phase 0 baseline. Missing requirements:'
    )
    for (const item of report.readiness.missingBaselineRequirements) {
      lines.push(`> - ${item}`)
    }
    lines.push('')
  }

  lines.push('## Metric 1 — Cold Start to CoreBox Interactive')
  lines.push('')
  const cold = report.metrics.coldStart
  lines.push(`- Status: \`${cold.status}\``)
  lines.push(
    `- Cold start to CoreBox interactive: ${
      cold.coldStartToCoreBoxInteractiveMs !== null
        ? `\`${cold.coldStartToCoreBoxInteractiveMs} ms\``
        : '`not measured`'
    }`
  )
  if (cold.reason) lines.push(`- Notes: ${cold.reason}`)
  lines.push('')

  lines.push('## Metric 2 — Idle Energy (powermetrics + Activity Monitor)')
  lines.push('')
  const pm = report.metrics.idleEnergy.powermetrics
  const am = report.metrics.idleEnergy.activityMonitor
  lines.push(`- \`powermetrics --samplers tasks\` status: \`${pm.status}\``)
  if (pm.parsed && pm.parsed.sampleCount > 0) {
    lines.push(
      `- Matched tasks (${pm.parsed.sampleCount} samples): median Energy Impact \`${pm.parsed.energyImpact.median}\`, p95 \`${pm.parsed.energyImpact.p95}\`, max \`${pm.parsed.energyImpact.max}\`; median CPU \`${pm.parsed.cpuMsPerSec.median} ms/s\``
    )
  } else if (pm.reason) {
    lines.push(`- Reason: ${pm.reason}`)
  }
  if (pm.manualCommand) {
    lines.push(`- Manual command: \`${pm.manualCommand}\``)
  }
  lines.push(`- Activity Monitor Energy Impact status: \`${am.status}\``)
  if (am.energyImpact !== null) {
    lines.push(`- Activity Monitor Energy Impact value: \`${am.energyImpact}\``)
  }
  lines.push('')

  lines.push('## Metric 3 — Per-Process Resident Memory & CPU')
  lines.push('')
  const mem = report.metrics.processMemory
  lines.push(`- Status: \`${mem.status}\``)
  lines.push(`- Samples collected: \`${mem.summary?.sampleCount ?? 0}\``)
  if (mem.summary && mem.summary.sampleCount > 0) {
    lines.push(
      `- Total RSS (MiB): min \`${mem.summary.totals.rssMiB.min}\` / median \`${mem.summary.totals.rssMiB.median}\` / p95 \`${mem.summary.totals.rssMiB.p95}\` / max \`${mem.summary.totals.rssMiB.max}\``
    )
    lines.push('')
    lines.push(
      '| Role | Procs (min-max) | RSS MiB (min / median / p95 / max) | CPU % (median / p95 / max) |'
    )
    lines.push('| --- | --- | --- | --- |')
    for (const [role, stats] of Object.entries(mem.summary.byRole)) {
      lines.push(
        `| ${role} | ${stats.processCount.min}-${stats.processCount.max} | ${stats.rssMiB.min ?? '-'} / ${stats.rssMiB.median ?? '-'} / ${stats.rssMiB.p95 ?? '-'} / ${stats.rssMiB.max ?? '-'} | ${stats.cpuPercent.median ?? '-'} / ${stats.cpuPercent.p95 ?? '-'} / ${stats.cpuPercent.max ?? '-'} |`
      )
    }
  } else if (mem.reason) {
    lines.push(`- Notes: ${mem.reason}`)
  }
  lines.push('')

  if (report.staticAudit) {
    lines.push('## Static Energy Audit (Phase 2 / Phase 3 Anchors)')
    lines.push('')
    lines.push(
      `- Scanned files: \`${report.staticAudit.scannedFiles}\` across \`${report.staticAudit.roots.join('`, `')}\``
    )
    lines.push('')
    lines.push('| Symbol | Runtime (non-test) | Tests | Total | Files |')
    lines.push('| --- | ---: | ---: | ---: | ---: |')
    for (const key of ['setInterval', 'powerMonitor', 'requestAnimationFrame']) {
      const entry = report.staticAudit.totals[key]
      lines.push(
        `| \`${key}\` | ${entry.runtime} | ${entry.test} | ${entry.total} | ${entry.filesWithMatches} |`
      )
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function checkTcpPortOpen(port, host = '127.0.0.1', timeoutMs = 400) {
  return await new Promise((resolvePromise) => {
    const socket = net.createConnection({ port, host })
    let settled = false
    const finish = (open) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolvePromise(open)
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
  })
}

function readLocalPsOutput() {
  if (process.platform === 'win32') {
    return { ok: true, stdout: '', error: null }
  }
  const result = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=,args='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.error) {
    return { ok: false, stdout: '', error: result.error.message }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      stdout: '',
      error: (result.stderr || `ps exited with code ${result.status}`).trim()
    }
  }
  return { ok: true, stdout: result.stdout, error: null }
}

async function loadCdpTargets(remoteDebuggingUrl) {
  validateRemoteDebuggingUrl(remoteDebuggingUrl)
  const response = await fetch(remoteDebuggingUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok) {
    throw new Error(`CDP endpoint returned HTTP ${response.status}`)
  }
  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

export function validateWebSocketDebuggerUrl(wsUrl) {
  let parsed
  try {
    parsed = new URL(wsUrl)
  } catch {
    throw new Error('CDP webSocketDebuggerUrl must be a valid URL')
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('CDP webSocketDebuggerUrl must use ws or wss')
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('CDP webSocketDebuggerUrl must point at a loopback host')
  }
  return parsed.toString()
}

export function buildIsolatedPackagedLaunchEnv({
  userDataDir,
  isolatedHome,
  baseEnv = process.env,
  platform = process.platform
} = {}) {
  if (!userDataDir || typeof userDataDir !== 'string' || !userDataDir.trim()) {
    throw new Error('buildIsolatedPackagedLaunchEnv requires a non-empty userDataDir')
  }
  const resolvedUserDataDir = path.resolve(userDataDir)
  const resolvedIsolatedHome =
    isolatedHome && typeof isolatedHome === 'string' && isolatedHome.trim()
      ? path.resolve(isolatedHome)
      : path.join(resolvedUserDataDir, 'home')

  const env = { ...baseEnv }
  for (const key of Object.keys(env)) {
    if (
      key === 'ELECTRON_RUN_AS_NODE' ||
      key === 'INIT_CWD' ||
      key.startsWith('NODE_') ||
      key.startsWith('TSX_') ||
      key.startsWith('npm_') ||
      key.startsWith('PNPM_')
    ) {
      delete env[key]
    }
  }

  const delimiter = platform === 'win32' ? ';' : ':'
  if (typeof env.PATH === 'string' && env.PATH.length > 0) {
    env.PATH = env.PATH.split(delimiter)
      .filter((entry) => {
        if (!entry) return false
        const isAbs =
          platform === 'win32' ? path.win32.isAbsolute(entry) : path.posix.isAbsolute(entry)
        const normalized = entry.replace(/\\/g, '/')
        return isAbs && !normalized.includes('node_modules/.bin')
      })
      .join(delimiter)
  }

  return {
    ...env,
    FORCE_COLOR: '0',
    HOME: resolvedIsolatedHome,
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: resolvedIsolatedHome,
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: resolvedUserDataDir,
    TUFF_PACKAGED_ACCEPTANCE_ISOLATED: '1'
  }
}

export async function seedIsolatedProfileSettings(userDataDir, { isolatedHome } = {}) {
  if (!userDataDir || typeof userDataDir !== 'string' || !userDataDir.trim()) {
    throw new Error('seedIsolatedProfileSettings requires a non-empty userDataDir')
  }
  const resolvedUserDataDir = path.resolve(userDataDir)
  const resolvedIsolatedHome =
    isolatedHome && typeof isolatedHome === 'string' && isolatedHome.trim()
      ? path.resolve(isolatedHome)
      : path.join(resolvedUserDataDir, 'home')

  await mkdir(resolvedUserDataDir, { recursive: true })
  await mkdir(resolvedIsolatedHome, { recursive: true })

  const settingsPaths = []
  for (const rootName of ISOLATED_PROFILE_ROOT_NAMES) {
    const configDir = path.join(resolvedUserDataDir, rootName, 'modules', 'config')
    const settingsPath = path.join(configDir, 'app-setting.ini')
    await mkdir(configDir, { recursive: true })

    let merged = {
      beginner: { init: true },
      dev: { developerMode: true }
    }
    if (existsSync(settingsPath)) {
      try {
        const parsed = JSON.parse(await readFile(settingsPath, 'utf8'))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          merged = {
            ...parsed,
            beginner: {
              ...(parsed.beginner && typeof parsed.beginner === 'object' ? parsed.beginner : {}),
              init: true
            },
            dev: {
              ...(parsed.dev && typeof parsed.dev === 'object' ? parsed.dev : {}),
              developerMode: true
            }
          }
        }
      } catch {
        // Overwrite malformed settings with canonical isolated defaults
      }
    }

    await writeFile(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
    settingsPaths.push(settingsPath)
  }

  return {
    userDataDir: resolvedUserDataDir,
    isolatedHome: resolvedIsolatedHome,
    settingsPaths
  }
}

export function rankCoreBoxCandidateTargets(targets) {
  if (!Array.isArray(targets)) return []
  const pageTargets = targets.filter(
    (target) =>
      target &&
      target.type === 'page' &&
      typeof target.webSocketDebuggerUrl === 'string' &&
      !/^devtools:\/\//i.test(String(target.url ?? ''))
  )

  const scoreTarget = (target) => {
    const label = `${target.title ?? ''} ${target.url ?? ''}`
    if (/\bcorebox\b|core-box|\/#\/?(?:core-?box|box)(?:[/?#]|$)/i.test(label)) {
      return 0
    }
    if (/meta-overlay|division|voice-dock|screenshot|omni-panel/i.test(label)) {
      return 2
    }
    return 1
  }

  return pageTargets
    .map((target, index) => ({ target, score: scoreTarget(target), index }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.target)
}

export function selectCoreBoxTarget(targets) {
  return rankCoreBoxCandidateTargets(targets)[0] || null
}

async function withCdpTarget(target, callback) {
  const wsUrl = validateWebSocketDebuggerUrl(target.webSocketDebuggerUrl)
  const socket = new WebSocket(wsUrl)
  let nextId = 0
  const pending = new Map()

  const rejectAll = (error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
  }

  socket.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (typeof msg.id !== 'number') return
    const req = pending.get(msg.id)
    if (!req) return
    pending.delete(msg.id)
    clearTimeout(req.timer)
    if (msg.error) {
      req.reject(new Error(`CDP ${req.method} error: ${msg.error.message || 'unknown'}`))
    } else {
      req.resolve(msg)
    }
  }
  socket.onclose = () => rejectAll(new Error(`CDP socket closed for target ${target.id}`))

  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      try {
        socket.close()
      } catch {
        // Ignore close errors on open timeout
      }
      rejectPromise(new Error(`Timed out opening CDP socket for ${target.id}`))
    }, 10_000)
    socket.onopen = () => {
      clearTimeout(timer)
      resolvePromise()
    }
    socket.onerror = () => {
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // Ignore close errors on socket error
      }
      rejectPromise(new Error(`CDP socket error for ${target.id}`))
    }
  })

  const send = (method, params = {}, timeoutMs = 15_000) =>
    new Promise((resolvePromise, rejectPromise) => {
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectPromise(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      pending.set(id, { method, resolve: resolvePromise, reject: rejectPromise, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })

  try {
    await send('Runtime.enable')
    return await callback(send)
  } finally {
    rejectAll(new Error('CDP session closed'))
    socket.close()
  }
}

async function evaluateCdp(send, expression, timeoutMs = 15_000) {
  const response = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    timeoutMs
  )
  if (response.result?.exceptionDetails) {
    throw new Error(
      `CDP Runtime.evaluate exception: ${JSON.stringify(response.result.exceptionDetails).slice(0, 400)}`
    )
  }
  return response.result?.result?.value
}

export function buildCoreBoxInteractiveExpression() {
  return `(() => {
    const readyState = document.readyState
    const visibilityState = document.visibilityState
    const href = String(location.href || '')
    const title = String(document.title || '')
    let startupContext = null
    try {
      startupContext =
        typeof window.api?.getStartupContextSnapshot === 'function'
          ? window.api.getStartupContextSnapshot()
          : null
    } catch {
      startupContext = null
    }
    const windowMode = startupContext?.windowMode ?? null
    const touchType = startupContext?.role?.touchType ?? null
    const coreType = startupContext?.role?.coreType ?? null
    const bodyClasses = document.body?.classList
    const hasCoreBoxBodyClass = Boolean(
      bodyClasses?.contains('core-box') && !bodyClasses?.contains('division-box')
    )
    const isDivisionBoxBodyClass = Boolean(bodyClasses?.contains('division-box'))
    const isCoreBoxRoute = /#\\/?(?:core-?box|box)(?:[/?#]|$)/i.test(href)
    const isExcludedWindowMode =
      Boolean(windowMode && windowMode !== 'CoreBox') || isDivisionBoxBodyClass
    const isCoreBoxContext =
      !isExcludedWindowMode &&
      (windowMode === 'CoreBox' ||
        (touchType === 'core-box' && !coreType) ||
        hasCoreBoxBodyClass ||
        isCoreBoxRoute)

    const coreBoxRoot = document.querySelector('.CoreBox, [data-corebox-root]')
    const coreBoxStyle =
      coreBoxRoot && typeof getComputedStyle === 'function' ? getComputedStyle(coreBoxRoot) : null
    const coreBoxDisplay = coreBoxStyle ? coreBoxStyle.display : null
    const coreBoxRendered = Boolean(coreBoxRoot && coreBoxDisplay !== 'none')

    const input = document.querySelector(
      '#core-box-input, #corebox-input, .CoreBox input, .CoreBox textarea, input[data-corebox-input]'
    )
    const inputStyle =
      input && typeof getComputedStyle === 'function' ? getComputedStyle(input) : null
    const inputRect =
      input && typeof input.getBoundingClientRect === 'function'
        ? input.getBoundingClientRect()
        : null
    const inputRectWidth = inputRect && Number.isFinite(inputRect.width) ? inputRect.width : 0
    const inputRectHeight = inputRect && Number.isFinite(inputRect.height) ? inputRect.height : 0
    const inputMounted = Boolean(
      input &&
        input.isConnected !== false &&
        !input.disabled &&
        (!inputStyle || (inputStyle.display !== 'none' && inputStyle.visibility !== 'hidden'))
    )
    const inputVisible = Boolean(inputMounted && inputRectWidth > 0 && inputRectHeight > 0)

    const ipc = window.electron?.ipcRenderer
    const hasIpcBridge = Boolean(
      ipc && typeof ipc.send === 'function' && typeof ipc.on === 'function'
    )

    const isHiddenWindow =
      visibilityState === 'hidden' ||
      (typeof window.innerWidth === 'number' && window.innerWidth === 0)
    const visibleInteractive =
      (readyState === 'complete' || readyState === 'interactive') &&
      isCoreBoxContext &&
      coreBoxRendered &&
      inputVisible &&
      hasIpcBridge
    const hiddenPrewarmedReady =
      isHiddenWindow &&
      readyState === 'complete' &&
      isCoreBoxContext &&
      coreBoxRendered &&
      inputMounted &&
      hasIpcBridge
    const interactive = visibleInteractive || hiddenPrewarmedReady
    const readinessMode = visibleInteractive
      ? 'visible-interactive'
      : hiddenPrewarmedReady
        ? 'hidden-prewarmed-ready'
        : 'not-ready'

    return {
      readyState,
      visibilityState,
      href,
      title,
      windowMode,
      touchType,
      hasCoreBoxBodyClass,
      isCoreBoxRoute,
      isCoreBoxContext,
      hasCoreBoxRoot: Boolean(coreBoxRoot),
      coreBoxDisplay,
      coreBoxRendered,
      inputId: input?.id || null,
      inputMounted,
      inputVisible,
      inputRectWidth,
      inputRectHeight,
      hasIpcBridge,
      readinessMode,
      interactive
    }
  })()`
}

function buildPerformanceReportIpcExpression(timeoutMs = 10_000) {
  return `(() => {
    const bridge = window.electron?.ipcRenderer
    if (!bridge || typeof bridge.send !== 'function' || typeof bridge.on !== 'function') {
      return { ok: false, reason: 'ipc-bridge-unavailable' }
    }
    return new Promise((resolve) => {
      const id = Date.now() + '#energy-probe-' + Math.random().toString(16).slice(2)
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
        finish({ ok: true, data: raw.data })
      })
      setTimeout(() => finish({ ok: false, reason: 'timeout' }), ${timeoutMs})
      bridge.send(${JSON.stringify(RAW_MAIN_PROCESS_CHANNEL)}, {
        code: 200,
        data: undefined,
        sync: { timeStamp: Date.now(), timeout: ${timeoutMs}, id },
        name: ${JSON.stringify(PERFORMANCE_GET_REPORT_EVENT)},
        header: { status: 'request', type: 'main', _originData: {} }
      })
    })
  })()`
}

function formatTargetDiagnosticEntry(entry) {
  const target = entry.target ?? {}
  const base = `[id=${target.id ?? 'unknown'} title=${JSON.stringify(target.title ?? '')} url=${JSON.stringify(target.url ?? '')}]`
  if (entry.error) {
    return `${base} error=${entry.error}`
  }
  const s = entry.snapshot ?? {}
  return (
    `${base} windowMode=${s.windowMode ?? 'null'} readyState=${s.readyState ?? 'unknown'} ` +
    `visibility=${s.visibilityState ?? 'unknown'} coreBoxContext=${Boolean(s.isCoreBoxContext)} ` +
    `coreBoxRoot=${Boolean(s.hasCoreBoxRoot)} display=${s.coreBoxDisplay ?? 'null'} ` +
    `inputMounted=${Boolean(s.inputMounted)} inputVisible=${Boolean(s.inputVisible)} ` +
    `ipc=${Boolean(s.hasIpcBridge)} mode=${s.readinessMode ?? 'not-ready'}`
  )
}

export async function waitForCoreBoxInteractive(
  remoteDebuggingUrl,
  timeoutMs,
  getChildFailure = null,
  deps = {}
) {
  const loadTargetsFn = deps.loadCdpTargets ?? loadCdpTargets
  const inspectTargetFn =
    deps.inspectTarget ??
    (async (target) =>
      await withCdpTarget(target, (send) =>
        evaluateCdp(send, buildCoreBoxInteractiveExpression(), 5_000)
      ))
  const getChildDiagnostics = deps.getChildDiagnostics ?? null
  const nowFn = deps.now ?? Date.now
  const sleepFn =
    deps.sleep ?? ((ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)))
  const pollIntervalMs = deps.pollIntervalMs ?? 250

  const deadline = nowFn() + timeoutMs
  let lastError = null
  let lastTargets = []
  let lastInspections = []

  while (nowFn() < deadline) {
    const childFailure = getChildFailure?.()
    if (childFailure) {
      throw childFailure
    }
    try {
      const targets = await loadTargetsFn(remoteDebuggingUrl)
      lastTargets = Array.isArray(targets) ? targets : []
      const candidates = rankCoreBoxCandidateTargets(lastTargets)
      const roundInspections = []
      for (const target of candidates) {
        const midChildFailure = getChildFailure?.()
        if (midChildFailure) {
          throw midChildFailure
        }
        try {
          const snapshot = await inspectTargetFn(target)
          roundInspections.push({ target, snapshot, error: null })
          if (snapshot?.interactive) {
            return {
              readyAt: nowFn(),
              target: { id: target.id, title: target.title, url: target.url },
              snapshot,
              inspectedTargetCount: candidates.length
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          lastError = message
          roundInspections.push({ target, snapshot: null, error: message })
        }
      }
      lastInspections = roundInspections
    } catch (error) {
      if (error === getChildFailure?.()) {
        throw error
      }
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleepFn(pollIntervalMs)
  }

  const diagnosticParts = []
  if (lastError) diagnosticParts.push(`lastError=${lastError}`)
  diagnosticParts.push(`cdpTargets=${lastTargets.length}`)
  if (lastInspections.length > 0) {
    diagnosticParts.push(
      `inspected=[${lastInspections.map((entry) => formatTargetDiagnosticEntry(entry)).join('; ')}]`
    )
  } else if (lastTargets.length > 0) {
    diagnosticParts.push(
      `rawTargets=[${lastTargets
        .map(
          (t) =>
            `${t?.type ?? 'unknown'}:${JSON.stringify(t?.title ?? '')}:${JSON.stringify(t?.url ?? '')}`
        )
        .join('; ')}]`
    )
  }
  const childDiag = getChildDiagnostics?.()
  if (childDiag) diagnosticParts.push(`child=(${childDiag})`)

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for CoreBox interactive at ${remoteDebuggingUrl} (${diagnosticParts.join(' | ')})`
  )
}

function appendBounded(buffer, chunk, limit = 8_000) {
  const next = `${buffer}${String(chunk)}`
  return next.length > limit ? next.slice(next.length - limit) : next
}

function captureChildOutput(child) {
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => {
    stdout = appendBounded(stdout, chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr = appendBounded(stderr, chunk)
  })
  return () =>
    [
      `pid=${child.pid ?? 'unknown'}`,
      `exitCode=${child.exitCode ?? 'null'}`,
      `signalCode=${child.signalCode ?? 'null'}`,
      stderr.trim() ? `stderrTail=${JSON.stringify(stderr.trim().slice(-600))}` : null,
      stdout.trim() ? `stdoutTail=${JSON.stringify(stdout.trim().slice(-600))}` : null
    ]
      .filter(Boolean)
      .join(', ')
}

function signalChildProcessTree(
  child,
  signal,
  { platform = process.platform, killProcess = process.kill } = {}
) {
  const hasPid = Number.isInteger(child?.pid) && child.pid > 0
  if (platform !== 'win32' && hasPid) {
    try {
      killProcess(-child.pid, signal)
      return true
    } catch {
      // Fall back to direct child.kill if process group no longer exists or child was not detached
    }
  }
  try {
    child.kill(signal)
    return true
  } catch {
    return false
  }
}

export async function terminateChildAndWait(
  child,
  timeoutMs = 3_000,
  { platform = process.platform, killProcess = process.kill } = {}
) {
  if (!child) return
  if (child.exitCode !== null || child.signalCode !== null) {
    if (platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
      try {
        killProcess(-child.pid, 'SIGTERM')
      } catch {
        // Process group already gone
      }
    }
    return
  }
  await new Promise((resolvePromise) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise()
    }
    child.once('exit', done)
    child.once('close', done)
    const timer = setTimeout(() => {
      signalChildProcessTree(child, 'SIGKILL', { platform, killProcess })
      done()
    }, timeoutMs)
    const signaled = signalChildProcessTree(child, 'SIGTERM', { platform, killProcess })
    if (!signaled) {
      done()
    }
  })
}

async function sampleProcessMemoryOnce({
  remoteDebuggingUrl,
  preferredTargetId = null,
  rootPid,
  processFilter
}) {
  if (remoteDebuggingUrl) {
    try {
      const targets = await loadCdpTargets(remoteDebuggingUrl)
      const candidates = rankCoreBoxCandidateTargets(targets)
      if (preferredTargetId) {
        candidates.sort((a, b) => {
          const aMatch = a.id === preferredTargetId ? 0 : 1
          const bMatch = b.id === preferredTargetId ? 0 : 1
          return aMatch - bMatch
        })
      }
      for (const target of candidates) {
        try {
          const reply = await withCdpTarget(target, (send) =>
            evaluateCdp(send, buildPerformanceReportIpcExpression(8_000), 10_000)
          )
          if (reply?.ok && reply.data && Array.isArray(reply.data.processes)) {
            return normalizeAppMetricsReport(reply.data, Date.now())
          }
        } catch {
          // Try next renderer target before falling back to ps
        }
      }
    } catch {
      // Fall through to ps sampling when IPC performance report is unavailable
    }
  }

  const psResult = readLocalPsOutput()
  const psRows = parsePsProcessList(psResult.stdout)
  const selected = selectProcessTreeFromPs(psRows, { rootPid, processFilter })
  return normalizePsMemorySnapshot(selected, Date.now())
}

export function buildDryRunPlan(options, { staticAudit = null, powermetrics } = {}) {
  const mode = 'dry-run'
  const remoteDebuggingUrl =
    options.remoteDebuggingUrl || `http://127.0.0.1:${options.cdpPort}/json/list`
  const executablePath = resolveExecutablePath(options.appPath)
  const report = {
    schema: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    dryRun: true,
    config: {
      executionMode: options.attachOnly ? 'attach-only' : 'isolated-launch',
      appPath: options.appPath,
      executablePath,
      remoteDebuggingUrl,
      cdpPort: options.cdpPort,
      idleSeconds: options.idleSeconds,
      sampleIntervalMs: options.sampleIntervalMs,
      powermetricsIntervalMs: options.powermetricsIntervalMs,
      powermetricsInput: options.powermetricsInput,
      activityMonitorEnergyImpact: options.activityMonitorEnergyImpact,
      processFilter: options.processFilter,
      outputDir: options.outputDir ? path.resolve(options.outputDir) : null
    },
    guards: {
      failClosedOnLiveDefaultInstance: !options.attachOnly,
      requiresLoopbackRemoteDebuggingUrl: true,
      neverLaunchesElectronInDryRun: true,
      liveInstanceCheckSkippedInDryRun: true
    },
    executionPlan: [
      options.attachOnly
        ? `1. Attach read-only to loopback CDP endpoint ${remoteDebuggingUrl} and verify CoreBox target readiness.`
        : `1. Verify no live /Applications/Tuff.app, default @talex-touch/core-app Electron profile, or Vite :${DEFAULT_VITE_DEV_PORT} listener is active; seed isolated profile settings (beginner.init=true) and launch ${executablePath} with isolated env (HOME, TUFF_STARTUP_BENCHMARK_USER_DATA_DIR, TUFF_PACKAGED_ACCEPTANCE_ISOLATED=1), --user-data-dir, and --remote-debugging-port=${options.cdpPort}, measuring spawn -> CoreBox interactive ms.`,
      `2. Observe idle window (${options.idleSeconds}s): collect macOS powermetrics --samplers tasks (or import --powermetricsInput) and Activity Monitor Energy Impact slot (--activityMonitorEnergyImpact).`,
      `3. Sample per-process resident memory & CPU every ${options.sampleIntervalMs}ms via app.getAppMetrics() (${PERFORMANCE_GET_REPORT_EVENT}) with ps fallback across Browser / GPU / Renderer / Utility roles and compute min/median/p95/max + total RSS.`,
      '4. Emit structured JSON + Markdown summary without claiming live baseline numbers unless all live metrics are measured.'
    ],
    metrics: {
      coldStart: {
        status: 'skipped-dry-run',
        coldStartToCoreBoxInteractiveMs: null,
        reason: 'dry-run mode does not launch Electron or connect to CDP'
      },
      idleEnergy: {
        idleSeconds: options.idleSeconds,
        powermetrics: powermetrics || {
          status: 'skipped-dry-run',
          source: null,
          reason: 'dry-run mode does not execute powermetrics',
          manualCommand: buildManualPowermetricsCommand({
            idleSeconds: options.idleSeconds,
            intervalMs: options.powermetricsIntervalMs
          }),
          parsed: null
        },
        activityMonitor: {
          status:
            options.activityMonitorEnergyImpact !== null ? 'imported' : 'pending-manual-import',
          energyImpact: options.activityMonitorEnergyImpact,
          reason:
            options.activityMonitorEnergyImpact !== null
              ? null
              : 'Pass --activityMonitorEnergyImpact <number> from macOS Activity Monitor Energy tab'
        }
      },
      processMemory: {
        status: 'skipped-dry-run',
        reason: 'dry-run mode does not sample live processes',
        summary: aggregateProcessMemorySamples([])
      }
    },
    staticAudit
  }
  report.readiness = evaluateBaselineReadiness(report)
  return report
}

export async function runProbe(options, deps = {}) {
  validateOptions(options)

  const runStaticAuditFn = deps.runStaticEnergyAudit ?? runStaticEnergyAudit
  const staticAudit = options.staticAudit
    ? await runStaticAuditFn({ repoRoot: options.repoRoot })
    : null

  if (options.dryRun) {
    const powermetrics = await collectPowermetricsEnergy(options, deps)
    const report = buildDryRunPlan(options, { staticAudit, powermetrics })
    await maybeWriteArtifacts(options.outputDir, report)
    return report
  }

  // Static audit only shortcut when user asks for --staticAudit without attach/launch intent
  if (
    options.staticAudit &&
    !options.attachOnly &&
    !options.remoteDebuggingUrl &&
    !options.powermetricsInput &&
    options.activityMonitorEnergyImpact === null &&
    deps.forceRuntime !== true
  ) {
    const powermetrics = await collectPowermetricsEnergy({ ...options, dryRun: true }, deps)
    const report = {
      ...buildDryRunPlan({ ...options, dryRun: true }, { staticAudit, powermetrics }),
      mode: 'static-audit-only',
      dryRun: false
    }
    report.readiness = evaluateBaselineReadiness(report)
    await maybeWriteArtifacts(options.outputDir, report)
    return report
  }

  const checkLiveInstancesFn =
    deps.checkLiveInstances ??
    (async () => {
      const psResult = readLocalPsOutput()
      const vitePortOpen = await checkTcpPortOpen(DEFAULT_VITE_DEV_PORT)
      return detectLiveDefaultInstances({
        psOutput: psResult.stdout,
        psFailed: !psResult.ok,
        psError: psResult.error,
        vitePortOpen
      })
    })

  const liveCheck = await checkLiveInstancesFn()
  const safety = assertSafeToLaunchOrAttach(options, liveCheck)

  let child = null
  let tempUserDataDir = null
  let readyTargetId = null
  const remoteDebuggingUrl =
    options.remoteDebuggingUrl || `http://127.0.0.1:${options.cdpPort}/json/list`
  let coldStartMetric = {
    status: 'attach-only-unmeasured',
    coldStartToCoreBoxInteractiveMs: null,
    reason:
      'Attached to an already-running instance via --attachOnly; process cold start was not launched by this harness'
  }

  const accessFileFn = deps.accessFile ?? access
  const checkTcpPortOpenFn = deps.checkTcpPortOpen ?? checkTcpPortOpen
  const seedProfileFn = deps.seedIsolatedProfileSettings ?? seedIsolatedProfileSettings
  const spawnProcessFn = deps.spawnProcess ?? spawn
  const waitForCoreBoxFn = deps.waitForCoreBoxInteractive ?? waitForCoreBoxInteractive
  const terminateChildFn = deps.terminateChildAndWait ?? terminateChildAndWait
  const launchPlatform = deps.platform ?? process.platform

  try {
    if (safety.mode === 'isolated-launch') {
      const executablePath = resolveExecutablePath(options.appPath)
      await accessFileFn(executablePath)
      if (await checkTcpPortOpenFn(options.cdpPort)) {
        throw new Error(
          `CDP port ${options.cdpPort} is already in use; refusing to attach isolated cold-start measurement to an existing listener`
        )
      }
      tempUserDataDir =
        options.userDataDir ||
        path.join(os.tmpdir(), `tuff-energy-baseline-${Date.now()}-${process.pid}`)
      const seededProfile = await seedProfileFn(tempUserDataDir)
      const launchEnv = buildIsolatedPackagedLaunchEnv({
        userDataDir: seededProfile.userDataDir,
        isolatedHome: seededProfile.isolatedHome,
        platform: launchPlatform
      })

      let childFailure = null
      const launchStartedAt = Date.now()
      child = spawnProcessFn(
        executablePath,
        [
          `--remote-debugging-port=${options.cdpPort}`,
          `--user-data-dir=${seededProfile.userDataDir}`
        ],
        {
          cwd: process.cwd(),
          env: launchEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: launchPlatform !== 'win32'
        }
      )
      const getChildDiagnostics = captureChildOutput(child)
      child.once('error', (error) => {
        childFailure = new Error(`Failed to spawn ${executablePath}: ${error.message}`)
      })
      child.once('exit', (code, signal) => {
        if (!childFailure) {
          const diag = getChildDiagnostics()
          childFailure = new Error(
            `Launched app exited before CoreBox became interactive (code=${code}, signal=${signal}; ${diag})`
          )
        }
      })
      const ready = await waitForCoreBoxFn(
        remoteDebuggingUrl,
        options.launchTimeoutMs,
        () => childFailure,
        { getChildDiagnostics }
      )
      readyTargetId = ready.target?.id ?? null
      coldStartMetric = {
        status: 'measured',
        coldStartToCoreBoxInteractiveMs: Math.max(0, ready.readyAt - launchStartedAt),
        target: ready.target,
        readinessMode: ready.snapshot?.readinessMode ?? null,
        reason: null
      }
    } else if (deps.skipCdpWait !== true) {
      const ready = await waitForCoreBoxFn(remoteDebuggingUrl, options.launchTimeoutMs)
      readyTargetId = ready.target?.id ?? null
      coldStartMetric.target = ready.target
      coldStartMetric.readinessMode = ready.snapshot?.readinessMode ?? null
    }

    const memorySamples = []
    const seenCaptureKeys = new Set()
    const sampleMemoryFn = deps.sampleProcessMemoryOnce ?? sampleProcessMemoryOnce
    const idleDeadline = Date.now() + options.idleSeconds * 1000

    const platform = deps.platform ?? process.platform
    const geteuid =
      deps.geteuid ?? (typeof process.geteuid === 'function' ? () => process.geteuid() : () => 1000)
    const execPowermetrics = deps.execPowermetrics ?? runPowermetricsCommand
    const shouldRunLivePowermetrics =
      !options.powermetricsInput && platform === 'darwin' && geteuid() === 0
    // Observe the promise immediately so an early failure during memory sampling never triggers
    // an unhandled rejection.
    const livePowermetricsOutcome = shouldRunLivePowermetrics
      ? execPowermetrics({
          intervalMs: options.powermetricsIntervalMs,
          sampleCount: Math.max(
            1,
            Math.round((options.idleSeconds * 1000) / options.powermetricsIntervalMs)
          )
        }).then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        )
      : Promise.resolve({ ok: true, value: null })

    const maxSamples = Math.max(
      1,
      Math.floor((options.idleSeconds * 1000) / options.sampleIntervalMs) + 1
    )
    for (let index = 0; index < maxSamples; index += 1) {
      const sample = await sampleMemoryFn({
        remoteDebuggingUrl,
        preferredTargetId: readyTargetId,
        rootPid: child?.pid ?? null,
        processFilter: options.processFilter
      })
      if (sample && Array.isArray(sample.processes) && sample.processes.length > 0) {
        const captureKey = `${sample.source ?? 'unknown'}:${sample.capturedAt ?? index}`
        if (!seenCaptureKeys.has(captureKey)) {
          seenCaptureKeys.add(captureKey)
          memorySamples.push(sample)
        }
      }
      const remainingMs = idleDeadline - Date.now()
      if (remainingMs <= 0 || index === maxSamples - 1) break
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, Math.min(options.sampleIntervalMs, remainingMs))
      )
    }

    const liveOutcome = await livePowermetricsOutcome
    if (!liveOutcome.ok) throw liveOutcome.error
    const rawLiveOutput = liveOutcome.value
    const observedPids = new Set()
    for (const sample of memorySamples) {
      for (const proc of sample.processes ?? []) {
        if (Number.isInteger(proc.pid) && proc.pid > 0) observedPids.add(proc.pid)
      }
    }
    if (child?.pid) {
      observedPids.add(child.pid)
      const psResult = readLocalPsOutput()
      if (psResult.ok) {
        const tree = selectProcessTreeFromPs(parsePsProcessList(psResult.stdout), {
          rootPid: child.pid
        })
        for (const row of tree) observedPids.add(row.pid)
      }
    }
    const powermetrics = await collectPowermetricsEnergy(options, {
      ...deps,
      rawLiveOutput,
      targetPids: !options.powermetricsInput && observedPids.size > 0 ? [...observedPids] : null
    })
    const memorySummary = aggregateProcessMemorySamples(memorySamples)

    const report = {
      schema: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      mode: safety.mode,
      dryRun: false,
      config: {
        executionMode: safety.mode,
        appPath: options.appPath,
        executablePath: resolveExecutablePath(options.appPath),
        remoteDebuggingUrl,
        cdpPort: options.cdpPort,
        idleSeconds: options.idleSeconds,
        sampleIntervalMs: options.sampleIntervalMs,
        powermetricsIntervalMs: options.powermetricsIntervalMs,
        powermetricsInput: options.powermetricsInput,
        activityMonitorEnergyImpact: options.activityMonitorEnergyImpact,
        processFilter: options.processFilter,
        outputDir: options.outputDir ? path.resolve(options.outputDir) : null
      },
      guards: {
        failClosedOnLiveDefaultInstance: !options.attachOnly,
        requiresLoopbackRemoteDebuggingUrl: true,
        liveInstanceCheck: liveCheck
      },
      metrics: {
        coldStart: coldStartMetric,
        idleEnergy: {
          idleSeconds: options.idleSeconds,
          powermetrics,
          activityMonitor: {
            status:
              options.activityMonitorEnergyImpact !== null ? 'imported' : 'pending-manual-import',
            energyImpact: options.activityMonitorEnergyImpact,
            reason:
              options.activityMonitorEnergyImpact !== null
                ? null
                : 'Pass --activityMonitorEnergyImpact <number> from macOS Activity Monitor Energy tab'
          }
        },
        processMemory: {
          status: memorySummary.sampleCount > 0 ? 'measured' : 'no-processes-observed',
          reason:
            memorySummary.sampleCount > 0
              ? null
              : 'No matching Tuff/Electron processes were sampled during the idle window',
          summary: memorySummary
        }
      },
      staticAudit
    }

    report.readiness = evaluateBaselineReadiness(report)
    await maybeWriteArtifacts(options.outputDir, report)
    return report
  } finally {
    if (child) {
      await terminateChildFn(child, 3_000, { platform: launchPlatform })
    }
    if (tempUserDataDir && !options.keepUserData && !options.userDataDir) {
      await rm(tempUserDataDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function maybeWriteArtifacts(outputDir, report) {
  if (!outputDir) return
  const resolvedDir = path.resolve(outputDir)
  await mkdir(resolvedDir, { recursive: true })
  const jsonPath = path.join(resolvedDir, 'energy-baseline-probe.json')
  const mdPath = path.join(resolvedDir, 'energy-baseline-probe.md')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, renderMarkdownSummary(report), 'utf8')
  report.artifacts = {
    jsonPath,
    markdownPath: mdPath
  }
}

function printHelp() {
  console.log(`Usage: node apps/core-app/scripts/coreapp-energy-baseline-probe.mjs [options]

3.0 Phase 0 Energy & Memory Baseline Probe (docs/engineering/reports/3.0-runtime-and-energy-decision-2026-10-21.md §3)

Options:
  --dryRun                               Print execution plan & schema without launching Electron
  --staticAudit                          Count setInterval, powerMonitor, and requestAnimationFrame in apps/core-app/src & packages/tuffex
  --attachOnly                           Attach read-only to an existing loopback CDP instance (requires --remoteDebuggingUrl)
  --remoteDebuggingUrl <url>             Loopback CDP endpoint (e.g. http://127.0.0.1:9712/json/list)
  --appPath <path>                       Packaged app bundle or binary path (default: /Applications/Tuff.app on macOS)
  --cdpPort <port>                       CDP port for isolated launch (default: ${DEFAULT_CDP_PORT})
  --idleSeconds <seconds>                Idle measurement window in seconds (default: ${DEFAULT_IDLE_SECONDS})
  --sampleIntervalMs <ms>                Process memory sampling interval in ms (default: ${DEFAULT_SAMPLE_INTERVAL_MS})
  --powermetricsInput <file>             Parse captured 'powermetrics --samplers tasks' text output
  --powermetricsIntervalMs <ms>          Sampling interval for powermetrics (default: ${DEFAULT_POWERMETRICS_INTERVAL_MS})
  --activityMonitorEnergyImpact <num>    Import Activity Monitor Energy Impact observation
  --outputDir <dir>                      Write energy-baseline-probe.json and energy-baseline-probe.md
  --processFilter <regex>                Process name filter for ps/powermetrics (default: ${DEFAULT_PROCESS_FILTER})
  --keepUserData                         Keep isolated user-data-dir after launch
  -h, --help                             Show this help
`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  const report = await runProbe(options)
  const serialized = options.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report)
  console.log(serialized)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(
      `[coreapp-energy-baseline-probe] ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  })
}
