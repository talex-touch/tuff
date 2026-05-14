import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  transportOn,
  appTaskWaitForIdle,
  searchIndexWorkerInit,
  watchServiceInitialize,
  watchServiceEnsure
} = vi.hoisted(() => ({
  transportOn: vi.fn(),
  appTaskWaitForIdle: vi.fn(async () => true),
  searchIndexWorkerInit: vi.fn(async () => undefined),
  watchServiceInitialize: vi.fn(),
  watchServiceEnsure: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/tuff-file-provider-${name}`)
  },
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  loggerManager: {
    getLogger: vi.fn(() => ({
      setEnabled: vi.fn()
    }))
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: transportOn,
    broadcast: vi.fn()
  }))
}))

vi.mock('../../../../db/utils', () => ({
  createDbUtils: vi.fn((db) => ({
    getDb: () => db,
    getAuxDb: () => db
  }))
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    waitForIdle: appTaskWaitForIdle,
    isActive: vi.fn(() => false)
  }
}))

vi.mock('../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn((_label: string, operation: () => Promise<unknown>) => operation())
  }
}))

vi.mock('../../../../db/sqlite-retry', () => ({
  withSqliteRetry: vi.fn((operation: () => Promise<unknown>) => operation())
}))

vi.mock('./embedding-service', () => ({
  EmbeddingService: vi.fn(() => ({
    semanticSearch: vi.fn(async () => [])
  }))
}))

vi.mock('./services/file-provider-watch-service', () => ({
  FileProviderWatchService: vi.fn().mockImplementation((deps) => ({
    getCurrentSettings: vi.fn(() => ({
      autoScanEnabled: true,
      autoScanIntervalMs: 86_400_000,
      autoScanIdleThresholdMs: 3_600_000,
      autoScanCheckIntervalMs: 300_000,
      extraPaths: []
    })),
    getWatchPaths: vi.fn(() => deps.baseWatchPaths),
    getNormalizedWatchPaths: vi.fn(() => deps.baseWatchPaths),
    isWatchPathRegistered: vi.fn(() => false),
    isFileSystemSubscribed: vi.fn(() => false),
    initializeBackgroundTaskService: watchServiceInitialize,
    ensureFileSystemWatchers: watchServiceEnsure,
    recordUserActivity: vi.fn(),
    shouldRunAutoIndexing: vi.fn(async () => ({ allowed: false, reason: 'test' })),
    applyWatchPaths: vi.fn(),
    handleFsAddedOrChanged: vi.fn(),
    handleFsUnlinked: vi.fn()
  }))
}))

vi.mock('./services/file-provider-opener-service', () => ({
  FileProviderOpenerService: vi.fn(() => ({
    getOpenerForExtension: vi.fn(async () => null)
  }))
}))

vi.mock('./services/file-provider-index-runtime-service', () => ({
  FileProviderIndexRuntimeService: vi.fn(() => ({
    handleIndexWorkerFile: vi.fn(),
    initWorker: vi.fn(async () => undefined),
    flushPendingIndexResults: vi.fn(async () => undefined)
  }))
}))

vi.mock('./workers/file-index-worker-client', () => ({
  FileIndexWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/file-reconcile-worker-client', () => ({
  FileReconcileWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/file-scan-worker-client', () => ({
  FileScanWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/icon-worker-client', () => ({
  IconWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn(),
    extract: vi.fn(async () => null)
  }))
}))

vi.mock('./workers/thumbnail-worker-client', () => ({
  ThumbnailWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('../../search-engine/workers/search-index-worker-client', () => ({
  SearchIndexWorkerClient: vi.fn(() => ({
    init: searchIndexWorkerInit,
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

import { fileProvider } from './file-provider'

interface MutableFileProvider {
  onLoad: (context: {
    touchApp: { channel: unknown }
    databaseManager: { getDb: () => unknown; filePath: string }
    searchIndex: unknown
  }) => Promise<void>
  backgroundStartupPromise: Promise<void> | null
  backgroundStartupReady: boolean
  backgroundStartupError: Error | null
  searchIndexWorkerReady: Promise<boolean> | null
  openersChannelRegistered: boolean
  getIndexingStatus: () => {
    startupReady?: boolean
    startupPending?: boolean
    startupError?: string | null
  }
  buildStartupDegradedNotice: (query: { text: string; inputs: unknown[] }) => {
    render?: {
      basic?: {
        title?: string
        description?: string
      }
    }
  } | null
}

function createContext() {
  return {
    touchApp: { channel: {} },
    databaseManager: {
      getDb: () => ({}),
      filePath: '/tmp/tuff-file-provider-db'
    },
    searchIndex: {}
  }
}

function resetProviderState(provider: MutableFileProvider): void {
  provider.backgroundStartupPromise = null
  provider.backgroundStartupReady = false
  provider.backgroundStartupError = null
  provider.searchIndexWorkerReady = null
  provider.openersChannelRegistered = false
}

afterEach(() => {
  const provider = fileProvider as unknown as MutableFileProvider
  resetProviderState(provider)
  vi.clearAllMocks()
  appTaskWaitForIdle.mockResolvedValue(true)
  searchIndexWorkerInit.mockResolvedValue(undefined)
})

describe('file-provider startup readiness', () => {
  it('registers channels without blocking on search-index worker or filesystem watchers', async () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)

    let releaseIdle: (value: boolean) => void = () => {}
    appTaskWaitForIdle.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseIdle = resolve
        })
    )

    await provider.onLoad(createContext())

    expect(transportOn).toHaveBeenCalledTimes(1)
    expect(searchIndexWorkerInit).not.toHaveBeenCalled()
    expect(watchServiceInitialize).not.toHaveBeenCalled()
    expect(watchServiceEnsure).not.toHaveBeenCalled()
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: false,
        startupPending: true,
        startupError: null
      })
    )

    await new Promise<void>((resolve) => setImmediate(resolve))
    releaseIdle(true)
    await provider.backgroundStartupPromise

    expect(searchIndexWorkerInit).toHaveBeenCalledWith('/tmp/tuff-file-provider-db/database.db')
    expect(watchServiceInitialize).toHaveBeenCalledTimes(1)
    expect(watchServiceEnsure).toHaveBeenCalledTimes(1)
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: true,
        startupPending: false,
        startupError: null
      })
    )
  })

  it('keeps startup degraded when the search-index worker cannot initialize', async () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    searchIndexWorkerInit.mockRejectedValueOnce(new Error('worker unavailable'))

    await provider.onLoad(createContext())
    await provider.backgroundStartupPromise

    expect(watchServiceInitialize).toHaveBeenCalledTimes(1)
    expect(watchServiceEnsure).toHaveBeenCalledTimes(1)
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: false,
        startupPending: false,
        startupError: 'Search index worker initialization failed'
      })
    )
  })

  it('builds a partial result notice while file index startup is pending', () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    provider.backgroundStartupPromise = Promise.resolve()

    const notice = provider.buildStartupDegradedNotice({ text: 'report', inputs: [] })

    expect(notice?.render?.basic?.title).toBe('File search is warming up')
    expect(notice?.render?.basic?.description).toContain('partial')
  })
})
