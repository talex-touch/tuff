import type { ModuleDestroyContext, ModuleInitContext, ModuleStopContext } from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'
import type { QuickOpsCapabilityInfo } from '@talex-touch/utils/transport/events/types/quick-ops'
import { QuickOpsEvents } from '@talex-touch/utils/transport/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const quickOpsCapabilityInfo: QuickOpsCapabilityInfo = {
  platform: 'darwin',
  enabled: true,
  entries: []
}
const quickOpsSystemInfo = vi.hoisted(() => ({
  osType: 'Darwin',
  osRelease: '25.0.0',
  platform: 'darwin',
  arch: 'arm64',
  cpuModel: 'Apple M-series',
  cpuCount: 10,
  totalMemoryBytes: 34_359_738_368,
  freeMemoryBytes: 17_179_869_184,
  uptimeSeconds: 3600,
  loadAverage: [1.25, 1.5, 1.75]
}))
type QuickOpsDiskSpaceResultFixture =
  | {
      entries: Array<{
        label: string
        path: string
        totalBytes: number
        freeBytes: number
        usedBytes: number
        usedPercent: number
      }>
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsDirectoryUsageResultFixture =
  | {
      entries: Array<{
        label: string
        path: string
        directFileBytes: number
        totalFileBytes?: number
        fileCount: number
        directoryCount: number
        otherCount: number
        scannedEntryCount: number
        truncated: boolean
      }>
      maxEntriesPerDirectory: number
      maxTotalEntries?: number
      scanDepth: number
    }
  | {
      degradedReason: string
      message: string
      path?: string
    }
type QuickOpsBatteryStatusResultFixture =
  | {
      levelPercent: number | null
      charging: boolean | null
      status: string
      source: string
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsSystemProxyResultFixture = {
  platform: NodeJS.Platform
  status: 'detected' | 'not-detected' | 'degraded'
  environment: Array<{ source: string; value: string }>
  system: Array<{
    source: 'environment' | 'macos-system' | 'windows-system' | 'linux-gsettings'
    name: string
    value: string
  }>
  degradedReason?: string
  degradedMessage?: string
}
type QuickOpsDnsQueryFixture =
  | {
      hostname: string
      records: Array<{
        type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA'
        value: string
        priority?: number
      }>
      failedTypes: Array<'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA'>
      deep: boolean
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsFileHashFixture =
  | {
      path: string
      fileName: string
      size: number
      md5: string
      sha1: string
      sha256: string
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsFileBase64Fixture =
  | {
      path: string
      fileName: string
      size: number
      base64: string
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsTempTextFileFixture =
  | {
      path: string
      fileName: string
      size: number
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsTempDirectoryFixture =
  | {
      path: string
      directoryName: string
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsRecentDownloadFixture =
  | {
      path: string
      fileName: string
      size: number
      modifiedAt: number
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsPublicIpFixture =
  | {
      address: string
      source: string
    }
  | {
      degradedReason: string
      message: string
    }
type QuickOpsDiagnosticsFixture = {
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
type QuickOpsSessionFixture = {
  id: string
  kind: 'keep-awake' | 'system-awake' | 'timer' | 'pomodoro' | 'screen-clean' | 'stopwatch'
  title: string
  startedAt: number
  durationMs: number
  expiresAt?: number
  pausedAt?: number
  elapsedMs?: number
  laps?: number[]
  windows?: Array<{ id: number }>
}
const quickOpsDiskSpaceInfo = vi.hoisted(() => ({
  entries: [
    {
      label: 'Home',
      path: '~/',
      totalBytes: 1_000_000,
      freeBytes: 400_000,
      usedBytes: 600_000,
      usedPercent: 60
    },
    {
      label: 'Tuff Data',
      path: '~/Library/Application Support/Tuff',
      totalBytes: 1_000_000,
      freeBytes: 500_000,
      usedBytes: 500_000,
      usedPercent: 50
    }
  ]
}))
const quickOpsDiskSpaceResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsDiskSpaceResultFixture> => quickOpsDiskSpaceInfo)
)
const quickOpsDirectoryUsageInfo = vi.hoisted(() => ({
  entries: [
    {
      label: 'Downloads',
      path: '~/Downloads',
      directFileBytes: 2048,
      totalFileBytes: undefined,
      fileCount: 2,
      directoryCount: 1,
      otherCount: 0,
      scannedEntryCount: 3,
      truncated: false
    }
  ],
  maxEntriesPerDirectory: 200,
  maxTotalEntries: undefined,
  scanDepth: 1
}))
const quickOpsDirectoryUsageResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsDirectoryUsageResultFixture> => quickOpsDirectoryUsageInfo)
)
const quickOpsNetworkStatusInfo = vi.hoisted(() => ({
  addresses: [{ name: 'en0', family: 'IPv4', address: '192.168.1.20' }],
  dnsServers: ['1.1.1.1'],
  proxyStatus: 'detected',
  proxies: [{ source: 'HTTPS_PROXY', value: 'https://example.invalid:443' }]
}))
const quickOpsBatteryStatusInfo = vi.hoisted(() => ({
  levelPercent: 72,
  charging: false,
  status: 'discharging',
  source: 'pmset'
}))
const quickOpsBatteryStatusResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsBatteryStatusResultFixture> => quickOpsBatteryStatusInfo)
)
const quickOpsSystemProxyInfo = vi.hoisted(
  (): QuickOpsSystemProxyResultFixture => ({
    platform: 'darwin',
    status: 'detected',
    environment: [{ source: 'HTTPS_PROXY', value: 'https://example.invalid:443' }],
    system: [{ source: 'macos-system', name: 'HTTPEnable', value: '1' }]
  })
)
const quickOpsSystemProxyResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsSystemProxyResultFixture> => quickOpsSystemProxyInfo)
)
const quickOpsDnsQueryInfo = vi.hoisted(() => ({
  hostname: 'example.com',
  records: [
    { type: 'A' as const, value: '93.184.216.34' },
    { type: 'MX' as const, value: 'mail.example.com', priority: 10 }
  ],
  failedTypes: ['AAAA' as const],
  deep: false
}))
const quickOpsDnsQueryResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsDnsQueryFixture> => quickOpsDnsQueryInfo)
)
const quickOpsFileHashInfo = vi.hoisted(() => ({
  path: '/tmp/demo.txt',
  fileName: 'demo.txt',
  size: 12,
  md5: 'md5-hash',
  sha1: 'sha1-hash',
  sha256: 'sha256-hash'
}))
const quickOpsFileHashResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsFileHashFixture> => quickOpsFileHashInfo)
)
const quickOpsFileBase64Info = vi.hoisted(() => ({
  path: '/tmp/demo.txt',
  fileName: 'demo.txt',
  size: 12,
  base64: 'SGVsbG8gVHVmZg=='
}))
const quickOpsFileBase64ResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsFileBase64Fixture> => quickOpsFileBase64Info)
)
const quickOpsTempTextFileInfo = vi.hoisted(() => ({
  path: '/tmp/tuff-quickops/scratch-1.txt',
  fileName: 'scratch-1.txt',
  size: 10
}))
const quickOpsTempTextFileResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsTempTextFileFixture> => quickOpsTempTextFileInfo)
)
const quickOpsTempDirectoryInfo = vi.hoisted(() => ({
  path: '/tmp/tuff-quickops/demo-workspace',
  directoryName: 'demo-workspace'
}))
const quickOpsTempDirectoryResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsTempDirectoryFixture> => quickOpsTempDirectoryInfo)
)
const quickOpsRecentDownloadInfo = vi.hoisted(() => ({
  path: '/tmp/Downloads/report.pdf',
  fileName: 'report.pdf',
  size: 4096,
  modifiedAt: 1_781_818_000_000
}))
const quickOpsRecentDownloadResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsRecentDownloadFixture> => quickOpsRecentDownloadInfo)
)
const quickOpsPublicIpInfo = vi.hoisted(() => ({
  address: '203.0.113.10',
  source: 'https://api.ipify.org?format=json'
}))
const quickOpsPublicIpResultMock = vi.hoisted(() =>
  vi.fn(async (): Promise<QuickOpsPublicIpFixture> => quickOpsPublicIpInfo)
)
type QuickOpsPortProbeFixture = {
  port: number
  host: string
  available: boolean
  process?: {
    pid: number
    name?: string
    command?: string
    source: 'lsof' | 'windows-nettcpconnection'
  }
  degradedReason?: string
  errorCode?: string
}
const quickOpsPortProbeMock = vi.hoisted(() =>
  vi.fn(
    async (port: number): Promise<QuickOpsPortProbeFixture> => ({
      port,
      host: '127.0.0.1',
      available: true
    })
  )
)
const quickOpsDiagnosticsInfo = vi.hoisted(
  (): QuickOpsDiagnosticsFixture => ({
    schemaVersion: 2,
    appVersion: '2.4.12-beta.8',
    platform: 'darwin',
    arch: 'arm64',
    osType: 'Darwin',
    osRelease: '25.0.0',
    nodeVersion: '22.16.0',
    electronVersion: '37.2.4',
    userDataDir: '~/Library/Application Support/Tuff',
    logsDir: '~/Library/Logs/Tuff',
    homeDir: '~',
    cpuCount: 10,
    totalMemoryBytes: 34_359_738_368,
    freeMemoryBytes: 17_179_869_184,
    uptimeSeconds: 3600,
    localAddressCount: 1,
    dnsServerCount: 1,
    proxyStatus: 'detected',
    proxySources: ['HTTPS_PROXY'],
    quickOpsEnabled: true,
    showRunningSessionsInCoreBox: true,
    defaultKeepAwakeDurationMs: 3_600_000,
    defaultTimerDurationMs: 1_500_000,
    defaultPomodoroFocusMs: 1_500_000,
    defaultPomodoroBreakMs: 300_000,
    defaultScreenCleanDurationMs: 60_000
  })
)

const quickOpsRuntimeMock = vi.hoisted(() => ({
  cleanup: vi.fn(),
  getCapabilityInfo: vi.fn(() => quickOpsCapabilityInfo),
  getDiagnosticsInfo: vi.fn(() => quickOpsDiagnosticsInfo),
  startKeepAwake: vi.fn((durationMs?: number) => ({
    durationMs: durationMs ?? 60 * 60 * 1000,
    expiresAt: 1781800000000
  })),
  startSystemAwake: vi.fn((durationMs?: number) => ({
    durationMs: durationMs ?? 60 * 60 * 1000,
    expiresAt: 1781800000000
  })),
  startTimer: vi.fn((durationMs?: number) => ({
    durationMs: durationMs ?? 25 * 60 * 1000,
    expiresAt: 1781800000000
  })),
  pauseTimer: vi.fn(() => ({
    durationMs: 90_000,
    remainingMs: 60_000
  })),
  resumeTimer: vi.fn(() => ({
    durationMs: 90_000,
    expiresAt: 1781800000000
  })),
  startPomodoro: vi.fn(
    (
      durationMs?: number,
      mode: 'focus-only' | 'cycle' = 'focus-only',
      breakDurationMs = 5 * 60 * 1000,
      totalCycles?: number,
      longBreakDurationMs?: number,
      longBreakEveryCycles?: number
    ) => ({
      durationMs: durationMs ?? 25 * 60 * 1000,
      expiresAt: 1781800000000,
      pomodoro: {
        mode,
        phase: 'focus',
        cycle: 1,
        totalCycles,
        breakDurationMs,
        longBreakDurationMs,
        longBreakEveryCycles
      }
    })
  ),
  pausePomodoro: vi.fn(() => ({
    durationMs: 2_400_000,
    remainingMs: 1_800_000,
    pomodoro: {
      phase: 'focus',
      cycle: 1
    }
  })),
  resumePomodoro: vi.fn(() => ({
    durationMs: 2_400_000,
    expiresAt: 1781800000000,
    pomodoro: {
      phase: 'focus',
      cycle: 1
    }
  })),
  startScreenClean: vi.fn((durationMs?: number, screenMode = 'black') => ({
    durationMs: durationMs ?? 60 * 1000,
    expiresAt: 1781800000000,
    screenMode,
    windows: [{ id: 1 }, { id: 2 }]
  })),
  startStopwatch: vi.fn(() => ({
    kind: 'stopwatch',
    startedAt: 1_781_800_000_000,
    elapsedMs: 0,
    laps: []
  })),
  pauseStopwatch: vi.fn(() => ({
    kind: 'stopwatch',
    startedAt: 1_781_800_000_000,
    pausedAt: 1_781_800_005_000,
    elapsedMs: 5_000,
    laps: [3_000]
  })),
  resumeStopwatch: vi.fn(() => ({
    kind: 'stopwatch',
    startedAt: 1_781_800_005_000,
    elapsedMs: 5_000,
    laps: [3_000]
  })),
  lapStopwatch: vi.fn(() => ({
    kind: 'stopwatch',
    startedAt: 1_781_800_000_000,
    elapsedMs: 0,
    laps: [3_000, 5_000]
  })),
  stopKeepAwake: vi.fn(() => true),
  stopSystemAwake: vi.fn(() => true),
  stopTimer: vi.fn(() => true),
  stopPomodoro: vi.fn(() => true),
  stopScreenClean: vi.fn(() => true),
  resetStopwatch: vi.fn(() => true),
  stopAllSessions: vi.fn(() => 0),
  listSessions: vi.fn((): QuickOpsSessionFixture[] => [])
}))
const localIpAddressesMock = vi.hoisted(() => [
  { name: 'en0', family: 'IPv4', address: '192.168.1.20' }
])
const formatQuickOpsCapabilityInfoMock = vi.hoisted(() =>
  vi.fn(
    (info: { platform: string; enabled: boolean; entries: unknown[] }) =>
      `QuickOps Capabilities (${info.platform})\nEnabled: ${info.enabled ? 'yes' : 'no'}\nentries=${info.entries.length}`
  )
)
const formatLocalIpInfoMock = vi.hoisted(() =>
  vi.fn((addresses: Array<{ name: string; family: string; address: string }>) =>
    addresses.map((item) => `${item.name} ${item.family} ${item.address}`).join('\n')
  )
)
const formatSystemInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsSystemInfo) => `System ${info.platform}/${info.arch}`)
)
const formatDiskSpaceInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsDiskSpaceInfo) => `Disk entries=${info.entries.length}`)
)
const formatDirectoryUsageInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsDirectoryUsageInfo) => `Directory entries=${info.entries.length}`)
)
const formatDiagnosticsInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsDiagnosticsInfo) => `Diagnostics schema=${info.schemaVersion}`)
)
const formatNetworkStatusInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsNetworkStatusInfo) => `Network addresses=${info.addresses.length}`)
)
const formatBatteryStatusInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsBatteryStatusInfo) => `Battery level=${info.levelPercent}`)
)
const formatSystemProxyInfoMock = vi.hoisted(() =>
  vi.fn((info: typeof quickOpsSystemProxyInfo) => `System proxy=${info.status}`)
)
const formatDurationMock = vi.hoisted(() =>
  vi.fn((durationMs: number) => `${Math.round(durationMs / 1000)}秒`)
)
const parseDurationMsMock = vi.hoisted(() =>
  vi.fn((text: string) => (text.includes('5m') ? 300000 : null))
)
const resolveCommonDirectoryMock = vi.hoisted(() =>
  vi.fn((text: string) =>
    text.includes('logs')
      ? {
          id: 'logs',
          title: '日志',
          subtitle: 'Logs',
          path: '/tmp/tuff/logs'
        }
      : {
          id: 'downloads',
          title: '下载',
          subtitle: 'Downloads',
          path: '/tmp/downloads'
        }
  )
)

const transportOnMock = vi.hoisted(() => vi.fn())
const transportDisposeMock = vi.hoisted(() => vi.fn())
const flowRegisterTargetMock = vi.hoisted(() => vi.fn())
const flowUnregisterTargetMock = vi.hoisted(() => vi.fn())
const flowRegisterDeliveryHandlerMock = vi.hoisted(() => vi.fn())
const flowDeliveryDisposeMock = vi.hoisted(() => vi.fn())
const flowAcknowledgeMock = vi.hoisted(() => vi.fn())
const showInternalSystemNotificationMock = vi.hoisted(() => vi.fn(() => ({ id: 'notification-1' })))
const clipboardWriteTextMock = vi.hoisted(() => vi.fn())
const shellOpenPathMock = vi.hoisted(() => vi.fn(async () => ''))

vi.mock('electron', () => ({
  clipboard: {
    writeText: clipboardWriteTextMock
  },
  shell: {
    openPath: shellOpenPathMock
  }
}))

vi.mock('./quick-ops-runtime-host', () => ({
  computeFileHashes: quickOpsFileHashResultMock,
  encodeFileBase64: quickOpsFileBase64ResultMock,
  findRecentDownloadFile: quickOpsRecentDownloadResultMock,
  createTempDirectory: quickOpsTempDirectoryResultMock,
  createTempTextFile: quickOpsTempTextFileResultMock,
  createBatteryStatusInfo: quickOpsBatteryStatusResultMock,
  createDiskSpaceInfo: quickOpsDiskSpaceResultMock,
  createDirectoryUsageInfo: quickOpsDirectoryUsageResultMock,
  createDnsQueryInfo: quickOpsDnsQueryResultMock,
  createFilePathInfo: vi.fn((filePath: string) => ({
    path: filePath,
    fileName: filePath.split('/').pop() || filePath,
    shellPath: `'${filePath.replace(/'/g, "'\\\\''")}'`,
    fileUrl: `file://${filePath}`,
    windowsPath: filePath.startsWith('/mnt/c/')
      ? `C:\\${filePath.slice('/mnt/c/'.length)}`
      : undefined,
    wslPath: /^[A-Za-z]:\\/.test(filePath)
      ? `/mnt/${filePath[0].toLowerCase()}/${filePath.slice(3).replace(/\\/g, '/')}`
      : undefined
  })),
  createNetworkStatusInfo: vi.fn(() => quickOpsNetworkStatusInfo),
  createPortReleaseCommand: vi.fn((processInfo: { pid: number }) => `kill ${processInfo.pid}`),
  createSystemProxyInfo: quickOpsSystemProxyResultMock,
  createSystemInfo: vi.fn(() => quickOpsSystemInfo),
  formatBatteryStatusInfo: formatBatteryStatusInfoMock,
  formatDiskSpaceInfo: formatDiskSpaceInfoMock,
  formatDirectoryUsageInfo: formatDirectoryUsageInfoMock,
  formatDnsQueryInfo: vi.fn(
    (info: { hostname: string; records: unknown[] }) =>
      `DNS ${info.hostname} records=${info.records.length}`
  ),
  formatDiagnosticsInfo: formatDiagnosticsInfoMock,
  formatLocalIpInfo: formatLocalIpInfoMock,
  formatNetworkStatusInfo: formatNetworkStatusInfoMock,
  formatQuickOpsCapabilityInfo: formatQuickOpsCapabilityInfoMock,
  formatSystemProxyInfo: formatSystemProxyInfoMock,
  formatSystemInfo: formatSystemInfoMock,
  getLocalIpAddresses: vi.fn(() => localIpAddressesMock),
  isValidTcpPort: vi.fn((port: number) => Number.isInteger(port) && port >= 1 && port <= 65_535),
  lookupPublicIp: quickOpsPublicIpResultMock,
  parseDurationMs: parseDurationMsMock,
  parseDnsQuery: vi.fn((text: string) => {
    const match = text.match(/^(deep\s+)?dns\s+([a-z0-9.-]+)$/i)
    return match?.[2]?.includes('.')
      ? {
          hostname: match[2].toLowerCase(),
          deep: Boolean(match[1])
        }
      : null
  }),
  parsePortQuery: vi.fn((text: string) => {
    const match = text.match(/(?:port|端口)\s+(-?\d+)/i)
    return match?.[1] ? Number(match[1]) : null
  }),
  probeLocalTcpPort: quickOpsPortProbeMock,
  quickOpsRuntime: quickOpsRuntimeMock,
  resolveCommonDirectory: resolveCommonDirectoryMock,
  resolveFileBase64Path: vi.fn((text: string) => {
    const match = text.match(/^(?:file\s+base64|base64\s+file)\s+\"?(.+?)\"?$/i)
    return match?.[1] ?? null
  }),
  resolveFileHashPath: vi.fn((text: string) => {
    const match = text.match(/^(?:hash|file\s+hash)\s+\"?(.+?)\"?$/i)
    return match?.[1] ?? null
  }),
  resolveFilePathTarget: vi.fn((text: string) => {
    const match = text.match(/^(?:copy\s+path|path\s+format|复制文件路径)\s+\"?(.+?)\"?$/i)
    return match?.[1] ?? null
  })
}))

vi.mock('./quick-ops-session-manager', () => ({
  formatDuration: formatDurationMock,
  getSessionDisplayDurationMs: vi.fn((session: { elapsedMs?: number }) => session.elapsedMs ?? 0)
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    transport: {
      on: transportOnMock
    }
  }))
}))

vi.mock('../flow-bus/target-registry', () => ({
  flowTargetRegistry: {
    registerTarget: flowRegisterTargetMock,
    unregisterTarget: flowUnregisterTargetMock
  }
}))

vi.mock('../flow-bus/flow-bus', () => ({
  flowBus: {
    acknowledge: flowAcknowledgeMock,
    registerDeliveryHandler: flowRegisterDeliveryHandlerMock
  }
}))

vi.mock('../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: showInternalSystemNotificationMock
  }
}))

interface ExpectedQuickOpsFlowTarget {
  id: string
  actionId: string
  requireConfirm: boolean
  maxPayloadSize?: number
}

const expectedQuickOpsTransportEvents = [
  QuickOpsEvents.capabilities.get,
  QuickOpsEvents.sessions.get,
  QuickOpsEvents.audit.get,
  QuickOpsEvents.systemInfo.get,
  QuickOpsEvents.tuffDiagnostics.get,
  QuickOpsEvents.diskSpace.get,
  QuickOpsEvents.directoryUsage.get,
  QuickOpsEvents.queryLocalIp.get,
  QuickOpsEvents.portStatus.get,
  QuickOpsEvents.dnsQuery.get,
  QuickOpsEvents.fileHash.get,
  QuickOpsEvents.fileBase64.get,
  QuickOpsEvents.recentDownload.get,
  QuickOpsEvents.commonDirectory.get,
  QuickOpsEvents.pathFormat.get,
  QuickOpsEvents.formatText.get,
  QuickOpsEvents.networkStatus.get,
  QuickOpsEvents.batteryStatus.get,
  QuickOpsEvents.systemProxy.get
] as const

import {
  computeFileHashes,
  encodeFileBase64,
  findRecentDownloadFile,
  createTempDirectory,
  createTempTextFile,
  createBatteryStatusInfo,
  createDiskSpaceInfo,
  createDirectoryUsageInfo,
  createNetworkStatusInfo,
  createPortReleaseCommand,
  createSystemProxyInfo,
  createSystemInfo,
  formatBatteryStatusInfo,
  formatDiskSpaceInfo,
  formatDirectoryUsageInfo,
  formatDiagnosticsInfo,
  formatLocalIpInfo,
  formatNetworkStatusInfo,
  formatQuickOpsCapabilityInfo,
  formatSystemProxyInfo,
  formatSystemInfo,
  getLocalIpAddresses,
  probeLocalTcpPort
} from './quick-ops-runtime-host'
import {
  QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_FULL_ID,
  QUICK_OPS_CAPABILITIES_FLOW_TARGET_FULL_ID,
  QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
  QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_FULL_ID,
  QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_FULL_ID,
  QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_DISK_SPACE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_DNS_QUERY_FLOW_TARGET_FULL_ID,
  QUICK_OPS_FILE_BASE64_FLOW_TARGET_FULL_ID,
  QUICK_OPS_FILE_HASH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_FULL_ID,
  QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_FULL_ID,
  QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PATH_FORMAT_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PORT_STATUS_FLOW_TARGET_FULL_ID,
  QUICK_OPS_PUBLIC_IP_FLOW_TARGET_FULL_ID,
  QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_FULL_ID,
  QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_FULL_ID,
  QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_FULL_ID,
  QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_RESUME_TIMER_FLOW_TARGET_FULL_ID,
  QUICK_OPS_SESSIONS_FLOW_TARGET_FULL_ID,
  QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_FULL_ID,
  QUICK_OPS_START_POMODORO_FLOW_TARGET_FULL_ID,
  QUICK_OPS_START_STOPWATCH_FLOW_TARGET_FULL_ID,
  QUICK_OPS_START_TIMER_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_POMODORO_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_STOP_TIMER_FLOW_TARGET_FULL_ID,
  QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_FULL_ID,
  QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_FULL_ID,
  QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_FULL_ID,
  QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_FULL_ID,
  QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_FULL_ID,
  QuickOpsModule
} from './index'

const expectedQuickOpsFlowTargets: ExpectedQuickOpsFlowTarget[] = [
  {
    id: 'capabilities',
    actionId: QUICK_OPS_CAPABILITIES_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'sessions',
    actionId: QUICK_OPS_SESSIONS_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'stop-all-sessions',
    actionId: QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'system-info',
    actionId: QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'tuff-diagnostics',
    actionId: QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'disk-space',
    actionId: QUICK_OPS_DISK_SPACE_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'directory-usage',
    actionId: QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'network-status',
    actionId: QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'battery-status',
    actionId: QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'system-proxy',
    actionId: QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'public-ip',
    actionId: QUICK_OPS_PUBLIC_IP_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'query-local-ip',
    actionId: QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'port-status',
    actionId: QUICK_OPS_PORT_STATUS_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'dns-query',
    actionId: QUICK_OPS_DNS_QUERY_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'file-hash',
    actionId: QUICK_OPS_FILE_HASH_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'file-base64',
    actionId: QUICK_OPS_FILE_BASE64_FLOW_TARGET_FULL_ID,
    requireConfirm: false,
    maxPayloadSize: 1024 * 1024 + 16 * 1024
  },
  {
    id: 'recent-download',
    actionId: QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'common-directory',
    actionId: QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'path-format',
    actionId: QUICK_OPS_PATH_FORMAT_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'temp-text-file',
    actionId: QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_FULL_ID,
    requireConfirm: true,
    maxPayloadSize: 80 * 1024
  },
  {
    id: 'temp-directory',
    actionId: QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_FULL_ID,
    requireConfirm: true,
    maxPayloadSize: 16 * 1024
  },
  {
    id: 'keep-awake',
    actionId: QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'stop-keep-awake',
    actionId: QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'system-awake',
    actionId: QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'stop-system-awake',
    actionId: QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'start-timer',
    actionId: QUICK_OPS_START_TIMER_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'pause-timer',
    actionId: QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'resume-timer',
    actionId: QUICK_OPS_RESUME_TIMER_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'stop-timer',
    actionId: QUICK_OPS_STOP_TIMER_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'start-pomodoro',
    actionId: QUICK_OPS_START_POMODORO_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'pause-pomodoro',
    actionId: QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'resume-pomodoro',
    actionId: QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'stop-pomodoro',
    actionId: QUICK_OPS_STOP_POMODORO_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'clean-screen',
    actionId: QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'stop-clean-screen',
    actionId: QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'start-stopwatch',
    actionId: QUICK_OPS_START_STOPWATCH_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'pause-stopwatch',
    actionId: QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'resume-stopwatch',
    actionId: QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'lap-stopwatch',
    actionId: QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'reset-stopwatch',
    actionId: QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'show-notification',
    actionId: QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'copy-to-clipboard',
    actionId: QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  },
  {
    id: 'format-text',
    actionId: QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_FULL_ID,
    requireConfirm: false
  },
  {
    id: 'open-folder',
    actionId: QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_FULL_ID,
    requireConfirm: true
  }
] as const

const quickOpsTargetsThatMustRequireConfirmation = new Set([
  'stop-all-sessions',
  'public-ip',
  'temp-text-file',
  'temp-directory',
  'keep-awake',
  'system-awake',
  'start-timer',
  'start-pomodoro',
  'clean-screen',
  'start-stopwatch',
  'show-notification',
  'copy-to-clipboard',
  'open-folder'
])

const quickOpsTargetsThatMustNotRequireConfirmation = new Set(
  expectedQuickOpsFlowTargets
    .map((target) => target.id)
    .filter((id) => !quickOpsTargetsThatMustRequireConfirmation.has(id))
)

type QuickOpsFlowPayloadHandler = (session: {
  sessionId: string
  targetId: string
  payload: { data: unknown }
}) => Promise<void>

function getQuickOpsTransportHandler<THandler>(event: unknown): THandler {
  const handler = transportOnMock.mock.calls.find(
    ([registeredEvent]) => registeredEvent === event
  )?.[1]
  expect(handler).toEqual(expect.any(Function))
  return handler as THandler
}

function getQuickOpsFlowHandler(): QuickOpsFlowPayloadHandler {
  const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1]
  expect(handler).toEqual(expect.any(Function))
  return handler as QuickOpsFlowPayloadHandler
}

function createQuickOpsModuleContext(): ModuleInitContext<TalexEvents> & {
  emit: (event: TalexEvents) => void
  eventHandlers: Map<TalexEvents, Set<() => void>>
} {
  const eventHandlers = new Map<TalexEvents, Set<() => void>>()
  const context = {
    events: {
      on: (event: TalexEvents, handler: () => void) => {
        const handlers = eventHandlers.get(event) ?? new Set<() => void>()
        handlers.add(handler)
        eventHandlers.set(event, handlers)
      },
      off: (event: TalexEvents, handler: () => void) => {
        const handlers = eventHandlers.get(event)
        if (!handlers) return false
        const deleted = handlers.delete(handler)
        if (handlers.size === 0) {
          eventHandlers.delete(event)
        }
        return deleted
      }
    },
    emit: (event: TalexEvents) => {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler()
      }
    },
    eventHandlers
  } as ModuleInitContext<TalexEvents> & {
    emit: (event: TalexEvents) => void
    eventHandlers: Map<TalexEvents, Set<() => void>>
  }

  return context
}

describe('QuickOpsModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    quickOpsBatteryStatusResultMock.mockResolvedValue(quickOpsBatteryStatusInfo)
    quickOpsDiskSpaceResultMock.mockResolvedValue(quickOpsDiskSpaceInfo)
    quickOpsDirectoryUsageResultMock.mockResolvedValue(quickOpsDirectoryUsageInfo)
    quickOpsSystemProxyResultMock.mockResolvedValue(quickOpsSystemProxyInfo)
    quickOpsTempTextFileResultMock.mockResolvedValue(quickOpsTempTextFileInfo)
    quickOpsTempDirectoryResultMock.mockResolvedValue(quickOpsTempDirectoryInfo)
    quickOpsRuntimeMock.listSessions.mockReturnValue([])
    quickOpsRuntimeMock.stopAllSessions.mockReturnValue(0)
    quickOpsPortProbeMock.mockImplementation(async (port: number) => ({
      port,
      host: '127.0.0.1',
      available: true
    }))
    transportOnMock.mockReturnValue(transportDisposeMock)
    flowRegisterTargetMock.mockReturnValue(true)
    flowRegisterDeliveryHandlerMock.mockReturnValue(flowDeliveryDisposeMock)
    shellOpenPathMock.mockResolvedValue('')
  })

  it('exposes the shared QuickOps runtime without cleaning sessions on init', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    expect(module.getRuntime()).toBe(quickOpsRuntimeMock)
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.capabilities.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(QuickOpsEvents.sessions.get, expect.any(Function))
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.systemInfo.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.tuffDiagnostics.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(QuickOpsEvents.diskSpace.get, expect.any(Function))
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.directoryUsage.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.queryLocalIp.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.portStatus.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(QuickOpsEvents.dnsQuery.get, expect.any(Function))
    expect(transportOnMock).toHaveBeenCalledWith(QuickOpsEvents.fileHash.get, expect.any(Function))
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.fileBase64.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.recentDownload.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.commonDirectory.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.pathFormat.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.formatText.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.networkStatus.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.batteryStatus.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(
      QuickOpsEvents.systemProxy.get,
      expect.any(Function)
    )
    expect(transportOnMock).toHaveBeenCalledWith(QuickOpsEvents.audit.get, expect.any(Function))
    expect(quickOpsRuntimeMock.cleanup).not.toHaveBeenCalled()
  })

  it('registers QuickOps only through typed transport events and Flow registry', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const registeredTransportEvents = transportOnMock.mock.calls.map(([event]) => event)
    expect(registeredTransportEvents).toEqual([...expectedQuickOpsTransportEvents])
    expect(registeredTransportEvents.every((event) => typeof event !== 'string')).toBe(true)

    const registeredFlowTargetIds = flowRegisterTargetMock.mock.calls.map(
      ([pluginId, target]) => `${pluginId}.${target.id}`
    )
    expect(flowRegisterTargetMock).toHaveBeenCalledTimes(expectedQuickOpsFlowTargets.length)
    expect(registeredFlowTargetIds).toEqual(
      expectedQuickOpsFlowTargets.map((target) => target.actionId)
    )
    expect(
      flowRegisterTargetMock.mock.calls.every(
        ([pluginId, , options]) =>
          pluginId === 'quickops' &&
          options?.pluginName === 'QuickOps' &&
          options.hasFlowHandler === true
      )
    ).toBe(true)
    expect(flowRegisterDeliveryHandlerMock).toHaveBeenCalledTimes(1)
    expect(flowRegisterDeliveryHandlerMock).toHaveBeenCalledWith('quickops', expect.any(Function))
  })

  it('requires one-time confirmation for every mutating or external QuickOps Flow target', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const registeredTargets = new Map(
      flowRegisterTargetMock.mock.calls.map(([pluginId, target]) => [
        `${pluginId}.${target.id}`,
        target
      ])
    )

    for (const targetId of quickOpsTargetsThatMustRequireConfirmation) {
      const target = registeredTargets.get(`quickops.${targetId}`)
      expect(target?.requireConfirm).toBe(true)
    }

    for (const targetId of quickOpsTargetsThatMustNotRequireConfirmation) {
      const target = registeredTargets.get(`quickops.${targetId}`)
      expect(target?.requireConfirm).toBeFalsy()
    }

    expect(registeredTargets.size).toBe(expectedQuickOpsFlowTargets.length)
  })

  it('exposes an empty local QuickOps audit snapshot before Flow deliveries', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = getQuickOpsTransportHandler<(request?: { limit?: number }) => unknown>(
      QuickOpsEvents.audit.get
    )

    expect(handler()).toEqual({
      state: 'empty',
      count: 0,
      limit: 20,
      maxEntries: 100,
      entries: []
    })
    expect(handler({ limit: 500 })).toEqual({
      state: 'empty',
      count: 0,
      limit: 100,
      maxEntries: 100,
      entries: []
    })
  })

  it('records redacted local QuickOps audit entries for Flow deliveries', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const flowHandler = getQuickOpsFlowHandler()
    await flowHandler({
      sessionId: 'flow-session-audit-format-text',
      targetId: 'format-text',
      payload: {
        data: {
          text: 'Sensitive text should not be stored',
          mode: 'snake'
        }
      }
    })

    const auditHandler = getQuickOpsTransportHandler<
      (request?: { limit?: number }) => {
        state: string
        count: number
        limit: number
        maxEntries: number
        entries: Array<Record<string, unknown>>
      }
    >(QuickOpsEvents.audit.get)
    const response = auditHandler({ limit: 1 })

    expect(response).toEqual(
      expect.objectContaining({
        state: 'ready',
        count: 1,
        limit: 1,
        maxEntries: 100
      })
    )
    expect(response.entries[0]).toEqual(
      expect.objectContaining({
        source: 'flow',
        targetId: 'format-text',
        decision: 'delivered',
        requiresConfirmation: false,
        payloadKeys: ['mode', 'text']
      })
    )
    expect(JSON.stringify(response.entries[0])).not.toContain('Sensitive text should not be stored')
  })

  it('records blocked QuickOps Flow deliveries in the local audit ring', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.network.local',
          label: '本机网络只读查询',
          status: 'disabled',
          riskLevel: 'safe',
          reason: 'network-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const flowHandler = getQuickOpsFlowHandler()
    await flowHandler({
      sessionId: 'flow-session-audit-network-blocked',
      targetId: 'network-status',
      payload: {
        data: {}
      }
    })

    const auditHandler = getQuickOpsTransportHandler<
      (request?: { limit?: number }) => {
        entries: Array<Record<string, unknown>>
      }
    >(QuickOpsEvents.audit.get)

    expect(auditHandler({ limit: 1 }).entries[0]).toEqual(
      expect.objectContaining({
        source: 'flow',
        targetId: 'network-status',
        decision: 'blocked',
        reason: 'network-tools-disabled-by-policy',
        requiresConfirmation: false,
        payloadKeys: []
      })
    )
  })

  it('exposes QuickOps sessions through the read-only typed transport handler', () => {
    quickOpsRuntimeMock.listSessions.mockReturnValueOnce([
      {
        id: 'quick-ops:screen-clean:1',
        kind: 'screen-clean',
        title: '清洁屏幕',
        startedAt: 1_781_800_000_000,
        durationMs: 60_000,
        windows: [{ id: 1 }]
      }
    ])
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.sessions.get
    )?.[1] as (() => unknown) | undefined
    const response = handler?.()

    expect(response).toEqual({
      state: 'running',
      count: 1,
      sessions: [
        expect.objectContaining({
          id: 'quick-ops:screen-clean:1',
          kind: 'screen-clean',
          title: '清洁屏幕',
          state: 'running',
          windowCount: 1
        })
      ],
      text: '清洁屏幕 (screen-clean) running: 0秒'
    })
    expect(
      (response as { sessions: Array<Record<string, unknown>> }).sessions[0]
    ).not.toHaveProperty('windows')
  })

  it('exposes local system info through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.systemInfo.get
    )?.[1] as (() => unknown) | undefined
    const response = handler?.()

    expect(formatSystemInfo).toHaveBeenCalledWith(quickOpsSystemInfo)
    expect(response).toEqual({
      text: 'System darwin/arm64',
      systemInfo: quickOpsSystemInfo
    })
  })

  it('exposes redacted Tuff diagnostics through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.tuffDiagnostics.get
    )?.[1] as (() => unknown) | undefined
    const response = handler?.()

    expect(quickOpsRuntimeMock.getDiagnosticsInfo).toHaveBeenCalledWith()
    expect(formatDiagnosticsInfo).toHaveBeenCalledWith(quickOpsDiagnosticsInfo)
    expect(response).toEqual({
      text: 'Diagnostics schema=2',
      diagnostics: quickOpsDiagnosticsInfo
    })
  })

  it('registers the structured QuickOps Flow target manifest', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    expect(flowRegisterTargetMock).toHaveBeenCalledTimes(expectedQuickOpsFlowTargets.length)
    for (const expectedTarget of expectedQuickOpsFlowTargets) {
      const [, target, options] =
        flowRegisterTargetMock.mock.calls.find(
          ([, registeredTarget]) => registeredTarget.id === expectedTarget.id
        ) ?? []

      expect(target).toEqual(
        expect.objectContaining({
          id: expectedTarget.id,
          actionId: expectedTarget.actionId,
          supportedTypes: ['json', 'text'],
          capabilities: {
            maxPayloadSize: expectedTarget.maxPayloadSize ?? 16 * 1024
          }
        })
      )
      expect(target.requireConfirm).toBe(expectedTarget.requireConfirm ? true : undefined)
      expect(options).toEqual(
        expect.objectContaining({
          pluginName: 'QuickOps',
          hasFlowHandler: true
        })
      )
    }
    expect(flowRegisterDeliveryHandlerMock).toHaveBeenCalledWith('quickops', expect.any(Function))
  })

  it('acks Flow delivery with the QuickOps capability payload', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-1' })

    const info = quickOpsRuntimeMock.getCapabilityInfo()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-1', {
      kind: 'quickops.capabilities',
      text: formatQuickOpsCapabilityInfo(info),
      capabilities: info
    })
  })

  it('acks Flow sessions delivery with an idle read-only runtime snapshot', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-sessions-idle', targetId: 'sessions' })

    expect(quickOpsRuntimeMock.listSessions).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-sessions-idle', {
      kind: 'quickops.sessions',
      state: 'idle',
      count: 0,
      sessions: [],
      text: 'QuickOps sessions: idle'
    })
  })

  it('acks Flow sessions delivery with sanitized running session snapshots', async () => {
    quickOpsRuntimeMock.listSessions.mockReturnValueOnce([
      {
        id: 'quick-ops:timer:1',
        kind: 'timer',
        title: '计时器',
        startedAt: 1_781_800_000_000,
        durationMs: 90_000,
        expiresAt: Date.now() + 90_000
      },
      {
        id: 'quick-ops:stopwatch:1',
        kind: 'stopwatch',
        title: '秒表',
        startedAt: 1_781_800_000_000,
        durationMs: 0,
        pausedAt: 1_781_800_006_000,
        elapsedMs: 6_000,
        laps: [3_000, 5_000],
        windows: [{ id: 1 }]
      }
    ])
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-sessions-running', targetId: 'sessions' })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith(
      'flow-session-sessions-running',
      expect.objectContaining({
        kind: 'quickops.sessions',
        state: 'running',
        count: 2,
        sessions: [
          expect.objectContaining({
            id: 'quick-ops:timer:1',
            kind: 'timer',
            title: '计时器',
            state: 'running',
            durationMs: 90_000
          }),
          expect.objectContaining({
            id: 'quick-ops:stopwatch:1',
            kind: 'stopwatch',
            title: '秒表',
            state: 'paused',
            displayDurationMs: 6_000,
            displayDurationText: '6秒',
            lapCount: 2,
            lastLapMs: 5_000,
            lastLapText: '5秒'
          })
        ],
        text: expect.stringContaining('秒表 (stopwatch) paused: 6秒')
      })
    )
    const ackPayload = flowAcknowledgeMock.mock.calls.at(-1)?.[1]
    expect(ackPayload.sessions[0]).not.toHaveProperty('timeout')
    expect(ackPayload.sessions[1]).not.toHaveProperty('windows')
  })

  it('acks Flow stopAllSessions delivery after clearing shared runtime sessions', async () => {
    quickOpsRuntimeMock.listSessions.mockReturnValueOnce([
      {
        id: 'quick-ops:timer:1',
        kind: 'timer',
        title: '计时器',
        startedAt: 1_781_800_000_000,
        durationMs: 90_000,
        expiresAt: Date.now() + 90_000
      },
      {
        id: 'quick-ops:screen-clean:1',
        kind: 'screen-clean',
        title: '清洁屏幕',
        startedAt: 1_781_800_000_000,
        durationMs: 60_000,
        windows: [{ id: 1 }, { id: 2 }]
      }
    ])
    quickOpsRuntimeMock.stopAllSessions.mockReturnValueOnce(2)
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-stop-all-sessions',
      targetId: 'stop-all-sessions'
    })

    expect(quickOpsRuntimeMock.listSessions).toHaveBeenCalledWith()
    expect(quickOpsRuntimeMock.stopAllSessions).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith(
      'flow-session-stop-all-sessions',
      expect.objectContaining({
        kind: 'quickops.stopAllSessions',
        state: 'stopped',
        stopped: 2,
        sessions: [
          expect.objectContaining({
            id: 'quick-ops:timer:1',
            kind: 'timer',
            title: '计时器'
          }),
          expect.objectContaining({
            id: 'quick-ops:screen-clean:1',
            kind: 'screen-clean',
            title: '清洁屏幕',
            windowCount: 2
          })
        ],
        text: 'Stopped 2 QuickOps sessions'
      })
    )
    const ackPayload = flowAcknowledgeMock.mock.calls.at(-1)?.[1]
    expect(ackPayload.sessions[1]).not.toHaveProperty('windows')
  })

  it('acks Flow stopAllSessions delivery as idle when no runtime sessions exist', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-stop-all-sessions-idle',
      targetId: 'stop-all-sessions'
    })

    expect(quickOpsRuntimeMock.stopAllSessions).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-stop-all-sessions-idle', {
      kind: 'quickops.stopAllSessions',
      state: 'idle',
      stopped: 0,
      sessions: [],
      text: 'QuickOps sessions: idle'
    })
  })

  it('acks Flow systemInfo delivery with a read-only local system summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-system-info',
      targetId: 'system-info'
    })

    const info = createSystemInfo()
    expect(formatSystemInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-system-info', {
      kind: 'quickops.systemInfo',
      text: formatSystemInfo(info),
      systemInfo: info
    })
  })

  it('acks Flow tuffDiagnostics delivery with a redacted local diagnostics summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-tuff-diagnostics',
      targetId: 'tuff-diagnostics'
    })

    const info = quickOpsRuntimeMock.getDiagnosticsInfo()
    expect(formatDiagnosticsInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-tuff-diagnostics', {
      kind: 'quickops.tuffDiagnostics',
      text: formatDiagnosticsInfo(info),
      diagnostics: info
    })
  })

  it('acks Flow diskSpace delivery with a read-only local disk summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-disk-space',
      targetId: 'disk-space'
    })

    const info = await createDiskSpaceInfo()
    if ('degradedReason' in info) throw new Error('Expected disk space info')
    expect(formatDiskSpaceInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-disk-space', {
      kind: 'quickops.diskSpace',
      state: 'ready',
      text: formatDiskSpaceInfo(info),
      diskSpace: info
    })
  })

  it('acks Flow diskSpace delivery with degraded details when local statfs fails', async () => {
    quickOpsDiskSpaceResultMock.mockResolvedValueOnce({
      degradedReason: 'disk-space-read-failed',
      message: '读取文件系统容量失败'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-disk-space-degraded',
      targetId: 'disk-space'
    })

    expect(formatDiskSpaceInfo).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-disk-space-degraded', {
      kind: 'quickops.diskSpace',
      state: 'degraded',
      degradedReason: 'disk-space-read-failed',
      message: '读取文件系统容量失败'
    })
  })

  it('exposes disk space through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.diskSpace.get
    )?.[1] as (() => Promise<unknown>) | undefined

    const response = await handler?.()
    const info = await createDiskSpaceInfo()
    if ('degradedReason' in info) throw new Error('Expected disk space info')
    expect(formatDiskSpaceInfo).toHaveBeenCalledWith(info)
    expect(response).toEqual({
      state: 'ready',
      text: formatDiskSpaceInfo(info),
      diskSpace: info
    })
  })

  it('exposes directory usage through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.directoryUsage.get
    )?.[1] as ((request?: { deep?: boolean }) => Promise<unknown>) | undefined

    const response = await handler?.({ deep: true })
    const info = await createDirectoryUsageInfo()
    if ('degradedReason' in info) throw new Error('Expected directory usage info')
    expect(quickOpsDirectoryUsageResultMock).toHaveBeenCalledWith(undefined, { deep: true })
    expect(formatDirectoryUsageInfo).toHaveBeenCalledWith(info)
    expect(response).toEqual({
      state: 'ready',
      text: formatDirectoryUsageInfo(info),
      directoryUsage: info
    })
  })

  it('exposes degraded directory usage details through the typed transport handler', async () => {
    quickOpsDirectoryUsageResultMock.mockResolvedValueOnce({
      degradedReason: 'directory-usage-read-failed',
      message: '读取目录占用失败',
      path: '~/Documents'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.directoryUsage.get
    )?.[1] as ((request?: { deep?: boolean }) => Promise<unknown>) | undefined

    await expect(handler?.()).resolves.toEqual({
      state: 'degraded',
      degradedReason: 'directory-usage-read-failed',
      message: '读取目录占用失败',
      path: '~/Documents',
      scanDepth: 1
    })
    expect(formatDirectoryUsageInfo).not.toHaveBeenCalled()
  })

  it('exposes local IP addresses through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.queryLocalIp.get
    )?.[1] as (() => unknown) | undefined
    const addresses = getLocalIpAddresses()

    expect(handler?.()).toEqual({
      text: formatLocalIpInfo(addresses),
      addresses,
      degradedReason: undefined
    })
  })

  it('exposes port status through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.portStatus.get
    )?.[1] as ((request: { port?: number | string; text?: string }) => Promise<unknown>) | undefined

    await expect(handler?.({ port: '3000' })).resolves.toEqual({
      state: 'available',
      available: true,
      port: 3000,
      host: '127.0.0.1',
      process: undefined,
      releaseCommand: undefined,
      degradedReason: undefined,
      errorCode: undefined
    })
    expect(probeLocalTcpPort).toHaveBeenCalledWith(3000)
  })

  it('exposes degraded port status details for invalid typed transport requests', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.portStatus.get
    )?.[1] as ((request: { port?: number | string; text?: string }) => Promise<unknown>) | undefined

    await expect(handler?.({ port: 70_000 })).resolves.toEqual({
      state: 'degraded',
      available: false,
      port: 70_000,
      degradedReason: 'invalid-port'
    })
    expect(probeLocalTcpPort).not.toHaveBeenCalled()
  })

  it('exposes DNS query through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.dnsQuery.get
    )?.[1] as
      | ((request: { hostname?: string; text?: string; deep?: boolean }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ hostname: 'Example.com' })).resolves.toEqual({
      state: 'resolved',
      text: 'DNS example.com records=2',
      dnsQuery: quickOpsDnsQueryInfo
    })
    expect(quickOpsDnsQueryResultMock).toHaveBeenCalledWith('example.com', false)
  })

  it('exposes degraded DNS query details for invalid typed transport requests', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.dnsQuery.get
    )?.[1] as
      | ((request: { hostname?: string; text?: string; deep?: boolean }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ text: 'dns localhost' })).resolves.toEqual({
      state: 'degraded',
      degradedReason: 'dns-query-invalid-hostname',
      message: '请输入有效域名'
    })
    expect(quickOpsDnsQueryResultMock).not.toHaveBeenCalled()
  })

  it('exposes file hash through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.fileHash.get
    )?.[1] as
      | ((request: { path?: string; filePath?: string; text?: string }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ path: '/tmp/demo.txt' })).resolves.toEqual({
      state: 'hashed',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      size: 12,
      hashes: {
        md5: 'md5-hash',
        sha1: 'sha1-hash',
        sha256: 'sha256-hash'
      },
      text: 'MD5 md5-hash\nSHA1 sha1-hash\nSHA256 sha256-hash',
      fileHash: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        md5: 'md5-hash',
        sha1: 'sha1-hash',
        sha256: 'sha256-hash'
      }
    })
    expect(computeFileHashes).toHaveBeenCalledWith('/tmp/demo.txt')
  })

  it('exposes degraded file hash details for invalid typed transport requests', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.fileHash.get
    )?.[1] as
      | ((request: { path?: string; filePath?: string; text?: string }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ text: 'hash' })).resolves.toEqual({
      state: 'degraded',
      degradedReason: 'file-hash-missing-file',
      message: '未找到要计算 Hash 的文件'
    })
    expect(computeFileHashes).not.toHaveBeenCalled()
  })

  it('exposes file Base64 through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.fileBase64.get
    )?.[1] as
      | ((request: { path?: string; filePath?: string; text?: string }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ path: '/tmp/demo.txt' })).resolves.toEqual({
      state: 'encoded',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      size: 12,
      base64: 'SGVsbG8gVHVmZg==',
      text: 'SGVsbG8gVHVmZg==',
      fileBase64: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        base64: 'SGVsbG8gVHVmZg=='
      }
    })
    expect(encodeFileBase64).toHaveBeenCalledWith('/tmp/demo.txt')
  })

  it('exposes degraded file Base64 details for invalid typed transport requests', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.fileBase64.get
    )?.[1] as
      | ((request: { path?: string; filePath?: string; text?: string }) => Promise<unknown>)
      | undefined

    await expect(handler?.({ text: 'file base64' })).resolves.toEqual({
      state: 'degraded',
      degradedReason: 'file-base64-missing-file',
      message: '未找到要编码的文件'
    })
    expect(encodeFileBase64).not.toHaveBeenCalled()
  })

  it('exposes recent download metadata through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.recentDownload.get
    )?.[1] as (() => Promise<unknown>) | undefined

    await expect(handler?.()).resolves.toEqual({
      state: 'found',
      path: '/tmp/Downloads/report.pdf',
      fileName: 'report.pdf',
      size: 4096,
      modifiedAt: 1_781_818_000_000,
      text: 'report.pdf\n/tmp/Downloads/report.pdf',
      recentDownload: {
        path: '/tmp/Downloads/report.pdf',
        fileName: 'report.pdf',
        size: 4096,
        modifiedAt: 1_781_818_000_000
      }
    })
    expect(findRecentDownloadFile).toHaveBeenCalledTimes(1)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it('exposes degraded recent download details through the typed transport handler', async () => {
    quickOpsRecentDownloadResultMock.mockResolvedValueOnce({
      degradedReason: 'recent-download-empty',
      message: 'Downloads 目录没有可打开的普通文件'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.recentDownload.get
    )?.[1] as (() => Promise<unknown>) | undefined

    await expect(handler?.()).resolves.toEqual({
      state: 'degraded',
      degradedReason: 'recent-download-empty',
      message: 'Downloads 目录没有可打开的普通文件'
    })
  })

  it('exposes common directory metadata through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.commonDirectory.get
    )?.[1] as ((request?: unknown) => unknown) | undefined

    expect(handler?.({ query: 'logs' })).toEqual({
      state: 'resolved',
      directoryId: 'logs',
      title: '日志',
      subtitle: 'Logs',
      path: '/tmp/tuff/logs',
      text: '日志\n/tmp/tuff/logs',
      commonDirectory: {
        id: 'logs',
        title: '日志',
        subtitle: 'Logs',
        path: '/tmp/tuff/logs'
      }
    })
    expect(resolveCommonDirectoryMock).toHaveBeenCalledWith('logs')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it('exposes copy-only path formats through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.pathFormat.get
    )?.[1] as ((request: unknown) => unknown) | undefined

    expect(handler?.({ path: '/tmp/demo.txt' })).toEqual({
      state: 'formatted',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      formats: {
        raw: '/tmp/demo.txt',
        shell: "'/tmp/demo.txt'",
        fileUrl: 'file:///tmp/demo.txt',
        windows: undefined,
        wsl: undefined
      },
      text: "/tmp/demo.txt\n'/tmp/demo.txt'\nfile:///tmp/demo.txt",
      pathFormat: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        shellPath: "'/tmp/demo.txt'",
        fileUrl: 'file:///tmp/demo.txt',
        windowsPath: undefined,
        wslPath: undefined
      }
    })
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it('exposes degraded path format details through the typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.pathFormat.get
    )?.[1] as ((request: unknown) => unknown) | undefined

    expect(handler?.({ text: 'copy path' })).toEqual({
      state: 'degraded',
      degradedReason: 'file-path-missing-file',
      message: '未找到要复制路径的文件'
    })
  })

  it('exposes formatted text through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.formatText.get
    )?.[1] as ((request: unknown) => unknown) | undefined

    expect(handler?.({ text: 'Hello quickOps Flow', mode: 'snake' })).toEqual({
      state: 'formatted',
      mode: 'snake',
      inputCharCount: 19,
      outputCharCount: 20,
      truncated: false,
      text: 'hello_quick_ops_flow'
    })
  })

  it('exposes skipped format text details through the typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.formatText.get
    )?.[1] as ((request: unknown) => unknown) | undefined

    expect(handler?.({})).toEqual({
      state: 'skipped',
      degradedReason: 'missing-text'
    })
  })

  it('acks Flow directoryUsage delivery with a bounded shallow summary by default', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-directory-usage',
      targetId: 'directory-usage'
    })

    expect(quickOpsDirectoryUsageResultMock).toHaveBeenCalledWith(undefined, { deep: false })
    const info = await createDirectoryUsageInfo()
    if ('degradedReason' in info) throw new Error('Expected directory usage info')
    expect(formatDirectoryUsageInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-directory-usage', {
      kind: 'quickops.directoryUsage',
      state: 'ready',
      text: formatDirectoryUsageInfo(info),
      directoryUsage: info
    })
  })

  it('acks Flow directoryUsage delivery with a bounded deep summary when requested', async () => {
    const deepInfo = {
      ...quickOpsDirectoryUsageInfo,
      maxTotalEntries: 1000,
      scanDepth: 3
    }
    quickOpsDirectoryUsageResultMock.mockResolvedValueOnce(deepInfo)
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-directory-usage-deep',
      targetId: 'directory-usage',
      payload: { data: { deep: true } }
    })

    expect(quickOpsDirectoryUsageResultMock).toHaveBeenCalledWith(undefined, { deep: true })
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-directory-usage-deep', {
      kind: 'quickops.directoryUsage',
      state: 'ready',
      text: formatDirectoryUsageInfo(deepInfo),
      directoryUsage: deepInfo
    })
  })

  it('acks Flow directoryUsage delivery with degraded details when bounded scan fails', async () => {
    quickOpsDirectoryUsageResultMock.mockResolvedValueOnce({
      degradedReason: 'directory-usage-permission-denied',
      message: '没有权限读取目录',
      path: '~/Downloads'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: string }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-directory-usage-degraded',
      targetId: 'directory-usage',
      payload: { data: 'deep' }
    })

    expect(formatDirectoryUsageInfo).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-directory-usage-degraded', {
      kind: 'quickops.directoryUsage',
      state: 'degraded',
      degradedReason: 'directory-usage-permission-denied',
      message: '没有权限读取目录',
      path: '~/Downloads',
      scanDepth: 3
    })
  })

  it('acks Flow networkStatus delivery with a read-only local network summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-network-status',
      targetId: 'network-status'
    })

    const info = createNetworkStatusInfo()
    expect(formatNetworkStatusInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-network-status', {
      kind: 'quickops.networkStatus',
      text: formatNetworkStatusInfo(info),
      networkStatus: info
    })
  })

  it('blocks network Flow targets when QuickOps policy disables network tools', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.network.local',
          label: '本机网络只读查询',
          status: 'disabled',
          riskLevel: 'safe',
          reason: 'network-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-network-policy-blocked',
      targetId: 'network-status'
    })

    expect(createNetworkStatusInfo).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-network-policy-blocked', {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: 'network-status',
      degradedReason: 'network-tools-disabled-by-policy',
      text: 'QuickOps network tools are disabled by policy'
    })
  })

  it('blocks file Flow targets when QuickOps policy disables file tools', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.files.readOnly',
          label: '文件 Hash / Base64 / 路径复制',
          status: 'disabled',
          riskLevel: 'safe',
          reason: 'file-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: { path: string } }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-policy-blocked',
      targetId: 'file-hash',
      payload: {
        data: {
          path: '/tmp/example.txt'
        }
      }
    })

    expect(computeFileHashes).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-policy-blocked', {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: 'file-hash',
      degradedReason: 'file-tools-disabled-by-policy',
      text: 'QuickOps file tools are disabled by policy'
    })
  })

  it('blocks system Flow targets when QuickOps policy disables system tools', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.system.diagnostics',
          label: '脱敏诊断 / 系统信息',
          status: 'disabled',
          riskLevel: 'safe',
          reason: 'system-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-system-policy-blocked',
      targetId: 'system-info'
    })

    expect(createSystemInfo).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-system-policy-blocked', {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: 'system-info',
      degradedReason: 'system-tools-disabled-by-policy',
      text: 'QuickOps system tools are disabled by policy'
    })
  })

  it('blocks developer Flow targets when QuickOps policy disables developer tools', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.developer.preview',
          label: 'PreviewSDK 开发者工具',
          status: 'disabled',
          riskLevel: 'safe',
          reason: 'developer-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-developer-policy-blocked',
      targetId: 'format-text',
      payload: {
        data: {
          text: 'Hello quickOps Flow',
          mode: 'snake'
        }
      }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-developer-policy-blocked', {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: 'format-text',
      degradedReason: 'developer-tools-disabled-by-policy',
      text: 'QuickOps developer tools are disabled by policy'
    })
  })

  it('exposes network status through the read-only typed transport handler', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.networkStatus.get
    )?.[1] as (() => unknown) | undefined

    const info = createNetworkStatusInfo()
    expect(handler?.()).toEqual({
      text: formatNetworkStatusInfo(info),
      networkStatus: info
    })
    expect(formatNetworkStatusInfo).toHaveBeenCalledWith(info)
  })

  it('acks Flow batteryStatus delivery with a read-only local battery summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-battery-status',
      targetId: 'battery-status'
    })

    const info = await createBatteryStatusInfo()
    if ('degradedReason' in info) throw new Error('Expected battery status info')
    expect(formatBatteryStatusInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-battery-status', {
      kind: 'quickops.batteryStatus',
      state: 'ready',
      text: formatBatteryStatusInfo(info),
      batteryStatus: info
    })
  })

  it('acks Flow batteryStatus delivery with degraded details when local battery probing fails', async () => {
    quickOpsBatteryStatusResultMock.mockResolvedValueOnce({
      degradedReason: 'battery-status-read-failed',
      message: '读取电池状态失败'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-battery-status-degraded',
      targetId: 'battery-status'
    })

    expect(formatBatteryStatusInfo).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-battery-status-degraded', {
      kind: 'quickops.batteryStatus',
      state: 'degraded',
      degradedReason: 'battery-status-read-failed',
      message: '读取电池状态失败'
    })
  })

  it('exposes battery status through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.batteryStatus.get
    )?.[1] as (() => Promise<unknown>) | undefined

    const response = await handler?.()
    const info = await createBatteryStatusInfo()
    if ('degradedReason' in info) throw new Error('Expected battery status info')
    expect(response).toEqual({
      state: 'ready',
      text: formatBatteryStatusInfo(info),
      batteryStatus: info
    })
    expect(formatBatteryStatusInfo).toHaveBeenCalledWith(info)
  })

  it('acks Flow systemProxy delivery with a read-only local proxy summary', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-system-proxy',
      targetId: 'system-proxy'
    })

    const info = await createSystemProxyInfo()
    expect(formatSystemProxyInfo).toHaveBeenCalledWith(info)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-system-proxy', {
      kind: 'quickops.systemProxy',
      state: 'ready',
      text: formatSystemProxyInfo(info),
      systemProxy: info,
      degradedReason: undefined,
      message: undefined
    })
  })

  it('acks Flow systemProxy delivery with degraded probe details when local probing fails', async () => {
    const degradedInfo: QuickOpsSystemProxyResultFixture = {
      platform: 'darwin',
      status: 'degraded',
      environment: [],
      system: [],
      degradedReason: 'system-proxy-probe-failed',
      degradedMessage: 'Unable to read system proxy'
    }
    quickOpsSystemProxyResultMock.mockResolvedValueOnce(degradedInfo)
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-system-proxy-degraded',
      targetId: 'system-proxy'
    })

    expect(formatSystemProxyInfo).toHaveBeenCalledWith(degradedInfo)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-system-proxy-degraded', {
      kind: 'quickops.systemProxy',
      state: 'degraded',
      text: formatSystemProxyInfo(degradedInfo),
      systemProxy: degradedInfo,
      degradedReason: 'system-proxy-probe-failed',
      message: 'Unable to read system proxy'
    })
  })

  it('exposes system proxy through the read-only typed transport handler', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.systemProxy.get
    )?.[1] as (() => Promise<unknown>) | undefined

    const response = await handler?.()
    const info = await createSystemProxyInfo()
    expect(response).toEqual({
      state: 'ready',
      text: formatSystemProxyInfo(info),
      systemProxy: info,
      degradedReason: undefined,
      message: undefined
    })
    expect(formatSystemProxyInfo).toHaveBeenCalledWith(info)
  })

  it('acks Flow publicIp delivery as disabled without explicit opt-in', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-public-ip-disabled',
      targetId: 'public-ip',
      payload: {
        data: {}
      }
    })

    expect(quickOpsPublicIpResultMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-public-ip-disabled', {
      kind: 'quickops.publicIp',
      state: 'disabled',
      degradedReason: 'public-ip-disabled',
      message: 'Public IP lookup requires explicit opt-in.'
    })
  })

  it('acks Flow publicIp delivery after explicit opt-in lookup', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-public-ip',
      targetId: 'public-ip',
      payload: {
        data: {
          allowLookup: true
        }
      }
    })

    expect(quickOpsPublicIpResultMock).toHaveBeenCalledTimes(1)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-public-ip', {
      kind: 'quickops.publicIp',
      state: 'ready',
      address: '203.0.113.10',
      source: 'https://api.ipify.org?format=json',
      text: '203.0.113.10\nSource: https://api.ipify.org?format=json'
    })
  })

  it('acks Flow keepAwake delivery after starting the shared keep-awake session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-5',
      targetId: 'keep-awake',
      payload: { data: { durationMinutes: 5 } }
    })

    expect(quickOpsRuntimeMock.startKeepAwake).toHaveBeenCalledWith(300_000)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-5', {
      kind: 'quickops.keepAwake',
      state: 'started',
      durationMs: 300_000,
      durationText: '300秒',
      expiresAt: 1781800000000
    })
  })

  it('acks Flow systemAwake delivery after starting the shared system-awake session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-system-awake',
      targetId: 'system-awake',
      payload: { data: { durationMinutes: 15 } }
    })

    expect(quickOpsRuntimeMock.startSystemAwake).toHaveBeenCalledWith(900_000)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-system-awake', {
      kind: 'quickops.systemAwake',
      state: 'started',
      durationMs: 900_000,
      durationText: '900秒',
      expiresAt: 1781800000000
    })
  })

  it('acks Flow startTimer delivery after starting the shared timer session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-4',
      targetId: 'start-timer',
      payload: { data: { durationSeconds: 90 } }
    })

    expect(quickOpsRuntimeMock.startTimer).toHaveBeenCalledWith(90_000)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-4', {
      kind: 'quickops.startTimer',
      state: 'started',
      durationMs: 90_000,
      durationText: '90秒',
      expiresAt: 1781800000000
    })
  })

  it('blocks stateful Flow targets when QuickOps policy disables stateful tools', async () => {
    quickOpsRuntimeMock.getCapabilityInfo.mockReturnValueOnce({
      platform: 'darwin',
      enabled: true,
      entries: [
        {
          id: 'quickops.state.timer',
          label: '快速计时器 / 秒表 / 番茄钟',
          status: 'disabled',
          riskLevel: 'stateful',
          reason: 'stateful-tools-disabled-by-policy'
        }
      ]
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-start-timer-policy-blocked',
      targetId: 'start-timer',
      payload: {
        data: {
          durationMs: 90_000
        }
      }
    })

    expect(quickOpsRuntimeMock.startTimer).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-start-timer-policy-blocked', {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: 'start-timer',
      degradedReason: 'stateful-tools-disabled-by-policy',
      text: 'QuickOps stateful tools are disabled by policy'
    })
  })

  it('acks Flow pauseTimer delivery after pausing the shared timer session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-pause-timer', targetId: 'pause-timer' })

    expect(quickOpsRuntimeMock.pauseTimer).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-pause-timer', {
      kind: 'quickops.pauseTimer',
      state: 'paused',
      paused: true,
      remainingMs: 60_000
    })
  })

  it('acks Flow resumeTimer delivery after resuming the shared timer session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-resume-timer', targetId: 'resume-timer' })

    expect(quickOpsRuntimeMock.resumeTimer).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-resume-timer', {
      kind: 'quickops.resumeTimer',
      state: 'resumed',
      resumed: true,
      durationMs: 90_000,
      durationText: '90秒',
      expiresAt: 1781800000000
    })
  })

  it('acks Flow startPomodoro delivery after starting the shared pomodoro session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-6',
      targetId: 'start-pomodoro',
      payload: {
        data: {
          focusDurationMinutes: 40,
          breakDurationMinutes: 8,
          cycles: 3,
          longBreakDurationMinutes: 20,
          longBreakEveryCycles: 2
        }
      }
    })

    expect(quickOpsRuntimeMock.startPomodoro).toHaveBeenCalledWith(
      2_400_000,
      'cycle',
      480_000,
      3,
      1_200_000,
      2
    )
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-6', {
      kind: 'quickops.startPomodoro',
      state: 'started',
      mode: 'cycle',
      phase: 'focus',
      cycle: 1,
      totalCycles: 3,
      durationMs: 2_400_000,
      durationText: '2400秒',
      breakDurationMs: 480_000,
      longBreakDurationMs: 1_200_000,
      longBreakEveryCycles: 2,
      expiresAt: 1781800000000
    })
  })

  it('acks Flow pausePomodoro delivery after pausing the shared pomodoro session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-pause-pomodoro', targetId: 'pause-pomodoro' })

    expect(quickOpsRuntimeMock.pausePomodoro).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-pause-pomodoro', {
      kind: 'quickops.pausePomodoro',
      state: 'paused',
      paused: true,
      remainingMs: 1_800_000,
      phase: 'focus',
      cycle: 1
    })
  })

  it('acks Flow resumePomodoro delivery after resuming the shared pomodoro session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-resume-pomodoro', targetId: 'resume-pomodoro' })

    expect(quickOpsRuntimeMock.resumePomodoro).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-resume-pomodoro', {
      kind: 'quickops.resumePomodoro',
      state: 'resumed',
      resumed: true,
      phase: 'focus',
      cycle: 1,
      durationMs: 2_400_000,
      durationText: '2400秒',
      expiresAt: 1781800000000
    })
  })

  it('acks Flow cleanScreen delivery after starting the shared overlay session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-7',
      targetId: 'clean-screen',
      payload: { data: { durationSeconds: 45, screenMode: 'blue' } }
    })

    expect(quickOpsRuntimeMock.startScreenClean).toHaveBeenCalledWith(45_000, 'blue')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-7', {
      kind: 'quickops.cleanScreen',
      state: 'started',
      durationMs: 45_000,
      durationText: '45秒',
      screenMode: 'blue',
      windowCount: 2,
      expiresAt: 1781800000000
    })
  })

  it('acks Flow stopCleanScreen delivery after stopping the shared overlay session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-stop-clean-screen', targetId: 'stop-clean-screen' })

    expect(quickOpsRuntimeMock.stopScreenClean).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-stop-clean-screen', {
      kind: 'quickops.stopCleanScreen',
      stopped: true,
      state: 'stopped'
    })
  })

  it('acks Flow startStopwatch delivery after starting the shared stopwatch session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-start-stopwatch', targetId: 'start-stopwatch' })

    expect(quickOpsRuntimeMock.startStopwatch).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-start-stopwatch', {
      kind: 'quickops.startStopwatch',
      state: 'started',
      elapsedMs: 0,
      elapsedText: '0秒',
      paused: false,
      lapCount: 0,
      lastLapMs: undefined,
      lastLapText: undefined
    })
  })

  it('acks Flow pauseStopwatch delivery after pausing the shared stopwatch session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-pause-stopwatch', targetId: 'pause-stopwatch' })

    expect(quickOpsRuntimeMock.pauseStopwatch).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-pause-stopwatch', {
      kind: 'quickops.pauseStopwatch',
      state: 'paused',
      paused: true,
      elapsedMs: 5_000,
      elapsedText: '5秒',
      lapCount: 1,
      lastLapMs: 3_000,
      lastLapText: '3秒'
    })
  })

  it('acks Flow resumeStopwatch delivery after resuming the shared stopwatch session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-resume-stopwatch', targetId: 'resume-stopwatch' })

    expect(quickOpsRuntimeMock.resumeStopwatch).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-resume-stopwatch', {
      kind: 'quickops.resumeStopwatch',
      state: 'resumed',
      resumed: true,
      elapsedMs: 5_000,
      elapsedText: '5秒',
      paused: false,
      lapCount: 1,
      lastLapMs: 3_000,
      lastLapText: '3秒'
    })
  })

  it('acks Flow lapStopwatch delivery after recording a shared stopwatch lap', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-lap-stopwatch', targetId: 'lap-stopwatch' })

    expect(quickOpsRuntimeMock.lapStopwatch).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-lap-stopwatch', {
      kind: 'quickops.lapStopwatch',
      state: 'recorded',
      recorded: true,
      elapsedMs: 0,
      elapsedText: '0秒',
      paused: false,
      lapCount: 2,
      lastLapMs: 5_000,
      lastLapText: '5秒'
    })
  })

  it('acks Flow resetStopwatch delivery after clearing the shared stopwatch session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-reset-stopwatch', targetId: 'reset-stopwatch' })

    expect(quickOpsRuntimeMock.resetStopwatch).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-reset-stopwatch', {
      kind: 'quickops.resetStopwatch',
      reset: true,
      state: 'reset'
    })
  })

  it('acks Flow showNotification delivery after sending a bounded local notification', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-8',
      targetId: 'show-notification',
      payload: {
        data: {
          title: 'Build finished',
          message: 'Snapshot build completed.',
          level: 'success',
          silent: true
        }
      }
    })

    expect(showInternalSystemNotificationMock).toHaveBeenCalledWith({
      title: 'Build finished',
      message: 'Snapshot build completed.',
      level: 'success',
      system: {
        silent: true
      }
    })
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-8', {
      kind: 'quickops.showNotification',
      state: 'sent',
      notificationId: 'notification-1',
      title: 'Build finished',
      message: 'Snapshot build completed.',
      level: 'success'
    })
  })

  it('acks Flow copyToClipboard delivery after writing bounded text locally', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-9',
      targetId: 'copy-to-clipboard',
      payload: {
        data: {
          text: 'copied from flow'
        }
      }
    })

    expect(clipboardWriteTextMock).toHaveBeenCalledWith('copied from flow')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-9', {
      kind: 'quickops.copyToClipboard',
      state: 'copied',
      copied: true,
      charCount: 16,
      truncated: false
    })
  })

  it('redacts sensitive clipboard text from Flow ack and QuickOps audit snapshots', async () => {
    const module = new QuickOpsModule()
    const secret = 'sk-live-sensitive-clipboard-token'

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = getQuickOpsFlowHandler()
    await handler({
      sessionId: 'flow-session-sensitive-clipboard',
      targetId: 'copy-to-clipboard',
      payload: {
        data: {
          text: secret
        }
      }
    })

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(secret)
    const ackPayload = flowAcknowledgeMock.mock.calls.at(-1)?.[1]
    expect(ackPayload).toEqual({
      kind: 'quickops.copyToClipboard',
      state: 'copied',
      copied: true,
      charCount: secret.length,
      truncated: false
    })
    expect(JSON.stringify(ackPayload)).not.toContain(secret)

    const auditHandler = getQuickOpsTransportHandler<
      (request?: { limit?: number }) => {
        entries: Array<Record<string, unknown>>
      }
    >(QuickOpsEvents.audit.get)
    const auditEntry = auditHandler({ limit: 1 }).entries[0]

    expect(auditEntry).toEqual(
      expect.objectContaining({
        source: 'flow',
        targetId: 'copy-to-clipboard',
        decision: 'delivered',
        requiresConfirmation: true,
        payloadKeys: ['text']
      })
    )
    expect(JSON.stringify(auditEntry)).not.toContain(secret)
  })

  it('skips Flow copyToClipboard delivery when text is missing', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-10',
      targetId: 'copy-to-clipboard',
      payload: {
        data: {
          text: ''
        }
      }
    })

    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-10', {
      kind: 'quickops.copyToClipboard',
      state: 'skipped',
      copied: false,
      degradedReason: 'missing-text'
    })
  })

  it('acks Flow formatText delivery with a local text transform', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-11',
      targetId: 'format-text',
      payload: {
        data: {
          text: 'Hello quickOps Flow',
          mode: 'snake'
        }
      }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-11', {
      kind: 'quickops.formatText',
      state: 'formatted',
      mode: 'snake',
      inputCharCount: 19,
      outputCharCount: 20,
      truncated: false,
      text: 'hello_quick_ops_flow'
    })
  })

  it('skips Flow formatText delivery when text is missing', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-12',
      targetId: 'format-text',
      payload: {
        data: {}
      }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-12', {
      kind: 'quickops.formatText',
      state: 'skipped',
      degradedReason: 'missing-text'
    })
  })

  it('acks Flow openFolder delivery after opening a supported common directory', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-13',
      targetId: 'open-folder',
      payload: {
        data: {
          folder: 'logs'
        }
      }
    })

    expect(resolveCommonDirectoryMock).toHaveBeenCalledWith('logs')
    expect(shellOpenPathMock).toHaveBeenCalledWith('/tmp/tuff/logs')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-13', {
      kind: 'quickops.openFolder',
      state: 'opened',
      opened: true,
      directoryId: 'logs',
      path: '/tmp/tuff/logs'
    })
  })

  it('acks Flow commonDirectory delivery without opening or copying a supported common directory', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-common-directory',
      targetId: 'common-directory',
      payload: {
        data: {
          query: 'logs'
        }
      }
    })

    expect(resolveCommonDirectoryMock).toHaveBeenCalledWith('logs')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-common-directory', {
      kind: 'quickops.commonDirectory',
      state: 'resolved',
      directoryId: 'logs',
      title: '日志',
      subtitle: 'Logs',
      path: '/tmp/tuff/logs',
      text: '日志\n/tmp/tuff/logs',
      commonDirectory: {
        id: 'logs',
        title: '日志',
        subtitle: 'Logs',
        path: '/tmp/tuff/logs'
      }
    })
  })

  it('acks Flow openFolder delivery with degraded failure details when shell open fails', async () => {
    shellOpenPathMock.mockResolvedValue('permission denied')
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: {
          sessionId: string
          targetId: string
          payload: { data: Record<string, unknown> }
        }) => Promise<void>)
      | undefined
    await handler?.({
      sessionId: 'flow-session-14',
      targetId: 'open-folder',
      payload: {
        data: {
          folder: 'downloads'
        }
      }
    })

    expect(shellOpenPathMock).toHaveBeenCalledWith('/tmp/downloads')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-14', {
      kind: 'quickops.openFolder',
      state: 'failed',
      opened: false,
      directoryId: 'downloads',
      path: '/tmp/downloads',
      degradedReason: 'open-folder-failed',
      message: 'permission denied'
    })
  })

  it('acks Flow stopKeepAwake delivery after stopping the shared session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-3', targetId: 'stop-keep-awake' })

    expect(quickOpsRuntimeMock.stopKeepAwake).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-3', {
      kind: 'quickops.stopKeepAwake',
      stopped: true,
      state: 'stopped'
    })
  })

  it('acks Flow stopSystemAwake delivery after stopping the shared session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-stop-system-awake', targetId: 'stop-system-awake' })

    expect(quickOpsRuntimeMock.stopSystemAwake).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-stop-system-awake', {
      kind: 'quickops.stopSystemAwake',
      stopped: true,
      state: 'stopped'
    })
  })

  it('acks Flow stopTimer delivery after stopping the shared session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-stop-timer', targetId: 'stop-timer' })

    expect(quickOpsRuntimeMock.stopTimer).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-stop-timer', {
      kind: 'quickops.stopTimer',
      stopped: true,
      state: 'stopped'
    })
  })

  it('acks Flow stopPomodoro delivery after stopping the shared session', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-stop-pomodoro', targetId: 'stop-pomodoro' })

    expect(quickOpsRuntimeMock.stopPomodoro).toHaveBeenCalledWith()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-stop-pomodoro', {
      kind: 'quickops.stopPomodoro',
      stopped: true,
      state: 'stopped'
    })
  })

  it('acks Flow queryLocalIp delivery with local-only network addresses', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | ((session: { sessionId: string; targetId: string }) => Promise<void>)
      | undefined
    await handler?.({ sessionId: 'flow-session-2', targetId: 'query-local-ip' })

    const addresses = getLocalIpAddresses()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-2', {
      kind: 'quickops.queryLocalIp',
      text: formatLocalIpInfo(addresses),
      addresses,
      degradedReason: undefined
    })
  })

  it('acks Flow portStatus delivery with a local-only available port result', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-port-status',
      targetId: 'port-status',
      payload: { data: { port: 3000 } }
    })

    expect(probeLocalTcpPort).toHaveBeenCalledWith(3000)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-port-status', {
      kind: 'quickops.portStatus',
      state: 'available',
      available: true,
      port: 3000,
      host: '127.0.0.1',
      process: undefined,
      releaseCommand: undefined,
      degradedReason: undefined,
      errorCode: undefined
    })
  })

  it('acks Flow portStatus delivery with copy-only process release command when occupied', async () => {
    quickOpsPortProbeMock.mockResolvedValueOnce({
      port: 5173,
      host: '127.0.0.1',
      available: false,
      process: {
        pid: 1234,
        name: 'node',
        command: 'node dev-server.js',
        source: 'lsof'
      },
      degradedReason: 'port-occupied',
      errorCode: 'EADDRINUSE'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-port-occupied',
      targetId: 'port-status',
      payload: { data: { text: 'port 5173' } }
    })

    expect(createPortReleaseCommand).toHaveBeenCalledWith({
      pid: 1234,
      name: 'node',
      command: 'node dev-server.js',
      source: 'lsof'
    })
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-port-occupied', {
      kind: 'quickops.portStatus',
      state: 'occupied',
      available: false,
      port: 5173,
      host: '127.0.0.1',
      process: {
        pid: 1234,
        name: 'node',
        command: 'node dev-server.js',
        source: 'lsof'
      },
      releaseCommand: 'kill 1234',
      degradedReason: 'port-occupied',
      errorCode: 'EADDRINUSE'
    })
  })

  it('acks Flow portStatus delivery with degraded details for invalid ports', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-port-invalid',
      targetId: 'port-status',
      payload: { data: { port: 70_000 } }
    })

    expect(probeLocalTcpPort).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-port-invalid', {
      kind: 'quickops.portStatus',
      state: 'degraded',
      available: false,
      port: 70_000,
      degradedReason: 'invalid-port'
    })
  })

  it('acks Flow dnsQuery delivery with read-only DNS records', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-dns-query',
      targetId: 'dns-query',
      payload: { data: { hostname: 'Example.com' } }
    })

    expect(quickOpsDnsQueryResultMock).toHaveBeenCalledWith('example.com', false)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-dns-query', {
      kind: 'quickops.dnsQuery',
      state: 'resolved',
      text: 'DNS example.com records=2',
      dnsQuery: quickOpsDnsQueryInfo
    })
  })

  it('acks Flow dnsQuery delivery with deep lookup records', async () => {
    const deepDnsInfo = {
      hostname: 'example.com',
      records: [
        { type: 'NS' as const, value: 'ns1.example.com' },
        { type: 'TXT' as const, value: 'v=spf1 -all' }
      ],
      failedTypes: [],
      deep: true
    }
    quickOpsDnsQueryResultMock.mockResolvedValueOnce(deepDnsInfo)
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-dns-deep',
      targetId: 'dns-query',
      payload: { data: { text: 'deep dns example.com' } }
    })

    expect(quickOpsDnsQueryResultMock).toHaveBeenCalledWith('example.com', true)
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-dns-deep', {
      kind: 'quickops.dnsQuery',
      state: 'resolved',
      text: 'DNS example.com records=2',
      dnsQuery: deepDnsInfo
    })
  })

  it('acks Flow dnsQuery delivery with degraded details for invalid hostnames', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-dns-invalid',
      targetId: 'dns-query',
      payload: { data: { text: 'dns localhost' } }
    })

    expect(quickOpsDnsQueryResultMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-dns-invalid', {
      kind: 'quickops.dnsQuery',
      state: 'degraded',
      degradedReason: 'dns-query-invalid-hostname',
      message: '请输入有效域名'
    })
  })

  it('acks Flow fileHash delivery with read-only hashes for a structured path', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-hash',
      targetId: 'file-hash',
      payload: { data: { path: '/tmp/demo.txt' } }
    })

    expect(computeFileHashes).toHaveBeenCalledWith('/tmp/demo.txt')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-hash', {
      kind: 'quickops.fileHash',
      state: 'hashed',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      size: 12,
      hashes: {
        md5: 'md5-hash',
        sha1: 'sha1-hash',
        sha256: 'sha256-hash'
      },
      fileHash: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        md5: 'md5-hash',
        sha1: 'sha1-hash',
        sha256: 'sha256-hash'
      },
      text: 'MD5 md5-hash\nSHA1 sha1-hash\nSHA256 sha256-hash'
    })
  })

  it('acks Flow fileHash delivery after resolving a hash command text', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-hash-text',
      targetId: 'file-hash',
      payload: { data: { text: 'hash "/tmp/demo.txt"' } }
    })

    expect(computeFileHashes).toHaveBeenCalledWith('/tmp/demo.txt')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith(
      'flow-session-file-hash-text',
      expect.objectContaining({
        kind: 'quickops.fileHash',
        state: 'hashed',
        path: '/tmp/demo.txt'
      })
    )
  })

  it('acks Flow fileHash delivery with degraded details when hashing fails', async () => {
    quickOpsFileHashResultMock.mockResolvedValueOnce({
      degradedReason: 'file-hash-file-missing',
      message: '文件不存在'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-hash-missing',
      targetId: 'file-hash',
      payload: { data: { filePath: '/tmp/missing.txt' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-hash-missing', {
      kind: 'quickops.fileHash',
      state: 'degraded',
      path: '/tmp/missing.txt',
      degradedReason: 'file-hash-file-missing',
      message: '文件不存在'
    })
  })

  it('acks Flow fileBase64 delivery with a bounded encoded payload', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-base64',
      targetId: 'file-base64',
      payload: { data: { path: '/tmp/demo.txt' } }
    })

    expect(encodeFileBase64).toHaveBeenCalledWith('/tmp/demo.txt')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-base64', {
      kind: 'quickops.fileBase64',
      state: 'encoded',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      size: 12,
      base64: 'SGVsbG8gVHVmZg==',
      text: 'SGVsbG8gVHVmZg==',
      fileBase64: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        base64: 'SGVsbG8gVHVmZg=='
      }
    })
  })

  it('acks Flow fileBase64 delivery after resolving a command text path', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-base64-text',
      targetId: 'file-base64',
      payload: { data: { text: 'file base64 "/tmp/demo.txt"' } }
    })

    expect(encodeFileBase64).toHaveBeenCalledWith('/tmp/demo.txt')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith(
      'flow-session-file-base64-text',
      expect.objectContaining({
        kind: 'quickops.fileBase64',
        state: 'encoded',
        path: '/tmp/demo.txt'
      })
    )
  })

  it('acks Flow fileBase64 delivery with degraded details when encoding fails', async () => {
    quickOpsFileBase64ResultMock.mockResolvedValueOnce({
      degradedReason: 'file-base64-too-large',
      message: '文件超过 1 MB 上限'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-base64-too-large',
      targetId: 'file-base64',
      payload: { data: { filePath: '/tmp/large.bin' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-base64-too-large', {
      kind: 'quickops.fileBase64',
      state: 'degraded',
      path: '/tmp/large.bin',
      degradedReason: 'file-base64-too-large',
      message: '文件超过 1 MB 上限'
    })
  })

  it('acks Flow fileBase64 delivery with degraded details when no path is provided', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-file-base64-missing',
      targetId: 'file-base64',
      payload: { data: { text: 'file base64' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-file-base64-missing', {
      kind: 'quickops.fileBase64',
      state: 'degraded',
      degradedReason: 'file-base64-missing-file',
      message: '未找到要编码的文件'
    })
  })

  it('acks Flow tempTextFile delivery after creating a bounded scratch note', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-temp-text-file',
      targetId: 'temp-text-file',
      payload: { data: { content: 'hello boss' } }
    })

    expect(createTempTextFile).toHaveBeenCalledWith('hello boss')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-temp-text-file', {
      kind: 'quickops.tempTextFile',
      state: 'created',
      path: '/tmp/tuff-quickops/scratch-1.txt',
      fileName: 'scratch-1.txt',
      size: 10,
      text: '/tmp/tuff-quickops/scratch-1.txt'
    })
  })

  it('acks Flow tempTextFile delivery with degraded details when writing fails', async () => {
    quickOpsTempTextFileResultMock.mockResolvedValueOnce({
      degradedReason: 'temp-text-file-too-large',
      message: '临时文本超过 64KB 上限'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-temp-text-file-degraded',
      targetId: 'temp-text-file',
      payload: { data: { text: 'too large' } }
    })

    expect(createTempTextFile).toHaveBeenCalledWith('too large')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-temp-text-file-degraded', {
      kind: 'quickops.tempTextFile',
      state: 'degraded',
      degradedReason: 'temp-text-file-too-large',
      message: '临时文本超过 64KB 上限'
    })
  })

  it('acks Flow tempDirectory delivery after creating a bounded temp workspace directory', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-temp-directory',
      targetId: 'temp-directory',
      payload: { data: { name: 'demo workspace' } }
    })

    expect(createTempDirectory).toHaveBeenCalledWith('demo workspace')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-temp-directory', {
      kind: 'quickops.tempDirectory',
      state: 'created',
      path: '/tmp/tuff-quickops/demo-workspace',
      directoryName: 'demo-workspace',
      text: '/tmp/tuff-quickops/demo-workspace'
    })
  })

  it('acks Flow tempDirectory delivery with degraded details when creation fails', async () => {
    quickOpsTempDirectoryResultMock.mockResolvedValueOnce({
      degradedReason: 'temp-directory-create-failed',
      message: '无法创建临时目录'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-temp-directory-degraded',
      targetId: 'temp-directory',
      payload: { data: { directoryName: 'demo workspace' } }
    })

    expect(createTempDirectory).toHaveBeenCalledWith('demo workspace')
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-temp-directory-degraded', {
      kind: 'quickops.tempDirectory',
      state: 'degraded',
      degradedReason: 'temp-directory-create-failed',
      message: '无法创建临时目录'
    })
  })

  it('acks Flow recentDownload delivery with the latest Downloads file metadata', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-recent-download',
      targetId: 'recent-download',
      payload: { data: {} }
    })

    expect(findRecentDownloadFile).toHaveBeenCalledTimes(1)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-recent-download', {
      kind: 'quickops.recentDownload',
      state: 'found',
      path: '/tmp/Downloads/report.pdf',
      fileName: 'report.pdf',
      size: 4096,
      modifiedAt: 1_781_818_000_000,
      text: 'report.pdf\n/tmp/Downloads/report.pdf',
      recentDownload: {
        path: '/tmp/Downloads/report.pdf',
        fileName: 'report.pdf',
        size: 4096,
        modifiedAt: 1_781_818_000_000
      }
    })
  })

  it('acks Flow recentDownload delivery with degraded details when Downloads is empty', async () => {
    quickOpsRecentDownloadResultMock.mockResolvedValueOnce({
      degradedReason: 'recent-download-empty',
      message: 'Downloads 目录没有可打开的普通文件'
    })
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-recent-download-empty',
      targetId: 'recent-download',
      payload: { data: {} }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-recent-download-empty', {
      kind: 'quickops.recentDownload',
      state: 'degraded',
      degradedReason: 'recent-download-empty',
      message: 'Downloads 目录没有可打开的普通文件'
    })
  })

  it('acks Flow pathFormat delivery with copy-only path formats', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-path-format',
      targetId: 'path-format',
      payload: { data: { path: '/tmp/demo.txt' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-path-format', {
      kind: 'quickops.pathFormat',
      state: 'formatted',
      path: '/tmp/demo.txt',
      fileName: 'demo.txt',
      formats: {
        raw: '/tmp/demo.txt',
        shell: "'/tmp/demo.txt'",
        fileUrl: 'file:///tmp/demo.txt',
        windows: undefined,
        wsl: undefined
      },
      text: "/tmp/demo.txt\n'/tmp/demo.txt'\nfile:///tmp/demo.txt",
      pathFormat: {
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        shellPath: "'/tmp/demo.txt'",
        fileUrl: 'file:///tmp/demo.txt',
        windowsPath: undefined,
        wslPath: undefined
      }
    })
  })

  it('acks Flow pathFormat delivery after resolving a copy-path command text', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-path-format-text',
      targetId: 'path-format',
      payload: { data: { text: 'copy path "C:\\Users\\tester\\demo.txt"' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith(
      'flow-session-path-format-text',
      expect.objectContaining({
        kind: 'quickops.pathFormat',
        state: 'formatted',
        formats: expect.objectContaining({
          raw: 'C:\\Users\\tester\\demo.txt',
          wsl: '/mnt/c/Users/tester/demo.txt'
        })
      })
    )
  })

  it('acks Flow pathFormat delivery with degraded details when no path is provided', async () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = flowRegisterDeliveryHandlerMock.mock.calls[0]?.[1] as
      | QuickOpsFlowPayloadHandler
      | undefined
    await handler?.({
      sessionId: 'flow-session-path-format-missing',
      targetId: 'path-format',
      payload: { data: { text: 'copy path' } }
    })

    expect(flowAcknowledgeMock).toHaveBeenCalledWith('flow-session-path-format-missing', {
      kind: 'quickops.pathFormat',
      state: 'degraded',
      degradedReason: 'file-path-missing-file',
      message: '未找到要复制路径的文件'
    })
  })

  it('returns QuickOps capability info through typed transport', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    const handler = transportOnMock.mock.calls.find(
      ([event]) => event === QuickOpsEvents.capabilities.get
    )?.[1] as (() => unknown) | undefined
    expect(handler?.()).toEqual({
      platform: 'darwin',
      enabled: true,
      entries: []
    })
    expect(quickOpsRuntimeMock.getCapabilityInfo).toHaveBeenCalledTimes(1)
  })

  it('cleans QuickOps sessions on module stop and destroy', () => {
    const module = new QuickOpsModule()

    module.onInit({} as ModuleInitContext<TalexEvents>)

    module.stop({ reason: 'app-quit' } as ModuleStopContext<TalexEvents>)
    module.onDestroy({} as ModuleDestroyContext<TalexEvents>)

    expect(transportDisposeMock).toHaveBeenCalledTimes(19)
    expect(flowDeliveryDisposeMock).toHaveBeenCalledTimes(1)
    for (const expectedTarget of expectedQuickOpsFlowTargets) {
      expect(flowUnregisterTargetMock).toHaveBeenCalledWith(expectedTarget.actionId)
    }
    expect(quickOpsRuntimeMock.cleanup).toHaveBeenNthCalledWith(1, 'module-stop:app-quit')
    expect(quickOpsRuntimeMock.cleanup).toHaveBeenNthCalledWith(2, 'module-destroy')
  })

  it('cleans QuickOps sessions on app quit lifecycle events and unregisters handlers', () => {
    const module = new QuickOpsModule()
    const context = createQuickOpsModuleContext()

    module.onInit(context)

    context.emit(TalexEvents.BEFORE_APP_QUIT)
    context.emit(TalexEvents.WILL_QUIT)

    expect(quickOpsRuntimeMock.cleanup).toHaveBeenNthCalledWith(1, 'app-before-quit')
    expect(quickOpsRuntimeMock.cleanup).toHaveBeenNthCalledWith(2, 'app-will-quit')

    module.stop({ reason: 'app-quit' } as ModuleStopContext<TalexEvents>)
    context.emit(TalexEvents.BEFORE_APP_QUIT)
    context.emit(TalexEvents.WILL_QUIT)

    expect(context.eventHandlers.size).toBe(0)
    expect(quickOpsRuntimeMock.cleanup).toHaveBeenCalledTimes(3)
    expect(quickOpsRuntimeMock.cleanup).toHaveBeenNthCalledWith(3, 'module-stop:app-quit')
  })
})
