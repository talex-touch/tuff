import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { ClipboardCapturePipeline } from './clipboard-capture-pipeline'
import {
  DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS,
  type ClipboardClassificationSettings
} from './clipboard-classification-settings'
import { ClipboardHelper } from './clipboard-capture-freshness'
import {
  resetClipboardCaptureSuppression,
  withClipboardCaptureSuppressed
} from './clipboard-capture-suppression'

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
  // 声明入参而不是留空：它替身的是 `db.insert().values(record)`，本来就收一个参数。
  // 留空的话 `mock.calls` 的元组长度是 0，取 `[0]` 在 typecheck 下是错的。
  values: vi.fn((_record?: Record<string, unknown>) => ({
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

function createPipeline(settingsOverride?: Partial<ClipboardClassificationSettings>) {
  const helper = new ClipboardHelper()
  const db = {
    insert: vi.fn(() => ({ values: mocks.values }))
  }
  const metaPersistence = {
    // Mirrors the production contract: the operation receives the
    // enqueue-time-resolved database handle.
    withDbWrite: vi.fn(async (_label: string, operation: (db: unknown) => Promise<unknown>) => {
      return await operation(db)
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
  let lastSuccessfulScanAt: number | null = null
  let lastImagePersistAt = 0
  let cooldownUntil = 0

  const pipeline = new ClipboardCapturePipeline({
    getClassificationSettings: () => ({
      ...DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS,
      ...settingsOverride
    }),
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

  /**
   * `retention_protected` 的列、索引和清理侧的豁免条件在这之前就都存在了，但没有任何
   * 代码写过它——所以密钥和普通文本一样会在 90 天后被清掉。清理侧不需要改动，
   * 也就意味着这条链路只有"采集时写没写"这一个失败点，必须有测试盯着它。
   */
  it('marks a captured secret as retention protected, and ordinary text as not', async () => {
    const context = createPipeline()
    mocks.readText
      .mockReturnValueOnce('previous')
      .mockReturnValue(`sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`)

    await context.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ retentionProtected: true }))

    mocks.values.mockClear()
    const ordinary = createPipeline()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('今天下午三点开会')

    await ordinary.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ retentionProtected: false })
    )
  })

  /**
   * 主机 IP 要掩码，但它不是凭据。
   *
   * 掩码和保留期在 `49560c7cf` 之前是同一个开关（`secrets.length > 0`），所以「让 IP
   * 被掩码」会顺带让每一条含 IP 的记录永不自动删除——一天复制几个 IP 就足以让历史
   * 只增不减。这条测试盯的就是这两个轴没有重新粘回去。
   */
  it('does not protect a record just because it carries a host ip', async () => {
    const context = createPipeline()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('ssh deploy@10.0.3.14 -p 2222')

    await context.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ retentionProtected: false })
    )
  })

  /**
   * 保护是可以关的——「我不想让密钥永久留在库里」是个合理选择。但它必须是显式关掉的
   * 结果，而不是配置读不出来时的默认。
   */
  it('honours the setting that turns secret protection off', async () => {
    const context = createPipeline({ protectSecrets: false })
    mocks.readText
      .mockReturnValueOnce('previous')
      .mockReturnValue(`sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`)

    await context.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ retentionProtected: false })
    )
  })

  it('uses the configured verification-code lifetime rather than a fixed hour', async () => {
    const context = createPipeline({ verificationCodeRetentionMs: 15 * 60_000 })
    const before = Date.now()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('G-123456')

    await context.pipeline.process('visible-poll')

    const record = mocks.values.mock.calls.at(-1)?.[0]
    expect(record?.retentionExpiresAt).toBeInstanceOf(Date)
    const lifetimeMs = (record?.retentionExpiresAt as Date).getTime() - before
    expect(lifetimeMs).toBeGreaterThan(14 * 60_000)
    expect(lifetimeMs).toBeLessThan(16 * 60_000)
  })

  it('persists WeChat aliases with their metadata search terms', async () => {
    const context = createPipeline()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('@wechat')

    await context.pipeline.process('visible-poll')

    expect(context.metaPersistence.persistMetaEntriesSafely).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ tags: ['wechat'] }),
      expect.arrayContaining([
        { key: 'tags', value: ['wechat'] },
        { key: 'tag_search_terms', value: ['wechat', 'wx', '微信'] }
      ]),
      { dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
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

describe('capture is skipped while the app is writing the clipboard itself', () => {
  afterEach(() => {
    resetClipboardCaptureSuppression()
  })

  it('抑制期间 process() 不读取剪贴板,也不落库', async () => {
    const getClipboardHelper = vi.fn()
    const getDatabase = vi.fn()
    const pipeline = new ClipboardCapturePipeline({
      getClipboardHelper,
      getDatabase
    } as never)

    await withClipboardCaptureSuppressed(async () => {
      await pipeline.process('poll' as never)
    })

    // The gate is before the helper/database lookup, so nothing downstream is reached at all.
    expect(getClipboardHelper).not.toHaveBeenCalled()
    expect(getDatabase).not.toHaveBeenCalled()
  })

  it('抑制解除后照常处理(守卫不是"永远跳过")', async () => {
    const getClipboardHelper = vi.fn(() => undefined)
    const pipeline = new ClipboardCapturePipeline({
      getClipboardHelper,
      getDatabase: vi.fn(() => undefined)
    } as never)

    await pipeline.process('poll' as never)

    expect(getClipboardHelper).toHaveBeenCalled()
  })
})
