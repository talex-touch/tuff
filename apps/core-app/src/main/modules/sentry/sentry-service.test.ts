import { describe, expect, it, vi } from 'vitest'
import type { TelemetryUploadStatsRecord } from './telemetry-upload-stats-store'
import { sanitizeNexusTelemetryEvent, sanitizeSentryEvent } from './telemetry-sanitizer'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn(),
    commandLine: { appendSwitch: vi.fn() }
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
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
    request: vi.fn()
  }))
}))

import { SentryServiceModule } from './sentry-service'

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
