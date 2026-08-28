import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app, BrowserWindow } from 'electron'
import * as Sentry from '@sentry/electron/main'
import type { TelemetryUploadStatsRecord } from './telemetry-upload-stats-store'
import { sanitizeNexusTelemetryEvent, sanitizeSentryEvent } from './telemetry-sanitizer'

const networkRequestMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn(),
    off: vi.fn(),
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
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn()
}))

vi.mock('../../core/precore', () => ({
  innerRootPath: '/tmp/tuff-sentry-test'
}))

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

import { SentryServiceModule } from './sentry-service'

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
