import type { AppSetting, TuffQuery } from '@talex-touch/utils'
import type {
  QuickOpsPomodoroMode,
  QuickOpsScreenCleanMode,
  QuickOpsSession,
  QuickOpsSessionChangeListener
} from './quick-ops-session-manager'
import type {
  QuickOpsCapabilityEntry,
  QuickOpsCapabilityInfo,
  QuickOpsBatteryStatusInfo,
  QuickOpsDiagnosticsInfo,
  QuickOpsDirectoryUsageEntry,
  QuickOpsDirectoryUsageInfo,
  QuickOpsDiskSpaceInfo,
  QuickOpsDnsQueryInfo,
  QuickOpsDnsRecord,
  QuickOpsDnsRecordType,
  QuickOpsLocalIpInfo,
  QuickOpsNetworkStatusInfo,
  QuickOpsPortProbeInfo,
  QuickOpsPortProcessInfo,
  QuickOpsProxyInfo,
  QuickOpsSystemProxyEntry,
  QuickOpsSystemProxyInfo,
  QuickOpsSystemInfo
} from '@talex-touch/utils/transport/events/types'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { getServers } from 'node:dns'
import {
  resolve4,
  resolve6,
  resolveCname,
  resolveMx,
  resolveNs,
  resolveSoa,
  resolveTxt
} from 'node:dns/promises'
import { mkdir, readdir, readFile, rename, stat, statfs, writeFile } from 'node:fs/promises'
import { createServer, isIP } from 'node:net'
import {
  cpus,
  freemem,
  homedir,
  loadavg,
  networkInterfaces,
  release,
  totalmem,
  type,
  uptime
} from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { app } from 'electron'
import { StorageList, TuffInputType } from '@talex-touch/utils'
import {
  DEFAULT_KEEP_AWAKE_DURATION_MS,
  DEFAULT_KEEP_AWAKE_EXTEND_DURATION_MS,
  DEFAULT_POMODORO_BREAK_DURATION_MS,
  DEFAULT_POMODORO_DURATION_MS,
  DEFAULT_SCREEN_CLEAN_DURATION_MS,
  DEFAULT_SYSTEM_AWAKE_DURATION_MS,
  DEFAULT_TIMER_DURATION_MS,
  DEFAULT_TIMER_EXTEND_DURATION_MS,
  formatDuration,
  QuickOpsSessionManager
} from './quick-ops-session-manager'
import { getMainConfig } from '../storage'

export {
  formatDuration,
  getSessionDisplayDurationMs,
  QuickOpsSessionManager
} from './quick-ops-session-manager'

const execFileAsync = promisify(execFile)

type QuickOpsAction =
  | 'keep-awake-start'
  | 'keep-awake-extend'
  | 'keep-awake-stop'
  | 'system-awake-start'
  | 'system-awake-stop'
  | 'timer-start'
  | 'timer-extend'
  | 'timer-pause'
  | 'timer-resume'
  | 'timer-stop'
  | 'pomodoro-start'
  | 'pomodoro-pause'
  | 'pomodoro-resume'
  | 'pomodoro-stop'
  | 'screen-clean-start'
  | 'screen-clean-stop'
  | 'stopwatch-start'
  | 'stopwatch-pause'
  | 'stopwatch-resume'
  | 'stopwatch-lap'
  | 'stopwatch-reset'
interface QuickOpsPublicIpInfo {
  address: string
  source: string
}

interface QuickOpsDegradedResult {
  degradedReason: string
  message: string
}

interface QuickOpsFileHashInfo {
  path: string
  fileName: string
  size: number
  md5: string
  sha1: string
  sha256: string
}

interface QuickOpsFileHashBatchInfo {
  files: QuickOpsFileHashInfo[]
  totalSize: number
}

interface QuickOpsFileBase64Info {
  path: string
  fileName: string
  size: number
  base64: string
}

interface QuickOpsFileBase64BatchInfo {
  files: QuickOpsFileBase64Info[]
  totalSize: number
}

interface QuickOpsFileBase64DecodeInfo {
  path: string
  fileName: string
  size: number
}

interface QuickOpsTempTextFileInfo {
  path: string
  fileName: string
  size: number
}

interface QuickOpsTempDirectoryInfo {
  path: string
  directoryName: string
}

interface QuickOpsRecentDownloadInfo {
  path: string
  fileName: string
  size: number
  modifiedAt: number
}

interface QuickOpsRecentDownloadMoveInfo extends QuickOpsRecentDownloadInfo {
  targetDirectory: string
  targetPath: string
}

interface QuickOpsFilePathInfo {
  path: string
  fileName: string
  shellPath: string
  fileUrl: string
  windowsPath?: string
  wslPath?: string
}

type QuickOpsCommonDirectoryId = 'desktop' | 'downloads' | 'documents' | 'app-data' | 'logs'

interface QuickOpsCommonDirectoryInfo {
  id: QuickOpsCommonDirectoryId
  title: string
  subtitle: string
  path: string
}

interface QuickOpsDirectoryUsageTarget {
  label: string
  path: string
}

interface ParsedQuickOpsQuery {
  action: QuickOpsAction
  durationMs?: number
  breakDurationMs?: number
  pomodoroCycles?: number
  pomodoroLongBreakMs?: number
  pomodoroLongBreakEvery?: number
  pomodoroMode?: QuickOpsPomodoroMode
  screenMode?: QuickOpsScreenCleanMode
}

type ParsedPomodoroCycle = Pick<
  ParsedQuickOpsQuery,
  | 'durationMs'
  | 'breakDurationMs'
  | 'pomodoroCycles'
  | 'pomodoroLongBreakMs'
  | 'pomodoroLongBreakEvery'
  | 'pomodoroMode'
>

interface QuickOpsResolvedSettings {
  enabled: boolean
  showRunningSessionsInCoreBox: boolean
  allowStatefulTools: boolean
  allowNetworkTools: boolean
  allowFileTools: boolean
  allowSystemTools: boolean
  allowDeveloperTools: boolean
  allowHighRiskTools: boolean
  defaultKeepAwakeDurationMs: number
  defaultSystemAwakeDurationMs: number
  defaultTimerDurationMs: number
  defaultTimerExtendMs: number
  defaultPomodoroFocusMs: number
  defaultPomodoroBreakMs: number
  pomodoroTemplates: {
    classic: boolean
    long: boolean
    custom: QuickOpsCustomPomodoroTemplate[]
  }
  defaultScreenCleanDurationMs: number
  defaultScreenCleanMode: QuickOpsScreenCleanMode
  allowPublicIpLookup: boolean
}

const QUICK_OPS_STATEFUL_POLICY_REASON = 'stateful-tools-disabled-by-policy'
const QUICK_OPS_NETWORK_POLICY_REASON = 'network-tools-disabled-by-policy'
const QUICK_OPS_FILE_POLICY_REASON = 'file-tools-disabled-by-policy'
const QUICK_OPS_SYSTEM_POLICY_REASON = 'system-tools-disabled-by-policy'
const QUICK_OPS_DEVELOPER_POLICY_REASON = 'developer-tools-disabled-by-policy'
const QUICK_OPS_HIGH_RISK_POLICY_REASON = 'high-risk-tools-disabled-by-policy'

type QuickOpsSettingsInput = Partial<Omit<AppSetting['quickOps'], 'pomodoroTemplates'>> & {
  pomodoroTemplates?: Partial<AppSetting['quickOps']['pomodoroTemplates']>
}
type QuickOpsSettingsResolver = () => QuickOpsSettingsInput | undefined

interface QuickOpsCustomPomodoroTemplate {
  name: string
  aliases: string[]
  focusMinutes: number
  breakMinutes: number
  enabled: boolean
}

const KEEP_AWAKE_KEYWORDS = [
  'keep awake',
  'caffeine',
  'stay awake',
  '禁止息屏',
  '不要黑屏',
  '保持唤醒',
  '防止睡眠'
]

const KEEP_AWAKE_STOP_KEYWORDS = [
  'stop keep awake',
  'stop caffeine',
  'cancel keep awake',
  '停止保持唤醒',
  '取消保持唤醒',
  '停止禁止息屏'
]

const KEEP_AWAKE_EXTEND_KEYWORDS = [
  'extend keep awake',
  'extend caffeine',
  'extend stay awake',
  '延长保持唤醒',
  '延长禁止息屏',
  '保持唤醒延长'
]

const SYSTEM_AWAKE_KEYWORDS = [
  'prevent system sleep',
  'keep system awake',
  'no system sleep',
  '禁止系统睡眠',
  '防止系统睡眠',
  '不要系统睡眠'
]

const SYSTEM_AWAKE_STOP_KEYWORDS = [
  'stop prevent system sleep',
  'stop system awake',
  'cancel system awake',
  '停止禁止系统睡眠',
  '取消禁止系统睡眠',
  '停止系统唤醒'
]

const TIMER_KEYWORDS = ['timer', 'start timer', '计时', '倒计时', '开始计时']
const TIMER_EXTEND_KEYWORDS = [
  'extend timer',
  'snooze timer',
  'add timer',
  '延长计时',
  '计时延长',
  '再计时'
]
const TIMER_PAUSE_KEYWORDS = ['pause timer', '暂停计时', '暂停倒计时']
const TIMER_RESUME_KEYWORDS = ['resume timer', 'continue timer', '继续计时', '恢复计时']
const TIMER_STOP_KEYWORDS = ['stop timer', 'cancel timer', '停止计时', '取消计时']
const POMODORO_KEYWORDS = ['pomodoro', 'start pomodoro', '番茄钟', '开始番茄钟']
const POMODORO_CYCLE_KEYWORDS = [
  'pomodoro cycle',
  'start pomodoro cycle',
  'cycle pomodoro',
  '循环番茄钟',
  '番茄钟循环'
]
const POMODORO_CUSTOM_TEMPLATE_KEYWORDS = [
  'custom pomodoro',
  'pomodoro custom',
  'custom pomodoro template',
  '自定义番茄钟',
  '番茄钟自定义',
  '自定义番茄模板'
]
const POMODORO_PAUSE_KEYWORDS = ['pause pomodoro', '暂停番茄钟']
const POMODORO_RESUME_KEYWORDS = [
  'resume pomodoro',
  'continue pomodoro',
  '继续番茄钟',
  '恢复番茄钟'
]
const POMODORO_STOP_KEYWORDS = ['stop pomodoro', 'cancel pomodoro', '停止番茄钟', '取消番茄钟']
const SCREEN_CLEAN_KEYWORDS = [
  'clean screen',
  'screen clean',
  'screen cleaning',
  'wipe screen',
  'black clean screen',
  'white clean screen',
  'solid color screen',
  'screen color test',
  'screen test',
  'dead pixel test',
  'red screen test',
  'green screen test',
  'blue screen test',
  '清洁屏幕',
  '擦屏幕',
  '屏幕清洁',
  '黑色清洁屏幕',
  '白色清洁屏幕',
  '白底清洁屏幕',
  '黑底清洁屏幕',
  '纯色屏幕',
  '屏幕纯色',
  '屏幕测试',
  '坏点测试',
  '红色屏幕测试',
  '绿色屏幕测试',
  '蓝色屏幕测试'
]
const SCREEN_CLEAN_WHITE_KEYWORDS = ['white', 'light', '白色', '白底']
const SCREEN_COLOR_TEST_KEYWORDS = [
  'solid color screen',
  'screen color test',
  'screen test',
  'dead pixel test',
  '纯色屏幕',
  '屏幕纯色',
  '屏幕测试',
  '坏点测试'
]
const SCREEN_CLEAN_STOP_KEYWORDS = [
  'stop clean screen',
  'stop screen clean',
  'cancel clean screen',
  '停止清洁屏幕',
  '退出清洁屏幕',
  '关闭清洁屏幕'
]
const STOPWATCH_KEYWORDS = ['stopwatch', 'start stopwatch', '秒表', '开始秒表']
const STOPWATCH_PAUSE_KEYWORDS = ['pause stopwatch', '暂停秒表']
const STOPWATCH_RESUME_KEYWORDS = ['resume stopwatch', 'continue stopwatch', '继续秒表', '恢复秒表']
const STOPWATCH_LAP_KEYWORDS = ['lap stopwatch', 'split stopwatch', '秒表分段', '记录分段']
const STOPWATCH_RESET_KEYWORDS = [
  'reset stopwatch',
  'stop stopwatch',
  'clear stopwatch',
  '重置秒表',
  '停止秒表',
  '清空秒表'
]
const PUBLIC_IP_LOOKUP_URL = 'https://api.ipify.org?format=json'
const PUBLIC_IP_LOOKUP_TIMEOUT_MS = 5_000
const PORT_QUERY_PATTERN = /(?:^|\s)(?:port|端口)\s*[:#-]?\s*(\d{1,5})(?:\s|$)/
const FILE_BASE64_MAX_BYTES = 1 * 1024 * 1024
const FILE_BASE64_DECODE_OUTPUT_NAME = 'decoded-base64.bin'
const TEMP_TEXT_FILE_MAX_BYTES = 64 * 1024
const DNS_QUERY_COMMANDS = [
  'dns query',
  'dns lookup',
  'dns 查询',
  'dns查询',
  'dns',
  '域名解析',
  '解析域名'
]
const DEEP_DNS_QUERY_COMMANDS = [
  'deep dns query',
  'deep dns lookup',
  'deep dns',
  'dns deep',
  'dns full',
  'dns all',
  '深度 dns 查询',
  '深度dns查询',
  '深度 dns',
  '深度dns',
  '完整 dns 查询',
  '完整dns查询'
]
const BASIC_DNS_RECORD_TYPES: QuickOpsDnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX']
const DEEP_DNS_RECORD_TYPES: QuickOpsDnsRecordType[] = [
  ...BASIC_DNS_RECORD_TYPES,
  'NS',
  'TXT',
  'SOA'
]
const DIRECTORY_USAGE_MAX_ENTRIES = 200
const DIRECTORY_USAGE_DEEP_MAX_DEPTH = 3
const DIRECTORY_USAGE_DEEP_MAX_TOTAL_ENTRIES = 1_000
const LOW_BATTERY_WARNING_THRESHOLD_PERCENT = 20
const PROXY_ENV_NAMES = [
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'all_proxy',
  'no_proxy'
]

const COMMON_DIRECTORY_DEFINITIONS: Array<{
  id: QuickOpsCommonDirectoryId
  title: string
  subtitle: string
  appPathName: Parameters<typeof app.getPath>[0]
  aliases: string[]
}> = [
  {
    id: 'desktop',
    title: '桌面',
    subtitle: 'Desktop',
    appPathName: 'desktop',
    aliases: ['desktop', '桌面']
  },
  {
    id: 'downloads',
    title: '下载',
    subtitle: 'Downloads',
    appPathName: 'downloads',
    aliases: ['downloads', 'download', '下载']
  },
  {
    id: 'documents',
    title: '文档',
    subtitle: 'Documents',
    appPathName: 'documents',
    aliases: ['documents', 'document', '文档']
  },
  {
    id: 'app-data',
    title: '应用数据',
    subtitle: 'User Data',
    appPathName: 'userData',
    aliases: ['app data', 'user data', 'userdata', '应用数据', '用户数据']
  },
  {
    id: 'logs',
    title: '日志',
    subtitle: 'Logs',
    appPathName: 'logs',
    aliases: ['logs', 'log', '日志']
  }
]

export class QuickOpsRuntimeHost {
  constructor(
    private readonly sessions = new QuickOpsSessionManager(),
    private readonly resolveSettings: QuickOpsSettingsResolver = readQuickOpsSettings
  ) {}

  onDeactivate(): void {
    this.sessions.stopAll('runtime-deactivate')
  }

  onDestroy(): void {
    this.sessions.stopAll('runtime-destroy')
  }

  cleanup(reason = 'cleanup'): void {
    this.sessions.stopAll(reason)
  }

  getCapabilityInfo(): QuickOpsCapabilityInfo {
    return createQuickOpsCapabilityInfo(getQuickOpsResolvedSettings(this.resolveSettings()))
  }

  getDiagnosticsInfo(): QuickOpsDiagnosticsInfo {
    return createDiagnosticsInfo(getQuickOpsResolvedSettings(this.resolveSettings()))
  }

  startKeepAwake(durationMs?: number) {
    return this.sessions.startKeepAwake(durationMs)
  }

  startSystemAwake(durationMs?: number) {
    return this.sessions.startSystemAwake(durationMs)
  }

  startTimer(durationMs?: number) {
    return this.sessions.startTimer(durationMs)
  }

  pauseTimer() {
    return this.sessions.pauseTimer()
  }

  resumeTimer() {
    return this.sessions.resumeTimer()
  }

  startPomodoro(
    durationMs?: number,
    mode?: QuickOpsPomodoroMode,
    breakDurationMs?: number,
    totalCycles?: number,
    longBreakDurationMs?: number,
    longBreakEveryCycles?: number
  ) {
    return this.sessions.startPomodoro(
      durationMs,
      mode,
      breakDurationMs,
      totalCycles,
      longBreakDurationMs,
      longBreakEveryCycles
    )
  }

  pausePomodoro() {
    return this.sessions.pausePomodoro()
  }

  resumePomodoro() {
    return this.sessions.resumePomodoro()
  }

  startScreenClean(durationMs?: number, screenMode?: QuickOpsScreenCleanMode) {
    return this.sessions.startScreenClean(durationMs, screenMode)
  }

  startStopwatch() {
    return this.sessions.startStopwatch()
  }

  pauseStopwatch() {
    return this.sessions.pauseStopwatch()
  }

  resumeStopwatch() {
    return this.sessions.resumeStopwatch()
  }

  lapStopwatch() {
    return this.sessions.lapStopwatch()
  }

  stopKeepAwake(reason = 'flow-action'): boolean {
    return this.sessions.stop('keep-awake', reason)
  }

  stopSystemAwake(reason = 'flow-action'): boolean {
    return this.sessions.stop('system-awake', reason)
  }

  stopTimer(reason = 'flow-action'): boolean {
    return this.sessions.stop('timer', reason)
  }

  stopPomodoro(reason = 'flow-action'): boolean {
    return this.sessions.stop('pomodoro', reason)
  }

  stopScreenClean(reason = 'flow-action'): boolean {
    return this.sessions.stop('screen-clean', reason)
  }

  resetStopwatch(reason = 'flow-action'): boolean {
    return this.sessions.stop('stopwatch', reason)
  }

  stopAllSessions(reason = 'flow-action'): number {
    const count = this.sessions.list().length
    if (count > 0) {
      this.sessions.stopAll(reason)
    }
    return count
  }

  listSessions(): QuickOpsSession[] {
    return this.sessions.list()
  }

  subscribeSessions(listener: QuickOpsSessionChangeListener): () => void {
    return this.sessions.subscribe(listener)
  }
}

export function getLocalIpAddresses(): QuickOpsLocalIpInfo[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, values]) =>
      (values ?? []).map((value) => ({
        name,
        family: value.family,
        address: value.address,
        internal: value.internal
      }))
    )
    .filter((value) => !value.internal && value.address)
    .sort((left, right) => {
      if (left.family !== right.family) return left.family === 'IPv4' ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    .map(({ name, family, address }) => ({ name, family, address }))
}

export function formatLocalIpInfo(addresses: QuickOpsLocalIpInfo[]): string {
  return addresses.length > 0
    ? addresses.map((item) => `${item.name} ${item.family} ${item.address}`).join('\n')
    : 'No non-internal local address'
}

export async function lookupPublicIp(
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<QuickOpsPublicIpInfo | QuickOpsDegradedResult> {
  if (typeof fetchImpl !== 'function') {
    return {
      degradedReason: 'public-ip-fetch-unavailable',
      message: '当前运行时不支持 fetch'
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PUBLIC_IP_LOOKUP_TIMEOUT_MS)

  try {
    const response = await fetchImpl(PUBLIC_IP_LOOKUP_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!response.ok) {
      return {
        degradedReason: 'public-ip-request-failed',
        message: `外部服务返回 HTTP ${response.status}`
      }
    }

    const payload = (await response.json()) as { ip?: unknown }
    const address = typeof payload.ip === 'string' ? payload.ip.trim() : ''
    if (!isValidIpAddress(address)) {
      return {
        degradedReason: 'public-ip-invalid-response',
        message: '外部服务返回了不可识别的 IP 地址'
      }
    }

    return {
      address,
      source: PUBLIC_IP_LOOKUP_URL
    }
  } catch {
    return {
      degradedReason: 'public-ip-request-failed',
      message: '无法连接公网 IP 查询服务'
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isValidIpAddress(address: string): boolean {
  if (!address || address.length > 45) return false
  return isIP(address) !== 0
}

export function createNetworkStatusInfo(): QuickOpsNetworkStatusInfo {
  const proxies = getProxyEnvironmentInfo()
  return {
    addresses: getLocalIpAddresses(),
    dnsServers: getServers(),
    proxyStatus: proxies.length > 0 ? 'detected' : 'not-detected',
    proxies
  }
}

export function createQuickOpsCapabilityInfo(
  settings: QuickOpsResolvedSettings,
  platform: NodeJS.Platform = process.platform
): QuickOpsCapabilityInfo {
  const disabledReason = 'quickops-disabled'
  const statusForRisk = (
    riskLevel: QuickOpsCapabilityEntry['riskLevel'],
    reason?: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason }
    if (!settings.allowStatefulTools && (riskLevel === 'stateful' || riskLevel === 'confirm')) {
      return { status: 'disabled', reason: QUICK_OPS_STATEFUL_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForNetwork = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowNetworkTools) {
      return { status: 'disabled', reason: QUICK_OPS_NETWORK_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForFile = (
    riskLevel: QuickOpsCapabilityEntry['riskLevel'],
    reason?: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason }
    if (!settings.allowFileTools) {
      return { status: 'disabled', reason: QUICK_OPS_FILE_POLICY_REASON }
    }
    return statusForRisk(riskLevel, reason)
  }
  const statusForSystem = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowSystemTools) {
      return { status: 'disabled', reason: QUICK_OPS_SYSTEM_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForDeveloper = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowDeveloperTools) {
      return { status: 'disabled', reason: QUICK_OPS_DEVELOPER_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForHighRisk = (
    fallbackReason: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowHighRiskTools) {
      return { status: 'disabled', reason: QUICK_OPS_HIGH_RISK_POLICY_REASON }
    }
    return { status: 'disabled', reason: fallbackReason }
  }
  const platformLabel = platform
  const systemProxyReason =
    platform === 'darwin'
      ? 'macos-scutil'
      : platform === 'win32'
        ? 'windows-internet-settings'
        : platform === 'linux'
          ? 'linux-gsettings-fallback'
          : 'unsupported-platform'
  const batteryReason =
    platform === 'darwin'
      ? 'macos-pmset'
      : platform === 'win32'
        ? 'windows-cim'
        : platform === 'linux'
          ? 'linux-sysfs'
          : 'unsupported-platform'

  const entries: QuickOpsCapabilityEntry[] = [
    {
      id: 'quickops.state.keepAwake',
      label: '显示器保持唤醒',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.state.systemAwake',
      label: '系统睡眠阻止',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.state.timer',
      label: '快速计时器 / 秒表 / 番茄钟',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.screen.overlay',
      label: '清洁屏幕 / 纯色屏幕',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.network.local',
      label: '本机网络只读查询',
      riskLevel: 'safe',
      ...statusForNetwork()
    },
    {
      id: 'quickops.network.publicIp',
      label: '公网 IP opt-in 查询',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowNetworkTools
          ? 'disabled'
          : settings.allowPublicIpLookup
            ? 'supported'
            : 'disabled',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowNetworkTools
          ? QUICK_OPS_NETWORK_POLICY_REASON
          : settings.allowPublicIpLookup
            ? undefined
            : 'public-ip-disabled'
    },
    {
      id: 'quickops.network.systemProxy',
      label: '系统代理只读摘要',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowNetworkTools
          ? 'disabled'
          : systemProxyReason === 'unsupported-platform'
            ? 'degraded'
            : 'supported',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowNetworkTools
          ? QUICK_OPS_NETWORK_POLICY_REASON
          : systemProxyReason
    },
    {
      id: 'quickops.files.readOnly',
      label: '文件 Hash / Base64 / 路径复制',
      riskLevel: 'safe',
      ...statusForFile('safe', disabledReason)
    },
    {
      id: 'quickops.files.writeTemp',
      label: 'Tuff 临时文件写入',
      riskLevel: 'confirm',
      ...statusForFile('confirm', disabledReason)
    },
    {
      id: 'quickops.files.moveRecentDownload',
      label: '最近下载文件移动',
      riskLevel: 'confirm',
      ...statusForFile('confirm', disabledReason)
    },
    {
      id: 'quickops.system.diagnostics',
      label: '脱敏诊断 / 系统信息',
      riskLevel: 'safe',
      ...statusForSystem()
    },
    {
      id: 'quickops.system.storage',
      label: '磁盘空间 / 目录占用',
      riskLevel: 'safe',
      ...statusForSystem()
    },
    {
      id: 'quickops.system.battery',
      label: '电池状态',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowSystemTools
          ? 'disabled'
          : batteryReason === 'unsupported-platform'
            ? 'degraded'
            : 'supported',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowSystemTools
          ? QUICK_OPS_SYSTEM_POLICY_REASON
          : batteryReason
    },
    {
      id: 'quickops.developer.preview',
      label: 'PreviewSDK 开发者工具',
      riskLevel: 'safe',
      ...statusForDeveloper()
    },
    {
      id: 'quickops.network.portKill',
      label: '真实端口进程终止',
      riskLevel: 'danger',
      ...(!settings.allowNetworkTools
        ? { status: 'disabled' as const, reason: QUICK_OPS_NETWORK_POLICY_REASON }
        : statusForHighRisk('copy-only-command'))
    }
  ]

  return {
    platform: platformLabel,
    enabled: settings.enabled,
    entries
  }
}

export function formatQuickOpsCapabilityInfo(info: QuickOpsCapabilityInfo): string {
  return [
    `QuickOps Capabilities (${info.platform})`,
    `Enabled: ${info.enabled ? 'yes' : 'no'}`,
    ...info.entries.map((entry) =>
      [
        entry.id,
        entry.status,
        `risk=${entry.riskLevel}`,
        entry.reason ? `reason=${entry.reason}` : null,
        entry.label
      ]
        .filter((part): part is string => Boolean(part))
        .join(' | ')
    )
  ].join('\n')
}

export function formatNetworkStatusInfo(info: QuickOpsNetworkStatusInfo): string {
  const addresses =
    info.addresses.length > 0
      ? info.addresses.map((item) => `${item.name} ${item.family} ${item.address}`).join('\n')
      : 'No non-internal local address'
  const dnsServers = info.dnsServers.length > 0 ? info.dnsServers.join('\n') : 'No DNS server'
  const proxyInfo =
    info.proxies.length > 0
      ? info.proxies.map((item) => `${item.source}: ${item.value}`).join('\n')
      : 'No proxy environment variable detected'

  return [
    'Local Addresses:',
    addresses,
    '',
    'DNS Servers:',
    dnsServers,
    '',
    'Proxy:',
    proxyInfo
  ].join('\n')
}

export function parseDnsQuery(text: string): { hostname: string; deep: boolean } | null {
  const normalized = text.trim()
  if (!normalized) return null

  for (const command of DEEP_DNS_QUERY_COMMANDS) {
    const pattern = new RegExp(`^${escapeRegExp(command)}\\s+(.+)$`, 'i')
    const match = normalized.match(pattern)
    const hostname = match?.[1]?.trim()
    const normalizedHostname = hostname ? normalizeDnsHostname(hostname) : null
    if (normalizedHostname) return { hostname: normalizedHostname, deep: true }
  }

  for (const command of DNS_QUERY_COMMANDS) {
    const pattern = new RegExp(`^${escapeRegExp(command)}\\s+(.+)$`, 'i')
    const match = normalized.match(pattern)
    const hostname = match?.[1]?.trim()
    const normalizedHostname = hostname ? normalizeDnsHostname(hostname) : null
    if (normalizedHostname) return { hostname: normalizedHostname, deep: false }
  }

  return null
}

export function normalizeDnsHostname(value: string): string | null {
  const withoutProtocol = value.replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
  const hostname = withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, '').trim().toLowerCase()
  if (!hostname || hostname.length > 253) return null
  if (hostname.includes('..')) return null
  if (/[^a-z0-9.-]/.test(hostname)) return null
  if (!hostname.includes('.')) return null

  const labels = hostname.split('.')
  if (
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-')
    )
  ) {
    return null
  }

  return hostname
}

export async function createDnsQueryInfo(
  hostname: string,
  deep = false
): Promise<
  | QuickOpsDnsQueryInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const normalizedHostname = normalizeDnsHostname(hostname)
  if (!normalizedHostname) {
    return {
      degradedReason: 'dns-query-invalid-hostname',
      message: '请输入有效域名'
    }
  }

  const results = await Promise.allSettled([
    resolve4(normalizedHostname),
    resolve6(normalizedHostname),
    resolveCname(normalizedHostname),
    resolveMx(normalizedHostname),
    ...(deep
      ? [
          resolveNs(normalizedHostname),
          resolveTxt(normalizedHostname),
          resolveSoa(normalizedHostname)
        ]
      : [])
  ])
  const records: QuickOpsDnsRecord[] = []
  const failedTypes: QuickOpsDnsRecordType[] = []

  appendDnsRecordResults(records, failedTypes, 'A', results[0])
  appendDnsRecordResults(records, failedTypes, 'AAAA', results[1])
  appendDnsRecordResults(records, failedTypes, 'CNAME', results[2])
  appendDnsRecordResults(records, failedTypes, 'MX', results[3])
  if (deep) {
    appendDnsRecordResults(records, failedTypes, 'NS', results[4])
    appendDnsRecordResults(records, failedTypes, 'TXT', results[5])
    appendDnsRecordResults(records, failedTypes, 'SOA', results[6])
  }

  if (records.length === 0) {
    return {
      degradedReason: 'dns-query-no-records',
      message: `未解析到 ${getDnsRecordTypes(deep).join(' / ')} 记录`
    }
  }

  return {
    hostname: normalizedHostname,
    records,
    failedTypes,
    deep
  }
}

export function formatDnsQueryInfo(info: QuickOpsDnsQueryInfo): string {
  const grouped = new Map<QuickOpsDnsRecordType, QuickOpsDnsRecord[]>()
  info.records.forEach((record) => {
    const records = grouped.get(record.type) ?? []
    records.push(record)
    grouped.set(record.type, records)
  })

  const sections = [`Host: ${info.hostname}`]
  getDnsRecordTypes(info.deep).forEach((type) => {
    const records = grouped.get(type)
    if (!records?.length) return
    sections.push(
      `${type}:`,
      ...records.map((record) =>
        record.type === 'MX' && record.priority !== undefined
          ? `${record.priority} ${record.value}`
          : record.value
      )
    )
  })

  if (info.failedTypes.length > 0) {
    sections.push(`Unavailable: ${info.failedTypes.join(', ')}`)
  }

  return sections.join('\n')
}

export function getProxyEnvironmentInfo(env: NodeJS.ProcessEnv = process.env): QuickOpsProxyInfo[] {
  return PROXY_ENV_NAMES.flatMap((name) => {
    const value = env[name]?.trim()
    return value ? [{ source: name, value: redactProxyValue(value) }] : []
  })
}

export async function createSystemProxyInfo(): Promise<QuickOpsSystemProxyInfo> {
  const environment = getProxyEnvironmentInfo()
  try {
    const system = await getSystemProxyEntries()
    return {
      platform: process.platform,
      status: environment.length + system.length > 0 ? 'detected' : 'not-detected',
      environment,
      system
    }
  } catch (error) {
    return {
      platform: process.platform,
      status: 'degraded',
      environment,
      system: [],
      degradedReason: 'system-proxy-probe-failed',
      degradedMessage: error instanceof Error ? error.message : 'Unable to read system proxy'
    }
  }
}

export function formatSystemProxyInfo(info: QuickOpsSystemProxyInfo): string {
  const envText =
    info.environment.length > 0
      ? info.environment.map((item) => `${item.source}: ${item.value}`).join('\n')
      : 'No proxy environment variable detected'
  const systemText =
    info.system.length > 0
      ? info.system.map((item) => `${item.name}: ${item.value}`).join('\n')
      : 'No enabled system proxy detected'
  const statusText =
    info.status === 'degraded' && info.degradedMessage
      ? `${info.status} (${info.degradedMessage})`
      : info.status

  return [
    `Platform: ${info.platform}`,
    `Status: ${statusText}`,
    '',
    'Environment Proxy:',
    envText,
    '',
    'System Proxy:',
    systemText,
    '',
    'Safety: read-only local proxy settings; credentials redacted; no external connectivity check'
  ].join('\n')
}

async function getSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  if (process.platform === 'darwin') return getMacSystemProxyEntries()
  if (process.platform === 'win32') return getWindowsSystemProxyEntries()
  if (process.platform === 'linux') return getLinuxSystemProxyEntries()
  return []
}

async function getMacSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync('scutil', ['--proxy'], { timeout: 3000 })
  return parseMacSystemProxyEntries(stdout)
}

async function getWindowsSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      [
        "$settings = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
        '[PSCustomObject]@{',
        'ProxyEnable=$settings.ProxyEnable;',
        'ProxyServer=$settings.ProxyServer;',
        'AutoConfigURL=$settings.AutoConfigURL;',
        'ProxyOverride=$settings.ProxyOverride',
        '} | ConvertTo-Json -Compress'
      ].join(' ')
    ],
    { timeout: 5000 }
  )
  return parseWindowsSystemProxyEntries(stdout)
}

async function getLinuxSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'mode'], {
    timeout: 3000
  })
  return parseLinuxSystemProxyEntries(stdout)
}

export function parseMacSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const values = new Map<string, string>()
  stdout.split(/\r?\n/).forEach((line) => {
    const match = /^\s*([A-Za-z][A-Za-z0-9]+)\s*:\s*(.+?)\s*$/.exec(line)
    if (!match?.[1] || !match[2]) return
    values.set(match[1], match[2])
  })

  const entries: QuickOpsSystemProxyEntry[] = []
  appendMacProxyEntry(entries, values, 'HTTP', 'HTTPEnable', 'HTTPProxy', 'HTTPPort')
  appendMacProxyEntry(entries, values, 'HTTPS', 'HTTPSEnable', 'HTTPSProxy', 'HTTPSPort')
  appendMacProxyEntry(entries, values, 'SOCKS', 'SOCKSEnable', 'SOCKSProxy', 'SOCKSPort')

  if (values.get('ProxyAutoConfigEnable') === '1') {
    const pacUrl = values.get('ProxyAutoConfigURLString')
    entries.push({
      source: 'macos-system',
      name: 'PAC',
      value: pacUrl ? redactProxyValue(pacUrl) : 'enabled'
    })
  }

  if (values.get('ProxyAutoDiscoveryEnable') === '1') {
    entries.push({
      source: 'macos-system',
      name: 'Auto Discovery',
      value: 'enabled'
    })
  }

  return entries
}

export function parseWindowsSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  const payload = JSON.parse(trimmed) as
    | {
        ProxyEnable?: number | boolean | string
        ProxyServer?: string
        AutoConfigURL?: string
        ProxyOverride?: string
      }
    | Array<{
        ProxyEnable?: number | boolean | string
        ProxyServer?: string
        AutoConfigURL?: string
        ProxyOverride?: string
      }>
  const settings = Array.isArray(payload) ? payload[0] : payload
  if (!settings) return []

  const entries: QuickOpsSystemProxyEntry[] = []
  if (isTruthyProxyFlag(settings.ProxyEnable) && settings.ProxyServer) {
    entries.push({
      source: 'windows-system',
      name: 'ProxyServer',
      value: redactProxyValue(settings.ProxyServer)
    })
  }
  if (settings.AutoConfigURL) {
    entries.push({
      source: 'windows-system',
      name: 'AutoConfigURL',
      value: redactProxyValue(settings.AutoConfigURL)
    })
  }
  if (settings.ProxyOverride) {
    entries.push({
      source: 'windows-system',
      name: 'ProxyOverride',
      value: settings.ProxyOverride
    })
  }

  return entries
}

export function parseLinuxSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const mode = stdout.trim().replace(/^['"]|['"]$/g, '')
  if (!mode || mode === 'none') return []

  return [
    {
      source: 'linux-gsettings',
      name: 'GNOME Proxy Mode',
      value: mode
    }
  ]
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

export function parsePortQuery(text: string): number | null {
  const match = text.match(PORT_QUERY_PATTERN)
  if (!match?.[1]) return null

  const port = Number(match[1])
  return Number.isInteger(port) ? port : null
}

export function isValidTcpPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

export function createPortReleaseCommand(processInfo: QuickOpsPortProcessInfo): string {
  if (processInfo.source === 'windows-nettcpconnection') {
    return `Stop-Process -Id ${processInfo.pid}`
  }

  return `kill ${processInfo.pid}`
}

export function probeLocalTcpPort(
  port: number,
  host = '127.0.0.1'
): Promise<QuickOpsPortProbeInfo> {
  return new Promise((resolve) => {
    const server = createServer()
    let settled = false

    const settle = (result: QuickOpsPortProbeInfo): void => {
      if (settled) return
      settled = true
      server.removeAllListeners()
      if (server.listening) {
        server.close(() => resolve(result))
        return
      }
      resolve(result)
    }

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EADDRINUSE') {
        settle({
          port,
          host,
          available: false,
          degradedReason: 'port-probe-failed',
          errorCode: error.code
        })
        return
      }

      void getPortProcessInfo(port)
        .catch(() => null)
        .then((processInfo) =>
          settle({
            port,
            host,
            available: false,
            process: processInfo ?? undefined,
            degradedReason: 'port-occupied',
            errorCode: error.code
          })
        )
    })
    server.listen({ port, host, exclusive: true }, () => {
      settle({ port, host, available: true })
    })
  })
}

export async function getPortProcessInfo(port: number): Promise<QuickOpsPortProcessInfo | null> {
  if (!isValidTcpPort(port)) return null

  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        [
          `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
          '$connections | Select-Object -First 1 -ExpandProperty OwningProcess | ForEach-Object {',
          '$p = Get-Process -Id $_ -ErrorAction SilentlyContinue',
          '[PSCustomObject]@{ Pid = $_; Name = $p.ProcessName; Path = $p.Path } | ConvertTo-Json -Compress',
          '}'
        ].join('; ')
      ],
      { timeout: 1200, windowsHide: true }
    )
    return parseWindowsPortProcessInfo(stdout)
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pc'],
      { timeout: 1200 }
    )
    return parseLsofPortProcessInfo(stdout)
  }

  return null
}

export function parseLsofPortProcessInfo(output: string): QuickOpsPortProcessInfo | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let pid: number | null = null
  let command: string | undefined

  for (const line of lines) {
    const prefix = line[0]
    const value = line.slice(1).trim()
    if (prefix === 'p') {
      const parsedPid = Number(value)
      if (Number.isInteger(parsedPid) && parsedPid > 0) pid = parsedPid
      continue
    }
    if (prefix === 'c' && value) command = value
  }

  if (pid === null) return null
  return {
    pid,
    name: command,
    command,
    source: 'lsof'
  }
}

export function parseWindowsPortProcessInfo(output: string): QuickOpsPortProcessInfo | null {
  const trimmed = output.trim()
  if (!trimmed) return null

  const data = JSON.parse(trimmed) as
    | {
        Pid?: number | string
        Name?: string
        Path?: string
      }
    | Array<{
        Pid?: number | string
        Name?: string
        Path?: string
      }>
  const processInfo = Array.isArray(data) ? data[0] : data
  if (!processInfo?.Pid) return null

  const pid = Number(processInfo.Pid)
  if (!Number.isInteger(pid) || pid <= 0) return null

  return {
    pid,
    name: processInfo.Name || undefined,
    command: processInfo.Path || processInfo.Name || undefined,
    source: 'windows-nettcpconnection'
  }
}

export function resolveFileHashPath(rawText: string, query: TuffQuery): string | null {
  return resolveFileHashPaths(rawText, query)[0] ?? null
}

export function resolveFileHashPaths(rawText: string, query: TuffQuery): string[] {
  const inputPaths = resolveFilesInputPaths(query)
  if (inputPaths.length > 0) return inputPaths

  const textPath = stripFileHashCommand(rawText)
  return textPath ? [textPath] : []
}

export function resolveFileBase64Path(rawText: string, query: TuffQuery): string | null {
  const inputPaths = resolveFilesInputPaths(query)
  if (inputPaths.length === 1) return inputPaths[0] ?? null
  if (inputPaths.length > 1) return null

  const textPath = stripFileBase64Command(rawText)
  return textPath || null
}

export function resolveFilePathTarget(rawText: string, query: TuffQuery): string | null {
  const inputPath = resolveFirstFilesInputPath(query)
  if (inputPath) return inputPath

  const textPath = stripFilePathCommand(rawText)
  return textPath || null
}

export function createFilePathInfo(filePath: string): QuickOpsFilePathInfo {
  return {
    path: filePath,
    fileName: getFilePathDisplayName(filePath),
    shellPath: escapeShellPath(filePath),
    fileUrl: pathToFileURL(filePath).href,
    windowsPath: convertWslPathToWindowsPath(filePath),
    wslPath: convertWindowsPathToWslPath(filePath)
  }
}

export function resolveCommonDirectory(text: string): QuickOpsCommonDirectoryInfo {
  const directory =
    COMMON_DIRECTORY_DEFINITIONS.find((item) => matchesKeyword(text, item.aliases)) ??
    COMMON_DIRECTORY_DEFINITIONS[0]

  return {
    id: directory.id,
    title: directory.title,
    subtitle: directory.subtitle,
    path: app.getPath(directory.appPathName)
  }
}

export async function findRecentDownloadFile(): Promise<
  QuickOpsRecentDownloadInfo | QuickOpsDegradedResult
> {
  const downloadsPath = app.getPath('downloads')
  try {
    const entries = await readdir(downloadsPath, { withFileTypes: true })
    const files: QuickOpsRecentDownloadInfo[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const filePath = path.join(downloadsPath, entry.name)
      const fileInfo = await stat(filePath)
      if (!fileInfo.isFile()) continue

      files.push({
        path: filePath,
        fileName: entry.name,
        size: fileInfo.size,
        modifiedAt: fileInfo.mtimeMs
      })
    }

    files.sort((left, right) => right.modifiedAt - left.modifiedAt)
    const latest = files[0]
    if (!latest) {
      return {
        degradedReason: 'recent-download-empty',
        message: 'Downloads 目录没有可打开的普通文件'
      }
    }

    return latest
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'recent-download-permission-denied'
          : 'recent-download-read-failed',
      message:
        code === 'EACCES' || code === 'EPERM'
          ? '没有权限读取 Downloads 目录'
          : '无法读取 Downloads 目录'
    }
  }
}

export async function prepareRecentDownloadMove(
  targetDirectory: string
): Promise<QuickOpsRecentDownloadMoveInfo | QuickOpsDegradedResult> {
  const normalizedTargetDirectory = targetDirectory.trim()
  if (!normalizedTargetDirectory || !path.isAbsolute(normalizedTargetDirectory)) {
    return {
      degradedReason: 'recent-download-move-invalid-target',
      message: '目标目录必须是绝对路径'
    }
  }

  const latest = await findRecentDownloadFile()
  if ('degradedReason' in latest) return latest

  try {
    const directoryInfo = await stat(normalizedTargetDirectory)
    if (!directoryInfo.isDirectory()) {
      return {
        degradedReason: 'recent-download-move-target-not-directory',
        message: '目标路径不是目录'
      }
    }

    const targetPath = path.join(normalizedTargetDirectory, latest.fileName)
    try {
      await stat(targetPath)
      return {
        degradedReason: 'recent-download-move-target-exists',
        message: '目标目录中已存在同名文件'
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          degradedReason: 'recent-download-move-target-check-failed',
          message: '无法检查目标路径'
        }
      }
    }

    return {
      ...latest,
      targetDirectory: normalizedTargetDirectory,
      targetPath
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'recent-download-move-target-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'recent-download-move-target-permission-denied'
            : 'recent-download-move-target-read-failed',
      message:
        code === 'ENOENT'
          ? '目标目录不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取目标目录'
            : '无法读取目标目录'
    }
  }
}

export async function moveRecentDownloadFile(
  sourcePath: string,
  targetPath: string
): Promise<{ path: string; targetPath: string } | QuickOpsDegradedResult> {
  if (!sourcePath || !targetPath || !path.isAbsolute(sourcePath) || !path.isAbsolute(targetPath)) {
    return {
      degradedReason: 'recent-download-move-invalid-path',
      message: '移动路径无效'
    }
  }

  if (!isPathInsideDirectory(sourcePath, app.getPath('downloads'))) {
    return {
      degradedReason: 'recent-download-move-source-outside-downloads',
      message: '源文件不在 Downloads 目录内'
    }
  }

  try {
    const sourceInfo = await stat(sourcePath)
    if (!sourceInfo.isFile()) {
      return {
        degradedReason: 'recent-download-move-source-not-file',
        message: '源路径不是普通文件'
      }
    }

    const targetDirectory = path.dirname(targetPath)
    const targetDirectoryInfo = await stat(targetDirectory)
    if (!targetDirectoryInfo.isDirectory()) {
      return {
        degradedReason: 'recent-download-move-target-not-directory',
        message: '目标路径不是目录'
      }
    }

    try {
      await stat(targetPath)
      return {
        degradedReason: 'recent-download-move-target-exists',
        message: '目标目录中已存在同名文件'
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          degradedReason: 'recent-download-move-target-check-failed',
          message: '无法检查目标路径'
        }
      }
    }

    await rename(sourcePath, targetPath)
    return {
      path: sourcePath,
      targetPath
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'recent-download-move-source-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'recent-download-move-permission-denied'
            : 'recent-download-move-failed',
      message:
        code === 'ENOENT'
          ? '源文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限移动文件'
            : '移动文件失败'
    }
  }
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relative = path.relative(directoryPath, filePath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

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

export function formatFileHashBatchInfo(info: QuickOpsFileHashBatchInfo): string {
  return info.files
    .map((file) =>
      [
        `${file.fileName}`,
        `Path: ${file.path}`,
        `Size: ${formatFileSize(file.size)}`,
        `MD5 ${file.md5}`,
        `SHA1 ${file.sha1}`,
        `SHA256 ${file.sha256}`
      ].join('\n')
    )
    .join('\n\n')
}

export function formatFileBase64BatchInfo(info: QuickOpsFileBase64BatchInfo): string {
  return info.files
    .map((file) =>
      [
        `${file.fileName}`,
        `Path: ${file.path}`,
        `Size: ${formatFileSize(file.size)}`,
        file.base64
      ].join('\n')
    )
    .join('\n\n')
}

export async function computeFileHashes(filePath: string): Promise<
  | QuickOpsFileHashInfo
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return {
        degradedReason: 'file-hash-not-file',
        message: '目标不是普通文件'
      }
    }

    const buffer = await readFile(filePath)
    return {
      path: filePath,
      fileName: path.basename(filePath) || filePath,
      size: info.size,
      md5: createHash('md5').update(buffer).digest('hex'),
      sha1: createHash('sha1').update(buffer).digest('hex'),
      sha256: createHash('sha256').update(buffer).digest('hex')
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'file-hash-file-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'file-hash-permission-denied'
            : 'file-hash-read-failed',
      message:
        code === 'ENOENT'
          ? '文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取文件'
            : '读取文件失败'
    }
  }
}

export async function computeFileHashBatch(filePaths: string[]): Promise<
  | QuickOpsFileHashBatchInfo
  | {
      degradedReason: string
      message: string
      path?: string
    }
> {
  const files: QuickOpsFileHashInfo[] = []

  for (const filePath of filePaths) {
    const result = await computeFileHashes(filePath)
    if ('degradedReason' in result) {
      return {
        degradedReason: result.degradedReason,
        message: result.message,
        path: filePath
      }
    }
    files.push(result)
  }

  return {
    files,
    totalSize: files.reduce((sum, file) => sum + file.size, 0)
  }
}

export async function encodeFileBase64(filePath: string): Promise<
  | QuickOpsFileBase64Info
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return {
        degradedReason: 'file-base64-not-file',
        message: '目标不是普通文件'
      }
    }

    if (info.size > FILE_BASE64_MAX_BYTES) {
      return {
        degradedReason: 'file-base64-too-large',
        message: `文件超过 ${formatFileSize(FILE_BASE64_MAX_BYTES)} 上限`
      }
    }

    const buffer = await readFile(filePath)
    return {
      path: filePath,
      fileName: path.basename(filePath) || filePath,
      size: info.size,
      base64: buffer.toString('base64')
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'file-base64-file-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'file-base64-permission-denied'
            : 'file-base64-read-failed',
      message:
        code === 'ENOENT'
          ? '文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取文件'
            : '读取文件失败'
    }
  }
}

export async function encodeFileBase64Batch(filePaths: string[]): Promise<
  | QuickOpsFileBase64BatchInfo
  | {
      degradedReason: string
      message: string
      path?: string
    }
> {
  const files: QuickOpsFileBase64Info[] = []

  for (const filePath of filePaths) {
    const result = await encodeFileBase64(filePath)
    if ('degradedReason' in result) {
      return {
        degradedReason: result.degradedReason,
        message: result.message,
        path: filePath
      }
    }
    files.push(result)
  }

  return {
    files,
    totalSize: files.reduce((sum, file) => sum + file.size, 0)
  }
}

export async function decodeFileBase64ToTempFile(input: string): Promise<
  | QuickOpsFileBase64DecodeInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const normalized = input.replace(/\s+/g, '')
  if (!normalized) {
    return {
      degradedReason: 'file-base64-decode-missing-input',
      message: '未找到要解码的 Base64 内容'
    }
  }

  if (!isValidBase64Payload(normalized)) {
    return {
      degradedReason: 'file-base64-decode-invalid-input',
      message: 'Base64 内容格式无效'
    }
  }

  const buffer = Buffer.from(normalized, 'base64')
  if (
    buffer.length === 0 ||
    buffer.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')
  ) {
    return {
      degradedReason: 'file-base64-decode-invalid-input',
      message: 'Base64 内容格式无效'
    }
  }

  if (buffer.length > FILE_BASE64_MAX_BYTES) {
    return {
      degradedReason: 'file-base64-decode-too-large',
      message: `解码后文件超过 ${formatFileSize(FILE_BASE64_MAX_BYTES)} 上限`
    }
  }

  try {
    const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
    await mkdir(outputDir, { recursive: true })
    const outputPath = path.join(
      outputDir,
      `base64-${Date.now()}-${FILE_BASE64_DECODE_OUTPUT_NAME}`
    )
    await writeFile(outputPath, buffer, { flag: 'wx' })
    return {
      path: outputPath,
      fileName: path.basename(outputPath),
      size: buffer.length
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'file-base64-decode-permission-denied'
          : 'file-base64-decode-write-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '写入临时文件失败'
    }
  }
}

export async function createTempTextFile(input: string): Promise<
  | QuickOpsTempTextFileInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const content = input.trim() || 'Tuff QuickOps scratch note\n'
  const size = Buffer.byteLength(content, 'utf8')
  if (size > TEMP_TEXT_FILE_MAX_BYTES) {
    return {
      degradedReason: 'temp-text-file-too-large',
      message: `临时文本超过 ${formatFileSize(TEMP_TEXT_FILE_MAX_BYTES)} 上限`
    }
  }

  try {
    const outputDir = await ensureQuickOpsTempDir()
    const outputPath = path.join(outputDir, `scratch-${Date.now()}.txt`)
    await writeFile(outputPath, content, { flag: 'wx' })
    return {
      path: outputPath,
      fileName: path.basename(outputPath),
      size
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'temp-text-file-permission-denied'
          : 'temp-text-file-write-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '写入临时文件失败'
    }
  }
}

export async function createTempDirectory(input: string): Promise<
  | QuickOpsTempDirectoryInfo
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const outputDir = await ensureQuickOpsTempDir()
    const directoryName = sanitizeTempDirectoryName(input) || `scratch-${Date.now()}`
    const outputPath = path.join(outputDir, directoryName)
    await mkdir(outputPath, { recursive: false })
    return {
      path: outputPath,
      directoryName
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'temp-directory-permission-denied'
          : 'temp-directory-create-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限创建临时目录' : '创建临时目录失败'
    }
  }
}

async function ensureQuickOpsTempDir(): Promise<string> {
  const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
  await mkdir(outputDir, { recursive: true })
  return outputDir
}

function sanitizeTempDirectoryName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function isValidBase64Payload(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function parseFilesInput(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
      if (typeof parsed === 'string') return [parsed]
    } catch {
      return []
    }
  }

  return [trimmed]
}

function resolveFirstFilesInputPath(query: TuffQuery): string | null {
  return resolveFilesInputPaths(query)[0] ?? null
}

function resolveFilesInputPaths(query: TuffQuery): string[] {
  const fileInputs = query.inputs?.filter((input) => input.type === TuffInputType.Files) ?? []
  for (const input of fileInputs) {
    const paths = parseFilesInput(input.content)
    const selected = paths.filter((item) => item.trim())
    if (selected.length > 0) return selected
  }
  return []
}

function stripFileHashCommand(rawText: string): string {
  const text = rawText.trim()
  const fileHashCommandPattern =
    /^(?:file\s+hash|hash\s+file|hash|checksum|sha256|sha1|md5|文件\s*hash|计算\s*hash|校验和)(?=\s|:|：|-|$)/i
  const match = fileHashCommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripFileBase64Command(rawText: string): string {
  const text = rawText.trim()
  const fileBase64CommandPattern =
    /^(?:file\s+base64|base64\s+file|base64\s+encode\s+file|encode\s+file\s+base64|文件\s*base64|base64\s*文件|base64编码文件|文件转\s*base64)(?=\s|:|：|-|$)/i
  const match = fileBase64CommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripFilePathCommand(rawText: string): string {
  const text = rawText.trim()
  const filePathCommandPattern =
    /^(?:copy\s+file\s+path|copy\s+path|file\s+path|path\s+format|复制文件路径|复制路径|文件路径|路径格式)(?=\s|:|：|-|$)/i
  const match = filePathCommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripCommandSeparators(value: string): string {
  const stripped = value.replace(/^(?::|：|-|->)?\s*/, '').trim()
  if (
    (stripped.startsWith('"') && stripped.endsWith('"')) ||
    (stripped.startsWith("'") && stripped.endsWith("'"))
  ) {
    return stripped.slice(1, -1)
  }
  return stripped
}

function escapeShellPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`
}

function getFilePathDisplayName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return path.posix.basename(normalized) || filePath
}

function convertWindowsPathToWslPath(filePath: string): string | undefined {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toLowerCase()
  const rest = match[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function convertWslPathToWindowsPath(filePath: string): string | undefined {
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toUpperCase()
  const rest = match[2]?.replace(/\//g, '\\') ?? ''
  return rest ? `${drive}:\\${rest}` : `${drive}:\\`
}

function redactProxyValue(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.host || parsed.username || parsed.password) {
      if (parsed.username) parsed.username = '***'
      if (parsed.password) parsed.password = '***'
      return parsed.toString()
    }
  } catch {
    // Fall through to non-URL proxy formats such as host lists and Windows ProxyServer values.
  }

  const redactedInlineCredentials = value.replace(/([=;]|^)([^=;@\s]+):([^=;@\s]+)@/g, '$1***:***@')
  if (redactedInlineCredentials !== value) return redactedInlineCredentials

  return value.replace(/^([^@\s]+)@/, '***@')
}

function appendMacProxyEntry(
  entries: QuickOpsSystemProxyEntry[],
  values: Map<string, string>,
  name: string,
  enabledKey: string,
  hostKey: string,
  portKey: string
): void {
  if (values.get(enabledKey) !== '1') return

  const host = values.get(hostKey)
  const port = values.get(portKey)
  entries.push({
    source: 'macos-system',
    name,
    value: redactProxyHostPort(host, port)
  })
}

function redactProxyHostPort(host: string | undefined, port: string | undefined): string {
  if (!host) return 'enabled'
  const redactedHost = redactProxyValue(host)
  return port ? `${redactedHost}:${port}` : redactedHost
}

function isTruthyProxyFlag(value: number | boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['1', 'true'].includes(value.trim().toLowerCase())
  return false
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

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
    value /= 1024
  }
  return `${value.toFixed(1)} PB`
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

export function parseQuickOpsQuery(
  rawText: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): ParsedQuickOpsQuery | null {
  const text = rawText.trim()
  if (!text) return null
  const normalized = text.toLowerCase()

  if (matchesKeyword(normalized, KEEP_AWAKE_STOP_KEYWORDS)) {
    return { action: 'keep-awake-stop' }
  }
  if (matchesKeyword(normalized, SYSTEM_AWAKE_STOP_KEYWORDS)) {
    return { action: 'system-awake-stop' }
  }
  if (matchesKeyword(normalized, KEEP_AWAKE_EXTEND_KEYWORDS)) {
    return {
      action: 'keep-awake-extend',
      durationMs: parseDurationMs(normalized) ?? DEFAULT_KEEP_AWAKE_EXTEND_DURATION_MS
    }
  }
  if (matchesKeyword(normalized, TIMER_STOP_KEYWORDS)) {
    return { action: 'timer-stop' }
  }
  if (matchesKeyword(normalized, TIMER_PAUSE_KEYWORDS)) {
    return { action: 'timer-pause' }
  }
  if (matchesKeyword(normalized, TIMER_RESUME_KEYWORDS)) {
    return { action: 'timer-resume' }
  }
  if (matchesKeyword(normalized, POMODORO_STOP_KEYWORDS)) {
    return { action: 'pomodoro-stop' }
  }
  if (matchesKeyword(normalized, POMODORO_PAUSE_KEYWORDS)) {
    return { action: 'pomodoro-pause' }
  }
  if (matchesKeyword(normalized, POMODORO_RESUME_KEYWORDS)) {
    return { action: 'pomodoro-resume' }
  }
  if (matchesKeyword(normalized, SCREEN_CLEAN_STOP_KEYWORDS)) {
    return { action: 'screen-clean-stop' }
  }
  if (matchesKeyword(normalized, STOPWATCH_PAUSE_KEYWORDS)) {
    return { action: 'stopwatch-pause' }
  }
  if (matchesKeyword(normalized, STOPWATCH_RESUME_KEYWORDS)) {
    return { action: 'stopwatch-resume' }
  }
  if (matchesKeyword(normalized, STOPWATCH_LAP_KEYWORDS)) {
    return { action: 'stopwatch-lap' }
  }
  if (matchesKeyword(normalized, STOPWATCH_RESET_KEYWORDS)) {
    return { action: 'stopwatch-reset' }
  }
  if (matchesKeyword(normalized, TIMER_EXTEND_KEYWORDS)) {
    return {
      action: 'timer-extend',
      durationMs: parseDurationMs(normalized) ?? settings.defaultTimerExtendMs
    }
  }
  if (matchesKeyword(normalized, KEEP_AWAKE_KEYWORDS)) {
    return {
      action: 'keep-awake-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultKeepAwakeDurationMs
    }
  }
  if (matchesKeyword(normalized, SYSTEM_AWAKE_KEYWORDS)) {
    return {
      action: 'system-awake-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultSystemAwakeDurationMs
    }
  }
  if (matchesKeyword(normalized, TIMER_KEYWORDS)) {
    return {
      action: 'timer-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultTimerDurationMs
    }
  }
  const customPomodoroTemplate = parseCustomPomodoroTemplate(normalized, settings)
  if (customPomodoroTemplate) {
    return {
      action: 'pomodoro-start',
      ...customPomodoroTemplate,
      pomodoroMode: 'cycle'
    }
  }
  if (matchesKeyword(normalized, POMODORO_CYCLE_KEYWORDS)) {
    return {
      action: 'pomodoro-start',
      ...parsePomodoroCycle(normalized, settings)
    }
  }
  if (matchesKeyword(normalized, POMODORO_CUSTOM_TEMPLATE_KEYWORDS)) {
    return {
      action: 'pomodoro-start',
      ...parsePomodoroCycle(normalized, settings)
    }
  }
  if (matchesKeyword(normalized, POMODORO_KEYWORDS)) {
    const durationParts = parseDurationPartsMs(normalized)
    const template = parsePomodoroTemplate(normalized, settings)
    if (durationParts.length >= 2 || template) {
      return {
        action: 'pomodoro-start',
        ...parsePomodoroCycle(normalized, settings)
      }
    }

    return {
      action: 'pomodoro-start',
      durationMs: durationParts[0] ?? settings.defaultPomodoroFocusMs
    }
  }
  if (matchesKeyword(normalized, SCREEN_CLEAN_KEYWORDS)) {
    return {
      action: 'screen-clean-start',
      durationMs: parseDurationMs(normalized) ?? settings.defaultScreenCleanDurationMs,
      screenMode: parseScreenCleanMode(normalized, settings.defaultScreenCleanMode)
    }
  }
  if (matchesKeyword(normalized, STOPWATCH_KEYWORDS)) {
    return { action: 'stopwatch-start' }
  }

  return null
}

function matchesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function parseScreenCleanMode(
  text: string,
  defaultMode: QuickOpsScreenCleanMode
): QuickOpsScreenCleanMode {
  if (matchesKeyword(text, ['red', '红色', '红屏'])) return 'red'
  if (matchesKeyword(text, ['green', '绿色', '绿屏'])) return 'green'
  if (matchesKeyword(text, ['blue', '蓝色', '蓝屏'])) return 'blue'
  if (matchesKeyword(text, SCREEN_CLEAN_WHITE_KEYWORDS)) return 'white'
  if (matchesKeyword(text, ['black', 'dark', '黑色', '黑底'])) return 'black'
  if (matchesKeyword(text, SCREEN_COLOR_TEST_KEYWORDS)) return 'red'
  return defaultMode
}

const DURATION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)/gi

export function parseDurationMs(text: string): number | null {
  const matches = parseDurationPartsMs(text)
  if (matches.length === 0) return null

  const total = matches.reduce((sum, durationMs) => sum + durationMs, 0)

  return total > 0 ? total : null
}

export function parseDurationPartsMs(text: string): number[] {
  const matches = Array.from(text.matchAll(DURATION_PATTERN))
  const durations: number[] = []

  for (const match of matches) {
    const amount = Number(match[1])
    const unit = (match[2] ?? '').toLowerCase()
    if (!Number.isFinite(amount)) continue
    if (unit === 'h' || unit.startsWith('hour') || unit.startsWith('hr') || unit === '小时') {
      durations.push(amount * 60 * 60 * 1000)
    } else if (unit === 'm' || unit.startsWith('min') || unit === '分钟' || unit === '分') {
      durations.push(amount * 60 * 1000)
    } else {
      durations.push(amount * 1000)
    }
  }

  return durations.filter((durationMs) => durationMs > 0)
}

function parsePomodoroCycle(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): ParsedPomodoroCycle {
  const durationParts = parseDurationPartsMs(text)
  const template = parsePomodoroTemplate(text, settings)

  return {
    durationMs: durationParts[0] ?? template?.durationMs ?? settings.defaultPomodoroFocusMs,
    breakDurationMs:
      durationParts[1] ?? template?.breakDurationMs ?? settings.defaultPomodoroBreakMs,
    pomodoroCycles: parsePomodoroCycles(text),
    ...parsePomodoroLongBreak(text),
    pomodoroMode: 'cycle'
  }
}

function parsePomodoroCycles(text: string): number | undefined {
  const match = text.match(
    /(?:^|[^\d])(?<cycles>\d{1,2})\s*(?:rounds?|cycles?|sets?|轮|次)(?:[^\d]|$)/i
  )
  const cycles = Number(match?.groups?.cycles)
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 12) return undefined
  return cycles
}

function parsePomodoroLongBreak(
  text: string
): Pick<ParsedPomodoroCycle, 'pomodoroLongBreakMs' | 'pomodoroLongBreakEvery'> {
  const durationMatch = text.match(
    /(?:long\s+break|longbreak|长休息|长间歇|长暂停)\s*(?<amount>\d+(?:\.\d+)?)\s*(?<unit>hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)/i
  )
  if (!durationMatch?.groups) return {}

  const amount = Number(durationMatch.groups.amount)
  const unit = durationMatch.groups.unit.toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) return {}

  const durationMs = parseDurationPartsMs(`${amount}${unit}`)[0] ?? 0
  if (durationMs < 60 * 1000 || durationMs > 60 * 60 * 1000) return {}

  const everyMatch = text.match(
    /(?:every|each|per|after|每|每隔)\s*(?<cycles>\d{1,2})\s*(?:rounds?|cycles?|sets?|轮|次)?/i
  )
  const every = Number(everyMatch?.groups?.cycles)
  if (!Number.isInteger(every) || every < 2 || every > 12) return {}

  return {
    pomodoroLongBreakMs: durationMs,
    pomodoroLongBreakEvery: every
  }
}

function readQuickOpsSettings(): AppSetting['quickOps'] | undefined {
  return (getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined)?.quickOps
}

function getQuickOpsResolvedSettings(settings?: QuickOpsSettingsInput): QuickOpsResolvedSettings {
  return {
    enabled: settings?.enabled !== false,
    showRunningSessionsInCoreBox: settings?.showRunningSessionsInCoreBox !== false,
    allowStatefulTools: settings?.allowStatefulTools !== false,
    allowNetworkTools: settings?.allowNetworkTools !== false,
    allowFileTools: settings?.allowFileTools !== false,
    allowSystemTools: settings?.allowSystemTools !== false,
    allowDeveloperTools: settings?.allowDeveloperTools !== false,
    allowHighRiskTools: settings?.allowHighRiskTools === true,
    defaultKeepAwakeDurationMs: minutesToMs(
      settings?.defaultKeepAwakeDurationMinutes,
      DEFAULT_KEEP_AWAKE_DURATION_MS
    ),
    defaultSystemAwakeDurationMs: minutesToMs(
      settings?.defaultSystemAwakeDurationMinutes,
      DEFAULT_SYSTEM_AWAKE_DURATION_MS
    ),
    defaultTimerDurationMs: minutesToMs(
      settings?.defaultTimerDurationMinutes,
      DEFAULT_TIMER_DURATION_MS
    ),
    defaultTimerExtendMs: minutesToMs(
      settings?.defaultTimerExtendMinutes,
      DEFAULT_TIMER_EXTEND_DURATION_MS
    ),
    defaultPomodoroFocusMs: minutesToMs(
      settings?.defaultPomodoroFocusMinutes,
      DEFAULT_POMODORO_DURATION_MS
    ),
    defaultPomodoroBreakMs: minutesToMs(
      settings?.defaultPomodoroBreakMinutes,
      DEFAULT_POMODORO_BREAK_DURATION_MS
    ),
    pomodoroTemplates: {
      classic: settings?.pomodoroTemplates?.classic !== false,
      long: settings?.pomodoroTemplates?.long !== false,
      custom: normalizeCustomPomodoroTemplates(settings?.pomodoroTemplates?.custom)
    },
    defaultScreenCleanDurationMs: secondsToMs(
      settings?.defaultScreenCleanDurationSeconds,
      DEFAULT_SCREEN_CLEAN_DURATION_MS
    ),
    defaultScreenCleanMode: settings?.defaultScreenCleanMode === 'white' ? 'white' : 'black',
    allowPublicIpLookup: settings?.allowPublicIpLookup === true
  }
}

function minutesToMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackMs
  return Math.max(1_000, value * 60 * 1000)
}

function secondsToMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallbackMs
  return Math.max(1_000, value * 1000)
}

function parsePomodoroTemplate(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> | null {
  const customTemplate = parseCustomPomodoroTemplate(text, settings)
  if (customTemplate) return customTemplate

  if (
    settings.pomodoroTemplates.classic &&
    matchesKeyword(text, ['classic pomodoro', 'standard pomodoro', '经典番茄钟'])
  ) {
    return toPomodoroTemplate(25, 5)
  }
  if (
    settings.pomodoroTemplates.long &&
    matchesKeyword(text, ['long pomodoro', 'deep pomodoro', '长番茄钟'])
  ) {
    return toPomodoroTemplate(50, 10)
  }

  const customMatch = text.match(
    /(?:custom pomodoro|pomodoro custom|自定义番茄钟|番茄钟自定义|自定义番茄模板)[^\d]*(?<focus>\d{1,3})\s*[\/／]\s*(?<break>\d{1,2})(?:[^\d]|$)/
  )
  if (customMatch?.groups) {
    const focusMinutes = Number(customMatch.groups.focus)
    const breakMinutes = Number(customMatch.groups.break)
    if (isValidPomodoroTemplate(focusMinutes, breakMinutes)) {
      return toPomodoroTemplate(focusMinutes, breakMinutes)
    }
  }

  const match = text.match(/(?:^|[^\d])(?<focus>25|50)\s*[\/／]\s*(?<break>5|10)(?:[^\d]|$)/)
  if (!match?.groups) return null

  const focusMinutes = Number(match.groups.focus)
  const breakMinutes = Number(match.groups.break)
  if (focusMinutes === 25 && breakMinutes === 5 && settings.pomodoroTemplates.classic) {
    return toPomodoroTemplate(25, 5)
  }
  if (focusMinutes === 50 && breakMinutes === 10 && settings.pomodoroTemplates.long) {
    return toPomodoroTemplate(50, 10)
  }
  return null
}

function parseCustomPomodoroTemplate(
  text: string,
  settings: QuickOpsResolvedSettings = getQuickOpsResolvedSettings()
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> | null {
  const customTemplate = settings.pomodoroTemplates.custom.find(
    (template) =>
      template.enabled &&
      [template.name, ...template.aliases].some((keyword) =>
        matchesPomodoroTemplateKeyword(text, keyword)
      )
  )
  if (!customTemplate) return null

  return toPomodoroTemplate(customTemplate.focusMinutes, customTemplate.breakMinutes)
}

function normalizeCustomPomodoroTemplates(value: unknown): QuickOpsCustomPomodoroTemplate[] {
  if (!Array.isArray(value)) return []

  const templates: QuickOpsCustomPomodoroTemplate[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const aliases = Array.isArray(record.aliases)
      ? record.aliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map((alias) => alias.trim())
          .filter(Boolean)
      : []
    const focusMinutes = Number(record.focusMinutes)
    const breakMinutes = Number(record.breakMinutes)
    if (!name || !isValidPomodoroTemplate(focusMinutes, breakMinutes)) continue

    templates.push({
      name,
      aliases: aliases.slice(0, 6),
      focusMinutes,
      breakMinutes,
      enabled: record.enabled !== false
    })
    if (templates.length >= 8) break
  }
  return templates
}

function matchesPomodoroTemplateKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return false
  return new RegExp(`(?:^|\\s)${escapeRegExp(normalizedKeyword)}(?:\\s|$)`, 'i').test(text)
}

function isValidPomodoroTemplate(focusMinutes: number, breakMinutes: number): boolean {
  return (
    Number.isInteger(focusMinutes) &&
    Number.isInteger(breakMinutes) &&
    focusMinutes >= 1 &&
    focusMinutes <= 180 &&
    breakMinutes >= 1 &&
    breakMinutes <= 60
  )
}

function toPomodoroTemplate(
  focusMinutes: number,
  breakMinutes: number
): Pick<ParsedPomodoroCycle, 'durationMs' | 'breakDurationMs'> {
  return {
    durationMs: focusMinutes * 60 * 1000,
    breakDurationMs: breakMinutes * 60 * 1000
  }
}

function appendDnsRecordResults(
  records: QuickOpsDnsRecord[],
  failedTypes: QuickOpsDnsRecordType[],
  type: QuickOpsDnsRecordType,
  result:
    | PromiseSettledResult<
        string[] | string[][] | Array<{ exchange: string; priority: number }> | { nsname: string }
      >
    | undefined
): void {
  if (!result || result.status === 'rejected') {
    failedTypes.push(type)
    return
  }

  if (type === 'SOA') {
    const value = (result.value as { nsname?: string }).nsname
    if (!value) {
      failedTypes.push(type)
      return
    }
    records.push({ type, value })
    return
  }

  if ((result.value as unknown[]).length === 0) {
    failedTypes.push(type)
    return
  }

  if (type === 'MX') {
    ;(result.value as Array<{ exchange: string; priority: number }>).forEach((record) => {
      records.push({
        type,
        value: record.exchange,
        priority: record.priority
      })
    })
    return
  }

  if (type === 'TXT') {
    ;(result.value as string[][]).forEach((record) => {
      records.push({ type, value: record.join('') })
    })
    return
  }

  ;(result.value as string[]).forEach((value) => {
    records.push({ type, value })
  })
}

function getDnsRecordTypes(deep: boolean): QuickOpsDnsRecordType[] {
  return deep ? DEEP_DNS_RECORD_TYPES : BASIC_DNS_RECORD_TYPES
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const quickOpsRuntime = new QuickOpsRuntimeHost()
