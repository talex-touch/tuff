import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const {
  ensureIntelligenceConfigLoadedMock,
  getCapabilityOptionsMock,
  aiInvokeMock,
  embeddingGenerateMock,
  pushInboxEntryMock
} = vi.hoisted(() => ({
  ensureIntelligenceConfigLoadedMock: vi.fn(),
  getCapabilityOptionsMock: vi.fn(),
  aiInvokeMock: vi.fn(),
  embeddingGenerateMock: vi.fn(),
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
    invoke: aiInvokeMock,
    embedding: { generate: embeddingGenerateMock }
  }
}))

import { ocrService } from './ocr-service'
import { createUsageLimitError } from '../ai/usage-ledger/usage-limits'

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

afterEach(() => {
  vi.restoreAllMocks()
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

/**
 * The start write must survive write-queue pressure (#645).
 *
 * It used to be skipped whenever the scheduler was backed up, which dropped the attempts
 * increment. A job whose image crashes the native worker then comes back as pending/attempts=0 on
 * the next launch, MAX_ATTEMPTS is never reached, and it is re-dispatched every poll forever.
 */
describe('ocr dispatch persists the attempt', () => {
  type Dispatchable = {
    db: unknown
    processing: boolean
    activeJobs: Map<number, Promise<void>>
    processQueue: () => Promise<void>
    runAgentJob: (jobId: number, job: unknown) => Promise<void>
    upsertConfig: (key: string, value: unknown) => Promise<void>
    isQueueDisabled: () => Promise<boolean>
    withDbWrite: (label: string, op: unknown, options?: unknown) => Promise<unknown>
  }

  function readyJobDb(job: Record<string, unknown>) {
    const builder = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: async () => [job]
    }
    return { select: () => builder }
  }

  it('schedules ocr.jobs.start as critical and undroppable, however deep the queue', async () => {
    const service = ocrService as unknown as Dispatchable
    const writes: Array<{ label: string; options?: { priority?: string; dropPolicy?: string } }> =
      []

    service.db = readyJobDb({ id: 42, clipboardId: 7, attempts: 0 })
    service.processing = false
    service.activeJobs = new Map()
    service.isQueueDisabled = async () => false
    service.upsertConfig = async () => {}
    service.runAgentJob = async () => {}
    service.withDbWrite = async (label, _op, options) => {
      writes.push({ label, options: options as { priority?: string; dropPolicy?: string } })
      return undefined
    }

    await service.processQueue()

    const startWrite = writes.find((entry) => entry.label === 'ocr.jobs.start')

    // Positive control: the dispatch path ran at all. Without it an early return would satisfy
    // every assertion below by never writing anything.
    expect(writes.length).toBeGreaterThan(0)

    expect(startWrite, 'ocr.jobs.start was not scheduled').toBeDefined()
    expect(startWrite?.options?.priority).toBe('critical')
    expect(startWrite?.options?.dropPolicy).toBe('none')
  })
})

describe('OcrService processQueue re-entrancy', () => {
  it('lets only one concurrent caller past the guard', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess
    const originalProcessing = service.processing
    const originalDb = service.db
    const originalIsQueueDisabled = service.isQueueDisabled

    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const isQueueDisabled = vi.fn(async () => {
      await gate
      return true // stop before touching the database; the guard is what is under test
    })

    service.processing = false
    service.db = {}
    service.isQueueDisabled = isQueueDisabled

    try {
      // Both start before either can finish the config read.
      const first = service.processQueue()
      const second = service.processQueue()
      release!()
      await Promise.all([first, second])

      // The defect: both callers reached the config read, so both went on to dispatch.
      expect(isQueueDisabled).toHaveBeenCalledTimes(1)
    } finally {
      service.processing = originalProcessing
      service.db = originalDb
      service.isQueueDisabled = originalIsQueueDisabled
    }
  })

  it('releases the guard even when the queue is disabled', async () => {
    // The claim moved above an early return, so a missed finally would wedge the queue shut.
    const service = ocrService as unknown as OcrServiceTestAccess
    const originalDb = service.db
    const originalIsQueueDisabled = service.isQueueDisabled

    service.processing = false
    service.db = {}
    service.isQueueDisabled = vi.fn(async () => true)

    try {
      await service.processQueue()
      expect(service.processing).toBe(false)
    } finally {
      service.db = originalDb
      service.isQueueDisabled = originalIsQueueDisabled
    }
  })
})
