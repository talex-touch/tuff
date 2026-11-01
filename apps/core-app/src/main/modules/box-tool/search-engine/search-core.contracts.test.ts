import type { IProviderActivate, TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import * as schema from '../../../db/schema'
import type * as SearchActivity from './search-activity'
import type { SearchIndexCommitHub } from './search-index-commit-hub'
import type { SearchExecution } from './search-session'
import type * as SearchIndexReadWorkerModule from './workers/search-index-read-worker-client'
import type { SearchIndexReadWorkerClientOptions } from './workers/search-index-read-worker-client'
import { getSearchIndexReadWorkerTestPath } from './workers/search-index-read-worker.test-harness'
import type { ActiveAppInfo } from '../../system/active-app'
import type * as DbUtilsModule from '../../../db/utils'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EmbeddingService } from '../addon/files/embedding-service'
import { FileProviderSearchResultService } from '../addon/files/services/file-provider-search-result-service'
import { LOCAL_EMBEDDING_MODEL_KEY } from '../../ai/local-embedding-model'
type PinnedItem = typeof schema.pinnedItems.$inferSelect
type ItemUsageStat = typeof schema.itemUsageStats.$inferSelect
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import type { DbUtils } from '../../../db/utils'
// resetModules reinitializes the real AppProvider module graph before each contract case.
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 })

const state = vi.hoisted(() => {
  const transportHandlers = new Map<unknown, (...args: never[]) => unknown>()
  const searchUpdateCompletion = { current: Promise.withResolvers<void>() }

  return {
    foregroundApp: null as ActiveAppInfo | null,
    /**
     * The committed-execute push. `broadcast` reaches every window (the main window owns the
     * settings/application pages); `broadcastToWindow` is the explicit CoreBox delivery, because
     * the channel's own broadcast list does not include the CoreBox window.
     */
    broadcast: vi.fn(),
    broadcastToWindow: vi.fn(),
    /** The CoreBox handle the explicit delivery needs; replaceable so a test can make it absent. */
    getCoreBoxWindow: vi.fn(
      (): { window: { id: number; isDestroyed: () => boolean } } | undefined => ({
        window: { id: 7, isDestroyed: () => false }
      })
    ),
    transportHandlers,
    searchUpdateCompletion,
    addUsageLog: vi.fn(async () => undefined),
    appProviderPrepareForShutdown: vi.fn(async () => undefined),
    appProviderRuntimeDelegate: vi.fn(),
    appRuntimeAbortAndDrain: vi.fn<(sourceId: string, timeoutMs?: number) => Promise<void>>(
      async () => undefined
    ),
    appRuntimeDrainMutations: vi.fn(async () => undefined),
    clearIndexingRuntime: vi.fn(),
    createDbUtils: vi.fn(),
    fileProviderMutationDelegate: vi.fn(),
    fileProviderPersistencePort: vi.fn(),
    fileProviderPrepareForShutdown: vi.fn(async () => undefined),
    fileProviderResetDelegate: vi.fn(),
    fileProviderIndexingStatus: vi.fn(() => ({ isInitializing: false })),
    filePathAdmitted: vi.fn((path: string) => path.startsWith('/scope/')),
    forceFlushUsageQueue: vi.fn(async () => undefined),
    getAllPinnedItems: vi.fn<() => Promise<PinnedItem[]>>(async () => []),
    getUsageStatsBatch: vi.fn<() => Promise<ItemUsageStat[]>>(async () => []),
    getUsageBehaviorBatch: vi.fn<() => Promise<never[]>>(async () => []),
    // The single-writer execute path: the facade's contract is that it hands the action to this
    // one transaction and reports what it accepted, not that it fans out to per-table writers.
    // Real shape: `usageStats` is the committed `item_usage_stats` row on an accepted write and
    // `null` only when the event was a duplicate, so the stub must allow both.
    recordExecuteTransaction: vi.fn<DbUtils['recordExecuteTransaction']>(async () => ({
      accepted: true,
      usageStats: null
    })),
    incrementUsageStats: vi.fn(async () => undefined),
    incrementUsageSummary: vi.fn(async () => undefined),
    incrementUsageTrendDaily: vi.fn(() => Promise.resolve()),
    indexingRuntimeBeginShutdown: vi.fn(),
    indexingRuntimeDrainAdmittedTasks: vi.fn(async () => undefined),
    indexingRuntimeDrainTaskStateWrites: vi.fn(async () => undefined),
    indexingRuntimeSetStore: vi.fn(),
    indexingRuntimeSetTaskStateStore: vi.fn(),
    indexingRuntimeSetWriterRouter: vi.fn(),
    invalidateRecommendationCache: vi.fn(),
    recommend: vi.fn(async () => ({
      containerLayout: undefined,
      duration: 0,
      items: [] as TuffItem[]
    })),
    invalidateUsageStatsCache: vi.fn(),
    readWorkerClose: vi.fn(async () => undefined),
    registerCoreIndexedSources: vi.fn(),
    sendToWindow: vi.fn((_windowId: unknown, event: { toEventName: () => string }) => {
      if (event.toEventName() === CoreBoxEvents.search.update.toEventName()) {
        state.searchUpdateCompletion.current.resolve()
      }
      return Promise.resolve()
    }),
    togglePin: vi.fn(async () => true),
    touchEventOff: vi.fn(),
    touchEventOn: vi.fn(),
    usageQueueEnqueue: vi.fn(),
    writerBeginShutdown: vi.fn(async () => undefined)
  }
})

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    }))
  }))
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'ALL_MODULES_LOADED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED',
    FILE_ADDED: 'FILE_ADDED',
    FILE_CHANGED: 'FILE_CHANGED',
    FILE_UNLINKED: 'FILE_UNLINKED',
    FILE_WATCH_ROOT_RECOVERED: 'FILE_WATCH_ROOT_RECOVERED',
    PROVIDER_DEACTIVATED: 'PROVIDER_DEACTIVATED'
  },
  ProviderDeactivatedEvent: class {},
  touchEventBus: {
    emit: vi.fn(),
    off: state.touchEventOff,
    on: state.touchEventOn,
    once: vi.fn()
  }
}))

vi.mock('../../../db/utils', () => ({ createDbUtils: state.createDbUtils }))
// Only the neural-model boundary is replaced; the late-recall cases run real SQLite consumers.
vi.mock('../../ai/intelligence-sdk', () => ({
  tuffIntelligence: { embedding: { generate: vi.fn(), generateLocalImage: vi.fn() } }
}))
vi.mock('../../system/active-app', () => ({
  activeAppService: { getActiveApp: async () => state.foregroundApp }
}))
vi.mock('../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: async (_label: string, operation: () => Promise<unknown>) => operation(),
    getStats: vi.fn(() => ({ queued: 0, processing: false, currentTaskLabel: null })),
    hasInteractiveWrites: vi.fn(() => false)
  }
}))
vi.mock('../../../service/app-task-gate', () => ({
  appTaskGate: {
    getSnapshot: vi.fn(() => ({ activeCount: 0, activeLabels: {} })),
    isActive: vi.fn(() => false)
  }
}))
vi.mock('../../../utils/perf-context', () => ({ enterPerfContext: vi.fn(() => () => {}) }))
vi.mock('../../../utils/perf-monitor', () => ({
  perfMonitor: { getRecentEventLoopLagSnapshot: vi.fn(() => null) }
}))
vi.mock('../../analytics', () => ({ analyticsModule: { recordSearchMetrics: vi.fn() } }))
vi.mock('../../database', () => ({
  databaseModule: {
    getAuxDb: vi.fn(() => ({})),
    getDb: vi.fn(() => ({})),
    getSearchDb: vi.fn(() => ({})),
    getSearchClient: vi.fn(() => ({})),
    getSearchDatabaseFilePath: vi.fn(() => ':memory:'),
    isSearchSplitEnabled: vi.fn(() => false),
    isSearchDbReady: vi.fn(() => false)
  }
}))
vi.mock('../../plugin/adapters/plugin-features-adapter', () => ({
  default: {
    // search-core calls this as it registers the provider (#523).
    attach: vi.fn(),
    id: 'plugin-features',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'plugin'
  }
}))
vi.mock('../../sentry', () => ({
  getSentryService: vi.fn(() => ({ isTelemetryEnabled: vi.fn(() => false) }))
}))
vi.mock('../../storage', () => ({
  getMainConfig: vi.fn(() => ({ beginner: { init: true } })),
  storageModule: {},
  isMainStorageReady: vi.fn(() => false),
  subscribeMainConfig: vi.fn(() => () => {}),
  OnboardingGateError: class OnboardingGateError extends Error {
    constructor(
      readonly decision: {
        state: 'blocked' | 'degraded'
        reason: string
        recoverable: boolean
      }
    ) {
      super(decision.reason)
    }
  },
  onboardingGate: {
    evaluate: vi.fn(() => ({ state: 'allowed' })),
    waitForDecision: vi.fn(async () => ({ state: 'allowed' })),
    subscribe: vi.fn(() => () => {})
  }
}))
vi.mock('../addon/apps/app-provider', () => ({
  // search-core.ts imports this alongside appProvider; a factory mock has to carry every
  // binding the importer names or vitest throws at import time, before any test runs.
  appProvider: {
    id: 'app-provider',
    onSearch: vi.fn(),
    prepareForSearchIndexShutdown: state.appProviderPrepareForShutdown,
    setIndexedSourceRuntimeDelegate: state.appProviderRuntimeDelegate,
    supportedInputTypes: ['text'],
    type: 'app'
  }
}))
vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: {
    buildUnavailableNotice: vi.fn(() => null),
    id: 'everything-provider',
    isSearchReady: vi.fn(() => false),
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../addon/files/file-provider', () => ({
  fileProvider: {
    buildStartupDegradedNotice: vi.fn(() => null),
    getIndexingStatus: state.fileProviderIndexingStatus,
    hasSearchFilters: vi.fn(() => false),
    id: 'file-provider',
    isSearchPathAdmitted: state.filePathAdmitted,
    onSearch: vi.fn(),
    semanticRecall: vi.fn(async () => []),
    prepareForSearchIndexShutdown: state.fileProviderPrepareForShutdown,
    setFilePersistencePort: state.fileProviderPersistencePort,
    setIndexedSourceRuntimeMutationDelegate: state.fileProviderMutationDelegate,
    setIndexedSourceRuntimeResetDelegate: state.fileProviderResetDelegate,
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../addon/files/native-file-search-provider', () => ({
  linuxNativeFileProvider: { id: 'linux-file-provider', onSearch: vi.fn(), type: 'file' },
  macSpotlightFileProvider: { id: 'mac-file-provider', onSearch: vi.fn(), type: 'file' }
}))
vi.mock('../addon/preview', () => ({
  previewProvider: {
    id: 'preview-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'preview'
  }
}))
vi.mock('../addon/system/app-destination-provider', () => ({
  appDestinationProvider: {
    id: 'app-destination-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'system'
  }
}))
vi.mock('../addon/system/system-actions-provider', () => ({
  systemActionsProvider: {
    id: 'system-actions-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'command'
  }
}))
vi.mock('../addon/system/windows-shell-file-provider', () => ({
  windowsShellFileProvider: {
    id: 'windows-shell-file-provider',
    onSearch: vi.fn(),
    supportedInputTypes: ['text'],
    type: 'file'
  }
}))
vi.mock('../core-box/window', () => ({
  // `getCoreBoxWindow` is the handle the committed-count delivery targets. Leaving it out of the
  // factory made the explicit CoreBox push a silent no-op (the lookup threw into the catch), which
  // is exactly the regression the delivery tests below guard.
  getCoreBoxWindow: state.getCoreBoxWindow,
  windowManager: { current: { window: { id: 7, isDestroyed: () => false } } }
}))
vi.mock('./indexing-runtime', () => ({
  indexingRuntime: {
    abortAndDrainSourceScans: state.appRuntimeAbortAndDrain,
    beginShutdown: state.indexingRuntimeBeginShutdown,
    clear: state.clearIndexingRuntime,
    drainAdmittedTasks: state.indexingRuntimeDrainAdmittedTasks,
    drainTaskStateWrites: state.indexingRuntimeDrainTaskStateWrites,
    drainSourceMutations: state.appRuntimeDrainMutations,
    resetSourceRuntimeState: vi.fn(),
    setSourceWriterRouter: state.indexingRuntimeSetWriterRouter,
    setStore: state.indexingRuntimeSetStore,
    setTaskStateStore: state.indexingRuntimeSetTaskStateStore
  }
}))
vi.mock('./indexing-runtime-sources', () => ({
  registerCoreIndexedSources: state.registerCoreIndexedSources
}))
vi.mock('./search-index-writer', () => ({
  LegacySearchIndexWriter: class {},
  SourceScopedIndexWriterRouter: class {},
  searchIndexWriter: {
    beginShutdown: state.writerBeginShutdown,
    getFilePersistencePort: vi.fn(() => null),
    initialize: vi.fn(async () => undefined)
  }
}))
vi.mock('./indexing-store-adapter', () => ({ SearchIndexStoreAdapter: class {} }))
vi.mock('./indexing-task-state-store', () => ({ SqliteIndexingTaskStateStore: class {} }))
vi.mock('./query-completion-service', () => ({
  QueryCompletionService: class {
    injectCompletionWeights = vi.fn(async () => undefined)
    recordCompletion = vi.fn(async () => undefined)
  }
}))
vi.mock('./recommendation/recommendation-engine', () => ({
  RecommendationEngine: class {
    invalidateCache = state.invalidateRecommendationCache
    recommend = state.recommend
  }
}))
vi.mock('./search-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof SearchActivity>()),
  markSearchActivity: vi.fn()
}))
vi.mock('./search-index-service', () => ({
  SearchIndexService: class {
    preloadPinyin = vi.fn()
    warmup = vi.fn(async () => undefined)
    waitUntilReadable = vi.fn(async () => undefined)
  }
}))
vi.mock('./workers/search-index-read-worker-client', async (importOriginal) => {
  const actual = await importOriginal<typeof SearchIndexReadWorkerModule>()
  return {
    ...actual,
    SearchIndexReadWorkerClient: vi.fn(function (
      databasePath: string,
      options?: SearchIndexReadWorkerClientOptions
    ) {
      if (options?.workerPath) {
        return new actual.SearchIndexReadWorkerClient(databasePath, options)
      }
      return { close: state.readWorkerClose }
    })
  }
})
vi.mock('./search-logger', () => ({
  searchLogger: {
    gathererStart: vi.fn(),
    providerCall: vi.fn(),
    providerError: vi.fn(),
    providerResult: vi.fn(),
    providerTimeout: vi.fn(),
    isEnabled: vi.fn(() => false),
    logSearchPhase: vi.fn(),
    searchProviders: vi.fn(),
    searchSessionEnd: vi.fn(),
    searchSessionStart: vi.fn(),
    searchUpdate: vi.fn()
  }
}))
vi.mock('./search-provider-config', () => ({ getSearchProviderUserConfigs: vi.fn(() => []) }))
vi.mock('./time-stats-aggregator', () => ({ TimeStatsAggregator: class {} }))
vi.mock('./usage-stats-cache', () => ({
  getUsageStatsBatchCached: state.getUsageStatsBatch,
  UsageStatsCache: class {
    invalidate = state.invalidateUsageStatsCache
  }
}))
vi.mock('./usage-stats-queue', () => ({
  UsageStatsQueue: class {
    enqueue = state.usageQueueEnqueue
    forceFlush = state.forceFlushUsageQueue
  }
}))
vi.mock('./usage-summary-service', () => ({
  UsageSummaryService: class {
    start = vi.fn()
    stop = vi.fn()
  }
}))
vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      isRegistered: vi.fn(() => false),
      unregister: vi.fn(),
      register: vi.fn(),
      start: vi.fn()
    }))
  }
}))
vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    broadcast: state.broadcast,
    broadcastToWindow: state.broadcastToWindow,
    on: (event: unknown, handler: (...args: never[]) => unknown) => {
      state.transportHandlers.set(event, handler)
    },
    sendToWindow: state.sendToWindow
  }))
}))

vi.mock('electron', () => ({
  app: {
    getLocale: vi.fn(() => 'en-US'),
    getPath: vi.fn(() => '/tmp'),
    commandLine: {
      appendSwitch: vi.fn()
    }
  },
  BrowserWindow: class BrowserWindow {},
  nativeTheme: {},
  powerSaveBlocker: {
    start: vi.fn(() => 1),
    stop: vi.fn(),
    isStarted: vi.fn(() => false)
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 100, height: 100 }
    }))
  },
  WebContentsView: class WebContentsView {}
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

import type { SearchEngineCore } from './search-core'
import {
  INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS,
  INDEX_COMMIT_NOTIFY_WINDOW_MS
} from './search-index-commit-coalescer'

let core: SearchEngineCore
let searchIndexCommitHub: SearchIndexCommitHub

function buildItem(id: string, providerId: string, title: string): TuffItem {
  return {
    id,
    kind: 'app',
    render: { basic: { title }, mode: 'default' },
    scoring: { final: 1 },
    source: { id: providerId, name: providerId, type: 'application' }
  }
}

function buildProvider(id: string, onSearch: () => Promise<TuffSearchResult>) {
  return {
    id,
    name: id,
    onSearch,
    priority: 'fast' as const,
    supportedInputTypes: ['text'],
    type: 'app'
  }
}

async function installLateImageRecall(provider: {
  semanticRecall: (
    query: TuffQuery,
    excludeIds: Set<string>,
    signal: AbortSignal
  ) => Promise<TuffItem[]>
}) {
  const workerPath = await getSearchIndexReadWorkerTestPath()
  const directory = await mkdtemp(join(tmpdir(), 'tuff-late-image-recall-'))
  const databasePath = join(directory, 'search-index.sqlite')
  const client = createClient({ url: `file:${databasePath}` })
  await client.execute(`CREATE TABLE files (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL,
    display_name TEXT, extension TEXT, size INTEGER, mtime INTEGER NOT NULL,
    ctime INTEGER NOT NULL, last_indexed_at INTEGER NOT NULL,
    is_dir INTEGER NOT NULL, type TEXT NOT NULL, content TEXT, embedding_status TEXT NOT NULL
  )`)
  await client.execute(
    'CREATE TABLE file_extensions (id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL)'
  )
  await client.execute(`CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL,
    embedding TEXT NOT NULL, model TEXT NOT NULL, content_hash TEXT, created_at INTEGER NOT NULL
  )`)
  const path = '/scope/IMG_2048.png'
  await client.execute({
    sql: "INSERT INTO files VALUES (17, ?, 'IMG_2048.png', NULL, '.png', 64, 2, 2, 0, 0, 'file', NULL, 'completed')",
    args: [path]
  })
  await client.execute({
    sql: "INSERT INTO embeddings VALUES (1, '17', 'file', '[1,0,0]', ?, 'image-identity', 0)",
    args: [LOCAL_EMBEDDING_MODEL_KEY]
  })
  const db = drizzle(client, { schema })
  const entered = Promise.withResolvers<void>()
  const answer = Promise.withResolvers<void>()
  const settled = Promise.withResolvers<void>()
  const embedding = new EmbeddingService(
    {
      isSplitEnabled: () => false,
      getReadDb: () => db,
      getDatabasePath: () => databasePath,
      getPrimaryDb: () => db,
      execWrite: async () => {
        throw new Error('READ_ONLY_RECALL_WROTE_TO_SQLITE')
      }
    },
    async (text) => {
      if (text !== 'test') {
        entered.resolve()
        await answer.promise
      }
      return { vector: [1, 0, 0], model: LOCAL_EMBEDDING_MODEL_KEY }
    },
    { workerPath }
  )
  const results = new FileProviderSearchResultService({
    providerId: 'file-provider',
    getDbUtils: () => ({ getDb: () => db, getFileIndexReadDb: () => db }) as never,
    getSearchIndex: () => null,
    isContentIndexingEnabled: () => true,
    isPathAdmitted: (candidate) => candidate.startsWith('/scope/'),
    buildItem: (file) => ({
      id: file.path,
      kind: 'file',
      source: { id: 'file-provider', name: 'Files', type: 'file' },
      render: { mode: 'default', basic: { title: file.name } },
      meta: { file: { path: file.path } }
    }),
    normalizeItem: (item) => item,
    sanitizeExtensions: (extensions) => extensions,
    cleanupStaleCandidates: () => {},
    semanticSearch: (query, limit, signal) => embedding.semanticSearch(query, limit, signal),
    logDebug: () => {},
    formatDuration: (duration) => `${duration}ms`
  })
  const recall = vi
    .spyOn(provider, 'semanticRecall')
    .mockImplementation(async (query, excluded, signal) => {
      try {
        return await results.semanticRecall(query, excluded, signal)
      } finally {
        settled.resolve()
      }
    })
  const close = async () => {
    await embedding.close()
    client.close()
    await rm(directory, { recursive: true, force: true })
  }
  return { client, path, entered, answer, settled, recall, close }
}

describe('SearchEngineCore facade contracts', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    state.transportHandlers.clear()
    state.foregroundApp = null
    state.searchUpdateCompletion.current = Promise.withResolvers<void>()
    const [searchIndexCommitHubModule, searchCoreModule] = await Promise.all([
      import('./search-index-commit-hub'),
      import('./search-core')
    ])
    searchIndexCommitHub = searchIndexCommitHubModule.searchIndexCommitHub
    core = searchCoreModule.SearchEngineCore.getInstance()
    state.createDbUtils.mockReturnValue({
      addUsageLog: state.addUsageLog,
      recordExecuteTransaction: state.recordExecuteTransaction,
      getAllPinnedItems: state.getAllPinnedItems,
      getUsageStatsBatch: state.getUsageStatsBatch,
      // `injectUsageStats` pairs the lifetime row with one dated behaviour read; a mock without
      // this method makes the whole injection throw into its catch and no row gets stamped.
      getUsageBehaviorBatch: state.getUsageBehaviorBatch,
      incrementUsageStats: state.incrementUsageStats,
      incrementUsageSummary: state.incrementUsageSummary,
      incrementUsageTrendDaily: state.incrementUsageTrendDaily,
      isPinned: vi.fn(async () => false),
      togglePin: state.togglePin
    })
    state.getAllPinnedItems.mockResolvedValue([])
    state.getUsageStatsBatch.mockResolvedValue([])
    state.filePathAdmitted.mockImplementation((path: string) => path.startsWith('/scope/'))
    state.recommend.mockResolvedValue({ containerLayout: undefined, duration: 0, items: [] })
    state.togglePin.mockResolvedValue(true)
    core.init({ app: { channel: {} } } as never)
  })

  afterEach(async () => {
    const lifecycle = core as unknown as { destroying: boolean }
    if (!lifecycle.destroying) await core.destroy()
  })

  it.each([
    { name: 'captured source A', known: true, expectedApp: 'com.example.editor' },
    { name: 'unknown original source', known: false, expectedApp: undefined }
  ])(
    'executes a completed session with its $name after hide and source B activation',
    async ({ known, expectedApp }) => {
      const client = createClient({ url: ':memory:' })
      // The harness resets modules per case: static imports would bind stale recorder/snapshot
      // singletons instead of the ones loaded with this SearchEngineCore instance.
      const { foregroundAppSnapshotStore } = await import('../../system/foreground-app-snapshot')
      const { recordAcceptedExecute } = await import('./execute-recorder')
      const migrationNames = [
        '0000_whole_mister_fear.sql',
        '0005_orange_wiccan.sql',
        '0007_remarkable_silver_sable.sql',
        '0011_add_recommendation_tables.sql',
        '0019_usage_trend_daily.sql',
        '0051_usage_execute_events.sql'
      ]
      try {
        for (const name of migrationNames) {
          const migration = await readFile(
            new URL(`../../../../../resources/db/migrations/${name}`, import.meta.url),
            'utf8'
          )
          for (const statement of migration.split('--> statement-breakpoint')) {
            if (statement.trim()) await client.execute(statement)
          }
        }
        const actual = await vi.importActual<typeof DbUtilsModule>('../../../db/utils')
        const usageDb = actual.createDbUtils(drizzle(client, { schema }))
        state.recordExecuteTransaction.mockImplementation((input) =>
          usageDb.recordExecuteTransaction(input)
        )
        const externalApp = (bundleId: string, displayName: string): ActiveAppInfo => ({
          bundleId,
          identifier: bundleId,
          displayName,
          processId: process.pid + 1,
          executablePath: `/Applications/${displayName}.app`,
          platform: 'macos',
          lastUpdated: 0,
          windowTitle: null
        })
        const sourceItem = buildItem('source-action', 'source-provider', 'Source action')
        core.registerProvider({
          ...buildProvider(
            'source-provider',
            async () => ({ items: [sourceItem] }) as TuffSearchResult
          ),
          onExecute: async (args: {
            item: TuffItem
            searchResult?: TuffSearchResult
            eventId: string
          }) => {
            // Real launch paths hide before their accepted recorder publishes. Crossing an await
            // here also catches implementations which lose the async-local source before admission.
            foregroundAppSnapshotStore.clear()
            await Promise.resolve()
            await recordAcceptedExecute({
              item: args.item,
              sessionId: args.searchResult?.sessionId,
              eventId: args.eventId,
              entryPoint: 'core-box'
            })
          }
        } as never)
        state.foregroundApp = known ? externalApp('com.example.editor', 'Editor') : null
        foregroundAppSnapshotStore.capture()
        await foregroundAppSnapshotStore.resolve()
        const original = core.startSearch(
          { inputs: [], text: 'original source action' },
          {
            caller: { kind: 'core-box', id: 'origin-original' }
          }
        )
        const originalResult = await original.result
        await original.completed
        foregroundAppSnapshotStore.clear()
        state.foregroundApp = externalApp('com.example.browser', 'Browser')
        foregroundAppSnapshotStore.capture()
        await foregroundAppSnapshotStore.resolve()
        const next = core.startSearch(
          { inputs: [], text: 'next source action' },
          {
            caller: { kind: 'core-box', id: 'origin-next' }
          }
        )
        const nextResult = await next.result
        await next.completed

        // resetModules recreates typed-event objects; resolve the registered transport address,
        // not the object imported before this engine's module graph was loaded.
        const execute = [...state.transportHandlers.entries()].find(([event]) => {
          const address = event as { toEventName: () => string }
          return address.toEventName() === CoreBoxEvents.item.execute.toEventName()
        })![1]
        await execute({
          item: sourceItem,
          searchResult: originalResult,
          eventId: 'original-execute'
        } as never)
        await execute({
          item: sourceItem,
          searchResult: nextResult,
          eventId: 'next-execute'
        } as never)
        const history = await usageDb.getRecommendationHistory()
        const { rows } = await client.execute(
          'SELECT event_id, context FROM usage_logs ORDER BY id'
        )
        const originalContext = JSON.parse(String(rows[0].context))
        const nextContext = JSON.parse(String(rows[1].context))

        expect(rows.map((row) => row.event_id)).toEqual(['original-execute', 'next-execute'])
        if (known) expect(originalContext.prevApp).toBe(expectedApp)
        else expect(originalContext).not.toHaveProperty('prevApp')
        expect(nextContext.prevApp).toBe('com.example.browser')
        expect(history.map((event) => event.previousApp).sort()).toEqual(
          known ? ['com.example.browser', 'com.example.editor'] : ['com.example.browser', null]
        )
      } finally {
        foregroundAppSnapshotStore.clear()
        state.foregroundApp = null
        state.recordExecuteTransaction
          .mockReset()
          .mockResolvedValue({ accepted: true, usageStats: null })
        client.close()
      }
    }
  )

  it('reports no committed push when the write throws, so no surface is shown a count that was rolled back', async () => {
    // A failed transaction is the one case where the user's action succeeded but there is no count:
    // announcing a row that was never committed (or the previous one) would make the visible count
    // disagree with the database on the next read.
    const item = buildItem('failed-item', 'app-provider', 'Failed')
    state.recordExecuteTransaction.mockRejectedValueOnce(new Error('database is locked'))

    await expect(
      core.recordExecute('failed-session', item, 'failed-1', { entryPoint: 'core-box' })
    ).resolves.toBeUndefined()

    expect(state.broadcast).not.toHaveBeenCalled()
    expect(state.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('delivers the committed count to both the main window and the CoreBox window, once per accepted action', async () => {
    // TouchChannel.broadcast only reaches the main window, so a committed count never showed up in
    // CoreBox itself. The engine now pushes the same serialized facts to the main window and
    // explicitly to the CoreBox window; the payload — not the call — is what a consumer applies to
    // its row, so a re-notified or failed action must not add a second one.
    const item = buildItem('counted-item', 'app-provider', 'Counted')
    const committedAt = new Date('2026-09-30T08:00:00.000Z')
    state.recordExecuteTransaction.mockResolvedValueOnce({
      accepted: true,
      usageStats: {
        sourceId: 'app-provider',
        itemId: 'counted-item',
        sourceType: 'application',
        executeCount: 7,
        searchCount: 2,
        cancelCount: 0,
        lastExecuted: committedAt,
        lastSearched: null,
        lastCancelled: null,
        createdAt: committedAt,
        updatedAt: committedAt
      }
    })

    await core.recordExecute('commit-session', item, 'commit-1', { entryPoint: 'core-box' })

    // One broadcast to every window, one explicit delivery to the CoreBox window by its live id.
    expect(state.broadcast).toHaveBeenCalledTimes(1)
    expect(state.broadcastToWindow).toHaveBeenCalledTimes(1)
    expect(state.broadcastToWindow).toHaveBeenCalledWith(
      7,
      expect.anything(),
      expect.objectContaining({
        sourceId: 'app-provider',
        itemId: 'counted-item',
        usageStats: expect.objectContaining({
          executeCount: 7,
          searchCount: 2,
          lastExecuted: committedAt.toISOString()
        })
      })
    )
    // Both deliveries carry the same serialized write, so the two surfaces cannot disagree.
    const broadcastPayload = state.broadcast.mock.calls[0]?.[1]
    const targetedPayload = state.broadcastToWindow.mock.calls[0]?.[2]
    expect(broadcastPayload).toEqual(targetedPayload)

    // A replay of the same action is a database dupe: it reports no committed row, so no extra
    // push of the stale pre-commit shape reaches the windows.
    state.recordExecuteTransaction.mockResolvedValueOnce({ accepted: false, usageStats: null })
    await core.recordExecute('commit-session', item, 'commit-1', { entryPoint: 'core-box' })
    expect(state.broadcast).toHaveBeenCalledTimes(1)
    expect(state.broadcastToWindow).toHaveBeenCalledTimes(1)
  })

  it('still records the accepted action when the CoreBox window is gone or destroyed', async () => {
    // The explicit CoreBox delivery is best-effort: a missing or torn-down window must not turn a
    // successful action into a failure, and the main-window push must still go out.
    const item = buildItem('headless-item', 'app-provider', 'Headless')
    const committedAt = new Date('2026-09-30T08:00:00.000Z')
    // Every call commits a row (the point is the delivery, not the write), so the committed push is
    // always due and the only variable is the CoreBox handle.
    state.recordExecuteTransaction.mockResolvedValue({
      accepted: true,
      usageStats: {
        sourceId: 'app-provider',
        itemId: 'headless-item',
        sourceType: 'application',
        executeCount: 1,
        searchCount: 0,
        cancelCount: 0,
        lastExecuted: committedAt,
        lastSearched: null,
        lastCancelled: null,
        createdAt: committedAt,
        updatedAt: committedAt
      }
    })

    for (const handle of [undefined, { window: { id: 9, isDestroyed: () => true } }]) {
      state.getCoreBoxWindow.mockReturnValueOnce(handle)
      state.broadcast.mockClear()
      state.broadcastToWindow.mockClear()

      await expect(
        core.recordExecute('headless-session', item, 'headless-1', { entryPoint: 'core-box' })
      ).resolves.toBeUndefined()

      // The action is accepted and announced to the main window; only the CoreBox leg is skipped.
      expect(state.broadcast).toHaveBeenCalledTimes(1)
      expect(state.broadcastToWindow).not.toHaveBeenCalled()
    }
    expect(state.recordExecuteTransaction).toHaveBeenCalledTimes(2)
  })

  it('releases first-result metrics even when telemetry is disabled', () => {
    // getSentryService is mocked with isTelemetryEnabled() === false, which is
    // the privacy default. The delete used to sit after that early return, so
    // the entry survived every execute on a privacy-default install (#669).
    const internals = core as unknown as {
      searchFirstResultMetrics: Map<string, unknown>
      queueExecuteTelemetry: (sessionId: string, item: unknown, startedAt?: number) => void
    }

    internals.searchFirstResultMetrics.set('session-1', { sessionId: 'session-1' })
    expect(internals.searchFirstResultMetrics.has('session-1')).toBe(true)

    internals.queueExecuteTelemetry('session-1', {
      id: 'item-1',
      kind: 'app',
      source: { id: 'app-provider', type: 'application', name: 'App Provider' },
      render: { mode: 'default', basic: { title: 'Demo' } }
    })

    expect(internals.searchFirstResultMetrics.has('session-1')).toBe(false)
  })

  it('routes the App runtime presentation-refresh delegate to subscribed CoreBox streams', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)
      const revision = searchIndexCommitHub.getRevision()
      const delegate = state.appProviderRuntimeDelegate.mock.calls.at(-1)?.[0] as
        | { invalidateRecommendations?: () => void }
        | undefined

      delegate?.invalidateRecommendations?.()
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          recommendationsInvalidated: true,
          revision
        })
      )
      expect(searchIndexCommitHub.getRevision()).toBe(revision)

      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('deduplicates activations and limits the public provider pool to active providers', () => {
    const alpha = buildProvider('contract-alpha', vi.fn())
    const beta = buildProvider('contract-beta', vi.fn())
    core.registerProvider(alpha as never)
    core.registerProvider(beta as never)

    core.activateProviders([
      { id: 'contract-beta', meta: { feature: 'beta' } },
      { id: 'contract-alpha', meta: { feature: 'alpha' } },
      { id: 'contract-beta', meta: { feature: 'beta' } }
    ] as IProviderActivate[])

    expect(core.getActiveProviders().map((provider) => provider.id)).toEqual([
      'contract-beta',
      'contract-alpha'
    ])
    expect(core.getActivationState()).toEqual([
      { id: 'contract-beta', meta: { feature: 'beta' } },
      { id: 'contract-alpha', meta: { feature: 'alpha' } }
    ])
  })

  it('merges healthy provider results, ranks the exact match first, and isolates a failed provider', async () => {
    const exactItem = buildItem('exact-item', 'first-provider', 'merge')
    const partialItem = buildItem('partial-item', 'second-provider', 'merge archive')
    const first = buildProvider(
      'first-provider',
      vi.fn(async () => ({ items: [exactItem] }) as never)
    )
    const second = buildProvider(
      'second-provider',
      vi.fn(async () => ({ items: [partialItem] }) as never)
    )
    const broken = buildProvider(
      'broken-provider',
      vi.fn(async () => Promise.reject(new Error('offline')))
    )
    core.registerProvider(first as never)
    core.registerProvider(second as never)
    core.registerProvider(broken as never)
    core.activateProviders([
      { id: 'first-provider' },
      { id: 'second-provider' },
      { id: 'broken-provider' }
    ] as IProviderActivate[])
    state.getAllPinnedItems.mockResolvedValue([
      {
        itemId: 'exact-item',
        order: 0,
        pinnedAt: new Date(),
        sourceId: 'first-provider',
        sourceType: 'application'
      }
    ])
    state.getUsageStatsBatch.mockResolvedValue([
      {
        cancelCount: 0,
        createdAt: new Date(),
        executeCount: 3,
        itemId: 'exact-item',
        lastCancelled: null,
        lastExecuted: null,
        lastSearched: null,
        searchCount: 8,
        sourceId: 'first-provider',
        sourceType: 'application',
        updatedAt: new Date()
      }
    ])

    const snapshots: TuffSearchResult[] = []
    const result = await core.search({ inputs: [], text: 'merge' } as TuffQuery, {
      caller: { kind: 'core-box', id: 'core-box:contract' },
      sink: {
        snapshot: (snapshot) => {
          snapshots.push(snapshot)
        }
      }
    })

    expect(result.items.map((item) => item.id)).toEqual(['exact-item', 'partial-item'])
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'first-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'second-provider', status: 'success' }),
        expect.objectContaining({ providerId: 'broken-provider', status: 'error' })
      ])
    )
    expect(snapshots).toEqual([
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'exact-item',
            meta: expect.objectContaining({
              pinned: expect.objectContaining({ isPinned: true }),
              usageStats: expect.objectContaining({ executeCount: 3, searchCount: 8 })
            })
          })
        ])
      })
    ])
  })

  it('completes concurrent UI and AI searches with isolated sinks and activation snapshots', async () => {
    const uiSearch = vi.fn(
      async () =>
        ({
          items: [buildItem('ui-only-item', 'ui-provider', 'UI result')]
        }) as never
    )
    const aiSearch = vi.fn(
      async () =>
        ({
          items: [buildItem('ai-only-item', 'ai-provider', 'AI result')]
        }) as never
    )
    const uiActivations = [{ id: 'ui-provider', meta: { scope: 'ui' } }] as IProviderActivate[]
    const aiActivations = [{ id: 'ai-provider', meta: { scope: 'ai' } }] as IProviderActivate[]
    const uiDeliveries: Array<{ type: 'start' | 'snapshot' | 'complete'; sessionId: string }> = []

    core.registerProvider(buildProvider('ui-provider', uiSearch) as never)
    core.registerProvider(buildProvider('ai-provider', aiSearch) as never)

    const uiExecution = core.startSearch(
      { inputs: [], text: 'concurrent UI request' } as TuffQuery,
      {
        caller: { kind: 'core-box', id: 'core-box:facade-contract' },
        activations: uiActivations,
        sink: {
          start: (sessionId) => {
            uiDeliveries.push({ type: 'start', sessionId })
          },
          snapshot: (result) => {
            uiDeliveries.push({ type: 'snapshot', sessionId: result.sessionId! })
          },
          complete: ({ searchId, cancelled }) => {
            expect(cancelled).toBeUndefined()
            uiDeliveries.push({ type: 'complete', sessionId: searchId })
          }
        }
      }
    )
    const aiExecution = core.startSearch(
      { inputs: [], text: 'concurrent AI request' } as TuffQuery,
      {
        caller: { kind: 'ai-agent', id: 'agent:facade-contract' },
        activations: aiActivations
      }
    )

    const [uiResult, aiResult] = await Promise.all([uiExecution.result, aiExecution.result])
    await Promise.all([uiExecution.completed, aiExecution.completed])

    expect(uiExecution.sessionId).not.toBe(aiExecution.sessionId)
    expect(uiResult).toMatchObject({
      activate: uiActivations,
      items: [expect.objectContaining({ id: 'ui-only-item' })],
      sessionId: uiExecution.sessionId
    })
    expect(aiResult).toMatchObject({
      activate: aiActivations,
      items: [expect.objectContaining({ id: 'ai-only-item' })],
      sessionId: aiExecution.sessionId
    })
    expect(uiSearch).toHaveBeenCalledTimes(1)
    expect(aiSearch).toHaveBeenCalledTimes(1)
    expect(uiDeliveries).toEqual([
      { type: 'start', sessionId: uiExecution.sessionId },
      { type: 'snapshot', sessionId: uiExecution.sessionId },
      { type: 'complete', sessionId: uiExecution.sessionId }
    ])
    expect(state.sendToWindow).not.toHaveBeenCalled()
  })

  it('materializes each cache hit as a fresh detached search session result', async () => {
    const search = vi.fn(
      async () =>
        ({
          items: [buildItem('cached-item', 'cache-provider', 'Cached result')]
        }) as never
    )
    const snapshots: TuffSearchResult[] = []
    const query = { inputs: [], text: 'facade cache identity contract' } as TuffQuery

    core.registerProvider(buildProvider('cache-provider', search) as never)
    core.activateProviders([{ id: 'cache-provider' }] as IProviderActivate[])

    const first = core.startSearch(query, {
      caller: { kind: 'core-box', id: 'core-box:cache-first' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    const firstResult = await first.result
    await first.completed
    firstResult.items[0].render.basic!.title = 'Mutated first result'

    const second = core.startSearch(query, {
      caller: { kind: 'ai-agent', id: 'agent:cache-second' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    const secondResult = await second.result
    await second.completed

    expect(search).toHaveBeenCalledTimes(1)
    expect(first.sessionId).not.toBe(second.sessionId)
    expect(firstResult).toMatchObject({ sessionId: first.sessionId })
    expect(secondResult).toMatchObject({
      items: [expect.objectContaining({ id: 'cached-item' })],
      sessionId: second.sessionId
    })
    expect(secondResult).not.toBe(firstResult)
    expect(secondResult.items).not.toBe(firstResult.items)
    expect(secondResult.items[0]).not.toBe(firstResult.items[0])
    expect(secondResult.items[0].render.basic?.title).toBe('Cached result')
    expect(secondResult.sources).not.toBe(firstResult.sources)
    expect(snapshots.map((result) => result.sessionId)).toEqual([first.sessionId, second.sessionId])
  })

  it('rechecks current file-owner roots on a cached hit without applying that policy to native-file results', async () => {
    const owned: TuffItem = {
      ...buildItem('owned-file', 'file-provider', 'Owned indexed file'),
      kind: 'file',
      source: { id: 'file-provider', name: 'Files', type: 'file' },
      meta: { file: { path: '/scope/owned.txt' } }
    }
    const native: TuffItem = {
      ...buildItem('native-file', 'mac-file-provider', 'Native file'),
      kind: 'file',
      source: { id: 'mac-file-provider', name: 'Native files', type: 'file' },
      meta: { file: { path: '/outside/native.txt' } }
    }
    let ownedItems = [owned]
    let nativeItems = [native]
    core.unregisterProvider('file-provider')
    core.unregisterProvider('mac-file-provider')
    core.registerProvider({
      ...buildProvider('file-provider', async () => ({ items: ownedItems }) as never),
      type: 'file'
    } as never)
    core.registerProvider({
      ...buildProvider('mac-file-provider', async () => ({ items: nativeItems }) as never),
      type: 'file'
    } as never)
    core.activateProviders([
      { id: 'file-provider' },
      { id: 'mac-file-provider' }
    ] as IProviderActivate[])
    const query = { inputs: [], text: 'current file owner scope cache' } as TuffQuery
    const first = core.startSearch(query, {
      caller: { kind: 'core-box', id: 'scope:before-withdrawal' }
    })
    expect((await first.result).items.map((item) => item.id).sort()).toEqual([
      'native-file',
      'owned-file'
    ])
    await first.completed

    // Fresh provider output is now empty. The retained native item below can only come from
    // the cached snapshot, whose index-owned member must still obey today's admission rule.
    ownedItems = []
    nativeItems = []
    state.filePathAdmitted.mockImplementation(() => false)
    const snapshots: TuffSearchResult[] = []
    const cached = core.startSearch(query, {
      caller: { kind: 'ai-agent', id: 'scope:after-withdrawal' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    expect((await cached.result).items.map((item) => item.id)).toEqual(['native-file'])
    await cached.completed
    expect(snapshots.map((result) => result.items.map((item) => item.id))).toEqual([
      ['native-file']
    ])
  })
  it('drops deleted index-owned files from cached hits while retaining missing native-file results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-cache-files-'))
    const ownedTempPath = join(directory, 'owned.txt')
    const nativeTempPath = join(directory, 'native.txt')
    const ownedPath = '/scope/cache-owned.txt'
    const nativePath = '/scope/cache-native.txt'
    await writeFile(ownedTempPath, 'indexed file')
    await writeFile(nativeTempPath, 'native file')
    const realExistsSync = fs.existsSync.bind(fs)
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((candidate) => {
      if (candidate === ownedPath) return realExistsSync(ownedTempPath)
      if (candidate === nativePath) return realExistsSync(nativeTempPath)
      return realExistsSync(candidate)
    })

    const owned: TuffItem = {
      ...buildItem('owned-file-cache', 'file-provider', 'Owned indexed file'),
      kind: 'file',
      source: { id: 'file-provider', name: 'Files', type: 'file' },
      meta: { file: { path: ownedPath } }
    }
    const native: TuffItem = {
      ...buildItem('native-file-cache', 'mac-file-provider', 'Native file'),
      kind: 'file',
      source: { id: 'mac-file-provider', name: 'Native files', type: 'file' },
      meta: { file: { path: nativePath } }
    }
    let ownedItems = [owned]
    let nativeItems = [native]
    core.unregisterProvider('file-provider')
    core.unregisterProvider('mac-file-provider')
    core.registerProvider({
      ...buildProvider('file-provider', async () => ({ items: ownedItems }) as never),
      type: 'file'
    } as never)
    core.registerProvider({
      ...buildProvider('mac-file-provider', async () => ({ items: nativeItems }) as never),
      type: 'file'
    } as never)
    core.activateProviders([
      { id: 'file-provider' },
      { id: 'mac-file-provider' }
    ] as IProviderActivate[])

    const query = { inputs: [], text: 'deleted file cache existence' } as TuffQuery
    try {
      const first = core.startSearch(query, {
        caller: { kind: 'core-box', id: 'cache-file-before-delete' }
      })
      expect((await first.result).items.map((item) => item.id).sort()).toEqual([
        'native-file-cache',
        'owned-file-cache'
      ])
      await first.completed

      ownedItems = []
      nativeItems = []
      await rm(ownedTempPath)
      await rm(nativeTempPath)

      const second = core.startSearch(query, {
        caller: { kind: 'core-box', id: 'cache-file-after-delete' }
      })
      expect((await second.result).items.map((item) => item.id)).toEqual(['native-file-cache'])
      await second.completed
    } finally {
      existsSyncSpy.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rechecks rebuilt recommendation ownership when roots change during recommendation lookup', async () => {
    const owned: TuffItem = {
      ...buildItem('owned-recommendation', 'recommendation-grid', 'Indexed recommendation'),
      kind: 'file',
      meta: { _originalSourceId: 'file-provider', file: { path: '/scope/recommended.txt' } }
    }
    const native: TuffItem = {
      ...buildItem('native-recommendation', 'recommendation-grid', 'Native recommendation'),
      kind: 'file',
      meta: { _originalSourceId: 'mac-file-provider', file: { path: '/outside/recommended.txt' } }
    }
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    state.recommend.mockImplementation(async () => {
      entered.resolve()
      await released.promise
      return { containerLayout: undefined, duration: 1, items: [owned, native] }
    })
    const operation = core.startSearch({ text: '', inputs: [] } as TuffQuery, {
      caller: { kind: 'core-box', id: 'scope:recommendation-withdrawal' }
    })
    try {
      await entered.promise
      state.filePathAdmitted.mockImplementation(() => false)
      released.resolve()
      expect((await operation.result).items.map((item) => item.id)).toEqual([
        'native-recommendation'
      ])
      await operation.completed
    } finally {
      released.resolve()
      await operation.result
      await operation.completed
    }
  })

  it.each(['猫', '宠物'])(
    'publishes a late real SQLite image recall after all fast providers finished for %s',
    async (text) => {
      // beforeEach resets modules: bind the real recall consumer to the provider this core loaded.
      const { fileProvider } = await import('../addon/files/file-provider')
      const fixture = await installLateImageRecall(fileProvider)
      core.registerProvider(
        buildProvider(
          'image-fast-contract',
          async () =>
            ({
              items: [buildItem('initial-app', 'image-fast-contract', 'Unrelated application')]
            }) as TuffSearchResult
        ) as never
      )
      core.activateProviders([{ id: 'image-fast-contract' }] as IProviderActivate[])
      const streamed: TuffItem[] = []
      const lifecycle: string[] = []
      const operation = core.startSearch({ text, inputs: [] } as TuffQuery, {
        caller: { kind: 'core-box', id: 'cjk-image-contract' },
        sink: {
          snapshot: () => {
            lifecycle.push('snapshot')
          },
          update: (payload) => {
            streamed.push(...payload.items)
            if (payload.items.some((item) => item.id === fixture.path)) lifecycle.push('image')
          },
          complete: () => {
            lifecycle.push('complete')
          }
        }
      })
      try {
        expect((await operation.result).items.map((item) => item.id)).toEqual(['initial-app'])
        // A broken gate or prematurely completed session loses this race and fails without a sleep.
        await Promise.race([fixture.entered.promise, operation.completed])
        expect(lifecycle).not.toContain('complete')
        fixture.answer.resolve()
        await operation.completed
        expect(
          streamed
            .filter((item) => item.id === fixture.path)
            .map((item) => ({
              id: item.id,
              title: item.render.basic?.title,
              match: item.meta?.deepMatch
            }))
        ).toEqual([
          {
            id: fixture.path,
            title: 'IMG_2048.png',
            match: { kind: 'semantic', score: 1 }
          }
        ])
        expect(lifecycle.indexOf('image')).toBeLessThan(lifecycle.indexOf('complete'))
        expect(
          (await fixture.client.execute('SELECT path, content FROM files WHERE id = 17')).rows
        ).toEqual([{ path: fixture.path, content: null }])
      } finally {
        operation.cancel()
        fixture.answer.resolve()
        await operation.completed
        if (fixture.recall.mock.calls.length > 0) await fixture.settled.promise
        fixture.recall.mockRestore()
        await fixture.close()
      }
    }
  )

  it('publishes late SQLite semantic files on the common score scale with pinned rows ranked first', async () => {
    // resetModules gives this core a fresh provider; a static import would bind the old instance.
    const { fileProvider } = await import('../addon/files/file-provider')
    const fixture = await installLateImageRecall(fileProvider)
    const pinnedPath = '/scope/IMG_b7c1.png'
    let operation: SearchExecution | undefined

    try {
      await fixture.client.execute({
        sql: "INSERT INTO files VALUES (18, ?, 'IMG_b7c1.png', NULL, '.png', 64, 2, 2, 0, 0, 'file', NULL, 'completed')",
        args: [pinnedPath]
      })
      await fixture.client.execute({
        sql: "INSERT INTO embeddings VALUES (2, '18', 'file', ?, ?, 'pinned-image-identity', 0)",
        args: [JSON.stringify([0.73, Math.sqrt(1 - 0.73 ** 2), 0]), LOCAL_EMBEDDING_MODEL_KEY]
      })
      state.getAllPinnedItems.mockResolvedValue([
        {
          itemId: pinnedPath,
          order: 0,
          pinnedAt: new Date('2026-10-01T00:00:00Z'),
          sourceId: 'file-provider',
          sourceType: 'file'
        }
      ])
      const providerId = 'semantic-ranking-fast-contract'
      const file = (id: string, title: string): TuffItem => ({
        ...buildItem(id, providerId, title),
        kind: 'file',
        source: { id: providerId, name: 'Files', type: 'file' },
        meta: { file: { path: id } }
      })
      core.registerProvider(
        buildProvider(
          providerId,
          async () =>
            ({
              items: [
                file('/scope/deploy.sh', 'deploy.sh'),
                file('/scope/a pet cat.png', 'a pet cat.png')
              ]
            }) as TuffSearchResult
        ) as never
      )
      core.activateProviders([{ id: providerId }] as IProviderActivate[])
      const updates: TuffItem[][] = []
      operation = core.startSearch({ text: 'a pet cat', inputs: [] } as TuffQuery, {
        caller: { kind: 'core-box', id: 'semantic-ranking-consumer' },
        sink: {
          update: (payload) => {
            updates.push(payload.items)
          }
        }
      })

      const firstScreen = await operation.result
      expect(firstScreen.items.map((item) => item.id)).toEqual([
        '/scope/a pet cat.png',
        '/scope/deploy.sh'
      ])
      await Promise.race([fixture.entered.promise, operation.completed])
      fixture.answer.resolve()
      await operation.completed

      expect(updates.map((items) => items.map((item) => item.id))).toEqual([
        [pinnedPath, fixture.path]
      ])
      const [pinnedSemantic, strongerSemantic] = updates[0]
      const [exactStem, historyOnly] = firstScreen.items
      // The lower-similarity pin wins the published batch, but numeric scores still share
      // the initial file match scale. Neither raw cosine scores nor un-enriched recall pass.
      expect(pinnedSemantic.scoring!.final!).toBeGreaterThan(historyOnly.scoring!.final!)
      expect(pinnedSemantic.scoring!.final!).toBeLessThan(strongerSemantic.scoring!.final!)
      expect(strongerSemantic.scoring!.final!).toBeLessThan(exactStem.scoring!.final!)
    } finally {
      operation?.cancel()
      fixture.answer.resolve()
      if (operation) await operation.completed
      if (fixture.recall.mock.calls.length > 0) await fixture.settled.promise
      fixture.recall.mockRestore()
      await fixture.close()
    }
  })

  it('appends a late SQLite image recall after a first screen of 25 applications without reordering it', async () => {
    // beforeEach resets modules: static imports would bind a provider outside this core's graph.
    const { fileProvider } = await import('../addon/files/file-provider')
    const fixture = await installLateImageRecall(fileProvider)
    const providerId = 'crowded-app-image-contract'
    const applications = Array.from({ length: 25 }, (_, index) =>
      buildItem(`cat-app-${index}`, providerId, 'Cat application')
    )
    core.registerProvider(
      buildProvider(providerId, async () => ({ items: applications }) as TuffSearchResult) as never
    )
    core.activateProviders([{ id: providerId }] as IProviderActivate[])
    const consumerItems: TuffItem[] = []
    const deliveries: Array<{ kind: 'snapshot' | 'update' | 'complete'; ids: string[] }> = []
    const operation = core.startSearch({ text: 'cat', inputs: [] } as TuffQuery, {
      caller: { kind: 'core-box', id: 'crowded-app-image' },
      sink: {
        snapshot: (result) => {
          consumerItems.splice(0, consumerItems.length, ...result.items)
          deliveries.push({ kind: 'snapshot', ids: result.items.map((item) => item.id) })
        },
        update: (payload) => {
          consumerItems.push(...payload.items)
          deliveries.push({ kind: 'update', ids: payload.items.map((item) => item.id) })
        },
        complete: () => {
          deliveries.push({ kind: 'complete', ids: consumerItems.map((item) => item.id) })
        }
      }
    })

    try {
      const firstScreenIds = (await operation.result).items.map((item) => item.id)
      expect([...firstScreenIds].sort()).toEqual(applications.map((item) => item.id).sort())
      // An application-heavy baseline must reach the consumer before semantic inference
      // settles, but must not complete the session and suppress the later file result.
      await Promise.race([fixture.entered.promise, operation.completed])
      expect(deliveries).toEqual([{ kind: 'snapshot', ids: firstScreenIds }])
      fixture.answer.resolve()
      await operation.completed

      expect(deliveries).toEqual([
        { kind: 'snapshot', ids: firstScreenIds },
        { kind: 'update', ids: [fixture.path] },
        { kind: 'complete', ids: [...firstScreenIds, fixture.path] }
      ])
      expect(consumerItems.at(-1)).toMatchObject({
        id: fixture.path,
        kind: 'file',
        source: { id: 'file-provider', type: 'file' },
        render: { basic: { title: 'IMG_2048.png' } },
        meta: { file: { path: fixture.path }, deepMatch: { kind: 'semantic', score: 1 } }
      })
    } finally {
      operation.cancel()
      fixture.answer.resolve()
      await operation.completed
      if (fixture.recall.mock.calls.length > 0) await fixture.settled.promise
      fixture.recall.mockRestore()
      await fixture.close()
    }
  })

  it('publishes early-fast image recall while a deferred provider is still answering', async () => {
    // Use the provider from this test's reset module graph, not a stale static singleton.
    const { fileProvider } = await import('../addon/files/file-provider')
    const fixture = await installLateImageRecall(fileProvider)
    const deferred = Promise.withResolvers<void>()
    core.registerProvider(
      buildProvider(
        'early-image-fast',
        async () =>
          ({
            items: [buildItem('early-app', 'early-image-fast', 'Unrelated application')]
          }) as TuffSearchResult
      ) as never
    )
    core.registerProvider({
      ...buildProvider('early-image-deferred', async () => {
        await deferred.promise
        return new TuffSearchResultBuilder({ text: '宠物', inputs: [] } as TuffQuery)
          .setItems([])
          .build()
      }),
      priority: 'deferred',
      type: 'file'
    } as never)
    core.activateProviders([
      { id: 'early-image-fast' },
      { id: 'early-image-deferred' }
    ] as IProviderActivate[])
    const streamed: TuffItem[] = []
    let completed = false
    const operation = core.startSearch({ text: '宠物', inputs: [] } as TuffQuery, {
      caller: { kind: 'core-box', id: 'early-deferred-image' },
      sink: {
        update: (payload) => {
          streamed.push(...payload.items)
        },
        complete: () => {
          completed = true
        }
      }
    })
    try {
      expect((await operation.result).items.map((item) => item.id)).toEqual(['early-app'])
      await vi.waitFor(() => expect(fixture.recall).toHaveBeenCalled())
      await Promise.race([fixture.entered.promise, fixture.settled.promise])
      fixture.answer.resolve()
      await vi.waitFor(() => expect(streamed.map((item) => item.id)).toContain(fixture.path))
      expect(completed).toBe(false)
      expect(streamed.find((item) => item.id === fixture.path)?.meta?.deepMatch).toEqual({
        kind: 'semantic',
        score: 1
      })
      deferred.resolve()
      await operation.completed
      expect(completed).toBe(true)
    } finally {
      fixture.answer.resolve()
      deferred.resolve()
      await operation.completed
      if (fixture.recall.mock.calls.length > 0) await fixture.settled.promise
      fixture.recall.mockRestore()
      await fixture.close()
    }
  })

  it('completes a cancelled all-fast search without waiting for late image inference or publishing it', async () => {
    // A static import would refer to the provider before the fixture's module-boundary reset.
    const { fileProvider } = await import('../addon/files/file-provider')
    const fixture = await installLateImageRecall(fileProvider)
    core.registerProvider(
      buildProvider('image-cancel-fast', async () =>
        new TuffSearchResultBuilder({ text: '猫', inputs: [] } as TuffQuery).setItems([]).build()
      ) as never
    )
    core.activateProviders([{ id: 'image-cancel-fast' }] as IProviderActivate[])
    const streamed: TuffItem[] = []
    let cancelled = false
    const operation = core.startSearch({ text: '猫', inputs: [] } as TuffQuery, {
      caller: { kind: 'core-box', id: 'cancel-late-image' },
      sink: {
        update: (payload) => {
          streamed.push(...payload.items)
        },
        complete: (payload) => {
          cancelled = payload.cancelled === true
        }
      }
    })
    try {
      await operation.result
      await Promise.race([fixture.entered.promise, operation.completed])
      expect(operation.cancel()).toBe(true)
      await operation.completed
      expect(cancelled).toBe(true)
      expect(streamed.map((item) => item.id)).not.toContain(fixture.path)
      fixture.answer.resolve()
      await fixture.settled.promise
      expect(streamed.map((item) => item.id)).not.toContain(fixture.path)
    } finally {
      operation.cancel()
      fixture.answer.resolve()
      await operation.completed
      if (fixture.recall.mock.calls.length > 0) await fixture.settled.promise
      fixture.recall.mockRestore()
      await fixture.close()
    }
  })

  it.each(['ab', '🐈'])(
    'does not launch semantic inference for the short non-Han engine query %s',
    async (text) => {
      // A static import would retain the provider from before beforeEach's module-boundary reset.
      const { fileProvider } = await import('../addon/files/file-provider')
      const recall = vi.spyOn(fileProvider, 'semanticRecall').mockResolvedValue([])
      core.registerProvider(
        buildProvider('short-query-contract', async () =>
          new TuffSearchResultBuilder({ text, inputs: [] } as TuffQuery).setItems([]).build()
        ) as never
      )
      core.activateProviders([{ id: 'short-query-contract' }] as IProviderActivate[])
      const operation = core.startSearch({ text, inputs: [] } as TuffQuery, {
        caller: { kind: 'core-box', id: 'short-query-contract' }
      })
      try {
        expect((await operation.result).items).toEqual([])
        await operation.completed
        expect(recall).not.toHaveBeenCalled()
      } finally {
        await operation.completed
        recall.mockRestore()
      }
    }
  )

  it('caches what the session ended with so a repeat query keeps the deferred batch', async () => {
    const fastSearch = vi.fn(
      async () => ({ items: [buildItem('fast-item', 'fast-provider', 'accumulated')] }) as never
    )
    const deferredSearch = vi.fn(
      async () =>
        ({ items: [buildItem('deferred-item', 'deferred-provider', 'accumulated file')] }) as never
    )
    const query = { inputs: [], text: 'accumulated cache contract' } as TuffQuery

    core.registerProvider(buildProvider('fast-provider', fastSearch) as never)
    core.registerProvider({
      ...buildProvider('deferred-provider', deferredSearch),
      priority: 'deferred',
      type: 'file'
    } as never)
    core.activateProviders([
      { id: 'fast-provider' },
      { id: 'deferred-provider' }
    ] as IProviderActivate[])

    const first = core.startSearch(query, { caller: { kind: 'core-box', id: 'accumulated-first' } })
    await first.result
    await first.completed

    const snapshots: TuffSearchResult[] = []
    const second = core.startSearch(query, {
      caller: { kind: 'core-box', id: 'accumulated-second' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        }
      }
    })
    await second.result
    await second.completed

    expect(deferredSearch).toHaveBeenCalledTimes(1)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].items.map((item) => item.id).sort()).toEqual(['deferred-item', 'fast-item'])
  })

  it('publishes each gather batch once with its enrichment already applied', async () => {
    const fastSearch = vi.fn(
      async () => ({ items: [buildItem('single-fast', 'fast-provider', 'single push')] }) as never
    )
    const deferredSearch = vi.fn(
      async () =>
        ({
          items: [buildItem('single-deferred', 'deferred-provider', 'single push file')]
        }) as never
    )
    const query = { inputs: [], text: 'single publish contract' } as TuffQuery

    core.registerProvider(buildProvider('fast-provider', fastSearch) as never)
    core.registerProvider({
      ...buildProvider('deferred-provider', deferredSearch),
      priority: 'deferred',
      type: 'file'
    } as never)
    core.activateProviders([
      { id: 'fast-provider' },
      { id: 'deferred-provider' }
    ] as IProviderActivate[])
    state.getAllPinnedItems.mockResolvedValue([
      {
        itemId: 'single-deferred',
        order: 0,
        pinnedAt: new Date(),
        sourceId: 'deferred-provider',
        sourceType: 'file'
      }
    ])

    const snapshots: TuffSearchResult[] = []
    const updates: TuffItem[][] = []
    const execution = core.startSearch(query, {
      caller: { kind: 'core-box', id: 'single-publish' },
      sink: {
        snapshot: (result) => {
          snapshots.push(result)
        },
        update: (payload) => {
          updates.push(payload.items)
        }
      }
    })
    await execution.result
    await execution.completed

    expect(snapshots).toHaveLength(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].map((item) => item.id)).toEqual(['single-deferred'])
    expect(updates[0][0].scoring).toMatchObject({ pinned: true, final: expect.any(Number) })
    expect(snapshots[0].items[0].scoring?.final).toEqual(expect.any(Number))
  })

  it('does not cache a result that completed after its search revision was superseded', () => {
    const harness = core as unknown as {
      cacheSearchResult: (cacheKey: string, result: TuffSearchResult, revision: number) => void
      searchCache: Map<string, unknown>
    }
    const searchRevision = searchIndexCommitHub.getRevision()
    searchIndexCommitHub.markCommitted(['file-provider'])

    harness.cacheSearchResult(
      'stale-search-revision',
      {
        items: [buildItem('stale-item', 'stale-provider', 'Stale result')],
        sources: []
      } as unknown as TuffSearchResult,
      searchRevision
    )

    expect(harness.searchCache.has('stale-search-revision')).toBe(false)
  })

  it('does not reuse an identical query cache entry after an index commit revision advances', async () => {
    const search = vi.fn(
      async () =>
        ({ items: [buildItem('revision-item', 'revision-provider', 'Revision result')] }) as never
    )
    const query = { inputs: [], text: 'revision cache contract' } as TuffQuery
    core.registerProvider(buildProvider('revision-provider', search) as never)
    core.activateProviders([{ id: 'revision-provider' }] as IProviderActivate[])

    const first = core.startSearch(query, { caller: { kind: 'core-box', id: 'revision-first' } })
    await first.result
    await first.completed
    searchIndexCommitHub.markCommitted(['file-provider'])

    const second = core.startSearch(query, { caller: { kind: 'core-box', id: 'revision-second' } })
    await second.result
    await second.completed

    expect(search).toHaveBeenCalledTimes(2)
  })

  /**
   * The first end-to-end read of the cache counters (#346).
   *
   * `search-cache-telemetry.test.ts` covers the counter object thoroughly, and
   * `getSearchCacheTelemetry` had exactly one reference in the repository -- its own declaration.
   * So every `recordHit` / `recordMiss` / `recordInvalidation` call site in search-core was
   * unverified: the counters incremented into a snapshot nobody obtained, which reads the same as
   * counters that were never wired at all.
   *
   * The reason distribution is the part #346 turns on. A miss attributed to `absent` says "nobody
   * repeated this query", which argues for removing the cache; one attributed to
   * `revision-mismatch` says "the index denied a repeat that would otherwise have hit", which
   * argues the opposite. This records which reason an index commit actually produces.
   */
  it('attributes a repeat denied by an index commit, and pins which reason it used', async () => {
    const search = vi.fn(
      async () =>
        ({ items: [buildItem('telemetry-item', 'telemetry-provider', 'Telemetry')] }) as never
    )
    core.registerProvider(buildProvider('telemetry-provider', search) as never)
    core.activateProviders([{ id: 'telemetry-provider' }] as IProviderActivate[])

    const run = async (text: string, id: string): Promise<void> => {
      const session = core.startSearch({ inputs: [], text } as TuffQuery, {
        caller: { kind: 'core-box', id }
      })
      await session.result
      await session.completed
    }

    // Two distinct queries, so the commit drops two entries. One entry cannot tell "counted per
    // entry dropped" from "counted per call", and both readings are one line apart in the source.
    await run('cache telemetry alpha', 'telemetry-alpha-cold')
    await run('cache telemetry beta', 'telemetry-beta-cold')
    await run('cache telemetry alpha', 'telemetry-alpha-warm')
    searchIndexCommitHub.markCommitted(['telemetry-provider'])
    await run('cache telemetry alpha', 'telemetry-alpha-after-commit')

    const snapshot = core.getSearchCacheTelemetry()

    // The counters reach the snapshot at all: four lookups, and the third one served.
    expect(snapshot.lookups).toBe(4)
    expect(snapshot.hits).toBe(1)
    expect(snapshot.hitRate).toBeCloseTo(1 / 4, 5)

    // Exactly two, because two entries were in the cache. Counted by entries dropped rather than
    // by calls -- a per-call implementation reports 1 here.
    // One entry was superseded and dropped at its own lookup; the other was never asked for.
    expect(snapshot.entriesDropped).toBe(1)

    /*
     * The attribution #346 turns on, and the reason this test exists.
     *
     * `revision-mismatch` used to be unreachable: the commit listener cleared the whole cache
     * before returning, so by the time a lookup compared revisions the entry was gone and the miss
     * was filed as `absent` — the same bucket as a query nobody repeated. A report built on that
     * distribution reads "nobody repeats queries, remove the cache" when the truth may be the
     * opposite.
     *
     * Entries now survive the commit and are rejected — and dropped — at lookup, so the reason is
     * counted where it happens.
     */
    expect(snapshot.misses['revision-mismatch']).toBe(1)
    expect(snapshot.misses.absent).toBe(2)
    expect(snapshot.invalidations['index-commit']).toBe(1)

    /*
     * Asking again hits, because the miss that reported `revision-mismatch` re-ran the search and
     * re-cached it at the new revision. One `revision-mismatch` per commit per query, not one per
     * lookup — which is the behaviour the report wants, and it is asserted because the alternative
     * (the stale entry surviving and mismatching forever) would inflate the count.
     *
     * Note this cannot observe the `searchCache.delete` itself: the re-cache overwrites the same
     * key either way. The delete is kept for the paths that do not re-cache — an aborted or failed
     * search — where the superseded entry would otherwise hold its slot until the TTL.
     */
    await run('cache telemetry alpha', 'telemetry-after-drop')
    const afterDrop = core.getSearchCacheTelemetry()
    expect(afterDrop.misses['revision-mismatch']).toBe(1)
    expect(afterDrop.misses.absent).toBe(2)
    expect(afterDrop.hits).toBe(2)
  })

  /**
   * The counters are readable from outside the process now (#346).
   *
   * `getSearchCacheTelemetry` had one reference — its own declaration — so the report that issue
   * asks for could not be produced from a real session. This asserts the transport handler is
   * registered and returns the live snapshot, not a fresh one.
   */
  it('exposes the cache counters over the transport', async () => {
    const search = vi.fn(
      async () => ({ items: [buildItem('tel-item', 'tel-provider', 'Telemetry')] }) as never
    )
    core.registerProvider(buildProvider('tel-provider', search) as never)
    core.activateProviders([{ id: 'tel-provider' }] as IProviderActivate[])

    const handler = [...state.transportHandlers.entries()].find(([event]) => {
      const transportEvent = event as { toEventName?: () => string }
      return transportEvent.toEventName?.() === CoreBoxEvents.search.cacheTelemetry.toEventName()
    })?.[1] as (() => Promise<{ lookups: number; hits: number }>) | undefined

    expect(handler, 'cacheTelemetry handler is registered').toBeTypeOf('function')

    const before = await handler!()
    expect(before.lookups).toBe(0)

    const session = core.startSearch(
      { inputs: [], text: 'telemetry over transport' } as TuffQuery,
      {
        caller: { kind: 'core-box', id: 'tel-1' }
      }
    )
    await session.result
    await session.completed

    const after = await handler!()
    expect(after.lookups).toBe(1)
  })

  /**
   * The one real cost of not clearing on commit, measured rather than asserted in prose (#346).
   *
   * Superseded entries stay until something drops them, so the question is whether they can
   * accumulate. They cannot: the cache is bounded at SEARCH_CACHE_MAX_SIZE and eviction picks the
   * oldest timestamp, which after a commit is a stale entry — so it drains stale-first, one per
   * insert, and no stale entry is ever served because the outcome is computed before the hit
   * branch.
   */
  it('stays bounded after a commit and never serves a superseded entry', async () => {
    const search = vi.fn(
      async () => ({ items: [buildItem('bound-item', 'bound-provider', 'Bounded')] }) as never
    )
    core.registerProvider(buildProvider('bound-provider', search) as never)
    core.activateProviders([{ id: 'bound-provider' }] as IProviderActivate[])

    const run = async (text: string): Promise<void> => {
      const session = core.startSearch({ inputs: [], text } as TuffQuery, {
        caller: { kind: 'core-box', id: `bound-${text}` }
      })
      await session.result
      await session.completed
    }

    // Fill past the bound, then supersede everything at once.
    for (let index = 0; index < 120; index += 1) await run(`bounded query ${index}`)
    searchIndexCommitHub.markCommitted(['bound-provider'])

    // Drain with fresh keys; each insert evicts one, oldest first.
    for (let index = 0; index < 40; index += 1) await run(`drained query ${index}`)

    const snapshot = core.getSearchCacheTelemetry()
    // Never served: every lookup was either absent or a revision mismatch, no hit on a stale entry.
    expect(snapshot.hits).toBe(0)
    expect(snapshot.misses['revision-mismatch']).toBe(0)
    // The bound held: evictions happened, which is only possible if the cache stayed at its cap.
    expect(snapshot.invalidations['lru-evict']).toBeGreaterThan(0)
  }, 60_000)

  it('invalidates the recommendation ranking on an app index commit but not a file one', () => {
    // A newly installed app has to be recommendable before the 30-minute
    // ranking cache expires; file commits fire throughout indexing, so they are
    // throttled rather than invalidating outright.
    searchIndexCommitHub.markCommitted(['app-provider'])
    expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
  })

  it('coalesces a storm of file commits into one ranking invalidation', () => {
    // A first scan of a large folder emits a commit per batch. Without the throttle each one drops
    // the cache and restarts a full recompute — the reason files were excluded entirely before.
    for (let i = 0; i < 200; i += 1) {
      searchIndexCommitHub.markCommitted(['file-provider'])
    }

    expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
  })

  /**
   * The throttle above used to keep only its leading edge: a file committed inside the window of
   * the previous invalidation was dropped, so a screenshot saved 10s after one stayed out of the
   * empty-query grid until some later commit happened to land past the 60s mark.
   */
  describe('trailing ranking invalidation for file commits', () => {
    const FILE_INVALIDATION_WINDOW_MS = 60_000

    function openStream(): { emit: ReturnType<typeof vi.fn>; close: () => void } {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)
      return { emit, close: () => abort.abort() }
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('answers a file commit held inside the window with one invalidation when it closes', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(10_000)
      searchIndexCommitHub.markCommitted(['file-provider'])
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(FILE_INVALIDATION_WINDOW_MS - 10_000 - 1)
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(2)
    })

    it('tells open CoreBox streams to refresh the grid when the trailing invalidation runs', async () => {
      const stream = openStream()

      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(10_000)
      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      // The held commit was reported plainly: the grid had not been invalidated for it yet.
      expect(stream.emit).toHaveBeenCalledTimes(2)
      expect(stream.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ recommendationsInvalidated: false })
      )

      await vi.advanceTimersByTimeAsync(
        FILE_INVALIDATION_WINDOW_MS - 10_000 - INDEX_COMMIT_NOTIFY_WINDOW_MS
      )
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      expect(stream.emit).toHaveBeenCalledTimes(3)
      expect(stream.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ recommendationsInvalidated: true, providerIds: [] })
      )

      stream.close()
    })

    it('folds every commit held inside one window into a single trailing invalidation', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      for (let index = 0; index < 100; index += 1) {
        searchIndexCommitHub.markCommitted(['file-provider'])
        await vi.advanceTimersByTimeAsync(100)
      }
      await vi.advanceTimersByTimeAsync(10 * FILE_INVALIDATION_WINDOW_MS)

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(2)
    })

    it('schedules no trailing invalidation when the window held nothing', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(10 * FILE_INVALIDATION_WINDOW_MS)

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
    })

    it('keeps a continuous commit stream to one invalidation per window', async () => {
      for (let second = 0; second < 300; second += 1) {
        searchIndexCommitHub.markCommitted(['file-provider'])
        await vi.advanceTimersByTimeAsync(1_000)
      }

      // The leading run, then one trailing run as each of the next five windows closes.
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(6)
    })

    it('still invalidates an app commit at once while a file window is open', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      searchIndexCommitHub.markCommitted(['file-provider'])
      searchIndexCommitHub.markCommitted(['app-provider'])

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(2)
    })

    it('keeps pacing the next window after a trailing invalidation fails', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      searchIndexCommitHub.markCommitted(['file-provider'])
      state.invalidateRecommendationCache.mockImplementationOnce(() => {
        throw new Error('ranking cache unavailable')
      })

      // A throw escaping the timer callback would reject this advance.
      await vi.advanceTimersByTimeAsync(FILE_INVALIDATION_WINDOW_MS)
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(2)

      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(FILE_INVALIDATION_WINDOW_MS)
      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(3)
    })

    it('drops a held trailing invalidation when the facade is destroyed', async () => {
      searchIndexCommitHub.markCommitted(['file-provider'])
      searchIndexCommitHub.markCommitted(['file-provider'])

      const destroy = core.destroy()
      await vi.advanceTimersByTimeAsync(2 * FILE_INVALIDATION_WINDOW_MS)
      await destroy

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
    })
  })

  it('notifies open CoreBox streams about hydrated app-icon presentation without mutating the index', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)
      const revision = searchIndexCommitHub.getRevision()

      core.invalidateAppRecommendationPresentation()
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)

      expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith({
        revision,
        providerIds: [],
        sourceGenerations: {},
        committedAt: expect.any(Number),
        recommendationsInvalidated: true
      })
      expect(searchIndexCommitHub.getRevision()).toBe(revision)

      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('flags the first file commit for renderers and stays quiet for the rest', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)

      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      expect(emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ recommendationsInvalidated: true })
      )

      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      expect(emit).toHaveBeenCalledTimes(2)
      expect(emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ recommendationsInvalidated: false })
      )

      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells subscribed renderers which commits changed the recommendation grid', async () => {
    // Dropping the cache is invisible to an already-open CoreBox: the renderer's index-commit
    // refresh skips the empty query unless it is told the grid actually changed. Deriving that
    // renderer-side from providerIds would either miss it or re-query on every file commit.
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)

      searchIndexCommitHub.markCommitted(['app-provider'])
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      expect(emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ recommendationsInvalidated: true })
      )

      // The original payload fields must survive the enrichment.
      expect(emit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          providerIds: ['app-provider'],
          revision: expect.any(Number),
          committedAt: expect.any(Number)
        })
      )

      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * The refresh storm (2026-09-26): a non-empty CoreBox query reruns in full on every notification,
   * and a scan commits every ~100-300ms, so the list re-searched back-to-back while it ran. The
   * hub revision is what keeps cached results honest, so it must still move on every commit; only
   * what reaches the renderer is paced.
   */
  it('folds a commit storm into a bounded number of stream notifications while the revision moves on every commit', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)
      const startRevision = searchIndexCommitHub.getRevision()

      for (let index = 1; index <= 100; index += 1) {
        searchIndexCommitHub.markCommitted(['file-provider'])
        expect(searchIndexCommitHub.getRevision()).toBe(startRevision + index)
        await vi.advanceTimersByTimeAsync(100)
      }
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS)

      expect(emit.mock.calls.length).toBeGreaterThanOrEqual(1)
      expect(emit.mock.calls.length).toBeLessThanOrEqual(4)
      // The last notification covers the newest commit, so nothing committed is left unannounced.
      expect(emit).toHaveBeenLastCalledWith(
        expect.objectContaining({ revision: startRevision + 100, bulk: true })
      )

      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('widens the very first window while a full file scan is running', async () => {
    vi.useFakeTimers()
    state.fileProviderIndexingStatus.mockReturnValue({ isInitializing: true })
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)

      searchIndexCommitHub.markCommitted(['file-provider'])
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_WINDOW_MS)
      expect(emit).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(
        INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS - INDEX_COMMIT_NOTIFY_WINDOW_MS
      )
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ bulk: true }))

      abort.abort()
    } finally {
      state.fileProviderIndexingStatus.mockReturnValue({ isInitializing: false })
      vi.useRealTimers()
    }
  })

  it('drops the pending notification of a stream the renderer closed', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const abort = new AbortController()
      core.registerIndexCommitStream({
        emit,
        end: vi.fn(),
        error: vi.fn(),
        isCancelled: () => abort.signal.aborted,
        signal: abort.signal
      } as never)

      searchIndexCommitHub.markCommitted(['file-provider'])
      abort.abort()
      await vi.advanceTimersByTimeAsync(INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS)

      expect(emit).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans initialized index and provider resources when the facade is destroyed', async () => {
    const providerDestroy = vi.fn()
    core.registerProvider({
      ...buildProvider(
        'destroyable-provider',
        vi.fn(async () => ({ items: [] }) as never)
      ),
      onDestroy: providerDestroy
    } as never)
    const togglePin = [...state.transportHandlers.entries()].find(([event]) => {
      const transportEvent = event as { toEventName?: () => string }
      return transportEvent.toEventName?.() === CoreBoxEvents.item.togglePin.toEventName()
    })?.[1] as
      | ((payload: { itemId: string; sourceId: string; sourceType: string }) => Promise<unknown>)
      | undefined

    expect(togglePin).toBeTypeOf('function')
    await expect(
      togglePin?.({ itemId: 'item-1', sourceId: 'provider-1', sourceType: 'app' })
    ).resolves.toEqual({
      isPinned: true,
      success: true
    })

    await core.destroy()

    expect(state.togglePin).toHaveBeenCalledWith('provider-1', 'item-1', 'app')
    expect(state.invalidateRecommendationCache).toHaveBeenCalledTimes(1)
    expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
    expect(state.fileProviderResetDelegate).toHaveBeenLastCalledWith(null)
    expect(state.forceFlushUsageQueue).toHaveBeenCalledTimes(1)
    expect(providerDestroy).toHaveBeenCalledTimes(1)
    expect(state.touchEventOff).toHaveBeenCalledWith('FILE_ADDED', expect.any(Function))
  })

  it.each([
    {
      name: 'Runtime admitted task',
      reject: () =>
        state.indexingRuntimeDrainAdmittedTasks.mockRejectedValueOnce(
          new Error('admitted task drain failed')
        )
    },
    {
      name: 'App source mutation',
      reject: () =>
        state.appRuntimeDrainMutations.mockRejectedValueOnce(new Error('app mutation drain failed'))
    },
    {
      name: 'File producer',
      reject: () =>
        state.fileProviderPrepareForShutdown.mockRejectedValueOnce(new Error('file drain failed'))
    }
  ])(
    'fails closed when the $name drain rejects and allows a later teardown retry',
    async ({ reject }) => {
      const coreHarness = core as unknown as {
        providerRegistry: { destroy: () => Promise<void> }
      }
      const providerRegistryDestroy = vi.spyOn(coreHarness.providerRegistry, 'destroy')
      state.appProviderRuntimeDelegate.mockClear()
      state.fileProviderResetDelegate.mockClear()
      state.fileProviderMutationDelegate.mockClear()
      state.fileProviderPersistencePort.mockClear()

      reject()

      await expect(core.destroy()).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

      expect(providerRegistryDestroy).not.toHaveBeenCalled()
      expect(state.appProviderRuntimeDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderResetDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderMutationDelegate).not.toHaveBeenCalledWith(null)
      expect(state.fileProviderPersistencePort).not.toHaveBeenCalledWith(null)
      expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
      // The writer begins its bounded close independently of these drains: it is the abort that
      // releases a scan parked on the writer, so it must not be sequenced behind them.
      expect(state.writerBeginShutdown).toHaveBeenCalledTimes(1)

      await core.destroy()

      expect(providerRegistryDestroy).toHaveBeenCalledTimes(1)
      expect(state.appProviderRuntimeDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderResetDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderMutationDelegate).toHaveBeenCalledWith(null)
      expect(state.fileProviderPersistencePort).toHaveBeenCalledWith(null)
      expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
      expect(state.writerBeginShutdown).toHaveBeenCalledTimes(2)
      providerRegistryDestroy.mockRestore()
    }
  )

  it.each([
    { name: 'App', sourceId: 'app-provider' },
    { name: 'File', sourceId: 'file-provider' }
  ])(
    'fails closed when the $name source scan abort drain times out, then succeeds after that scan releases',
    async ({ sourceId }) => {
      const scanDrainStarted = Promise.withResolvers<void>()
      const releaseTimedOutDrain = Promise.withResolvers<void>()
      const scanReleased = Promise.withResolvers<void>()
      let retryAfterRelease = false
      const coreHarness = core as unknown as {
        providerRegistry: { destroy: () => Promise<void> }
      }
      const providerRegistryDestroy = vi.spyOn(coreHarness.providerRegistry, 'destroy')
      state.appProviderRuntimeDelegate.mockClear()
      state.fileProviderResetDelegate.mockClear()
      state.fileProviderMutationDelegate.mockClear()
      state.fileProviderPersistencePort.mockClear()
      state.clearIndexingRuntime.mockClear()
      state.writerBeginShutdown.mockClear()
      state.appRuntimeAbortAndDrain.mockImplementation(async (drainedSourceId: string) => {
        if (drainedSourceId !== sourceId) return
        if (!retryAfterRelease) {
          scanDrainStarted.resolve()
          await releaseTimedOutDrain.promise
          throw new Error(`INDEXED_SOURCE_SCAN_DRAIN_TIMEOUT:${sourceId}`)
        }
        await scanReleased.promise
      })

      try {
        const destroy = core.destroy()
        await scanDrainStarted.promise

        expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(1, 'app-provider')
        expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(2, 'file-provider')
        // The scan drain here is parked on a writer the blocked scan is holding: the writer's
        // bounded close must already have begun, or destroy would wait on its own abort.
        expect(state.writerBeginShutdown).toHaveBeenCalledTimes(1)

        releaseTimedOutDrain.resolve()
        await expect(destroy).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

        expect(providerRegistryDestroy).not.toHaveBeenCalled()
        expect(state.appProviderRuntimeDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderResetDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderMutationDelegate).not.toHaveBeenCalledWith(null)
        expect(state.fileProviderPersistencePort).not.toHaveBeenCalledWith(null)
        expect(state.clearIndexingRuntime).not.toHaveBeenCalled()

        retryAfterRelease = true
        scanReleased.resolve()
        await expect(core.destroy()).resolves.toBeUndefined()

        expect(providerRegistryDestroy).toHaveBeenCalledTimes(1)
        expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
        // One begin per destroy attempt; the writer's own promise caching is what makes the
        // second attempt a no-op, and that is covered against the real writer.
        expect(state.writerBeginShutdown).toHaveBeenCalledTimes(2)
      } finally {
        state.appRuntimeAbortAndDrain.mockImplementation(async () => undefined)
        providerRegistryDestroy.mockRestore()
      }
    }
  )

  it('starts the writer shutdown before awaiting producers while App producers, scan aborts, and mutation drains run concurrently', async () => {
    const lifecycle: string[] = []
    const appProducerStopStarted = Promise.withResolvers<void>()
    const appProducerStop = Promise.withResolvers<void>()
    const appProducerStopped = Promise.withResolvers<void>()
    const initialAppScanController = new AbortController()
    const initialAppScanSettled = Promise.withResolvers<void>()
    const appRuntimeDrainStarted = Promise.withResolvers<void>()
    const appRuntimeDrain = Promise.withResolvers<void>()
    const appRuntimeDrained = Promise.withResolvers<void>()
    const appMutationDrainStarted = Promise.withResolvers<void>()
    const appMutationDrain = Promise.withResolvers<void>()
    const fileShutdownPreparationStarted = Promise.withResolvers<void>()
    const fileShutdownPreparation = Promise.withResolvers<void>()
    const fileShutdownPrepared = Promise.withResolvers<void>()
    const harness = core as unknown as {
      initialAppScanController: AbortController | null
      initialAppScanPromise: Promise<void> | null
    }

    initialAppScanController.signal.addEventListener(
      'abort',
      () => {
        lifecycle.push('app-scan-aborted')
        initialAppScanSettled.resolve()
      },
      { once: true }
    )
    harness.initialAppScanController = initialAppScanController
    harness.initialAppScanPromise = initialAppScanSettled.promise
    state.appProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('app-producer-stop-started')
      appProducerStopStarted.resolve()
      await appProducerStop.promise
      lifecycle.push('app-producer-stopped')
      appProducerStopped.resolve()
    })
    state.appRuntimeAbortAndDrain.mockImplementationOnce(async () => {
      lifecycle.push('app-runtime-drain-started')
      appRuntimeDrainStarted.resolve()
      await appRuntimeDrain.promise
      lifecycle.push('app-runtime-drained')
      appRuntimeDrained.resolve()
    })
    state.appRuntimeDrainMutations.mockImplementationOnce(async () => {
      lifecycle.push('app-mutation-drain-started')
      appMutationDrainStarted.resolve()
      await appMutationDrain.promise
      lifecycle.push('app-mutation-drained')
    })
    state.fileProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('file-shutdown-preparation-started')
      fileShutdownPreparationStarted.resolve()
      await fileShutdownPreparation.promise
      lifecycle.push('file-shutdown-prepared')
      fileShutdownPrepared.resolve()
    })
    state.clearIndexingRuntime.mockImplementationOnce(() => {
      lifecycle.push('runtime-cleared')
    })
    state.writerBeginShutdown.mockImplementationOnce(async () => {
      lifecycle.push('writer-shutdown-started')
    })

    const destroy = core.destroy()
    await Promise.all([
      appProducerStopStarted.promise,
      appRuntimeDrainStarted.promise,
      fileShutdownPreparationStarted.promise
    ])

    // The writer's bounded close is the abort that releases a scan parked on a wedged worker, so
    // it starts before this method awaits anything -- not after every producer has drained.
    expect(lifecycle[0]).toBe('writer-shutdown-started')
    expect(lifecycle).toEqual([
      'writer-shutdown-started',
      'app-producer-stop-started',
      'app-scan-aborted',
      'app-runtime-drain-started',
      'file-shutdown-preparation-started'
    ])
    expect(initialAppScanController.signal.aborted).toBe(true)
    expect(state.appRuntimeAbortAndDrain).toHaveBeenCalledWith('app-provider')
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()

    appProducerStop.resolve()
    fileShutdownPreparation.resolve()
    await Promise.all([appProducerStopped.promise, fileShutdownPrepared.promise])

    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()

    appRuntimeDrain.resolve()
    await Promise.all([appRuntimeDrained.promise, appMutationDrainStarted.promise])

    expect(state.appRuntimeDrainMutations).toHaveBeenCalledWith('app-provider')
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()

    appMutationDrain.resolve()
    await destroy

    expect(lifecycle).toEqual([
      'writer-shutdown-started',
      'app-producer-stop-started',
      'app-scan-aborted',
      'app-runtime-drain-started',
      'file-shutdown-preparation-started',
      'app-producer-stopped',
      'file-shutdown-prepared',
      'app-runtime-drained',
      'app-mutation-drain-started',
      'app-mutation-drained',
      'runtime-cleared'
    ])
  })

  it('rejects initialization after destruction as a terminal lifecycle', async () => {
    await core.destroy()

    expect(() => core.init({ app: { channel: {} } } as never)).toThrow('SEARCH_CORE_DESTROYED')
  })

  it('closes Runtime admission before producer shutdown and waits for admitted tasks and both source drains before clearing Runtime', async () => {
    const lifecycle: string[] = []
    const appScanController = new AbortController()
    const appScanSettled = Promise.withResolvers<void>()
    const appProducerStopped = Promise.withResolvers<void>()
    const fileShutdownStarted = Promise.withResolvers<void>()
    const releaseFileShutdown = Promise.withResolvers<void>()
    const fileShutdownPrepared = Promise.withResolvers<void>()
    const admittedDrainStarted = Promise.withResolvers<void>()
    const releaseAdmittedDrain = Promise.withResolvers<void>()
    const admittedDrainFinished = Promise.withResolvers<void>()
    const sourceDrainsStarted = Promise.withResolvers<void>()
    const harness = core as unknown as {
      initialAppScanController: AbortController | null
      initialAppScanPromise: Promise<void> | null
    }
    let sourceDrainCount = 0
    const recordSourceDrain = async (sourceId?: string): Promise<undefined> => {
      lifecycle.push(`source-drain:${sourceId}`)
      sourceDrainCount += 1
      if (sourceDrainCount === 2) sourceDrainsStarted.resolve()
      return undefined
    }

    appScanController.signal.addEventListener(
      'abort',
      () => {
        lifecycle.push('app-scan-stopped')
        appScanSettled.resolve()
      },
      { once: true }
    )
    harness.initialAppScanController = appScanController
    harness.initialAppScanPromise = appScanSettled.promise
    state.indexingRuntimeBeginShutdown.mockImplementationOnce(() => {
      lifecycle.push('admission-closed')
    })
    state.appProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('app-producer-stopped')
      appProducerStopped.resolve()
    })
    state.fileProviderPrepareForShutdown.mockImplementationOnce(async () => {
      lifecycle.push('file-shutdown-started')
      fileShutdownStarted.resolve()
      await releaseFileShutdown.promise
      lifecycle.push('file-shutdown-prepared')
      fileShutdownPrepared.resolve()
    })
    state.indexingRuntimeDrainAdmittedTasks.mockImplementationOnce(async () => {
      lifecycle.push('admitted-drain-started')
      admittedDrainStarted.resolve()
      await releaseAdmittedDrain.promise
      lifecycle.push('admitted-drain-finished')
      admittedDrainFinished.resolve()
    })
    state.indexingRuntimeDrainTaskStateWrites.mockImplementationOnce(async () => {
      lifecycle.push('task-state-drained')
    })
    state.appRuntimeDrainMutations
      .mockImplementationOnce(recordSourceDrain)
      .mockImplementationOnce(recordSourceDrain)
    state.clearIndexingRuntime.mockImplementationOnce(() => {
      lifecycle.push('runtime-cleared')
    })
    state.writerBeginShutdown.mockImplementationOnce(async () => {
      lifecycle.push('writer-shutdown-started')
    })

    const destroy = core.destroy()
    await Promise.all([
      appProducerStopped.promise,
      appScanSettled.promise,
      fileShutdownStarted.promise,
      admittedDrainStarted.promise
    ])

    expect(lifecycle[0]).toBe('admission-closed')
    expect(lifecycle).toContain('writer-shutdown-started')
    expect(lifecycle).toContain('app-producer-stopped')
    expect(lifecycle).toContain('app-scan-stopped')
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()
    expect(state.indexingRuntimeDrainTaskStateWrites).not.toHaveBeenCalled()

    releaseAdmittedDrain.resolve()
    await admittedDrainFinished.promise
    await vi.waitFor(() =>
      expect(state.indexingRuntimeDrainTaskStateWrites).toHaveBeenCalledTimes(1)
    )
    expect(state.appRuntimeDrainMutations).not.toHaveBeenCalled()
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()

    releaseFileShutdown.resolve()
    await Promise.all([fileShutdownPrepared.promise, sourceDrainsStarted.promise])

    expect(state.appRuntimeDrainMutations).toHaveBeenNthCalledWith(1, 'app-provider')
    expect(state.appRuntimeDrainMutations).toHaveBeenNthCalledWith(2, 'file-provider')
    expect(state.clearIndexingRuntime).not.toHaveBeenCalled()

    await destroy

    // Runtime stays alive until every source drain settles; the writer began long before that.
    expect(lifecycle.slice(-1)).toEqual(['runtime-cleared'])
    expect(lifecycle.indexOf('writer-shutdown-started')).toBeLessThan(
      lifecycle.indexOf('admitted-drain-started')
    )
    expect(lifecycle.indexOf('admitted-drain-finished')).toBeLessThan(
      lifecycle.indexOf('task-state-drained')
    )
    expect(lifecycle.indexOf('task-state-drained')).toBeLessThan(
      lifecycle.indexOf('runtime-cleared')
    )
  })

  it('initiates source-scan cancellation before awaiting session destruction so a blocked session drain cannot deadlock destroy', async () => {
    const lifecycle: string[] = []
    const sessionDestroyStarted = Promise.withResolvers<void>()
    const scanCancellationInitiated = Promise.withResolvers<void>()
    const harness = core as unknown as {
      sessionRegistry: { destroy: () => Promise<void> }
    }
    // A live search session's drain can only settle once the active index scan it depends on is
    // aborted (the coalesced watcher route parked on the mutation gate the scan holds). Awaiting
    // session destruction before cancelling the scan therefore deadlocks the whole quit path.
    const sessionDestroy = vi
      .spyOn(harness.sessionRegistry, 'destroy')
      .mockImplementationOnce(async () => {
        lifecycle.push('session-destroy-wait')
        sessionDestroyStarted.resolve()
        await scanCancellationInitiated.promise
        lifecycle.push('session-destroyed')
      })
    state.appRuntimeAbortAndDrain.mockImplementation(async (sourceId: string) => {
      lifecycle.push(`scan-abort-initiated:${sourceId}`)
      scanCancellationInitiated.resolve()
    })
    state.clearIndexingRuntime.mockImplementation(() => {
      lifecycle.push('runtime-cleared')
    })
    state.writerBeginShutdown.mockImplementation(async () => {
      lifecycle.push('writer-shutdown-started')
    })

    try {
      const destroy = core.destroy()
      await sessionDestroyStarted.promise

      // Both source scans must already be cancelled, and the producer stop initiated, while destroy
      // is parked on the session drain — not after it.
      expect(state.appProviderPrepareForShutdown).toHaveBeenCalledTimes(1)
      expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(1, 'app-provider')
      expect(state.appRuntimeAbortAndDrain).toHaveBeenNthCalledWith(2, 'file-provider')
      // The writer's close is one of those aborts: it is initiated before this await, never after.
      expect(lifecycle[0]).toBe('writer-shutdown-started')

      await destroy

      expect(lifecycle.indexOf('scan-abort-initiated:app-provider')).toBeLessThan(
        lifecycle.indexOf('session-destroyed')
      )
      // Runtime is cleared only after every started drain (session included) has settled.
      expect(lifecycle.slice(-1)).toEqual(['runtime-cleared'])
    } finally {
      state.appRuntimeAbortAndDrain.mockImplementation(async () => undefined)
      state.clearIndexingRuntime.mockImplementation(() => undefined)
      state.writerBeginShutdown.mockImplementation(async () => undefined)
      sessionDestroy.mockRestore()
    }
  })

  it('fails closed when the coalesced event-router drain rejects, and completes teardown on retry', async () => {
    const coreHarness = core as unknown as {
      indexedSourceEventRouter: { unsubscribe: () => Promise<void> }
      providerRegistry: { destroy: () => Promise<void> }
    }
    const providerRegistryDestroy = vi.spyOn(coreHarness.providerRegistry, 'destroy')
    const unsubscribe = vi
      .spyOn(coreHarness.indexedSourceEventRouter, 'unsubscribe')
      .mockRejectedValueOnce(new Error('event router drain failed'))

    try {
      await expect(core.destroy()).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

      expect(providerRegistryDestroy).not.toHaveBeenCalled()
      expect(state.clearIndexingRuntime).not.toHaveBeenCalled()

      await expect(core.destroy()).resolves.toBeUndefined()

      expect(providerRegistryDestroy).toHaveBeenCalledTimes(1)
      expect(state.clearIndexingRuntime).toHaveBeenCalledTimes(1)
      // One begin per destroy attempt: the writer's own promise caching, not this call count, is
      // what makes the second attempt idempotent.
      expect(state.writerBeginShutdown).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe.mockRestore()
      providerRegistryDestroy.mockRestore()
    }
  })

  it('fails closed when the writer shutdown rejects and retries the terminal teardown', async () => {
    state.writerBeginShutdown.mockRejectedValueOnce(new Error('writer shutdown failed'))

    await expect(core.destroy()).rejects.toThrow('SEARCH_CORE_INDEX_DRAIN_FAILED')

    expect(state.writerBeginShutdown).toHaveBeenCalledTimes(1)

    await expect(core.destroy()).resolves.toBeUndefined()

    expect(state.writerBeginShutdown).toHaveBeenCalledTimes(2)
  })
})
