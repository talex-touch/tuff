import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
  normalizeSourceForAgent: (...args: unknown[]) => Promise<{
    type: string
    dataUrl?: string
    filePath?: string
  }>
  buildJobPayload: (...args: unknown[]) => Promise<{
    clipboardId: number
    source: { type: string; dataUrl?: string; filePath?: string }
    options: { language: string }
    payloadHash: string | null
  } | null>
  buildAgentPrompt: (...args: unknown[]) => string
  persistAgentSuccess: (...args: unknown[]) => Promise<void>
  deferJob: (...args: unknown[]) => Promise<void>
  failJob: (...args: unknown[]) => Promise<void>
  invokeWorkerOcr: (...args: unknown[]) => Promise<Record<string, unknown>>
  shouldUseWorkerPath: (...args: unknown[]) => boolean
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

  it('uses file source for clipboard image file payload', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ocr-service-image-'))
    const imagePath = path.join(tempDir, 'clipboard.png')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    try {
      const payload = await service.buildJobPayload({
        clipboardId: 1001,
        item: {
          type: 'image',
          content: imagePath,
          meta: null
        },
        formats: ['public.png']
      })

      expect(payload).not.toBeNull()
      expect(payload?.source.type).toBe('file')
      expect(payload?.source.filePath).toBe(imagePath)
      expect(typeof payload?.payloadHash).toBe('string')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('normalizes explicit file source without base64 conversion', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ocr-service-source-'))
    const imagePath = path.join(tempDir, 'source.jpg')
    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]))

    try {
      const source = await service.normalizeSourceForAgent(
        {
          type: 'file',
          filePath: imagePath
        },
        null
      )

      expect(source).toEqual({
        type: 'file',
        filePath: imagePath
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uses worker invocation path when enabled and source supported', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const previousWorkerEnv = process.env.TUFF_OCR_WORKER_ENABLED
    process.env.TUFF_OCR_WORKER_ENABLED = '1'

    try {
      getCapabilityOptionsMock.mockReturnValue({
        allowedProviderIds: ['local-system-ocr'],
        modelPreference: ['system-ocr']
      })

      const workerInvokeSpy = vi.spyOn(service, 'invokeWorkerOcr').mockResolvedValue({
        result: { text: 'worker-path' },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: 'system-ocr-worker',
        latency: 3,
        traceId: 'worker-trace',
        provider: 'local'
      })
      vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
      vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({
        type: 'file',
        filePath: '/tmp/ocr-worker-source.png'
      })
      vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
      const persistSpy = vi.spyOn(service, 'persistAgentSuccess').mockResolvedValue(undefined)
      vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
      vi.spyOn(service, 'failJob').mockResolvedValue(undefined)

      await service.runAgentJob(9, {
        id: 9,
        clipboardId: 321,
        payloadHash: 'hash-worker',
        meta: JSON.stringify({
          source: { type: 'clipboard' },
          options: { language: 'eng' }
        })
      })

      expect(workerInvokeSpy).toHaveBeenCalledOnce()
      expect(aiInvokeMock).not.toHaveBeenCalled()
      expect(persistSpy).toHaveBeenCalledOnce()
    } finally {
      if (previousWorkerEnv === undefined) {
        delete process.env.TUFF_OCR_WORKER_ENABLED
      } else {
        process.env.TUFF_OCR_WORKER_ENABLED = previousWorkerEnv
      }
    }
  })

  it('falls back to provider invocation when worker path fails', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const previousWorkerEnv = process.env.TUFF_OCR_WORKER_ENABLED
    process.env.TUFF_OCR_WORKER_ENABLED = '1'

    try {
      getCapabilityOptionsMock.mockReturnValue({
        allowedProviderIds: ['local-system-ocr'],
        modelPreference: ['system-ocr']
      })

      aiInvokeMock.mockResolvedValue({
        result: { text: 'provider-path' },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: 'system-ocr',
        latency: 6,
        traceId: 'provider-trace',
        provider: 'local'
      })

      const workerInvokeSpy = vi
        .spyOn(service, 'invokeWorkerOcr')
        .mockRejectedValue(new Error('worker unavailable'))
      vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
      vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({
        type: 'file',
        filePath: '/tmp/ocr-worker-fallback.png'
      })
      vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
      const persistSpy = vi.spyOn(service, 'persistAgentSuccess').mockResolvedValue(undefined)
      vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
      vi.spyOn(service, 'failJob').mockResolvedValue(undefined)

      await service.runAgentJob(11, {
        id: 11,
        clipboardId: 654,
        payloadHash: 'hash-worker-fallback',
        meta: JSON.stringify({
          source: { type: 'clipboard' },
          options: { language: 'eng' }
        })
      })

      expect(workerInvokeSpy).toHaveBeenCalledOnce()
      expect(aiInvokeMock).toHaveBeenCalledOnce()
      expect(persistSpy).toHaveBeenCalledOnce()
    } finally {
      if (previousWorkerEnv === undefined) {
        delete process.env.TUFF_OCR_WORKER_ENABLED
      } else {
        process.env.TUFF_OCR_WORKER_ENABLED = previousWorkerEnv
      }
    }
  })
})
