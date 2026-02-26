import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  ensureIntelligenceConfigLoadedMock,
  getCapabilityOptionsMock,
  aiInvokeMock,
  pushInboxEntryMock
} = vi.hoisted(() => ({
  ensureIntelligenceConfigLoadedMock: vi.fn(),
  getCapabilityOptionsMock: vi.fn(),
  aiInvokeMock: vi.fn(),
  pushInboxEntryMock: vi.fn()
}))

vi.mock('electron', () => {
  const electronMock = {
    app: {
      commandLine: { appendSwitch: vi.fn() },
      getAppPath: vi.fn(() => '/tmp/talex-touch'),
      getPath: vi.fn(() => '/tmp/talex-touch'),
      setPath: vi.fn(),
      getName: vi.fn(() => 'Talex Touch'),
      getVersion: vi.fn(() => '0.0.0-test'),
      whenReady: vi.fn(async () => undefined),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      quit: vi.fn(),
      isPackaged: false
    },
    clipboard: {},
    dialog: {},
    shell: {},
    crashReporter: {
      start: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      on: vi.fn()
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
  }

  return {
    __esModule: true,
    ...electronMock,
    default: electronMock
  }
})

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('@sentry/electron/main', () => ({
  __esModule: true,
  init: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: (
    callback: (scope: {
      setTag: ReturnType<typeof vi.fn>
      setLevel: ReturnType<typeof vi.fn>
      setContext: ReturnType<typeof vi.fn>
    }) => void
  ) =>
    callback({
      setTag: vi.fn(),
      setLevel: vi.fn(),
      setContext: vi.fn()
    }),
  captureMessage: vi.fn(),
  captureException: vi.fn()
}))

vi.mock('../../core', () => ({
  genTouchApp: () => ({ channel: null })
}))

vi.mock('../box-tool/core-box/window', () => ({
  windowManager: {
    getAttachedPlugin: vi.fn(() => null)
  }
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn(() => null)
  }
}))

vi.mock('../notification', () => ({
  notificationModule: {
    pushInboxEntry: pushInboxEntryMock
  }
}))

vi.mock('../ai/intelligence-config', () => ({
  INTERNAL_SYSTEM_OCR_PROVIDER_ID: 'local-system-ocr',
  ensureIntelligenceConfigLoaded: ensureIntelligenceConfigLoadedMock,
  getCapabilityOptions: getCapabilityOptionsMock,
  getCapabilityPrompt: vi.fn()
}))

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    invoke: aiInvokeMock
  }
}))

import { ocrService } from './ocr-service'

interface OcrServiceTestAccess {
  runAgentJob: (jobId: number, job: Record<string, unknown>) => Promise<void>
  updateClipboardMeta: (...args: unknown[]) => Promise<void>
  normalizeSourceForAgent: (...args: unknown[]) => Promise<{ type: string; dataUrl: string }>
  buildAgentPrompt: (...args: unknown[]) => string
  persistAgentSuccess: (...args: unknown[]) => Promise<void>
  deferJob: (...args: unknown[]) => Promise<void>
  failJob: (...args: unknown[]) => Promise<void>
  queueDisabledUntil: number | null
  queueDisableReason: string | null
  consecutiveFailureCount: number
  recentFailureTimestamps: number[]
  recordJobFailure: (reason: string) => Promise<void>
  classifyRetryableAgentError: (error: Error) => string
  upsertConfig: (...args: unknown[]) => Promise<void>
  queueDisableStrike: number
  lastQueueDisabledAt: number | null
  disableQueue: (reason: string) => Promise<void>
}

afterEach(() => {
  vi.restoreAllMocks()
  ensureIntelligenceConfigLoadedMock.mockReset()
  getCapabilityOptionsMock.mockReset()
  aiInvokeMock.mockReset()
  pushInboxEntryMock.mockReset()
})

describe('OcrService runAgentJob local-first options', () => {
  it('prepends local system OCR provider and model preference', async () => {
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['openai-default', 'anthropic-default'],
      modelPreference: ['gpt-4o']
    })

    aiInvokeMock.mockResolvedValue({
      result: { text: 'hello' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'system-ocr',
      latency: 5,
      traceId: 'trace-id',
      provider: 'local'
    })

    const service = ocrService as unknown as OcrServiceTestAccess

    vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
    vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({
      type: 'data-url',
      dataUrl: 'data:image/png;base64,AA=='
    })
    vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
    vi.spyOn(service, 'persistAgentSuccess').mockResolvedValue(undefined)
    vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
    vi.spyOn(service, 'failJob').mockResolvedValue(undefined)

    await service.runAgentJob(1, {
      id: 1,
      clipboardId: 123,
      payloadHash: 'hash-1',
      meta: JSON.stringify({
        source: { type: 'clipboard' },
        options: { language: 'eng' }
      })
    })

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    const call = aiInvokeMock.mock.calls[0]
    expect(call[0]).toBe('vision.ocr')
    expect(call[2].allowedProviderIds[0]).toBe('local-system-ocr')
    expect(call[2].modelPreference[0]).toBe('system-ocr')
  })

  it('auto-disables queue after repeated failures and pushes inbox warning', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess

    vi.spyOn(service, 'upsertConfig').mockResolvedValue(undefined)

    service.queueDisabledUntil = null
    service.queueDisableReason = null
    service.consecutiveFailureCount = 0
    service.recentFailureTimestamps = []

    for (let index = 0; index < 5; index += 1) {
      await service.recordJobFailure('No enabled providers available')
    }

    expect(service.queueDisabledUntil).toBeTypeOf('number')
    expect(service.queueDisableReason).toBe('No enabled providers available')
    expect(pushInboxEntryMock).toHaveBeenCalledOnce()
  })

  it('classifies fetch failure as retryable provider network issue', () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const reason = service.classifyRetryableAgentError(new Error('fetch failed'))
    expect(reason).toBe('OCR provider network failure')
  })

  it('escalates cooldown window for repeated queue auto-disable', async () => {
    vi.useFakeTimers()
    try {
      const service = ocrService as unknown as OcrServiceTestAccess
      vi.spyOn(service, 'upsertConfig').mockResolvedValue(undefined)

      service.queueDisabledUntil = null
      service.queueDisableReason = null
      service.queueDisableStrike = 0
      service.lastQueueDisabledAt = null

      const firstNow = new Date('2026-02-24T00:00:00.000Z')
      vi.setSystemTime(firstNow)
      await service.disableQueue('No enabled providers available')
      const firstCooldownMs = (service.queueDisabledUntil ?? Date.now()) - Date.now()

      service.queueDisabledUntil = Date.now() - 1
      vi.setSystemTime(new Date('2026-02-24T01:00:00.000Z'))
      await service.disableQueue('No enabled providers available')
      const secondCooldownMs = (service.queueDisabledUntil ?? Date.now()) - Date.now()

      expect(secondCooldownMs).toBeGreaterThan(firstCooldownMs)
      expect(service.queueDisableStrike).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
