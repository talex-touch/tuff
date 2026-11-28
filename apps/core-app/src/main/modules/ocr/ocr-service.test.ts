import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const {
  ensureIntelligenceConfigLoadedMock,
  getCapabilityOptionsMock,
  aiInvokeMock,
  embeddingGenerateMock,
  pushInboxEntryMock,
  checkPermissionMock,
  getPermissionModuleMock
} = vi.hoisted(() => {
  const checkPermissionMock = vi.fn(() => ({ allowed: true }))
  return {
    ensureIntelligenceConfigLoadedMock: vi.fn(),
    getCapabilityOptionsMock: vi.fn(),
    aiInvokeMock: vi.fn(),
    embeddingGenerateMock: vi.fn(),
    pushInboxEntryMock: vi.fn(),
    checkPermissionMock,
    getPermissionModuleMock: vi.fn<() => { checkPermission: typeof checkPermissionMock } | null>(
      () => ({
        checkPermission: checkPermissionMock
      })
    )
  }
})

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

vi.mock('../permission', () => ({
  getPermissionModule: getPermissionModuleMock
}))

vi.mock('../ai/intelligence-config', () => ({
  INTERNAL_SYSTEM_OCR_PROVIDER_ID: 'local-system-ocr',
  ensureIntelligenceConfigLoaded: ensureIntelligenceConfigLoadedMock,
  getCapabilityOptions: getCapabilityOptionsMock,
  getCapabilityPrompt: vi.fn()
}))

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    invoke: aiInvokeMock,
    embedding: { generate: embeddingGenerateMock }
  }
}))

import { ocrService } from './ocr-service'
import { createUsageLimitError } from '../ai/usage-ledger/usage-limits'
import { ocrJobs } from '../../db/schema'

interface OcrServiceTestAccess {
  processQueue: () => Promise<void>
  processing: boolean
  isQueueDisabled: () => Promise<boolean>
  db: unknown
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
    options: { language?: string }
    payloadHash: string | null
  } | null>
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

let serviceSnapshot: PropertyDescriptorMap

beforeEach(() => {
  serviceSnapshot = Object.getOwnPropertyDescriptors(ocrService)
  for (const descriptor of Object.values(serviceSnapshot)) {
    if (descriptor.value instanceof Map) descriptor.value = new Map(descriptor.value)
    else if (Array.isArray(descriptor.value)) descriptor.value = [...descriptor.value]
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of Object.getOwnPropertyNames(ocrService)) {
    if (!(key in serviceSnapshot)) Reflect.deleteProperty(ocrService, key)
  }
  Object.defineProperties(ocrService, serviceSnapshot)
  ensureIntelligenceConfigLoadedMock.mockReset()
  getCapabilityOptionsMock.mockReset()
  aiInvokeMock.mockReset()
  embeddingGenerateMock.mockReset()
  pushInboxEntryMock.mockReset()
})

describe('OcrService runAgentJob local-first options', () => {
  it('preserves legacy persisted job language while prepending local OCR preferences', async () => {
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
        options: { language: 'fr-FR' }
      })
    })

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    const call = aiInvokeMock.mock.calls[0]
    expect(call[0]).toBe('vision.ocr')
    expect(call[1]).toMatchObject({ language: 'fr-FR' })
    expect(call[2].allowedProviderIds[0]).toBe('local-system-ocr')
    expect(call[2].modelPreference[0]).toBe('system-ocr')
    // Stable usage-ledger caller of the clipboard OCR agent (AC-B5).
    expect(call[2].metadata).toEqual({ caller: 'core.ocr.clipboard' })
    expect(call[2].timeout).toBe(45_000)
  })

  it('counts the OCR text embedding under its own stable caller', async () => {
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['openai-default'],
      modelPreference: ['text-embedding-3-small']
    })
    embeddingGenerateMock.mockResolvedValue({ result: [0.25, 0.5] })
    const service = ocrService as unknown as {
      generateEmbedding: (text: string) => Promise<number[] | null>
    }

    await expect(service.generateEmbedding('recognised clipboard text')).resolves.toEqual([
      0.25, 0.5
    ])
    expect(embeddingGenerateMock).toHaveBeenCalledWith(
      { text: 'recognised clipboard text' },
      {
        modelPreference: ['text-embedding-3-small'],
        allowedProviderIds: ['openai-default'],
        metadata: { caller: 'core.ocr.embedding' }
      }
    )
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

  it('classifies OCR process timeouts and exits as retryable', () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const timeoutErr = Object.assign(new Error('OCR process timed out after 45000ms'), {
      code: 'OCR_PROCESS_TIMEOUT'
    })
    const exitErr = Object.assign(new Error('OCR process exited with code 1'), {
      code: 'OCR_PROCESS_EXITED'
    })
    expect(service.classifyRetryableAgentError(timeoutErr)).toBe('OCR process timed out')
    expect(service.classifyRetryableAgentError(exitErr)).toBe('OCR process exited')
  })

  it('ends a job the global usage limit refused with that code and never retries it', async () => {
    getCapabilityOptionsMock.mockReturnValue({ allowedProviderIds: [], modelPreference: [] })
    aiInvokeMock.mockRejectedValue(
      createUsageLimitError('vision.ocr', {
        key: 'requestsPerDay',
        used: 3,
        max: 3,
        resetsAt: Date.parse('2026-10-03T16:00:00.000Z')
      })
    )
    const service = ocrService as unknown as OcrServiceTestAccess & {
      withDbWrite: (label: string, operation: (db: unknown) => Promise<unknown>) => Promise<unknown>
    }
    const updateClipboardMeta = vi
      .spyOn(service, 'updateClipboardMeta')
      .mockResolvedValue(undefined)
    vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({
      type: 'data-url',
      dataUrl: 'data:image/png;base64,AA=='
    })
    vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
    const deferJob = vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
    const failJob = vi.spyOn(service, 'failJob').mockResolvedValue(undefined)
    const recordJobFailure = vi.spyOn(service, 'recordJobFailure').mockResolvedValue(undefined)
    const jobUpdates: unknown[] = []
    const fakeDb = {
      update: () => ({
        set: (values: unknown) => {
          jobUpdates.push(values)
          return { where: async () => undefined }
        }
      })
    }
    vi.spyOn(service, 'withDbWrite').mockImplementation(async (_label, operation) =>
      operation(fakeDb)
    )
    const previousDb = service.db
    service.db = fakeDb

    try {
      await service.runAgentJob(7, {
        id: 7,
        clipboardId: 321,
        attempts: 1,
        payloadHash: 'hash-7',
        meta: JSON.stringify({ source: { type: 'clipboard' }, options: {} })
      })
    } finally {
      service.db = previousDb
    }

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    expect(jobUpdates).toEqual([
      expect.objectContaining({
        status: 'failed',
        lastError: 'USAGE_LIMIT_REACHED',
        nextRetryAt: null
      })
    ])
    expect(updateClipboardMeta).toHaveBeenLastCalledWith(
      321,
      expect.objectContaining({
        ocr_status: 'failed',
        ocr_last_error: 'USAGE_LIMIT_REACHED',
        ocr_next_retry_at: null
      })
    )
    // No retry path: neither deferred nor re-queued, and not counted toward disabling the queue.
    expect(deferJob).not.toHaveBeenCalled()
    expect(failJob).not.toHaveBeenCalled()
    expect(recordJobFailure).not.toHaveBeenCalled()
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
      expect(payload?.options).toEqual({})
      expect(typeof payload?.payloadHash).toBe('string')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it.each([
    { name: 'Chinese app locale', languageHint: 'zh-CN', expectedLanguage: 'zh-Hans' },
    { name: 'English app locale', languageHint: 'en-US', expectedLanguage: 'en-US' },
    { name: 'absent app locale', languageHint: undefined, expectedLanguage: undefined },
    { name: 'unsupported app locale', languageHint: 'ja-JP', expectedLanguage: undefined }
  ])(
    'normalizes $name into the native OCR language hint',
    async ({ languageHint, expectedLanguage }) => {
      const service = ocrService as unknown as OcrServiceTestAccess

      const payload = await service.buildJobPayload({
        clipboardId: 1003,
        item: {
          type: 'image',
          content: 'data:image/png;base64,AA==',
          meta: null
        },
        formats: ['public.png'],
        languageHint
      })

      expect(payload?.options.language).toBe(expectedLanguage)
    }
  )

  it('creates unhinted OCR jobs for clipboard file images', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ocr-service-files-'))
    const imagePath = path.join(tempDir, 'clipboard.png')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    try {
      const payload = await service.buildJobPayload({
        clipboardId: 1002,
        item: {
          type: 'files',
          content: JSON.stringify([imagePath]),
          meta: null
        },
        formats: ['public.file-url']
      })

      expect(payload).not.toBeNull()
      expect(payload?.source).toEqual({ type: 'file', filePath: imagePath })
      expect(payload?.options).toEqual({})
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

  function stubAgentJobDeps(service: OcrServiceTestAccess, filePath: string) {
    vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
    vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({ type: 'file', filePath })
    vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
    const persistSpy = vi.spyOn(service, 'persistAgentSuccess').mockResolvedValue(undefined)
    const deferSpy = vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
    const failSpy = vi.spyOn(service, 'failJob').mockResolvedValue(undefined)
    return { persistSpy, deferSpy, failSpy }
  }

  function successfulInvocation(text: string) {
    return {
      result: { text },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'system-ocr',
      latency: 6,
      traceId: 'provider-trace',
      provider: 'local'
    }
  }

  it('resolves a supported file job through exactly one route and persists one success', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['local-system-ocr'],
      modelPreference: ['system-ocr']
    })
    aiInvokeMock.mockResolvedValue(successfulInvocation('provider-path'))

    const { persistSpy, deferSpy, failSpy } = stubAgentJobDeps(service, '/tmp/ocr-source.png')

    await service.runAgentJob(9, {
      id: 9,
      clipboardId: 321,
      payloadHash: 'hash-single-route',
      meta: JSON.stringify({ source: { type: 'clipboard' }, options: {} })
    })

    // Regression: the removed worker-first path recognised the image natively, timed out after
    // 30s, then ran the same image a second time through the provider route. That duplicate
    // native recognition is what aborted the host. A supported job must resolve through one route.
    expect(aiInvokeMock).toHaveBeenCalledOnce()
    expect(persistSpy).toHaveBeenCalledOnce()
    expect(deferSpy).not.toHaveBeenCalled()
    expect(failSpy).not.toHaveBeenCalled()
  })

  it('defers a retryable provider failure once and never fails the job', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['local-system-ocr'],
      modelPreference: ['system-ocr']
    })
    aiInvokeMock.mockRejectedValue(new Error('fetch failed'))

    const { persistSpy, deferSpy, failSpy } = stubAgentJobDeps(service, '/tmp/ocr-retry.png')

    await service.runAgentJob(11, {
      id: 11,
      clipboardId: 654,
      payloadHash: 'hash-retryable',
      meta: JSON.stringify({ source: { type: 'clipboard' }, options: {} })
    })

    // A retryable classification must defer (one attempt), not double-run native work and not
    // burn the job as fatal.
    expect(aiInvokeMock).toHaveBeenCalledOnce()
    expect(deferSpy).toHaveBeenCalledOnce()
    expect(failSpy).not.toHaveBeenCalled()
    expect(persistSpy).not.toHaveBeenCalled()
  })

  it('defers OCR process timeout instead of failing the job on the first attempt', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['local-system-ocr'],
      modelPreference: ['system-ocr']
    })
    aiInvokeMock.mockRejectedValue(
      Object.assign(new Error('OCR process timed out after 45000ms'), {
        code: 'OCR_PROCESS_TIMEOUT'
      })
    )

    const { persistSpy, deferSpy, failSpy } = stubAgentJobDeps(service, '/tmp/ocr-timeout.png')

    await service.runAgentJob(13, {
      id: 13,
      clipboardId: 888,
      attempts: 1,
      payloadHash: 'hash-timeout',
      meta: JSON.stringify({ source: { type: 'clipboard' }, options: {} })
    })

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    expect(deferSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 13 }),
      'OCR process timed out'
    )
    expect(failSpy).not.toHaveBeenCalled()
    expect(persistSpy).not.toHaveBeenCalled()
  })

  it('fails an unclassified provider error once instead of deferring it', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['local-system-ocr'],
      modelPreference: ['system-ocr']
    })
    aiInvokeMock.mockRejectedValue(new Error('image decode exploded'))

    const { persistSpy, deferSpy, failSpy } = stubAgentJobDeps(service, '/tmp/ocr-fatal.png')

    await service.runAgentJob(12, {
      id: 12,
      clipboardId: 777,
      payloadHash: 'hash-fatal',
      meta: JSON.stringify({ source: { type: 'clipboard' }, options: {} })
    })

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    expect(failSpy).toHaveBeenCalledOnce()
    expect(deferSpy).not.toHaveBeenCalled()
    expect(persistSpy).not.toHaveBeenCalled()
  })
})

describe('OcrService clipboard metadata', () => {
  it('merges OCR-detected tags and search terms with persisted clipboard metadata', async () => {
    type MetaWriteService = OcrServiceTestAccess & {
      withDbWrite: (
        label: string,
        operation: (db: {
          transaction: (
            callback: (tx: {
              select: () => {
                from: () => {
                  where: () => {
                    limit: () => Promise<Array<{ metadata: string }>>
                  }
                }
              }
              delete: () => { where: () => Promise<void> }
              insert: () => {
                values: (values: Array<{ key: string; value: string }>) => Promise<void>
              }
              update: () => {
                set: (values: { metadata: string }) => { where: () => Promise<void> }
              }
            }) => Promise<void>
          ) => Promise<void>
        }) => Promise<void>
      ) => Promise<void>
    }

    const service = ocrService as unknown as MetaWriteService
    const originalDb = service.db
    const originalWithDbWrite = service.withDbWrite
    let persistedMetadata: string | null = null

    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                metadata: JSON.stringify({
                  tags: ['email', 'legacy_tag'],
                  tag_search_terms: ['email', 'legacy-alias']
                })
              }
            ]
          })
        })
      }),
      delete: () => ({ where: async () => undefined }),
      insert: () => ({ values: async () => undefined }),
      update: () => ({
        set: ({ metadata }: { metadata: string }) => ({
          where: async () => {
            persistedMetadata = metadata
          }
        })
      })
    }

    service.db = {}
    service.withDbWrite = async (_label, operation) =>
      operation({ transaction: async (callback) => callback(tx) })

    try {
      await service.updateClipboardMeta(7, {
        ocr_status: 'done',
        tags: ['api_key', 'github', 'api_key'],
        tag_search_terms: ['wechat', 'wx', '微信', 'wx']
      })

      expect(JSON.parse(persistedMetadata ?? '{}')).toMatchObject({
        ocr_status: 'done',
        tags: ['email', 'legacy_tag', 'api_key', 'github'],
        tag_search_terms: ['email', 'legacy-alias', 'wechat', 'wx', '微信']
      })
    } finally {
      service.db = originalDb
      service.withDbWrite = originalWithDbWrite
    }
  })
})

describe('OcrService serial background dispatch', () => {
  type Job = typeof ocrJobs.$inferSelect
  type QueueDb = LibSQLDatabase
  type Dispatchable = OcrServiceTestAccess & {
    initialized: boolean
    nextDispatchAt: number
    activeJobs: Map<number, Promise<void>>
    withDbWrite: <T>(label: string, operation: (db: QueueDb) => Promise<T>) => Promise<T>
  }

  const service = ocrService as unknown as Dispatchable
  const epoch = Date.parse('2026-10-14T00:00:00.000Z')
  let client: Client
  let db: QueueDb
  let starts: Array<{ id: number; at: number }>
  let releases: Map<number, (status: 'completed' | 'failed') => void>

  function at(milliseconds: number): void {
    vi.setSystemTime(epoch + milliseconds)
  }

  async function jobs(): Promise<Array<Pick<Job, 'id' | 'status' | 'attempts'>>> {
    return db
      .select({ id: ocrJobs.id, status: ocrJobs.status, attempts: ocrJobs.attempts })
      .from(ocrJobs)
      .orderBy(ocrJobs.id)
  }

  async function finish(id: number, status: 'completed' | 'failed' = 'completed'): Promise<void> {
    const task = service.activeJobs.get(id)
    const release = releases.get(id)
    if (!task || !release) throw new Error(`OCR job ${id} was not dispatched`)
    release(status)
    await task
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setImmediate', 'clearImmediate'] })
    at(0)
    client = createClient({ url: ':memory:' })
    db = drizzle(client)
    await client.execute(`CREATE TABLE ocr_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clipboard_id INTEGER,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      next_retry_at INTEGER,
      payload_hash TEXT,
      meta TEXT,
      queued_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    )`)
    await db.insert(ocrJobs).values([
      {
        id: 1,
        clipboardId: 101,
        status: 'pending',
        priority: 0,
        attempts: 0,
        queuedAt: new Date(0)
      },
      {
        id: 2,
        clipboardId: 102,
        status: 'pending',
        priority: 0,
        attempts: 0,
        queuedAt: new Date(1_000)
      }
    ])
    starts = []
    releases = new Map()
    service.db = db
    service.initialized = true
    service.processing = false
    service.nextDispatchAt = 0
    service.activeJobs = new Map()
    vi.spyOn(service, 'isQueueDisabled').mockResolvedValue(false)
    vi.spyOn(service, 'upsertConfig').mockResolvedValue(undefined)
    vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
    vi.spyOn(service, 'withDbWrite').mockImplementation(async (_label, operation) => operation(db))
    // Native recognition is the external boundary: hold its completion explicitly while the real
    // queue selection and attempt/status writes run against SQLite.
    vi.spyOn(service, 'runAgentJob').mockImplementation(async (id) => {
      starts.push({ id, at: Date.now() - epoch })
      const status = await new Promise<'completed' | 'failed'>((resolve) => {
        releases.set(id, resolve)
      })
      await db.update(ocrJobs).set({ status, finishedAt: new Date() }).where(eq(ocrJobs.id, id))
      releases.delete(id)
    })
  })

  afterEach(async () => {
    // Settle every controlled recognition before restoring singleton state; never leave an old
    // finally callback mutating a later test's activeJobs or dispatch deadline.
    for (const release of releases.values()) release('completed')
    await Promise.allSettled([...service.activeJobs.values()])
    vi.clearAllTimers()
    vi.useRealTimers()
    client.close()
  })

  it('starts the cold queue immediately but preserves pending jobs and attempts until 10 seconds', async () => {
    await ocrService.start()
    expect(starts).toEqual([{ id: 1, at: 0 }])
    expect(await jobs()).toEqual([
      { id: 1, status: 'processing', attempts: 1 },
      { id: 2, status: 'pending', attempts: 0 }
    ])

    at(1_000)
    await finish(1)
    at(5_000)
    await ocrService.enqueueFromClipboard({
      clipboardId: 103,
      item: { type: 'image', content: 'data:image/png;base64,AA==', meta: null },
      formats: ['public.png']
    })
    at(9_999)
    await Promise.all([ocrService.start(), service.processQueue(), service.processQueue()])
    expect(starts).toEqual([{ id: 1, at: 0 }])
    expect(await jobs()).toEqual([
      { id: 1, status: 'completed', attempts: 1 },
      { id: 2, status: 'pending', attempts: 0 },
      { id: 3, status: 'pending', attempts: 0 }
    ])

    at(10_000)
    await ocrService.start()
    expect(starts).toEqual([
      { id: 1, at: 0 },
      { id: 2, at: 10_000 }
    ])
    expect(await jobs()).toEqual([
      { id: 1, status: 'completed', attempts: 1 },
      { id: 2, status: 'processing', attempts: 1 },
      { id: 3, status: 'pending', attempts: 0 }
    ])

    at(11_000)
    await finish(2)
    at(20_000)
    await service.processQueue()
    expect(starts).toEqual([
      { id: 1, at: 0 },
      { id: 2, at: 10_000 },
      { id: 3, at: 20_000 }
    ])
    expect(await jobs()).toEqual([
      { id: 1, status: 'completed', attempts: 1 },
      { id: 2, status: 'completed', attempts: 1 },
      { id: 3, status: 'processing', attempts: 1 }
    ])
  })

  it.each(['completed', 'failed'] as const)(
    'waits for an active job and rests 5 seconds after it becomes %s',
    async (status) => {
      await ocrService.start()
      at(11_000)
      await ocrService.start()
      expect(starts).toEqual([{ id: 1, at: 0 }])

      at(12_000)
      await finish(1, status)
      at(16_999)
      await Promise.all([ocrService.start(), service.processQueue()])
      expect(starts).toEqual([{ id: 1, at: 0 }])
      expect(await jobs()).toEqual([
        { id: 1, status, attempts: 1 },
        { id: 2, status: 'pending', attempts: 0 }
      ])

      at(17_000)
      await ocrService.start()
      expect(starts).toEqual([
        { id: 1, at: 0 },
        { id: 2, at: 17_000 }
      ])
      expect(await jobs()).toEqual([
        { id: 1, status, attempts: 1 },
        { id: 2, status: 'processing', attempts: 1 }
      ])
    }
  )

  it('persists the final allowed attempt before recognition and never redispatches that failed job', async () => {
    await db.update(ocrJobs).set({ attempts: 2 }).where(eq(ocrJobs.id, 1))
    await ocrService.start()
    expect(await jobs()).toEqual([
      { id: 1, status: 'processing', attempts: 3 },
      { id: 2, status: 'pending', attempts: 0 }
    ])
    await finish(1, 'failed')
    at(10_000)
    await ocrService.start()
    expect(starts).toEqual([
      { id: 1, at: 0 },
      { id: 2, at: 10_000 }
    ])
    expect(await jobs()).toEqual([
      { id: 1, status: 'failed', attempts: 3 },
      { id: 2, status: 'processing', attempts: 1 }
    ])
  })

  it('dispatches one job when concurrent callers overlap the asynchronous disabled check', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.mocked(service.isQueueDisabled).mockImplementation(async () => {
      await gate
      return false
    })
    const first = service.processQueue()
    const second = service.processQueue()
    release()
    await Promise.all([first, second])
    expect(starts).toEqual([{ id: 1, at: 0 }])
    expect(await jobs()).toEqual([
      { id: 1, status: 'processing', attempts: 1 },
      { id: 2, status: 'pending', attempts: 0 }
    ])
  })

  it('can dispatch after an earlier disabled-queue return', async () => {
    vi.mocked(service.isQueueDisabled).mockResolvedValueOnce(true)
    await ocrService.start()
    expect(await jobs()).toEqual([
      { id: 1, status: 'pending', attempts: 0 },
      { id: 2, status: 'pending', attempts: 0 }
    ])
    await ocrService.start()
    expect(starts).toEqual([{ id: 1, at: 0 }])
    expect(await jobs()).toEqual([
      { id: 1, status: 'processing', attempts: 1 },
      { id: 2, status: 'pending', attempts: 0 }
    ])
  })
})

describe('OcrService security and reliability regressions', () => {
  it('marks the job failed when normalizeSourceForAgent rejects instead of throwing unhandled', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
    vi.spyOn(service, 'normalizeSourceForAgent').mockRejectedValue(
      new Error('Image file missing on disk')
    )
    const failSpy = vi.spyOn(service, 'failJob').mockResolvedValue(undefined)

    await expect(
      service.runAgentJob(99, {
        clipboardId: 7,
        attempts: 1,
        meta: JSON.stringify({
          clipboardId: 7,
          source: { type: 'file', filePath: '/nonexistent/missing.png' },
          options: {}
        })
      })
    ).resolves.toBeUndefined()

    expect(failSpy).toHaveBeenCalledWith(99, 'Image file missing on disk', expect.any(Error), 1)
  })

  it('rejects symbolic links in ensureImageFileWithinBudget via lstat', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ocr-symlink-test-'))
    const realFile = path.join(dir, 'real.png')
    const linkFile = path.join(dir, 'link.png')
    const { symlink } = await import('node:fs/promises')
    await writeFile(realFile, Buffer.from('png'))
    await symlink(realFile, linkFile)

    try {
      const service = ocrService as unknown as {
        ensureImageFileWithinBudget: (filePath: string) => Promise<void>
      }
      await expect(service.ensureImageFileWithinBudget(linkFile)).rejects.toThrow(/regular file/i)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gates OCR metadata broadcasts on clipboard:read permission for attached plugins', async () => {
    const { windowManager } = await import('../box-tool/core-box/window')
    const broadcastPlugin = vi.fn()
    const channelStub = {
      regChannel: vi.fn(() => vi.fn()),
      sendTo: vi.fn(async () => undefined),
      sendPlugin: vi.fn(async () => undefined),
      broadcast: vi.fn(),
      broadcastTo: vi.fn(),
      broadcastPlugin
    }

    const service = ocrService as unknown as {
      setTransportChannel: (channel: unknown) => void
      broadcastMetaUpdate: (clipboardId: number, patch: Record<string, unknown>) => void
    }
    service.setTransportChannel(channelStub)

    try {
      // Denied plugin: permission checked, broadcast suppressed.
      vi.mocked(windowManager.getAttachedPlugin).mockReturnValue({
        name: 'unauthorized-plugin',
        _uniqueChannelKey: 'ch-1',
        sdkapi: 260101
      } as never)
      checkPermissionMock.mockReturnValueOnce({ allowed: false })

      service.broadcastMetaUpdate(12, { ocr_text: 'sensitive screenshot text' })
      expect(checkPermissionMock).toHaveBeenCalledWith(
        'unauthorized-plugin',
        'clipboard:read',
        260101
      )
      expect(broadcastPlugin).not.toHaveBeenCalled()

      // Unavailable permission module: fail closed, broadcast suppressed.
      getPermissionModuleMock.mockReturnValueOnce(null)
      service.broadcastMetaUpdate(12, { ocr_text: 'sensitive screenshot text' })
      expect(broadcastPlugin).not.toHaveBeenCalled()

      // Authorized plugin: broadcastPlugin receives event and payload.
      vi.mocked(windowManager.getAttachedPlugin).mockReturnValue({
        name: 'authorized-plugin',
        _uniqueChannelKey: 'ch-2',
        sdkapi: 260101
      } as never)
      checkPermissionMock.mockReturnValueOnce({ allowed: true })

      service.broadcastMetaUpdate(12, { ocr_text: 'allowed screenshot text' })
      expect(checkPermissionMock).toHaveBeenLastCalledWith(
        'authorized-plugin',
        'clipboard:read',
        260101
      )
      expect(broadcastPlugin).toHaveBeenCalledWith(
        'authorized-plugin',
        'core-box:clipboard-meta-updated',
        {
          clipboardId: 12,
          patch: { ocr_text: 'allowed screenshot text' }
        }
      )
    } finally {
      service.setTransportChannel(null)
    }
  })
})
