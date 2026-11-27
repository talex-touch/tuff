import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageList } from '@talex-touch/utils'

const { networkRequestMock, getMainConfigMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn(),
  getMainConfigMock: vi.fn((_key?: unknown): unknown => ({ enabled: true, anonymous: false }))
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => '2.4.15',
    isPackaged: false
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn()
  },
  MessageChannelMain: vi.fn()
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: networkRequestMock
  })
}))

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.test'
}))

vi.mock('../auth', () => ({
  getAuthToken: () => null,
  subscribeAuthState: () => () => {}
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn(),
    getAuxDb: vi.fn()
  }
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {}
}))

vi.mock('../../core/channel-core', () => ({
  setIpcTracer: vi.fn()
}))

vi.mock('../../utils/perf-monitor', () => ({
  setPerfSummaryReporter: vi.fn()
}))

import { AnalyticsModule } from './analytics-module'

type TestableAnalyticsModule = {
  enqueueMessageReport: (message: {
    id: string
    source: 'system'
    severity: 'warn' | 'error' | 'info'
    title: string
    message: string
    status: 'unread'
    createdAt: number
    meta?: Record<string, unknown>
  }) => void
  flushMessageReportQueue: () => Promise<void>
  messageReportQueue: unknown[]
  messageReportTimer: NodeJS.Timeout | null
}

describe('AnalyticsModule message report idempotency & ACK handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMainConfigMock.mockImplementation((key?: unknown) =>
      key === StorageList.SENTRY_CONFIG ? { enabled: true, anonymous: false } : {}
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the same X-Idempotency-Key across retries on invalid ACK and clears queue only after verified success', async () => {
    const mod = new AnalyticsModule() as unknown as TestableAnalyticsModule
    mod.enqueueMessageReport({
      id: 'msg-row-1',
      source: 'system',
      severity: 'warn',
      title: 'Perf',
      message: 'slow',
      status: 'unread',
      createdAt: Date.now()
    })
    if (mod.messageReportTimer) {
      clearTimeout(mod.messageReportTimer)
      mod.messageReportTimer = null
    }

    // Attempt 1: 200 with { success: false } must be rejected and retain the batch.
    networkRequestMock.mockResolvedValueOnce({
      status: 200,
      data: JSON.stringify({ success: false })
    })
    await mod.flushMessageReportQueue()
    if (mod.messageReportTimer) {
      clearTimeout(mod.messageReportTimer)
      mod.messageReportTimer = null
    }
    expect(mod.messageReportQueue).toHaveLength(1)

    const firstKey = (networkRequestMock.mock.calls[0]?.[0] as { headers: Record<string, string> })
      .headers['X-Idempotency-Key']
    expect(firstKey).toMatch(/^msg:[0-9a-f-]{36}$/)

    // Attempt 2: retry sends the exact same X-Idempotency-Key and clears queue on verified { success: true }.
    networkRequestMock.mockResolvedValueOnce({
      status: 200,
      data: JSON.stringify({
        success: true,
        accepted: 1,
        rejected: 0,
        duplicate: false,
        dropped: 0,
        processed: 1
      })
    })
    await mod.flushMessageReportQueue()
    if (mod.messageReportTimer) {
      clearTimeout(mod.messageReportTimer)
      mod.messageReportTimer = null
    }

    const secondKey = (networkRequestMock.mock.calls[1]?.[0] as { headers: Record<string, string> })
      .headers['X-Idempotency-Key']
    expect(secondKey).toBe(firstKey)
    expect(mod.messageReportQueue).toHaveLength(0)

    // Attempt 3: a new batch receives a fresh random X-Idempotency-Key.
    mod.enqueueMessageReport({
      id: 'msg-row-2',
      source: 'system',
      severity: 'warn',
      title: 'Perf 2',
      message: 'slow 2',
      status: 'unread',
      createdAt: Date.now()
    })
    if (mod.messageReportTimer) {
      clearTimeout(mod.messageReportTimer)
      mod.messageReportTimer = null
    }
    networkRequestMock.mockResolvedValueOnce({
      status: 200,
      data: JSON.stringify({
        success: true,
        accepted: 1,
        rejected: 0,
        duplicate: false,
        dropped: 0,
        processed: 1
      })
    })
    await mod.flushMessageReportQueue()
    if (mod.messageReportTimer) {
      clearTimeout(mod.messageReportTimer)
      mod.messageReportTimer = null
    }

    const thirdKey = (networkRequestMock.mock.calls[2]?.[0] as { headers: Record<string, string> })
      .headers['X-Idempotency-Key']
    expect(thirdKey).toMatch(/^msg:[0-9a-f-]{36}$/)
    expect(thirdKey).not.toBe(firstKey)
    expect(mod.messageReportQueue).toHaveLength(0)
  })
})
