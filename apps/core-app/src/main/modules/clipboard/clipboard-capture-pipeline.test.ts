import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardCapturePipeline } from './clipboard-capture-pipeline'
import { ClipboardHelper } from './clipboard-capture-freshness'

const mocks = vi.hoisted(() => ({
  availableFormats: vi.fn(),
  readText: vi.fn(),
  readHTML: vi.fn(),
  sendToPlugin: vi.fn(async () => undefined),
  getAttachedPlugin: vi.fn(),
  shouldForwardClipboardChange: vi.fn(),
  schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => await operation()),
  values: vi.fn(() => ({
    returning: vi.fn(async () => [
      {
        id: 11,
        type: 'text',
        content: 'https://example.test',
        rawContent: '<b>https://example.test</b>',
        metadata: null
      }
    ])
  })),
  setTaskMeta: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    availableFormats: mocks.availableFormats,
    readText: mocks.readText,
    readHTML: mocks.readHTML,
    readImage: vi.fn(() => ({ isEmpty: () => true }))
  }
}))

vi.mock('../box-tool/core-box/window', () => ({
  windowManager: {
    getAttachedPlugin: mocks.getAttachedPlugin,
    shouldForwardClipboardChange: mocks.shouldForwardClipboardChange
  }
}))

vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    getStats: () => ({ queued: 0, processing: 0, currentTaskLabel: null }),
    schedule: mocks.schedule
  }
}))

vi.mock('../../db/schema', () => ({
  clipboardHistory: {}
}))

vi.mock('../../utils/perf-context', () => ({
  enterPerfContext: vi.fn(() => vi.fn())
}))

vi.mock('../../utils/perf-monitor', () => ({
  perfMonitor: {
    recordMainReport: vi.fn()
  }
}))

function createPipeline() {
  const helper = new ClipboardHelper()
  const metaPersistence = {
    withDbWrite: vi.fn(async (_label: string, operation: () => Promise<unknown>) => {
      return await operation()
    }),
    persistMetaEntriesSafely: vi.fn()
  }
  const updateMemoryCache = vi.fn()
  const notifyTransportChange = vi.fn()
  const rememberFreshness = vi.fn()
  const enqueueStageB = vi.fn()
  const db = {
    insert: vi.fn(() => ({ values: mocks.values }))
  }
  let lastSuccessfulScanAt: number | null = null
  let lastImagePersistAt = 0
  let cooldownUntil = 0

  const pipeline = new ClipboardCapturePipeline({
    getDatabase: () => db as never,
    getClipboardHelper: () => helper,
    getLastSuccessfulScanAt: () => lastSuccessfulScanAt,
    getLastImagePersistAt: () => lastImagePersistAt,
    getTransport: () => ({ sendToPlugin: mocks.sendToPlugin }) as never,
    imagePersistence: {
      createClipboardImageFile: vi.fn()
    } as never,
    metaPersistence: metaPersistence as never,
    rememberFreshness,
    updateMemoryCache,
    notifyTransportChange,
    enqueueStageB,
    shouldLogMetaQueuePressure: () => true,
    setLastSuccessfulScanAt: (value) => {
      lastSuccessfulScanAt = value
    },
    setLastImagePersistAt: (value) => {
      lastImagePersistAt = value
    },
    setCooldownUntil: (value) => {
      cooldownUntil = value
    },
    setTaskMeta: mocks.setTaskMeta,
    logInfo: mocks.logInfo,
    logWarn: mocks.logWarn
  })

  return {
    pipeline,
    helper,
    metaPersistence,
    updateMemoryCache,
    notifyTransportChange,
    rememberFreshness,
    enqueueStageB,
    getState: () => ({ lastSuccessfulScanAt, lastImagePersistAt, cooldownUntil })
  }
}

describe('clipboard-capture-pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.availableFormats.mockReturnValue(['text/plain', 'text/html'])
    mocks.readText.mockReturnValue('https://example.test')
    mocks.readHTML.mockReturnValue('<b>https://example.test</b>')
    mocks.getAttachedPlugin.mockReturnValue({ name: 'demo-plugin', _uniqueChannelKey: 'key' })
    mocks.shouldForwardClipboardChange.mockReturnValue(true)
  })

  it('persists changed text captures and forwards the change event', async () => {
    const context = createPipeline()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('https://example.test')

    await context.pipeline.process('visible-poll')

    expect(context.metaPersistence.withDbWrite).toHaveBeenCalledWith(
      'clipboard.persist',
      expect.any(Function)
    )
    expect(context.rememberFreshness).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, type: 'text', content: 'https://example.test' }),
      expect.objectContaining({ eligible: true, captureSource: 'visible-poll' })
    )
    expect(context.metaPersistence.persistMetaEntriesSafely).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        capture_source: 'visible-poll',
        text_length: 'https://example.test'.length,
        html_length: '<b>https://example.test</b>'.length,
        tags: ['url'],
        auto_paste_eligible: true
      }),
      expect.any(Array),
      { dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
    )
    expect(context.enqueueStageB).toHaveBeenCalledWith({
      clipboardId: 11,
      item: expect.objectContaining({ id: 11 }),
      formats: ['text/plain', 'text/html']
    })
    expect(context.updateMemoryCache).toHaveBeenCalled()
    expect(context.notifyTransportChange).toHaveBeenCalled()
    expect(mocks.sendToPlugin).toHaveBeenCalled()
    expect(context.getState().lastSuccessfulScanAt).toEqual(expect.any(Number))
    expect(mocks.setTaskMeta).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: expect.any(Number) })
    )
  })
})
