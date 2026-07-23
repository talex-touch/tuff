import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardCapturePipeline } from './clipboard-capture-pipeline'
import { ClipboardHelper } from './clipboard-capture-freshness'

interface FakeClipboardImage {
  isEmpty: () => boolean
  getSize: () => { width: number; height: number }
  resize: ReturnType<typeof vi.fn<() => { toDataURL: () => string }>>
  toDataURL: () => string
  toPNG: () => Buffer
}

function createEmptyImage(): FakeClipboardImage {
  return {
    isEmpty: () => true,
    getSize: () => ({ width: 0, height: 0 }),
    resize: vi.fn(() => ({ toDataURL: () => '' })),
    toDataURL: () => '',
    toPNG: () => Buffer.alloc(0)
  }
}

function createImage(): FakeClipboardImage {
  return {
    isEmpty: () => false,
    getSize: () => ({ width: 640, height: 360 }),
    resize: vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,thumb' })),
    toDataURL: () => 'data:image/png;base64,fingerprint',
    toPNG: () => Buffer.from('png')
  }
}

const mocks = vi.hoisted(() => ({
  availableFormats: vi.fn(),
  readText: vi.fn(),
  readHTML: vi.fn(),
  readImage: vi.fn(createEmptyImage),
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
    readImage: mocks.readImage
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
  const createClipboardImageFile = vi.fn(async () => ({
    path: '/tmp/tuff/clipboard/images/image.png',
    sizeBytes: 123
  }))
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
    getReader: () => ({
      kind: 'electron',
      readText: async () => mocks.readText(),
      readHtml: async () => mocks.readHTML(),
      readFiles: async () => [],
      readImage: async () => {
        const image = mocks.readImage()
        return image.isEmpty() ? null : (image as never)
      }
    }),
    getLastSuccessfulScanAt: () => lastSuccessfulScanAt,
    getLastImagePersistAt: () => lastImagePersistAt,
    getTransport: () => ({ sendToPlugin: mocks.sendToPlugin }) as never,
    imagePersistence: {
      createClipboardImageFile
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
    createClipboardImageFile,
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
    mocks.readImage.mockReturnValue(createEmptyImage())
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

  it('captures a CoreBox show baseline image even when bootstrap already saw the same image', async () => {
    const image = createImage()
    mocks.availableFormats.mockReturnValue(['public.png'])
    mocks.readText.mockReturnValue('')
    mocks.readHTML.mockReturnValue('')
    mocks.readImage.mockReturnValue(image)
    mocks.values.mockReturnValueOnce({
      returning: vi.fn(async () => [
        {
          id: 12,
          type: 'image',
          content: '/tmp/tuff/clipboard/images/image.png',
          rawContent: '',
          thumbnail: 'data:image/png;base64,thumb',
          metadata: null
        }
      ])
    })
    const context = createPipeline()

    await context.pipeline.process('corebox-show-baseline')

    expect(context.createClipboardImageFile).toHaveBeenCalledWith(Buffer.from('png'))
    expect(context.rememberFreshness).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, type: 'image' }),
      expect.objectContaining({ eligible: false, captureSource: 'corebox-show-baseline' })
    )
    expect(context.updateMemoryCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, type: 'image' })
    )
    expect(context.notifyTransportChange).toHaveBeenCalled()
  })

  it('keeps background polling deduped for a bootstrap-seen image', async () => {
    const image = createImage()
    mocks.availableFormats.mockReturnValue(['public.png'])
    mocks.readText.mockReturnValue('')
    mocks.readHTML.mockReturnValue('')
    mocks.readImage.mockReturnValue(image)
    const context = createPipeline()

    await context.pipeline.process('background-poll')

    expect(context.createClipboardImageFile).not.toHaveBeenCalled()
    expect(context.updateMemoryCache).not.toHaveBeenCalled()
    expect(context.notifyTransportChange).not.toHaveBeenCalled()
  })

  it('captures a CoreBox baseline image after an earlier poll saw the bootstrap image', async () => {
    const image = createImage()
    mocks.availableFormats.mockReturnValue(['public.png'])
    mocks.readText.mockReturnValue('')
    mocks.readHTML.mockReturnValue('')
    mocks.readImage.mockReturnValue(image)
    const context = createPipeline()

    await context.pipeline.process('background-poll')

    expect(context.getState().lastSuccessfulScanAt).toEqual(expect.any(Number))
    expect(context.createClipboardImageFile).not.toHaveBeenCalled()

    mocks.values.mockReturnValueOnce({
      returning: vi.fn(async () => [
        {
          id: 13,
          type: 'image',
          content: '/tmp/tuff/clipboard/images/image.png',
          rawContent: '',
          thumbnail: 'data:image/png;base64,thumb',
          metadata: null
        }
      ])
    })

    await context.pipeline.process('corebox-show-baseline')

    expect(context.createClipboardImageFile).toHaveBeenCalledWith(Buffer.from('png'))
    expect(context.rememberFreshness).toHaveBeenCalledWith(
      expect.objectContaining({ id: 13, type: 'image' }),
      expect.objectContaining({ eligible: false, captureSource: 'corebox-show-baseline' })
    )
    expect(context.updateMemoryCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 13, type: 'image' })
    )
    expect(context.notifyTransportChange).toHaveBeenCalled()
  })
})
