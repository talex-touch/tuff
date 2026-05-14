import { describe, expect, it, vi } from 'vitest'
import type { TelemetryUploadStatsRecord } from './telemetry-upload-stats-store'

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

describe('SentryServiceModule telemetry stats hydration', () => {
  it('waits for hydration and preserves startup increments before persisting', async () => {
    const pendingRecord = deferred<TelemetryUploadStatsRecord | null>()
    const store = {
      get: vi.fn(() => pendingRecord.promise),
      upsert: vi.fn()
    }

    const service = new SentryServiceModule() as unknown as Record<string, any>
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
