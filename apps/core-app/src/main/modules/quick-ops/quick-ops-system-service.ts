import type {
  QuickOpsBatteryStatusInfo,
  QuickOpsDiagnosticsInfo,
  QuickOpsDirectoryUsageEntry,
  QuickOpsDirectoryUsageInfo,
  QuickOpsDiskSpaceInfo,
  QuickOpsSystemInfo
} from '@talex-touch/utils/transport/events/types'
import { execFile } from 'node:child_process'
import { readdir, readFile, stat, statfs } from 'node:fs/promises'
import { cpus, freemem, homedir, loadavg, release, totalmem, type, uptime } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { formatDuration } from './quick-ops-session-manager'
import { createNetworkStatusInfo } from './quick-ops-network-service'
import type {
  QuickOpsDirectoryUsageTarget,
  QuickOpsResolvedSettings
} from './quick-ops-runtime-types'

const execFileAsync = promisify(execFile)
const DIRECTORY_USAGE_MAX_ENTRIES = 200
const DIRECTORY_USAGE_DEEP_MAX_DEPTH = 3
const DIRECTORY_USAGE_DEEP_MAX_TOTAL_ENTRIES = 1_000
const LOW_BATTERY_WARNING_THRESHOLD_PERCENT = 20

export function createDiagnosticsInfo(settings: QuickOpsResolvedSettings): QuickOpsDiagnosticsInfo {
  const networkInfo = createNetworkStatusInfo()
  return {
    schemaVersion: 2,
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osType: type(),
    osRelease: release(),
    nodeVersion: process.versions.node ?? 'unknown',
    electronVersion: process.versions.electron ?? 'unknown',
    userDataDir: redactHomePath(app.getPath('userData')),
    logsDir: redactHomePath(app.getPath('logs')),
    homeDir: redactHomePath(homedir()),
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    uptimeSeconds: uptime(),
    localAddressCount: networkInfo.addresses.length,
    dnsServerCount: networkInfo.dnsServers.length,
    proxyStatus: networkInfo.proxyStatus,
    proxySources: networkInfo.proxies.map((item) => item.source),
    quickOpsEnabled: settings.enabled,
    showRunningSessionsInCoreBox: settings.showRunningSessionsInCoreBox,
    defaultKeepAwakeDurationMs: settings.defaultKeepAwakeDurationMs,
    defaultTimerDurationMs: settings.defaultTimerDurationMs,
    defaultPomodoroFocusMs: settings.defaultPomodoroFocusMs,
    defaultPomodoroBreakMs: settings.defaultPomodoroBreakMs,
    pomodoroAdvancedLoopSupported: true,
    pomodoroCustomTemplateCount: settings.pomodoroTemplates.custom.filter(
      (template) => template.enabled
    ).length,
    defaultScreenCleanDurationMs: settings.defaultScreenCleanDurationMs
  }
}

export function formatDiagnosticsInfo(info: QuickOpsDiagnosticsInfo): string {
  return [
    `Schema: quickops-diagnostics/v${info.schemaVersion}`,
    `Tuff ${info.appVersion}`,
    `Platform: ${info.platform}/${info.arch}`,
    `OS: ${info.osType} ${info.osRelease}`,
    `Runtime: Node ${info.nodeVersion}, Electron ${info.electronVersion}`,
    `CPU: ${info.cpuCount} logical cores`,
    `Memory: ${formatBytes(info.freeMemoryBytes)} free / ${formatBytes(info.totalMemoryBytes)} total`,
    `Uptime: ${formatDuration(Math.round(info.uptimeSeconds) * 1000)}`,
    `Home: ${info.homeDir}`,
    `UserData: ${info.userDataDir}`,
    `Logs: ${info.logsDir}`,
    `Network: localAddresses=${info.localAddressCount}, dnsServers=${info.dnsServerCount}, proxy=${info.proxyStatus}`,
    `Proxy Sources: ${info.proxySources.length > 0 ? info.proxySources.join(', ') : 'none'}`,
    `QuickOps: enabled=${info.quickOpsEnabled}, showRunning=${info.showRunningSessionsInCoreBox}`,
    [
      'Defaults:',
      `keepAwake=${formatDuration(info.defaultKeepAwakeDurationMs)}`,
      `timer=${formatDuration(info.defaultTimerDurationMs)}`,
      `pomodoro=${formatDuration(info.defaultPomodoroFocusMs)}/${formatDuration(info.defaultPomodoroBreakMs)}`,
      `pomodoroLoop=${info.pomodoroAdvancedLoopSupported ? 'supported' : 'unsupported'}`,
      `pomodoroCustomTemplates=${info.pomodoroCustomTemplateCount}`,
      `screenClean=${formatDuration(info.defaultScreenCleanDurationMs)}`
    ].join(' '),
    'Safety: redacted paths only; no log contents; no full configuration dump'
  ].join('\n')
}

export function createSystemInfo(): QuickOpsSystemInfo {
  const cpuList = cpus()
  return {
    osType: type(),
    osRelease: release(),
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCount: cpuList.length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    uptimeSeconds: uptime(),
    loadAverage: loadavg()
  }
}

export function formatSystemInfo(info: QuickOpsSystemInfo): string {
  return [
    `OS: ${info.osType} ${info.osRelease}`,
    `Platform: ${info.platform}/${info.arch}`,
    `CPU: ${info.cpuModel} x${info.cpuCount}`,
    `Memory: ${formatBytes(info.freeMemoryBytes)} free / ${formatBytes(info.totalMemoryBytes)} total`,
    `Uptime: ${formatDuration(Math.round(info.uptimeSeconds) * 1000)}`,
    `Load Average: ${info.loadAverage.map((value) => value.toFixed(2)).join(', ')}`
  ].join('\n')
}

export async function createDiskSpaceInfo(): Promise<
  | QuickOpsDiskSpaceInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const targets = [
    { label: 'Home', path: homedir() },
    { label: 'Tuff Data', path: app.getPath('userData') }
  ].filter((target) => target.path)

  try {
    const entries = await Promise.all(
      targets.map(async (target) => {
        const info = await statfs(target.path)
        const totalBytes = info.blocks * info.bsize
        const freeBytes = info.bavail * info.bsize
        const usedBytes = Math.max(0, totalBytes - freeBytes)
        const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0

        return {
          label: target.label,
          path: redactHomePath(target.path),
          totalBytes,
          freeBytes,
          usedBytes,
          usedPercent
        }
      })
    )

    return { entries }
  } catch {
    return {
      degradedReason: 'disk-space-read-failed',
      message: '读取文件系统容量失败'
    }
  }
}

export function formatDiskSpaceInfo(info: QuickOpsDiskSpaceInfo): string {
  return info.entries
    .map((entry) =>
      [
        `${entry.label}: ${entry.path}`,
        `Free: ${formatBytes(entry.freeBytes)}`,
        `Used: ${formatBytes(entry.usedBytes)} (${entry.usedPercent}%)`,
        `Total: ${formatBytes(entry.totalBytes)}`
      ].join('\n')
    )
    .join('\n\n')
}

export async function createDirectoryUsageInfo(
  targets: QuickOpsDirectoryUsageTarget[] = getDefaultDirectoryUsageTargets(),
  options: { deep?: boolean } = {}
): Promise<
  | QuickOpsDirectoryUsageInfo
  | {
      degradedReason: string
      message: string
      path?: string
    }
> {
  const normalizedTargets = dedupeDirectoryUsageTargets(targets)
  const deep = options.deep === true
  try {
    const entries = await Promise.all(
      normalizedTargets.map((target) => scanDirectoryUsageTarget(target, { deep }))
    )
    return {
      entries,
      maxEntriesPerDirectory: DIRECTORY_USAGE_MAX_ENTRIES,
      maxTotalEntries: deep ? DIRECTORY_USAGE_DEEP_MAX_TOTAL_ENTRIES : undefined,
      scanDepth: deep ? DIRECTORY_USAGE_DEEP_MAX_DEPTH : 1
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    const failedPath = (error as NodeJS.ErrnoException).path
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'directory-usage-directory-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'directory-usage-permission-denied'
            : 'directory-usage-read-failed',
      message:
        code === 'ENOENT'
          ? '目录不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取目录'
            : '读取目录占用失败',
      path: typeof failedPath === 'string' ? failedPath : undefined
    }
  }
}

export function formatDirectoryUsageInfo(info: QuickOpsDirectoryUsageInfo): string {
  const scanLine =
    info.scanDepth > 1
      ? `Scan: recursive depth ${info.scanDepth}, max ${info.maxEntriesPerDirectory} entries per directory, max ${info.maxTotalEntries} entries total`
      : `Scan: direct children only, max ${info.maxEntriesPerDirectory} entries per directory`
  return [
    scanLine,
    ...info.entries.map((entry) =>
      [
        `${entry.label}: ${entry.path}`,
        `Direct file size: ${formatBytes(entry.directFileBytes)}`,
        entry.totalFileBytes === undefined
          ? ''
          : `Recursive file size: ${formatBytes(entry.totalFileBytes)}`,
        `Entries: ${entry.fileCount} files, ${entry.directoryCount} directories, ${entry.otherCount} other`,
        `Scanned: ${entry.scannedEntryCount}${entry.truncated ? ' (truncated)' : ''}`
      ]
        .filter(Boolean)
        .join('\n')
    )
  ].join('\n\n')
}

function getDefaultDirectoryUsageTargets(): QuickOpsDirectoryUsageTarget[] {
  return [
    { label: 'Desktop', path: getSafeAppPath('desktop') },
    { label: 'Downloads', path: getSafeAppPath('downloads') },
    { label: 'Documents', path: getSafeAppPath('documents') },
    { label: 'Tuff Data', path: getSafeAppPath('userData') },
    { label: 'Logs', path: getSafeAppPath('logs') }
  ].filter((target) => target.path)
}

function getSafeAppPath(name: Parameters<typeof app.getPath>[0]): string {
  try {
    return app.getPath(name)
  } catch {
    return ''
  }
}

function dedupeDirectoryUsageTargets(
  targets: QuickOpsDirectoryUsageTarget[]
): QuickOpsDirectoryUsageTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    if (!target.path || seen.has(target.path)) return false
    seen.add(target.path)
    return true
  })
}

async function scanDirectoryUsageTarget(
  target: QuickOpsDirectoryUsageTarget,
  options: { deep: boolean }
): Promise<QuickOpsDirectoryUsageEntry> {
  const entries = await readdir(target.path, { withFileTypes: true })
  const scannedEntries = entries.slice(0, DIRECTORY_USAGE_MAX_ENTRIES)
  let directFileBytes = 0
  let fileCount = 0
  let directoryCount = 0
  let otherCount = 0

  for (const entry of scannedEntries) {
    if (entry.isFile()) {
      fileCount += 1
      const fileInfo = await stat(path.join(target.path, entry.name))
      directFileBytes += fileInfo.size
      continue
    }

    if (entry.isDirectory()) {
      directoryCount += 1
      continue
    }

    otherCount += 1
  }

  let totalFileBytes: number | undefined
  let deepScannedEntryCount = 0
  let deepTruncated = false
  if (options.deep) {
    const deepUsage = await scanDirectoryUsageDeep(target.path, 0, {
      scannedEntries: 0,
      truncated: false
    })
    totalFileBytes = deepUsage.totalFileBytes
    fileCount = deepUsage.fileCount
    directoryCount = deepUsage.directoryCount
    otherCount = deepUsage.otherCount
    deepScannedEntryCount = deepUsage.scannedEntryCount
    deepTruncated = deepUsage.truncated
  }

  return {
    label: target.label,
    path: redactHomePath(target.path),
    directFileBytes,
    totalFileBytes,
    fileCount,
    directoryCount,
    otherCount,
    scannedEntryCount: options.deep ? deepScannedEntryCount : scannedEntries.length,
    truncated: options.deep ? deepTruncated : entries.length > scannedEntries.length
  }
}

async function scanDirectoryUsageDeep(
  directoryPath: string,
  depth: number,
  state: { scannedEntries: number; truncated: boolean }
): Promise<{
  totalFileBytes: number
  fileCount: number
  directoryCount: number
  otherCount: number
  scannedEntryCount: number
  truncated: boolean
}> {
  if (
    depth >= DIRECTORY_USAGE_DEEP_MAX_DEPTH ||
    state.scannedEntries >= DIRECTORY_USAGE_DEEP_MAX_TOTAL_ENTRIES
  ) {
    return {
      totalFileBytes: 0,
      fileCount: 0,
      directoryCount: 0,
      otherCount: 0,
      scannedEntryCount: state.scannedEntries,
      truncated: true
    }
  }

  const entries = await readdir(directoryPath, { withFileTypes: true })
  const remainingBudget = Math.max(0, DIRECTORY_USAGE_DEEP_MAX_TOTAL_ENTRIES - state.scannedEntries)
  const scanLimit = Math.min(DIRECTORY_USAGE_MAX_ENTRIES, remainingBudget)
  const scannedEntries = entries.slice(0, scanLimit)
  state.scannedEntries += scannedEntries.length
  if (entries.length > scannedEntries.length) {
    state.truncated = true
  }

  let totalFileBytes = 0
  let fileCount = 0
  let directoryCount = 0
  let otherCount = 0

  for (const entry of scannedEntries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isFile()) {
      fileCount += 1
      const fileInfo = await stat(entryPath)
      totalFileBytes += fileInfo.size
      continue
    }

    if (entry.isDirectory()) {
      directoryCount += 1
      const child = await scanDirectoryUsageDeep(entryPath, depth + 1, state)
      totalFileBytes += child.totalFileBytes
      fileCount += child.fileCount
      directoryCount += child.directoryCount
      otherCount += child.otherCount
      state.truncated ||= child.truncated
      continue
    }

    otherCount += 1
  }

  return {
    totalFileBytes,
    fileCount,
    directoryCount,
    otherCount,
    scannedEntryCount: state.scannedEntries,
    truncated: state.truncated
  }
}

export async function createBatteryStatusInfo(): Promise<
  | QuickOpsBatteryStatusInfo
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    if (process.platform === 'darwin') return await createMacBatteryStatusInfo()
    if (process.platform === 'win32') return await createWindowsBatteryStatusInfo()
    if (process.platform === 'linux') return await createLinuxBatteryStatusInfo()
    return {
      degradedReason: 'battery-status-unsupported-platform',
      message: '当前平台暂不支持电池状态读取'
    }
  } catch {
    return {
      degradedReason: 'battery-status-read-failed',
      message: '读取电池状态失败'
    }
  }
}
async function createMacBatteryStatusInfo(): Promise<QuickOpsBatteryStatusInfo> {
  const { stdout } = await execFileAsync('pmset', ['-g', 'batt'], { timeout: 3000 })
  const info = parseMacBatteryStatus(stdout)
  if (!info) throw new Error('Unable to parse pmset battery output')
  return info
}

async function createWindowsBatteryStatusInfo(): Promise<QuickOpsBatteryStatusInfo> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Battery | Select-Object -Property EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress'
    ],
    { timeout: 5000 }
  )
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('No Windows battery data')
  }

  const info = parseWindowsBatteryStatus(trimmed)
  if (!info) throw new Error('Unable to parse Windows battery output')
  return info
}

async function createLinuxBatteryStatusInfo(): Promise<QuickOpsBatteryStatusInfo> {
  const base = '/sys/class/power_supply'
  const entries = await readdir(base)
  for (const entry of entries) {
    const root = path.join(base, entry)
    const typeText = await readFile(path.join(root, 'type'), 'utf8').catch(() => '')
    if (typeText.trim().toLowerCase() !== 'battery') continue

    const [capacity, status] = await Promise.all([
      readFile(path.join(root, 'capacity'), 'utf8'),
      readFile(path.join(root, 'status'), 'utf8').catch(() => 'unknown')
    ])
    const info = parseLinuxBatteryStatus(capacity, status)
    if (info) return info
  }

  throw new Error('No Linux battery data')
}

export function formatBatteryStatusInfo(info: QuickOpsBatteryStatusInfo): string {
  return [
    `Level: ${info.levelPercent === null ? 'unknown' : `${info.levelPercent}%`}`,
    `Charging: ${info.charging === null ? 'unknown' : info.charging ? 'yes' : 'no'}`,
    `Status: ${info.status}`,
    `Source: ${info.source}`
  ].join('\n')
}

export function shouldNotifyLowBattery(info: QuickOpsBatteryStatusInfo): boolean {
  return (
    info.levelPercent !== null &&
    info.levelPercent <= LOW_BATTERY_WARNING_THRESHOLD_PERCENT &&
    info.charging === false
  )
}

export function parseMacBatteryStatus(output: string): QuickOpsBatteryStatusInfo | null {
  const levelMatch = /(\d{1,3})%/.exec(output)
  const statusMatch = /;\s*([^;]+);/.exec(output)
  if (!levelMatch) return null

  const status = statusMatch?.[1]?.trim() || 'unknown'
  return {
    levelPercent: clampBatteryLevel(Number(levelMatch[1])),
    charging: isChargingBatteryStatus(status),
    status,
    source: 'macos-pmset'
  }
}

export function parseWindowsBatteryStatus(output: string): QuickOpsBatteryStatusInfo | null {
  const data = JSON.parse(output) as
    | {
        EstimatedChargeRemaining?: number
        BatteryStatus?: number
      }
    | Array<{
        EstimatedChargeRemaining?: number
        BatteryStatus?: number
      }>
  const battery = Array.isArray(data) ? data[0] : data
  if (!battery || battery.EstimatedChargeRemaining === undefined) return null

  const status = windowsBatteryStatusToText(battery.BatteryStatus)
  return {
    levelPercent: clampBatteryLevel(Number(battery.EstimatedChargeRemaining)),
    charging: isWindowsBatteryCharging(battery.BatteryStatus),
    status,
    source: 'windows-cim'
  }
}

export function parseLinuxBatteryStatus(
  capacity: string,
  status: string
): QuickOpsBatteryStatusInfo | null {
  const level = Number(capacity.trim())
  if (!Number.isFinite(level)) return null

  const normalizedStatus = status.trim() || 'unknown'
  return {
    levelPercent: clampBatteryLevel(level),
    charging: isChargingBatteryStatus(normalizedStatus),
    status: normalizedStatus,
    source: 'linux-sysfs'
  }
}

function clampBatteryLevel(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}

function isWindowsBatteryCharging(status: number | undefined): boolean | null {
  if (status === undefined) return null
  return [2, 6, 7, 8, 9, 11].includes(status)
}

function isChargingBatteryStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return [
    'ac',
    'charged',
    'charging',
    'finishing charge',
    'full',
    'fully charged',
    'not charging'
  ].includes(normalized)
}

function windowsBatteryStatusToText(status: number | undefined): string {
  const labels: Record<number, string> = {
    1: 'Discharging',
    2: 'AC',
    3: 'Fully Charged',
    4: 'Low',
    5: 'Critical',
    6: 'Charging',
    7: 'Charging and High',
    8: 'Charging and Low',
    9: 'Charging and Critical',
    10: 'Undefined',
    11: 'Partially Charged'
  }
  return status === undefined ? 'unknown' : (labels[status] ?? `Unknown (${status})`)
}
function redactHomePath(value: string): string {
  const home = homedir()
  if (!home || value === home) return value === home ? '~' : value

  const relative = path.relative(home, value)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return path.join('~', relative)
  }
  return value
}
function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return 'unknown'
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
    value /= 1024
  }
  return `${value.toFixed(1)} PB`
}
