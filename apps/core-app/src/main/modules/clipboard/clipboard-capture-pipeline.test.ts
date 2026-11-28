import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { ClipboardCapturePipeline } from './clipboard-capture-pipeline'
import {
  DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS,
  type ClipboardClassificationSettings
} from './clipboard-classification-settings'
import { ClipboardHelper } from './clipboard-capture-freshness'
import { NativeClipboardReader } from './clipboard-reader'
import {
  resetClipboardCaptureSuppression,
  withClipboardCaptureSuppressed
} from './clipboard-capture-suppression'
import { registerClipboardPorts, resetClipboardPorts } from './clipboard-ports'

const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64'
)

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
  has: vi.fn((_format: string) => false),
  readBuffer: vi.fn(() => Buffer.alloc(0)),
  readText: vi.fn(),
  readHTML: vi.fn(),
  readImage: vi.fn(createEmptyImage),
  createFromBuffer: vi.fn(() => createEmptyImage()),
  sendToPlugin: vi.fn(async () => undefined),
  checkPluginPermission: vi.fn(() => true),
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
    has: mocks.has,
    readBuffer: mocks.readBuffer,
    readText: mocks.readText,
    readHTML: mocks.readHTML,
    readImage: mocks.readImage
  },
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer
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

function createPipeline(
  settingsOverride?: Partial<ClipboardClassificationSettings>,
  readerExtras?: { readImageWithEncoded?: () => Promise<unknown> }
) {
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
      },
      ...(readerExtras as object)
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
    checkPluginPermission: mocks.checkPluginPermission,
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
    registerClipboardPorts({
      coreBox: {
        getAttachedPlugin: mocks.getAttachedPlugin,
        shouldForwardClipboardChange: mocks.shouldForwardClipboardChange
      }
    })
    mocks.availableFormats.mockReturnValue(['text/plain', 'text/html'])
    mocks.has.mockReturnValue(false)
    mocks.readBuffer.mockReturnValue(Buffer.alloc(0))
    mocks.readText.mockReturnValue('https://example.test')
    mocks.readHTML.mockReturnValue('<b>https://example.test</b>')
    mocks.readImage.mockReturnValue(createEmptyImage())
    mocks.checkPluginPermission.mockReturnValue(true)
    mocks.getAttachedPlugin.mockReturnValue({ name: 'demo-plugin', _uniqueChannelKey: 'key' })
    mocks.shouldForwardClipboardChange.mockReturnValue(true)
  })

  afterEach(() => {
    resetClipboardPorts()
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

  it('marks a captured secret as retention protected only when opt-in protectSecrets is enabled', async () => {
    const defaultContext = createPipeline()
    mocks.readText
      .mockReturnValueOnce('previous')
      .mockReturnValue(`sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`)

    await defaultContext.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ retentionProtected: false })
    )

    mocks.values.mockClear()
    const optInContext = createPipeline({ protectSecrets: true })
    mocks.readText
      .mockReturnValueOnce('previous')
      .mockReturnValue(`sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`)

    await optInContext.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ retentionProtected: true }))

    mocks.values.mockClear()
    const ordinary = createPipeline({ protectSecrets: true })
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('今天下午三点开会')

    await ordinary.pipeline.process('visible-poll')

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ retentionProtected: false })
    )
  })

  it('skips capture and forwarding for concealed or transient password-manager pasteboard formats', async () => {
    for (const marker of [
      'org.nspasteboard.ConcealedType',
      'org.nspasteboard.TransientType',
      'ExcludeClipboardContentFromMonitorProcessing',
      'x-kde-passwordmanagerhint'
    ]) {
      mocks.values.mockClear()
      mocks.sendToPlugin.mockClear()
      mocks.availableFormats.mockReturnValue(['text/plain', marker])
      mocks.readText.mockReturnValue('super-secret-password')

      const context = createPipeline()
      await context.pipeline.process('visible-poll')

      expect(mocks.values, `${marker} must not be persisted`).not.toHaveBeenCalled()
      expect(context.updateMemoryCache).not.toHaveBeenCalled()
      expect(mocks.sendToPlugin).not.toHaveBeenCalled()
    }

    // Windows CanIncludeInClipboardHistory = DWORD 0 must also skip capture.
    mocks.values.mockClear()
    mocks.availableFormats.mockReturnValue(['text/plain', 'CanIncludeInClipboardHistory'])
    mocks.readBuffer.mockReturnValue(Buffer.from([0, 0, 0, 0]))
    const winContext = createPipeline()
    await winContext.pipeline.process('visible-poll')
    expect(mocks.values).not.toHaveBeenCalled()

    // Real Electron runtime omits OS privacy markers from availableFormats() and only exposes
    // them through clipboard.has(marker). Verify direct probing skips capture.
    for (const marker of [
      'org.nspasteboard.ConcealedType',
      'org.nspasteboard.TransientType',
      'org.nspasteboard.AutoGeneratedType',
      'com.agilebits.onepassword',
      'ExcludeClipboardContentFromMonitorProcessing',
      'x-kde-passwordmanagerhint',
      'org.kde.klipper.ignore'
    ]) {
      mocks.values.mockClear()
      mocks.sendToPlugin.mockClear()
      mocks.availableFormats.mockReturnValue(['text/plain'])
      mocks.has.mockImplementation((fmt: string) => fmt === marker)
      mocks.readText.mockReturnValueOnce('prev').mockReturnValue('password-manager-secret')

      const probedContext = createPipeline()
      await probedContext.pipeline.process('visible-poll')

      expect(
        mocks.values,
        `${marker} probed via clipboard.has must not persist`
      ).not.toHaveBeenCalled()
      expect(mocks.sendToPlugin).not.toHaveBeenCalled()
    }

    // Probed Windows CanIncludeInClipboardHistory: DWORD 0 or empty fails closed; DWORD 1 allows.
    mocks.values.mockClear()
    mocks.availableFormats.mockReturnValue(['text/plain'])
    mocks.has.mockImplementation((fmt: string) => fmt === 'CanIncludeInClipboardHistory')
    mocks.readBuffer.mockReturnValue(Buffer.from([0, 0, 0, 0]))
    mocks.readText.mockReturnValueOnce('prev').mockReturnValue('win-hidden-secret')
    const winProbedBlocked = createPipeline()
    await winProbedBlocked.pipeline.process('visible-poll')
    expect(mocks.values).not.toHaveBeenCalled()

    mocks.values.mockClear()
    mocks.readBuffer.mockReturnValue(Buffer.from([1, 0, 0, 0]))
    mocks.readText.mockReturnValueOnce('prev').mockReturnValue('win-allowed-text')
    const winProbedAllowed = createPipeline()
    await winProbedAllowed.pipeline.process('visible-poll')
    expect(mocks.values).toHaveBeenCalledTimes(1)
  })

  it('does not forward clipboard changes to an attached plugin lacking clipboard:read permission', async () => {
    mocks.checkPluginPermission.mockReturnValue(false)
    const context = createPipeline()
    mocks.readText.mockReturnValueOnce('previous').mockReturnValue('https://example.test')

    await context.pipeline.process('visible-poll')

    expect(mocks.checkPluginPermission).toHaveBeenCalledWith(
      'demo-plugin',
      'clipboard:read',
      undefined
    )
    expect(mocks.sendToPlugin).not.toHaveBeenCalled()
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

  it('persists the PNG bytes the reader already had instead of re-encoding the image', async () => {
    const image = createImage()
    const toPNG = vi.fn(() => Buffer.from('re-encoded'))
    image.toPNG = toPNG
    mocks.availableFormats.mockReturnValue(['public.png'])
    mocks.readText.mockReturnValue('')
    mocks.readHTML.mockReturnValue('')
    mocks.readImage.mockReturnValue(image)
    mocks.values.mockReturnValueOnce({
      returning: vi.fn(async () => [
        {
          id: 14,
          type: 'image',
          content: '/tmp/tuff/clipboard/images/image.png',
          rawContent: '',
          thumbnail: 'data:image/png;base64,thumb',
          metadata: null
        }
      ])
    })
    const context = createPipeline(undefined, {
      readImageWithEncoded: async () => ({ image, png: Buffer.from('native-png') })
    })

    await context.pipeline.process('corebox-show-baseline')

    expect(context.createClipboardImageFile).toHaveBeenCalledWith(Buffer.from('native-png'))
    expect(toPNG).not.toHaveBeenCalled()
  })

  it('captures and thumbnails a valid PNG via sharp without any main-thread NativeImage decode', async () => {
    mocks.availableFormats.mockReturnValue(['public.png'])
    const nativeReader = new NativeClipboardReader({
      getText: async () => '',
      getHtml: async () => '',
      getFiles: async () => [],
      getImageBinary: async () => VALID_1X1_PNG
    })
    mocks.values.mockReturnValueOnce({
      returning: vi.fn(async () => [
        {
          id: 15,
          type: 'image',
          content: '/tmp/tuff/clipboard/images/image.png',
          rawContent: '',
          thumbnail: 'data:image/png;base64,sharp',
          metadata: null
        }
      ])
    })
    const context = createPipeline(undefined, {
      readImageWithEncoded: () => nativeReader.readImageWithEncoded()
    })

    await context.pipeline.process('corebox-show-baseline')

    expect(mocks.createFromBuffer).not.toHaveBeenCalled()
    expect(mocks.readImage).not.toHaveBeenCalled()
    expect(context.createClipboardImageFile).toHaveBeenCalledWith(VALID_1X1_PNG)
    const insertedRecord = mocks.values.mock.calls.at(-1)?.[0]
    expect(insertedRecord?.thumbnail).toMatch(/^data:image\/png;base64,/)
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

  describe('a deferred capture is dated by when its change was signalled', () => {
    async function capture(options?: { observedAt?: number }) {
      const context = createPipeline()
      mocks.readText.mockReturnValueOnce('previous').mockReturnValue('https://example.test')
      const before = Date.now()
      await context.pipeline.process('native-watch', options)
      const after = Date.now()
      const record = mocks.values.mock.calls.at(-1)?.[0]
      const meta = context.metaPersistence.persistMetaEntriesSafely.mock.calls.at(-1)?.[1]
      return {
        context,
        before,
        after,
        stamped: (record?.timestamp as Date | undefined)?.getTime(),
        observedAt: meta?.observed_at as number | undefined
      }
    }

    it('stamps the history row, the observed_at meta and the freshness base with the signal time', async () => {
      const signalledAt = Date.now() - 20_000
      const { context, before, stamped, observedAt } = await capture({ observedAt: signalledAt })

      expect(stamped).toBe(signalledAt)
      expect(observedAt).toBe(signalledAt)
      expect(context.rememberFreshness).toHaveBeenCalledWith(
        expect.objectContaining({ id: 11 }),
        expect.objectContaining({
          eligible: true,
          captureSource: 'native-watch',
          observedAt: signalledAt,
          freshnessBaseAt: signalledAt
        })
      )
      // The scan itself ran now, and that is the clock the next scan measures its gap from.
      expect(context.getState().lastSuccessfulScanAt).toBeGreaterThanOrEqual(before)
    })

    it('dates a capture by the scan when no signal time is given', async () => {
      const { before, after, stamped, observedAt } = await capture()

      expect(stamped).toBeGreaterThanOrEqual(before)
      expect(stamped).toBeLessThanOrEqual(after)
      expect(observedAt).toBeGreaterThanOrEqual(before)
      expect(observedAt).toBeLessThanOrEqual(after)
    })

    it('never dates a capture later than the scan, whatever the signal time says', async () => {
      const { context, after, stamped, observedAt } = await capture({
        observedAt: Date.now() + 60_000
      })

      expect(stamped).toBeLessThanOrEqual(after)
      expect(observedAt).toBeLessThanOrEqual(after)
      expect(context.getState().lastSuccessfulScanAt).toBeLessThanOrEqual(after)
    })

    it('ignores a signal time that is not a finite number', async () => {
      const { before, after, stamped, observedAt } = await capture({ observedAt: Number.NaN })

      expect(stamped).toBeGreaterThanOrEqual(before)
      expect(stamped).toBeLessThanOrEqual(after)
      expect(observedAt).toBeGreaterThanOrEqual(before)
      expect(observedAt).toBeLessThanOrEqual(after)
    })
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
