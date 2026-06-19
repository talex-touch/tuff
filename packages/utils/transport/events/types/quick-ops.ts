import type { PreviewCardPayload } from '../../../core-box/preview'
import type { TuffQuery } from '../../../core-box/tuff/tuff-dsl'

export type QuickOpsCapabilityStatus = 'supported' | 'disabled' | 'degraded'

export type QuickOpsCapabilityRiskLevel = 'safe' | 'stateful' | 'confirm' | 'danger'

export interface QuickOpsCapabilityEntry {
  id: string
  label: string
  status: QuickOpsCapabilityStatus
  riskLevel: QuickOpsCapabilityRiskLevel
  reason?: string
}

export interface QuickOpsCapabilityInfo {
  platform: NodeJS.Platform
  enabled: boolean
  entries: QuickOpsCapabilityEntry[]
}

export type QuickOpsCapabilityGetResponse = QuickOpsCapabilityInfo

export type QuickOpsSessionKind =
  | 'keep-awake'
  | 'system-awake'
  | 'timer'
  | 'pomodoro'
  | 'screen-clean'
  | 'stopwatch'

export type QuickOpsSessionState = 'running' | 'paused'

export interface QuickOpsPomodoroSessionState {
  phase: 'focus' | 'break'
  mode: 'focus-only' | 'cycle'
  cycle: number
  totalCycles?: number
  breakDurationMs: number
  longBreakDurationMs?: number
  longBreakEveryCycles?: number
}

export interface QuickOpsSessionSnapshot {
  id: string
  kind: QuickOpsSessionKind
  title: string
  state: QuickOpsSessionState
  startedAt: number
  durationMs: number
  displayDurationMs: number
  displayDurationText: string
  expiresAt?: number
  pausedAt?: number
  screenMode?: 'black' | 'white' | 'red' | 'green' | 'blue'
  windowCount?: number
  lapCount?: number
  lastLapMs?: number
  lastLapText?: string
  pomodoro?: QuickOpsPomodoroSessionState
}

export interface QuickOpsSessionsGetResponse {
  state: 'idle' | 'running'
  count: number
  sessions: QuickOpsSessionSnapshot[]
  text: string
}

export type QuickOpsAuditDecision = 'delivered' | 'blocked' | 'degraded'

export interface QuickOpsAuditEntry {
  id: string
  at: number
  source: 'flow'
  targetId: string
  decision: QuickOpsAuditDecision
  reason?: string
  requiresConfirmation: boolean
  payloadKeys: string[]
}

export interface QuickOpsAuditGetRequest {
  limit?: number
}

export interface QuickOpsAuditGetResponse {
  state: 'empty' | 'ready'
  count: number
  limit: number
  maxEntries: number
  entries: QuickOpsAuditEntry[]
}

export interface QuickOpsSystemInfo {
  osType: string
  osRelease: string
  platform: NodeJS.Platform
  arch: string
  cpuModel: string
  cpuCount: number
  totalMemoryBytes: number
  freeMemoryBytes: number
  uptimeSeconds: number
  loadAverage: number[]
}

export interface QuickOpsSystemInfoGetResponse {
  text: string
  systemInfo: QuickOpsSystemInfo
}

export interface QuickOpsDiagnosticsInfo {
  schemaVersion: number
  appVersion: string
  platform: NodeJS.Platform
  arch: string
  osType: string
  osRelease: string
  nodeVersion: string
  electronVersion: string
  userDataDir: string
  logsDir: string
  homeDir: string
  cpuCount: number
  totalMemoryBytes: number
  freeMemoryBytes: number
  uptimeSeconds: number
  localAddressCount: number
  dnsServerCount: number
  proxyStatus: 'detected' | 'not-detected'
  proxySources: string[]
  quickOpsEnabled: boolean
  showRunningSessionsInCoreBox: boolean
  defaultKeepAwakeDurationMs: number
  defaultTimerDurationMs: number
  defaultPomodoroFocusMs: number
  defaultPomodoroBreakMs: number
  defaultScreenCleanDurationMs: number
}

export interface QuickOpsDiagnosticsGetResponse {
  text: string
  diagnostics: QuickOpsDiagnosticsInfo
}

export interface QuickOpsDiskSpaceEntry {
  label: string
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  usedPercent: number
}

export interface QuickOpsDiskSpaceInfo {
  entries: QuickOpsDiskSpaceEntry[]
}

export interface QuickOpsDiskSpaceDegradedResponse {
  state: 'degraded'
  degradedReason: string
  message: string
}

export interface QuickOpsDiskSpaceReadyResponse {
  state: 'ready'
  text: string
  diskSpace: QuickOpsDiskSpaceInfo
}

export type QuickOpsDiskSpaceGetResponse =
  | QuickOpsDiskSpaceReadyResponse
  | QuickOpsDiskSpaceDegradedResponse

export interface QuickOpsDirectoryUsageGetRequest {
  deep?: boolean
}

export interface QuickOpsDirectoryUsageEntry {
  label: string
  path: string
  directFileBytes: number
  totalFileBytes?: number
  fileCount: number
  directoryCount: number
  otherCount: number
  scannedEntryCount: number
  truncated: boolean
}

export interface QuickOpsDirectoryUsageInfo {
  entries: QuickOpsDirectoryUsageEntry[]
  maxEntriesPerDirectory: number
  maxTotalEntries?: number
  scanDepth: number
}

export interface QuickOpsDirectoryUsageDegradedResponse {
  state: 'degraded'
  degradedReason: string
  message: string
  path?: string
  scanDepth: number
}

export interface QuickOpsDirectoryUsageReadyResponse {
  state: 'ready'
  text: string
  directoryUsage: QuickOpsDirectoryUsageInfo
}

export type QuickOpsDirectoryUsageGetResponse =
  | QuickOpsDirectoryUsageReadyResponse
  | QuickOpsDirectoryUsageDegradedResponse

export interface QuickOpsLocalIpInfo {
  name: string
  family: string
  address: string
}

export interface QuickOpsQueryLocalIpGetResponse {
  text: string
  addresses: QuickOpsLocalIpInfo[]
  degradedReason?: 'local-ip-unavailable'
}

export interface QuickOpsPortStatusGetRequest {
  port?: number | string
  text?: string
}

export interface QuickOpsPortProcessInfo {
  pid: number
  name?: string
  command?: string
  source: 'lsof' | 'windows-nettcpconnection'
}

export interface QuickOpsPortProbeInfo {
  port: number
  host: string
  available: boolean
  process?: QuickOpsPortProcessInfo
  degradedReason?: string
  errorCode?: string
}

export interface QuickOpsPortStatusGetResponse {
  state: 'available' | 'occupied' | 'degraded'
  available: boolean
  port: number | null
  host?: string
  process?: QuickOpsPortProcessInfo
  releaseCommand?: string
  degradedReason?: string
  errorCode?: string
}

export type QuickOpsDnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA'

export interface QuickOpsDnsRecord {
  type: QuickOpsDnsRecordType
  value: string
  priority?: number
}

export interface QuickOpsDnsQueryInfo {
  hostname: string
  records: QuickOpsDnsRecord[]
  failedTypes: QuickOpsDnsRecordType[]
  deep: boolean
}

export interface QuickOpsDnsQueryGetRequest {
  hostname?: string
  text?: string
  deep?: boolean
}

export interface QuickOpsDnsQueryDegradedResponse {
  state: 'degraded'
  hostname?: string
  deep?: boolean
  degradedReason: string
  message: string
}

export interface QuickOpsDnsQueryResolvedResponse {
  state: 'resolved'
  text: string
  dnsQuery: QuickOpsDnsQueryInfo
}

export type QuickOpsDnsQueryGetResponse =
  | QuickOpsDnsQueryResolvedResponse
  | QuickOpsDnsQueryDegradedResponse

export interface QuickOpsFileHashGetRequest {
  path?: string
  filePath?: string
  text?: string
}

export interface QuickOpsFileHashInfo {
  path: string
  fileName: string
  size: number
  md5: string
  sha1: string
  sha256: string
}

export interface QuickOpsFileHashDegradedResponse {
  state: 'degraded'
  path?: string
  degradedReason: string
  message: string
}

export interface QuickOpsFileHashHashedResponse {
  state: 'hashed'
  path: string
  fileName: string
  size: number
  hashes: {
    md5: string
    sha1: string
    sha256: string
  }
  text: string
  fileHash: QuickOpsFileHashInfo
}

export type QuickOpsFileHashGetResponse =
  | QuickOpsFileHashHashedResponse
  | QuickOpsFileHashDegradedResponse

export interface QuickOpsFileBase64GetRequest {
  path?: string
  filePath?: string
  text?: string
}

export interface QuickOpsFileBase64Info {
  path: string
  fileName: string
  size: number
  base64: string
}

export interface QuickOpsFileBase64DegradedResponse {
  state: 'degraded'
  path?: string
  degradedReason: string
  message: string
}

export interface QuickOpsFileBase64EncodedResponse {
  state: 'encoded'
  path: string
  fileName: string
  size: number
  base64: string
  text: string
  fileBase64: QuickOpsFileBase64Info
}

export type QuickOpsFileBase64GetResponse =
  | QuickOpsFileBase64EncodedResponse
  | QuickOpsFileBase64DegradedResponse

export interface QuickOpsRecentDownloadInfo {
  path: string
  fileName: string
  size: number
  modifiedAt: number
}

export interface QuickOpsRecentDownloadDegradedResponse {
  state: 'degraded'
  degradedReason: string
  message: string
}

export interface QuickOpsRecentDownloadFoundResponse {
  state: 'found'
  path: string
  fileName: string
  size: number
  modifiedAt: number
  text: string
  recentDownload: QuickOpsRecentDownloadInfo
}

export type QuickOpsRecentDownloadGetResponse =
  | QuickOpsRecentDownloadFoundResponse
  | QuickOpsRecentDownloadDegradedResponse

export interface QuickOpsCommonDirectoryGetRequest {
  query?: string
  folder?: string
  directory?: string
  id?: string
  text?: string
}

export interface QuickOpsCommonDirectoryInfo {
  id: 'desktop' | 'downloads' | 'documents' | 'app-data' | 'logs'
  title: string
  subtitle: string
  path: string
}

export interface QuickOpsCommonDirectoryGetResponse {
  state: 'resolved'
  directoryId: QuickOpsCommonDirectoryInfo['id']
  title: string
  subtitle: string
  path: string
  text: string
  commonDirectory: QuickOpsCommonDirectoryInfo
}

export interface QuickOpsPathFormatGetRequest {
  path?: string
  filePath?: string
  text?: string
}

export interface QuickOpsPathFormatInfo {
  path: string
  fileName: string
  shellPath: string
  fileUrl: string
  windowsPath?: string
  wslPath?: string
}

export interface QuickOpsPathFormatDegradedResponse {
  state: 'degraded'
  degradedReason: 'file-path-missing-file'
  message: string
}

export interface QuickOpsPathFormatFormattedResponse {
  state: 'formatted'
  path: string
  fileName: string
  formats: {
    raw: string
    shell: string
    fileUrl: string
    windows?: string
    wsl?: string
  }
  text: string
  pathFormat: QuickOpsPathFormatInfo
}

export type QuickOpsPathFormatGetResponse =
  | QuickOpsPathFormatFormattedResponse
  | QuickOpsPathFormatDegradedResponse

export type QuickOpsFormatTextMode = 'upper' | 'lower' | 'camel' | 'snake' | 'kebab'

export interface QuickOpsFormatTextGetRequest {
  text?: string
  value?: string
  content?: string
  mode?: QuickOpsFormatTextMode | string
  format?: QuickOpsFormatTextMode | string
}

export interface QuickOpsFormatTextSkippedResponse {
  state: 'skipped'
  degradedReason: 'missing-text'
}

export interface QuickOpsFormatTextFormattedResponse {
  state: 'formatted'
  mode: QuickOpsFormatTextMode
  inputCharCount: number
  outputCharCount: number
  truncated: boolean
  text: string
}

export type QuickOpsFormatTextGetResponse =
  | QuickOpsFormatTextFormattedResponse
  | QuickOpsFormatTextSkippedResponse

export interface QuickOpsProxyInfo {
  source: string
  value: string
}

export interface QuickOpsNetworkStatusInfo {
  addresses: QuickOpsLocalIpInfo[]
  dnsServers: string[]
  proxyStatus: 'detected' | 'not-detected'
  proxies: QuickOpsProxyInfo[]
}

export interface QuickOpsNetworkStatusGetResponse {
  text: string
  networkStatus: QuickOpsNetworkStatusInfo
}

export interface QuickOpsBatteryStatusInfo {
  levelPercent: number | null
  charging: boolean | null
  status: string
  source: 'macos-pmset' | 'windows-cim' | 'linux-sysfs'
}

export interface QuickOpsBatteryStatusDegradedResponse {
  state: 'degraded'
  degradedReason: string
  message: string
}

export interface QuickOpsBatteryStatusReadyResponse {
  state: 'ready'
  text: string
  batteryStatus: QuickOpsBatteryStatusInfo
}

export type QuickOpsBatteryStatusGetResponse =
  | QuickOpsBatteryStatusReadyResponse
  | QuickOpsBatteryStatusDegradedResponse

export interface QuickOpsSystemProxyEntry {
  source: 'environment' | 'macos-system' | 'windows-system' | 'linux-gsettings'
  name: string
  value: string
}

export interface QuickOpsSystemProxyInfo {
  platform: NodeJS.Platform
  status: 'detected' | 'not-detected' | 'degraded'
  environment: QuickOpsProxyInfo[]
  system: QuickOpsSystemProxyEntry[]
  degradedReason?: string
  degradedMessage?: string
}

export interface QuickOpsSystemProxyGetResponse {
  state: 'ready' | 'degraded'
  text: string
  systemProxy: QuickOpsSystemProxyInfo
  degradedReason?: string
  message?: string
}

export interface QuickOpsDeveloperPreviewRequest {
  query: TuffQuery
}

export type QuickOpsDeveloperPreviewResponse =
  | {
      state: 'ready'
      abilityId: string
      confidence: number
      payload: PreviewCardPayload
    }
  | {
      state: 'empty' | 'blocked'
      reason: string
    }

export interface QuickOpsDeveloperPreviewSaveRequest {
  payload: PreviewCardPayload
  format: 'svg' | 'png'
}

export type QuickOpsDeveloperPreviewSaveResponse =
  | {
      state: 'saved'
      format: 'svg' | 'png'
      path: string
      bytes: number
    }
  | {
      state: 'skipped' | 'degraded'
      reason: string
      message?: string
    }
