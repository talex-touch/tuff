import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { app, BrowserWindow } from 'electron'
import * as Sentry from '@sentry/electron/main'
import type { TelemetryUploadStatsRecord } from './telemetry-upload-stats-store'
import type * as LoggerModule from '../../utils/logger'
import { sanitizeNexusTelemetryEvent, sanitizeSentryEvent } from './telemetry-sanitizer'

const networkRequestMock = vi.hoisted(() => vi.fn())

const DEFAULT_INNER_ROOT_PATH = '/tmp/tuff-sentry-test'
const DEFAULT_CRASH_DUMPS_PATH = '/tmp/tuff-sentry-test/crash-dumps'

/**
 * Mutable so native-crash tests can point the pre-init config lookup (and therefore the crash dump
 * root) at a per-test temp directory instead of a shared path that a leftover run could poison.
 */
const precoreMock = vi.hoisted(() => ({ innerRootPath: '/tmp/tuff-sentry-test' }))

type CrashDiagnosticLogRecord = {
  level: string
  message: string
  meta: Record<string, unknown> | undefined
}

/**
 * Records only the SentryService namespace so native-crash diagnostics can be inspected for leaked
 * dump names/paths/content without silencing the rest of the module graph.
 */
const crashDiagnosticLogs = vi.hoisted(() => {
  const records: CrashDiagnosticLogRecord[] = []
  return {
    records,
    reset: () => {
      records.length = 0
    }
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn(),
    off: vi.fn(),
    getPath: vi.fn(() => '/tmp/tuff-sentry-test/crash-dumps'),
    commandLine: { appendSwitch: vi.fn() }
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [] as unknown[])
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  },
  MessageChannelMain: class MessageChannelMain {
    port1 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }

    port2 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }
  }
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  getClient: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn()
}))

vi.mock('../../core/precore', () => precoreMock)

vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggerModule>()
  return {
    ...actual,
    createLogger: (namespace: string) => {
      const logger = actual.createLogger(namespace)
      if (namespace !== 'SentryService') return logger
      const record =
        (level: string) => (message: unknown, options?: Parameters<typeof logger.info>[1]) => {
          crashDiagnosticLogs.records.push({
            level,
            message: String(message),
            meta: options?.meta as Record<string, unknown> | undefined
          })
        }
      return {
        ...logger,
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
        success: record('success'),
        debug: record('debug')
      }
    }
  }
})

vi.mock('../database', () => ({
  databaseModule: {
    getAuxDb: vi.fn(),
    getDb: vi.fn()
  }
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: vi.fn(() => ({
    request: networkRequestMock
  }))
}))

import { SentryServiceModule, type NativeCrashDeliveryStatus } from './sentry-service'

type TestableWindowPerf = {
  ensureWindowPerformanceListeners: () => void
  stopPerformanceMonitors: () => void
}

type TestableSentryService = {
  getTelemetryStatsStore: () => {
    get: () => Promise<TelemetryUploadStatsRecord | null>
    upsert: ReturnType<typeof vi.fn>
  }
  scheduleTelemetryStatsHydration: () => void
  searchCount: number
  totalNexusUploads: number
  failedNexusUploads: number
  lastNexusUploadTime: number
  lastTelemetryFailureAt: number
  lastTelemetryFailureMessage: string
  persistTelemetryStats: () => Promise<void>
}

type TestReportQueueItem = {
  id: number
  endpoint: string
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
  lastAttemptAt?: number
  lastError?: string | null
}

type TestableNexusTelemetryOutbox = {
  getReportQueueStore: () => {
    list: ReturnType<typeof vi.fn<() => Promise<TestReportQueueItem[]>>>
    remove: ReturnType<typeof vi.fn<(id: number) => Promise<void>>>
    markAttempt: ReturnType<typeof vi.fn<(id: number, error?: string) => Promise<void>>>
  }
  flushQueuedNexusTelemetryOutbox: () => Promise<void>
  saveConfig: (config: { enabled?: boolean; anonymous?: boolean }) => void
  nexusTelemetryBuffer: unknown[]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function telemetryRecord(
  overrides: Partial<TelemetryUploadStatsRecord>
): TelemetryUploadStatsRecord {
  return {
    searchCount: 0,
    totalUploads: 0,
    failedUploads: 0,
    lastUploadTime: null,
    lastFailureAt: null,
    lastFailureMessage: null,
    updatedAt: 1,
    ...overrides
  }
}

describe('SentryServiceModule telemetry sanitizer', () => {
  it('drops breadcrumbs before the Electron SDK can persist sensitive payload previews', () => {
    vi.mocked(Sentry.init).mockClear()
    const service = new SentryServiceModule()

    service.preInitBeforeReady()

    const options = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0]
    expect(
      options?.beforeBreadcrumb?.({
        category: 'console',
        data: {
          arguments: ['Save provider credential config', { payloadPreview: 'acceptance-canary' }]
        }
      })
    ).toBeNull()
  })

  it('associates signed-in telemetry by user id without sending device fingerprint or sensitive fields', () => {
    const event = sanitizeNexusTelemetryEvent({
      eventType: 'search',
      clientId: 'client-1',
      userId: 'user_123',
      platform: 'darwin',
      version: '1.0.0',
      searchQuery: 'private search text',
      searchDurationMs: 120,
      searchResultCount: 3,
      providerTimings: {
        app: 12,
        file: 34
      },
      inputTypes: ['text'],
      metadata: {
        sessionId: 'session-1',
        queryLength: 18,
        queryText: 'secret query',
        filePath: '/Users/me/private.txt',
        providerResults: { app: 1, file: 2 },
        providerStatus: { app: 'success', file: 'timeout' },
        providerErrorCount: 0
      },
      isAnonymous: false
    })

    expect(event).toMatchObject({
      userId: 'user_123',
      isAnonymous: false,
      searchQuery: undefined,
      metadata: {
        sessionId: 'session-1',
        queryLength: 18,
        providerResults: { app: 1, file: 2 },
        providerStatus: { app: 'success', file: 'timeout' },
        providerErrorCount: 0
      }
    })
    expect(event).not.toHaveProperty('deviceFingerprint')
    expect(event?.metadata).not.toHaveProperty('queryText')
    expect(event?.metadata).not.toHaveProperty('filePath')
  })

  it('keeps anonymous telemetry anonymous even when a user id is present', () => {
    const event = sanitizeNexusTelemetryEvent({
      eventType: 'feature_use',
      clientId: 'client-1',
      userId: 'user_123',
      platform: 'darwin',
      version: '1.0.0',
      metadata: {
        action: 'execute',
        sourceType: 'app',
        sourceName: '/Users/private/CANARY_SOURCE_NAME',
        featureId: 'feature-1',
        email: 'user@example.com',
        token: 'secret'
      },
      isAnonymous: true
    })

    expect(event).toMatchObject({
      userId: undefined,
      isAnonymous: true
    })
    expect(event?.metadata).toEqual({
      action: 'execute',
      sourceType: 'app',
      featureId: 'feature-1'
    })
    expect(JSON.stringify(event)).not.toContain('CANARY_SOURCE_NAME')
  })

  it('accepts only identifier-shaped performance reasons', () => {
    const redacted = sanitizeNexusTelemetryEvent({
      eventType: 'performance',
      metadata: { reason: '/Users/private/CANARY_NATIVE_REASON' },
      isAnonymous: true
    })
    const stable = sanitizeNexusTelemetryEvent({
      eventType: 'performance',
      metadata: { reason: 'startup_timeout' },
      isAnonymous: true
    })

    expect(redacted?.metadata).toBeUndefined()
    expect(stable?.metadata).toEqual({ reason: 'startup_timeout' })
  })

  it('removes Sentry request details, breadcrumbs and stack frame paths before upload', () => {
    const event = sanitizeSentryEvent({
      message: 'Failed to open /Users/me/private.txt with token=secret',
      request: { url: 'https://example.com?token=secret' },
      breadcrumbs: [{ message: 'secret breadcrumb' }],
      extra: { token: 'secret' },
      user: {
        id: 'user_123',
        email: 'user@example.com',
        username: 'name',
        ip_address: '127.0.0.1'
      },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'private failure from /Users/me/private.txt',
            stacktrace: {
              frames: [
                {
                  filename: '/Users/me/project/file.ts',
                  abs_path: '/Users/me/project/file.ts',
                  context_line: 'const token = "secret"',
                  function: 'run'
                }
              ]
            }
          }
        ]
      }
    })

    expect(event.request).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.extra).toBeUndefined()
    expect(event.user).toEqual({
      id: 'user_123',
      username: undefined,
      email: undefined,
      ip_address: undefined
    })
    expect(event.message).toBe('redacted')
    expect(event.exception?.values?.[0]?.value).toBe('redacted')
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ function: 'run' })
  })
})

describe('SentryServiceModule Nexus telemetry privacy gates', () => {
  beforeEach(() => {
    networkRequestMock.mockReset()
  })

  it('drops queued Nexus telemetry instead of uploading while telemetry is disabled', async () => {
    const list = vi.fn(async () => [
      {
        id: 1,
        endpoint: 'https://nexus.local/api/telemetry/batch',
        payload: {
          metadata: { kind: 'sentry.nexus.batch' },
          events: [{ eventType: 'feature_use' }]
        },
        createdAt: 1,
        retryCount: 0,
        lastError: null
      },
      {
        id: 2,
        endpoint: 'https://nexus.local/api/analytics/startup',
        payload: {
          metadata: { kind: 'startup.analytics' },
          events: [{ eventType: 'startup' }]
        },
        createdAt: 2,
        retryCount: 0,
        lastError: null
      }
    ])
    const remove = vi.fn(async () => {})
    const markAttempt = vi.fn(async () => {})
    const service = new SentryServiceModule() as unknown as TestableNexusTelemetryOutbox
    service.getReportQueueStore = () => ({ list, remove, markAttempt })
    service.nexusTelemetryBuffer = [{ eventType: 'search' }]

    service.saveConfig({ enabled: false })
    await service.flushQueuedNexusTelemetryOutbox()

    expect(networkRequestMock).not.toHaveBeenCalled()
    expect(service.nexusTelemetryBuffer).toEqual([])
    expect(remove).toHaveBeenCalledWith(1)
    expect(remove).not.toHaveBeenCalledWith(2)
    expect(markAttempt).not.toHaveBeenCalled()
  })
})

describe('SentryServiceModule telemetry stats hydration', () => {
  it('waits for hydration and preserves startup increments before persisting', async () => {
    const pendingRecord = deferred<TelemetryUploadStatsRecord | null>()
    const store = {
      get: vi.fn(() => pendingRecord.promise),
      upsert: vi.fn()
    }

    const service = new SentryServiceModule() as unknown as TestableSentryService
    service.getTelemetryStatsStore = () => store

    service.scheduleTelemetryStatsHydration()
    service.searchCount = 2
    service.totalNexusUploads = 1
    service.failedNexusUploads = 1
    service.lastNexusUploadTime = 3_000
    service.lastTelemetryFailureAt = 4_000
    service.lastTelemetryFailureMessage = 'runtime failure'

    const persist = service.persistTelemetryStats()
    await Promise.resolve()

    expect(store.upsert).not.toHaveBeenCalled()

    pendingRecord.resolve(
      telemetryRecord({
        searchCount: 100,
        totalUploads: 10,
        failedUploads: 5,
        lastUploadTime: 2_000,
        lastFailureAt: 1_000,
        lastFailureMessage: 'persisted failure'
      })
    )

    await persist

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        searchCount: 102,
        totalUploads: 11,
        failedUploads: 6,
        lastUploadTime: 3_000,
        lastFailureAt: 4_000,
        lastFailureMessage: 'runtime failure'
      })
    )
  })
})

describe('SentryServiceModule window performance listeners', () => {
  function fakeWindow(id: number) {
    return {
      webContents: { id },
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false)
    }
  }

  beforeEach(() => {
    vi.mocked(app.on).mockClear()
    vi.mocked(app.off).mockClear()
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])
  })

  it('re-attaches to windows that already existed after a stop/start cycle', () => {
    // The defect in #534: teardown left `windowPerfListenersReady` set, so a later start
    // early-returned and never re-ran the getAllWindows loop. Windows open at that moment stopped
    // being watched for 'unresponsive', and nothing logged the gap.
    const existing = fakeWindow(1)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([existing] as never)

    const service = new SentryServiceModule() as unknown as TestableWindowPerf

    service.ensureWindowPerformanceListeners()
    // Positive control: without this the assertions below would hold over a window that was
    // never attached in the first place.
    expect(existing.on).toHaveBeenCalledTimes(3)

    service.stopPerformanceMonitors()
    existing.on.mockClear()

    service.ensureWindowPerformanceListeners()
    expect(existing.on).toHaveBeenCalledTimes(3)
  })

  it('removes what it attached', () => {
    const existing = fakeWindow(2)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([existing] as never)

    const service = new SentryServiceModule() as unknown as TestableWindowPerf
    service.ensureWindowPerformanceListeners()

    // Widened before comparing: app.on is overloaded, so TS narrows the tuple to the first
    // signature's event name and calls the comparison unreachable.
    const calls = vi.mocked(app.on).mock.calls as unknown as Array<
      [string, (...args: unknown[]) => void]
    >
    const registered = calls.find(([event]) => event === 'browser-window-created')
    expect(registered).toBeDefined()

    service.stopPerformanceMonitors()

    // The app-level listener is the one that leaked for the lifetime of the process, attaching
    // three more handlers to every window created afterwards.
    expect(vi.mocked(app.off)).toHaveBeenCalledWith('browser-window-created', registered![1])
    expect(existing.off).toHaveBeenCalledTimes(3)
  })

  it('does not stack handlers when start is called twice without a stop', () => {
    const existing = fakeWindow(3)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([existing] as never)

    const service = new SentryServiceModule() as unknown as TestableWindowPerf
    service.ensureWindowPerformanceListeners()
    service.ensureWindowPerformanceListeners()

    // The latch still does its original job — this is what would break if the fix simply
    // cleared it everywhere.
    expect(existing.on).toHaveBeenCalledTimes(3)
  })

  it('skips a window that has already been destroyed', () => {
    // win.off on a destroyed BrowserWindow throws; teardown has to survive the common case of a
    // window closing before the module stops.
    const closed = fakeWindow(4)
    closed.isDestroyed.mockReturnValue(true)
    const live = fakeWindow(5)
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([closed, live] as never)

    const service = new SentryServiceModule() as unknown as TestableWindowPerf
    service.ensureWindowPerformanceListeners()

    expect(() => service.stopPerformanceMonitors()).not.toThrow()
    expect(closed.off).not.toHaveBeenCalled()
    // The live window in the same batch proves the skip is selective. Without it, teardown that
    // bailed out entirely on the first destroyed window would pass this test.
    expect(live.off).toHaveBeenCalledTimes(3)
  })
})

type FakeNativeTransportEvent = { platform?: string }
type FakeNativeTransportResponse = { statusCode?: number }
type FakeNativeTransportListener = (
  event: FakeNativeTransportEvent,
  response: FakeNativeTransportResponse
) => void

type FakeNativeTransportClient = {
  options: { enabled: boolean }
  on: Mock<(event: string, listener: FakeNativeTransportListener) => () => void>
  getOptions: Mock<() => { enabled: boolean }>
  listenerCount: () => number
  dispatchNativeAfterSend: (
    event: FakeNativeTransportEvent,
    response: FakeNativeTransportResponse
  ) => void
}

type TestableNativeCrashService = {
  preInitBeforeReady: () => void
  saveConfig: (config: { enabled?: boolean; anonymous?: boolean }) => void
  getNativeCrashDeliveryStatus: () => NativeCrashDeliveryStatus
  syncPerformanceMonitors: () => void
  getReportQueueStore: () => null
}

/**
 * Minimal hand-written stand-in for the Sentry client's hook registry. It honours the unsubscribe
 * returned by `on`, so "the transport hook was detached" is observable through dispatch behaviour
 * instead of a mock-call assertion that a rename would invalidate.
 */
function createFakeNativeTransportClient(): FakeNativeTransportClient {
  const options = { enabled: true }
  const listeners = new Set<FakeNativeTransportListener>()
  return {
    options,
    on: vi.fn((event: string, listener: FakeNativeTransportListener) => {
      if (event === 'afterSendEvent') listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    getOptions: vi.fn(() => options),
    listenerCount: () => listeners.size,
    dispatchNativeAfterSend(event, response) {
      for (const listener of [...listeners]) listener(event, response)
    }
  }
}

describe('SentryServiceModule native crash delivery diagnostics', () => {
  let root: string
  let crashRoot: string
  let activeClient: FakeNativeTransportClient | undefined

  function createService(): TestableNativeCrashService {
    const service = new SentryServiceModule() as unknown as TestableNativeCrashService
    // Keep the diagnostic lifecycle isolated from performance monitors and the telemetry outbox.
    service.syncPerformanceMonitors = vi.fn()
    service.getReportQueueStore = () => null
    return service
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-sentry-native-'))
    crashRoot = path.join(root, 'crash-dumps')
    precoreMock.innerRootPath = root

    vi.mocked(app.getPath).mockReset()
    vi.mocked(app.getPath).mockReturnValue(crashRoot)

    vi.mocked(Sentry.init).mockClear()
    vi.mocked(Sentry.getClient).mockReset()
    activeClient = undefined
    vi.mocked(Sentry.getClient).mockImplementation((() => activeClient) as never)

    crashDiagnosticLogs.reset()
  })

  afterEach(() => {
    vi.mocked(app.getPath).mockReset()
    vi.mocked(app.getPath).mockReturnValue(DEFAULT_CRASH_DUMPS_PATH)
    vi.mocked(Sentry.getClient).mockReset()
    vi.mocked(Sentry.init).mockClear()
    precoreMock.innerRootPath = DEFAULT_INNER_ROOT_PATH
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('keeps native crash delivery untouched when reporting is disabled: no dump scan, no client, no transport hook', () => {
    fs.mkdirSync(path.join(root, 'modules', 'config'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'modules', 'config', 'sentry-config.json'),
      JSON.stringify({ enabled: false })
    )
    fs.mkdirSync(path.join(crashRoot, 'completed'), { recursive: true })
    fs.writeFileSync(path.join(crashRoot, 'completed', 'pending-crash.dmp'), 'dump-body')

    const service = createService()
    service.preInitBeforeReady()

    // Disabled reporting must not create a client or bind a transport hook that could upload, and
    // the status proves the whole lifecycle (including the dump count) stayed switched off.
    expect(vi.mocked(Sentry.init)).not.toHaveBeenCalled()
    expect(vi.mocked(Sentry.getClient)).not.toHaveBeenCalled()
    expect(service.getNativeCrashDeliveryStatus()).toEqual({
      phase: 'disabled',
      pendingAtStartup: 0,
      pendingAtStartupTruncated: false,
      discoveredAt: null,
      parsedAt: null,
      sentAt: null,
      statusCode: null,
      failureCode: null
    })
  })

  it('counts only .dmp filenames from the darwin completed/pending directories without reading dump content', () => {
    // The scanned directories are per platform (win32 `reports`, darwin `completed` + `pending`,
    // others `completed` only), so this pins darwin instead of inheriting the runner's platform.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
    fs.mkdirSync(path.join(crashRoot, 'completed', 'nested'), { recursive: true })
    fs.mkdirSync(path.join(crashRoot, 'pending'), { recursive: true })
    fs.writeFileSync(path.join(crashRoot, 'completed', 'alpha.dmp'), 'dump-body-alpha')
    fs.writeFileSync(path.join(crashRoot, 'completed', 'beta.DMP'), 'dump-body-beta')
    fs.writeFileSync(path.join(crashRoot, 'completed', 'notes.txt'), 'not a dump')
    fs.writeFileSync(path.join(crashRoot, 'completed', 'nested', 'gamma.dmp'), 'nested dump')
    fs.writeFileSync(path.join(crashRoot, 'pending', 'delta.dmp'), 'pending dump')

    const readFileSpy = vi.spyOn(fs, 'readFileSync')
    try {
      const service = createService()
      activeClient = createFakeNativeTransportClient()
      service.preInitBeforeReady()

      const status = service.getNativeCrashDeliveryStatus()
      expect(status.phase).toBe('discovered')
      // Only alpha.dmp and delta.dmp count: the uppercase, text, and nested entries are not dumps.
      expect(status.pendingAtStartup).toBe(2)
      expect(status.discoveredAt).toEqual(expect.any(Number))

      const readCalls = readFileSpy.mock.calls as unknown as Array<[unknown]>
      const dumpReads = readCalls.filter(([target]) => /\.dmp$/i.test(String(target)))
      expect(dumpReads).toEqual([])
    } finally {
      readFileSpy.mockRestore()
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it.each([
    { dumps: 99, truncated: false },
    { dumps: 100, truncated: true }
  ])(
    'bounds the startup dump scan at 100 entries ($dumps dumps -> truncated=$truncated)',
    ({ dumps, truncated }) => {
      const completed = path.join(crashRoot, 'completed')
      fs.mkdirSync(completed, { recursive: true })
      for (let index = 0; index < dumps; index += 1) {
        fs.writeFileSync(path.join(completed, `crash-${index}.dmp`), '')
      }

      const service = createService()
      activeClient = createFakeNativeTransportClient()
      service.preInitBeforeReady()

      const status = service.getNativeCrashDeliveryStatus()
      expect(status.pendingAtStartup).toBe(dumps)
      expect(status.pendingAtStartupTruncated).toBe(truncated)
    }
  )

  it('moves discovery to parsed for a native beforeSend payload only', () => {
    const service = createService()
    activeClient = createFakeNativeTransportClient()
    service.preInitBeforeReady()

    const beforeSend = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0]?.beforeSend
    expect(beforeSend).toBeTypeOf('function')

    beforeSend?.({ platform: 'javascript', type: undefined }, {})
    const afterJavaScriptEvent = service.getNativeCrashDeliveryStatus()
    expect(afterJavaScriptEvent.phase).toBe('idle')
    expect(afterJavaScriptEvent.parsedAt).toBeNull()

    beforeSend?.({ platform: 'native', type: undefined }, {})
    const afterNativeEvent = service.getNativeCrashDeliveryStatus()
    expect(afterNativeEvent.phase).toBe('parsed')
    expect(afterNativeEvent.parsedAt).toEqual(expect.any(Number))
    expect(afterNativeEvent.sentAt).toBeNull()
  })

  it.each([
    { name: '2xx success (200)', statusCode: 200, phase: 'sent', failureCode: null },
    { name: '2xx upper boundary (299)', statusCode: 299, phase: 'sent', failureCode: null },
    {
      name: 'bad request (400)',
      statusCode: 400,
      phase: 'transport-failed',
      failureCode: 'SENTRY_NATIVE_TRANSPORT_HTTP_400'
    },
    {
      name: 'server error (503)',
      statusCode: 503,
      phase: 'transport-failed',
      failureCode: 'SENTRY_NATIVE_TRANSPORT_HTTP_503'
    },
    {
      name: 'offline transport stored the envelope without a response status',
      statusCode: undefined,
      phase: 'queued',
      failureCode: 'SENTRY_NATIVE_TRANSPORT_QUEUED'
    }
  ])(
    'maps afterSendEvent response status to the native transport outcome: $name',
    ({ statusCode, phase, failureCode }) => {
      const service = createService()
      const client = createFakeNativeTransportClient()
      activeClient = client
      service.preInitBeforeReady()

      client.dispatchNativeAfterSend(
        { platform: 'native' },
        statusCode === undefined ? {} : { statusCode }
      )

      const status = service.getNativeCrashDeliveryStatus()
      expect(status.phase).toBe(phase)
      expect(status.failureCode).toBe(failureCode)
      expect(status.statusCode).toBe(statusCode ?? null)
      // Transport implies the dump reached the parsed stage; only a confirmed send sets sentAt.
      expect(status.parsedAt).toEqual(expect.any(Number))
      if (phase === 'sent') {
        expect(status.sentAt).toEqual(expect.any(Number))
      } else {
        expect(status.sentAt).toBeNull()
      }
    }
  )

  it('ignores afterSendEvent results that are not native crash events', () => {
    const service = createService()
    const client = createFakeNativeTransportClient()
    activeClient = client
    service.preInitBeforeReady()
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('idle')

    client.dispatchNativeAfterSend({ platform: 'javascript' }, { statusCode: 500 })

    const status = service.getNativeCrashDeliveryStatus()
    expect(status.phase).toBe('idle')
    expect(status.statusCode).toBeNull()
    expect(status.failureCode).toBeNull()
  })

  it('returns a defensive copy of the native crash delivery status', () => {
    fs.mkdirSync(path.join(crashRoot, 'completed'), { recursive: true })
    fs.writeFileSync(path.join(crashRoot, 'completed', 'one.dmp'), 'dump-body')

    const service = createService()
    activeClient = createFakeNativeTransportClient()
    service.preInitBeforeReady()

    const first = service.getNativeCrashDeliveryStatus()
    expect(first.phase).toBe('discovered')
    first.phase = 'sent'
    first.pendingAtStartup = 999
    first.sentAt = 123

    const second = service.getNativeCrashDeliveryStatus()
    expect(second.phase).toBe('discovered')
    expect(second.pendingAtStartup).toBe(1)
    expect(second.sentAt).toBeNull()
  })

  it('disabling reporting disables the live client, detaches the hook, and ignores a late native send', () => {
    const service = createService()
    const client = createFakeNativeTransportClient()
    activeClient = client
    service.preInitBeforeReady()
    expect(client.listenerCount()).toBe(1)

    service.saveConfig({ enabled: false })

    // The active client is switched off and the hook detached, so a native send that still fires
    // after shutdown cannot be reported as delivered.
    expect(client.options.enabled).toBe(false)
    expect(client.listenerCount()).toBe(0)
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('disabled')

    client.dispatchNativeAfterSend({ platform: 'native' }, { statusCode: 200 })
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('disabled')
  })

  it('re-enabling binds one fresh client and only the fresh hook can advance the phase', () => {
    const service = createService()
    const first = createFakeNativeTransportClient()
    activeClient = first
    service.preInitBeforeReady()
    expect(vi.mocked(Sentry.init)).toHaveBeenCalledTimes(1)
    expect(first.listenerCount()).toBe(1)

    // Prove the first hook is wired before tearing it down.
    first.dispatchNativeAfterSend({ platform: 'native' }, { statusCode: 500 })
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('transport-failed')

    service.saveConfig({ enabled: false })
    expect(first.options.enabled).toBe(false)
    expect(first.listenerCount()).toBe(0)

    fs.mkdirSync(path.join(crashRoot, 'completed'), { recursive: true })
    fs.writeFileSync(path.join(crashRoot, 'completed', 'rearmed.dmp'), 'dump-body')
    const second = createFakeNativeTransportClient()
    activeClient = second
    service.saveConfig({ enabled: true })

    expect(vi.mocked(Sentry.init)).toHaveBeenCalledTimes(2)
    expect(second.listenerCount()).toBe(1)

    // Fresh discovery, not the stale transport-failed state.
    const rearmed = service.getNativeCrashDeliveryStatus()
    expect(rearmed.phase).toBe('discovered')
    expect(rearmed.pendingAtStartup).toBe(1)

    first.dispatchNativeAfterSend({ platform: 'native' }, { statusCode: 200 })
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('discovered')

    second.dispatchNativeAfterSend({ platform: 'native' }, { statusCode: 200 })
    expect(service.getNativeCrashDeliveryStatus().phase).toBe('sent')
  })

  it('keeps dump filenames, dump content, and the crash directory out of diagnostic logs and the public status', () => {
    const nameCanary = 'CANARY_NATIVE_DUMP_FILENAME'
    const contentCanary = 'CANARY_NATIVE_DUMP_CONTENT'
    const dumpPath = path.join(crashRoot, 'completed', `crash-${nameCanary}.dmp`)
    fs.mkdirSync(path.dirname(dumpPath), { recursive: true })
    fs.writeFileSync(dumpPath, `minidump-body-${contentCanary}`)

    const service = createService()
    const client = createFakeNativeTransportClient()
    activeClient = client
    service.preInitBeforeReady()
    const beforeSend = vi.mocked(Sentry.init).mock.calls.at(-1)?.[0]?.beforeSend
    beforeSend?.({ platform: 'native', type: undefined }, {})
    client.dispatchNativeAfterSend({ platform: 'native' }, { statusCode: 200 })

    // Positive control: the diagnostic sites actually reported the lifecycle (startup count plus the
    // parsed/sent phases), so the absence assertions below cannot pass just because nothing logged.
    const reportedValues = crashDiagnosticLogs.records.flatMap((record) =>
      Object.values(record.meta ?? {})
    )
    expect(reportedValues).toContain(1)
    expect(reportedValues).toContain('parsed')
    expect(reportedValues).toContain('sent')

    const logged = JSON.stringify(crashDiagnosticLogs.records)
    expect(logged).not.toContain(nameCanary)
    expect(logged).not.toContain(contentCanary)
    expect(logged).not.toContain(crashRoot)
    expect(logged).not.toContain('.dmp')

    const exposed = JSON.stringify(service.getNativeCrashDeliveryStatus())
    expect(exposed).not.toContain(nameCanary)
    expect(exposed).not.toContain(contentCanary)
    expect(exposed).not.toContain(crashRoot)
    expect(exposed).not.toContain('.dmp')
  })
})
