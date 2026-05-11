import { vi } from 'vitest'

const appProviderMocks = vi.hoisted(() => ({
  addWatchPathMock: vi.fn(),
  getAppsMock: vi.fn(),
  getAppInfoByPathMock: vi.fn(),
  getLoggerMock: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  getMainConfigMock: vi.fn(),
  getWatchPathsMock: vi.fn((): string[] => []),
  registerPollingMock: vi.fn(),
  removeByProviderMock: vi.fn(),
  runAdaptiveTaskQueueMock: vi.fn(async (items, handler) => {
    for (let index = 0; index < items.length; index += 1) {
      await handler(items[index], index)
    }
  }),
  runAppTaskMock: vi.fn(async (task: () => Promise<unknown>) => await task()),
  runMdlsUpdateScanMock: vi.fn(),
  saveMainConfigMock: vi.fn(),
  scheduleDbWriteMock: vi.fn(async (_label: string, task: () => Promise<unknown>) => await task()),
  searchRecordExecuteMock: vi.fn(),
  shellOpenPathMock: vi.fn(),
  showInternalSystemNotificationMock: vi.fn(),
  pinyinMock: vi.fn(),
  spawnSafeMock: vi.fn(),
  unregisterPollingMock: vi.fn(),
  withSqliteRetryMock: vi.fn(async (task: () => Promise<unknown>) => await task())
}))

export const addWatchPathMock = appProviderMocks.addWatchPathMock
export const getAppsMock = appProviderMocks.getAppsMock
export const getAppInfoByPathMock = appProviderMocks.getAppInfoByPathMock
export const getLoggerMock = appProviderMocks.getLoggerMock
export const getMainConfigMock = appProviderMocks.getMainConfigMock
export const getWatchPathsMock = appProviderMocks.getWatchPathsMock
export const registerPollingMock = appProviderMocks.registerPollingMock
export const removeByProviderMock = appProviderMocks.removeByProviderMock
export const runAdaptiveTaskQueueMock = appProviderMocks.runAdaptiveTaskQueueMock
export const runAppTaskMock = appProviderMocks.runAppTaskMock
export const runMdlsUpdateScanMock = appProviderMocks.runMdlsUpdateScanMock
export const saveMainConfigMock = appProviderMocks.saveMainConfigMock
export const scheduleDbWriteMock = appProviderMocks.scheduleDbWriteMock
export const searchRecordExecuteMock = appProviderMocks.searchRecordExecuteMock
export const shellOpenPathMock = appProviderMocks.shellOpenPathMock
export const showInternalSystemNotificationMock =
  appProviderMocks.showInternalSystemNotificationMock
export const pinyinMock = appProviderMocks.pinyinMock
export const spawnSafeMock = appProviderMocks.spawnSafeMock
export const unregisterPollingMock = appProviderMocks.unregisterPollingMock
export const withSqliteRetryMock = appProviderMocks.withSqliteRetryMock

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

vi.mock('@talex-touch/utils', () => ({
  completeTiming: vi.fn((_label: string, startedAt: number) => Date.now() - startedAt),
  createRetrier: vi.fn(() => {
    return <T>(task: () => Promise<T>) => {
      return async () => await task()
    }
  }),
  sleep: vi.fn(async () => undefined),
  startTiming: vi.fn(() => Date.now()),
  StorageList: {
    APP_INDEX_SETTINGS: 'APP_INDEX_SETTINGS'
  },
  timingLogger: {
    print: vi.fn((_label: string, durationMs: number) => durationMs)
  }
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'zh-CN')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  shell: {
    openPath: shellOpenPathMock
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: getLoggerMock
}))

vi.mock('@talex-touch/utils/common/utils', () => ({
  runAdaptiveTaskQueue: runAdaptiveTaskQueueMock
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: registerPollingMock,
    unregister: unregisterPollingMock
  }
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock
}))

vi.mock('pinyin-pro', () => ({
  pinyin: pinyinMock
}))

vi.mock('../../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    FILE_ADDED: 'FILE_ADDED',
    FILE_CHANGED: 'FILE_CHANGED',
    FILE_UNLINKED: 'FILE_UNLINKED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED'
  },
  touchEventBus: {
    on: vi.fn(),
    off: vi.fn()
  },
  DirectoryAddedEvent: class {},
  DirectoryUnlinkedEvent: class {},
  FileAddedEvent: class {},
  FileChangedEvent: class {},
  FileUnlinkedEvent: class {}
}))

vi.mock('../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: scheduleDbWriteMock
  }
}))

vi.mock('../../../../db/sqlite-retry', () => ({
  withSqliteRetry: withSqliteRetryMock
}))

vi.mock('../../../../db/utils', () => ({
  createDbUtils: vi.fn(() => null)
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: vi.fn(() => false),
    runAppTask: runAppTaskMock,
    waitForIdle: vi.fn(async () => true),
    getSnapshot: vi.fn(() => ({ activeCount: 0, activeLabels: {} }))
  }
}))

vi.mock('../../../../service/device-idle-service', () => ({
  deviceIdleService: {
    canRun: vi.fn(async () => ({ allowed: true })),
    getSettings: vi.fn(() => ({ blockBatteryBelowPercent: 20 })),
    getBatteryStatus: vi.fn(async () => null)
  }
}))

vi.mock('../../../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('../../../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: showInternalSystemNotificationMock
  }
}))

vi.mock('../../../../utils/i18n-helper', () => ({
  t: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (key === 'notifications.appLaunchFailedTitle') return 'App Launch Failed'
    if (key === 'notifications.appLaunchFailedBody') {
      return `Failed to launch ${params?.name}\n${params?.error}`
    }
    return key
  })
}))

vi.mock('../../file-system-watcher', () => ({
  default: {
    addPath: addWatchPathMock
  }
}))

vi.mock('../../search-engine/search-core', () => ({
  default: {
    recordExecute: searchRecordExecuteMock
  }
}))

vi.mock('./app-scanner', () => ({
  appScanner: {
    getApps: getAppsMock,
    getAppInfoByPath: getAppInfoByPathMock,
    getWatchPaths: getWatchPathsMock,
    runMdlsUpdateScan: runMdlsUpdateScanMock
  }
}))

vi.mock('./display-name-sync-utils', () => ({
  isProbablyCorruptedDisplayName: vi.fn((value: string | null | undefined) => {
    return typeof value === 'string' && (value.includes('\uFFFD') || value.includes('\u25A1'))
  }),
  normalizeDisplayName: vi.fn((value: string | null | undefined) => value ?? null),
  resolveDisplayName: vi.fn((displayName: string | null | undefined, fallbackName: string) => {
    if (typeof displayName === 'string' && displayName && !displayName.includes('\uFFFD')) {
      return displayName
    }
    return fallbackName
  }),
  shouldUpdateDisplayName: vi.fn(
    (current: string | null | undefined, next: string | null | undefined) => {
      const normalizedCurrent = current ?? null
      const normalizedNext = next ?? null
      if (typeof normalizedNext === 'string' && normalizedNext.includes('\uFFFD')) return false
      if (typeof normalizedCurrent === 'string' && normalizedCurrent.includes('\uFFFD')) return true
      return normalizedCurrent !== normalizedNext
    }
  )
}))

vi.mock('./app-noise-filter', () => ({
  matchNoisySystemAppRule: vi.fn(() => null)
}))

vi.mock('./app-utils', () => {
  const normalizeStringList = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
      const normalized = value?.trim()
      if (!normalized) continue
      const lookupKey = normalized.toLowerCase()
      if (seen.has(lookupKey)) continue
      seen.add(lookupKey)
      result.push(normalized)
    }
    return result
  }

  return {
    formatLog: vi.fn((_scope: string, message: string) => message),
    normalizeStringList: vi.fn(normalizeStringList),
    parseStringList: vi.fn((value: string | null | undefined) => {
      if (!value) return []
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed)
          ? normalizeStringList(parsed.filter((item): item is string => typeof item === 'string'))
          : []
      } catch {
        return []
      }
    }),
    serializeStringList: vi.fn((values: string[] | undefined) => {
      const normalized = normalizeStringList(values ?? [])
      return normalized.length > 0 ? JSON.stringify(normalized) : undefined
    }),
    LogStyle: {
      info: (message: string) => message,
      warning: (message: string) => message,
      error: (message: string) => message,
      process: (message: string) => message,
      success: (message: string) => message
    }
  }
})

vi.mock('./search-processing-service', () => ({
  isSearchableAppRow: vi.fn(() => true),
  processSearchResults: vi.fn(async () => [])
}))

export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

export async function loadSubject() {
  return await import('./app-provider')
}

export async function withPlatform<T>(
  platform: NodeJS.Platform,
  run: () => Promise<T> | T
): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

export function upsertExtensionRows(
  target: Array<{ fileId: number; key: string; value: string }>,
  rows: Array<{ fileId: number; key: string; value: string }>
): void {
  for (const row of rows) {
    const existingIndex = target.findIndex(
      (candidate) => candidate.fileId === row.fileId && candidate.key === row.key
    )
    if (existingIndex >= 0) {
      target[existingIndex] = row
    } else {
      target.push(row)
    }
  }
}

export type AppProviderPrivate = {
  buildAppExtensions: (
    fileId: number,
    app: {
      bundleId?: string
      icon?: string
      stableId?: string
      launchKind: string
      launchTarget: string
      launchArgs?: string
      workingDirectory?: string
      displayPath?: string
      description?: string
      alternateNames?: string[]
    }
  ) => Array<{ fileId: number; key: string; value: string }>
  syncScannedAppExtensions: (
    fileId: number,
    app: {
      bundleId?: string
      icon?: string
      stableId?: string
      launchKind: string
      launchTarget: string
      launchArgs?: string
      workingDirectory?: string
      displayPath?: string
      description?: string
      alternateNames?: string[]
    }
  ) => Promise<void>
  context: unknown
  dbUtils: unknown
  searchIndex: unknown
  fetchExtensionsForFiles: (files: unknown[]) => Promise<unknown[]>
  _clearPendingDeletions: () => Promise<void>
  _initialize: (options?: { forceRefresh?: boolean }) => Promise<void>
  _performFullSync: (forced: boolean) => Promise<void>
  _generateKeywordsForApp: (app: {
    alternateNames?: string[]
    bundleId?: string
    displayName?: string
    fileName?: string
    icon?: string
    lastModified?: Date
    launchKind: string
    launchTarget: string
    name: string
    path: string
    stableId?: string
  }) => Promise<Set<string>>
  _syncKeywordsForApp: (app: {
    alternateNames?: string[]
    bundleId?: string
    displayName?: string
    fileName?: string
    icon?: string
    lastModified?: Date
    launchKind: string
    launchTarget: string
    name: string
    path: string
    stableId?: string
  }) => Promise<void>
  diagnoseAppSearch: (request: { target: string; query?: string }) => Promise<unknown>
  reindexAppSearchTarget: (request: {
    target: string
    mode?: 'keywords' | 'scan'
    force?: boolean
  }) => Promise<unknown>
  _performMdlsUpdateScan: () => Promise<void>
  _performRebuild: () => Promise<void>
  _performStartupBackfill: () => Promise<void>
  reindexManagedEntries: () => Promise<void>
  _recordMissingIconApps: (apps: unknown[]) => Promise<void>
  _runFullSync: (forced: boolean) => Promise<void>
  _runMdlsUpdateScan: () => Promise<void>
  _runStartupBackfill: () => Promise<void>
  _setLastFullSyncTime: (timestamp: number) => Promise<void>
  _mapDbAppToScannedInfo: (app: {
    name: string
    displayName?: string | null
    path: string
    mtime: Date
    extensions: Record<string, string>
  }) => {
    description?: string
    displayName?: string
    launchKind: string
  }
}

export function asPrivateProvider(provider: unknown): AppProviderPrivate {
  return provider as AppProviderPrivate
}
