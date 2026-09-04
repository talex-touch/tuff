import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const workerMocks = vi.hoisted(() => ({
  instances: [] as Array<{ workerData: unknown }>
}))

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

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()

  return {
    ...actual,
    Worker: class {
      private readonly listeners = new Map<string, (payload: unknown) => void>()

      constructor(_workerPath: string, options: { workerData: unknown }) {
        workerMocks.instances.push({ workerData: options.workerData })
        queueMicrotask(() => {
          this.listeners.get('message')?.({ status: 'success', result: { text: 'worker-path' } })
        })
      }

      once(event: string, listener: (payload: unknown) => void) {
        this.listeners.set(event, listener)
        return this
      }

      terminate() {
        return Promise.resolve(0)
      }
    }
  }
})

import { ocrService } from './ocr-service'

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
  workerMocks.instances.length = 0
  vi.restoreAllMocks()
  ensureIntelligenceConfigLoadedMock.mockReset()
  getCapabilityOptionsMock.mockReset()
  aiInvokeMock.mockReset()
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
          options: {}
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

  it('forwards an unhinted clipboard OCR job to the native worker', async () => {
    const service = ocrService as unknown as OcrServiceTestAccess

    const response = await service.invokeWorkerOcr(
      12,
      {
        clipboardId: 500,
        payloadHash: 'worker-unhinted'
      },
      {
        source: { type: 'file', filePath: '/tmp/clipboard-image.png' },
        options: {}
      },
      {
        type: 'file',
        filePath: '/tmp/clipboard-image.png'
      }
    )

    expect(response).toMatchObject({ result: { text: 'worker-path' } })
    expect(workerMocks.instances).toHaveLength(1)
    const workerData = workerMocks.instances[0]?.workerData as {
      options: { language?: string }
    }
    expect(workerData.options.language).toBeUndefined()
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
          options: {}
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
