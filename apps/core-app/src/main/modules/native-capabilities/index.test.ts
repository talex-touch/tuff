import { describe, expect, it, vi } from 'vitest'
import { NativeEvents } from '@talex-touch/utils/transport/events'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  streamHandlers: new Map<string, (...args: any[]) => any>(),
  capture: vi.fn(async () => ({
    tfileUrl: 'tfile:///tmp/shot.png',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    displayId: '1',
    displayName: 'Display',
    x: 0,
    y: 0,
    scaleFactor: 1,
    durationMs: 1,
    sizeBytes: 1,
    wroteClipboard: false
  })),
  getSupport: vi.fn(() => ({ supported: true, platform: 'darwin', engine: 'xcap' })),
  listDisplays: vi.fn(() => []),
  getIndexingStatus: vi.fn(() => ({
    isInitializing: false,
    initializationFailed: false,
    error: null,
    progress: { stage: 'idle', current: 0, total: 0 },
    startTime: null,
    estimatedCompletion: null,
    estimatedRemainingMs: 0,
    averageItemsPerSecond: 0
  })),
  getIndexStats: vi.fn(async () => ({
    totalFiles: 1,
    failedFiles: 0,
    skippedFiles: 0,
    completedFiles: 1,
    embeddingCompletedFiles: 0,
    embeddingRows: 0
  })),
  fileIndexSearch: vi.fn(async (query) => ({
    items: [],
    query,
    duration: 1,
    sources: []
  })),
  rebuildIndex: vi.fn(async () => ({ success: true })),
  addWatchPath: vi.fn(async (path: string) => ({ success: true, status: 'added', path })),
  registerProgressStream: vi.fn(),
  getEverythingStatusSnapshot: vi.fn(() => ({
    enabled: true,
    available: false,
    backend: 'unavailable',
    health: 'unsupported',
    healthReason: 'not-windows',
    version: null,
    esPath: null,
    error: null,
    lastBackendError: null,
    backendAttemptErrors: {},
    fallbackChain: [],
    lastChecked: null
  })),
  everythingSearch: vi.fn(async (query) => ({
    items: [{ id: 'everything-item' }],
    query,
    duration: 1,
    sources: []
  })),
  everythingIsSearchReady: vi.fn(() => false),
  stat: vi.fn(async () => ({ path: '/tmp/a.png', exists: true })),
  reveal: vi.fn(async () => ({ path: '/tmp/a.png', success: true })),
  open: vi.fn(async () => ({ path: '/tmp/a.png', success: true })),
  getIcon: vi.fn(async () => ({ kind: 'data-url', url: 'data:image/png;base64,a' })),
  getThumbnail: vi.fn(async () => ({ kind: 'tfile', url: 'tfile:///tmp/thumb.jpg' })),
  toTfile: vi.fn(async () => ({ ref: { kind: 'tfile', url: 'tfile:///tmp/a.png' } })),
  probeMedia: vi.fn(async () => ({ path: '/tmp/a.png', kind: 'image' })),
  getMediaThumbnail: vi.fn(async () => ({ kind: 'tfile', url: 'tfile:///tmp/media.jpg' })),
  enforcePermission: vi.fn(),
  checkPermission: vi.fn(() => ({ allowed: true })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    child: vi.fn(),
    time: vi.fn(() => ({ end: vi.fn(), split: vi.fn() }))
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: vi.fn((event, handler) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    }),
    onStream: vi.fn((event, handler) => {
      mocks.streamHandlers.set(event.toEventName(), handler)
      return vi.fn()
    })
  }))
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    transport: {
      on: vi.fn((event, handler) => {
        mocks.handlers.set(event.toEventName(), handler)
        return vi.fn()
      }),
      onStream: vi.fn((event, handler) => {
        mocks.streamHandlers.set(event.toEventName(), handler)
        return vi.fn()
      })
    }
  }))
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../permission', () => ({
  getPermissionModule: vi.fn(() => ({
    enforcePermission: mocks.enforcePermission,
    checkPermission: mocks.checkPermission
  }))
}))

vi.mock('../box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    getIndexingStatus: mocks.getIndexingStatus,
    getIndexStats: mocks.getIndexStats,
    onSearch: mocks.fileIndexSearch,
    rebuildIndex: mocks.rebuildIndex,
    addWatchPath: mocks.addWatchPath,
    registerProgressStream: mocks.registerProgressStream
  }
}))

vi.mock('../box-tool/addon/files/everything-provider', () => ({
  everythingProvider: {
    getStatusSnapshot: mocks.getEverythingStatusSnapshot,
    onSearch: mocks.everythingSearch,
    isSearchReady: mocks.everythingIsSearchReady
  }
}))

vi.mock('./native-file-service', () => ({
  nativeFileService: {
    stat: mocks.stat,
    reveal: mocks.reveal,
    open: mocks.open,
    getIcon: mocks.getIcon,
    getThumbnail: mocks.getThumbnail,
    toTfile: mocks.toTfile,
    probeMedia: mocks.probeMedia,
    getMediaThumbnail: mocks.getMediaThumbnail
  }
}))

vi.mock('./screenshot-service', () => ({
  getNativeScreenshotService: vi.fn(() => ({
    getSupport: mocks.getSupport,
    listDisplays: mocks.listDisplays,
    capture: mocks.capture
  }))
}))

function createContext(pluginName?: string) {
  return {
    sender: {} as any,
    eventName: NativeEvents.screenshot.capture.toEventName(),
    plugin: pluginName
      ? {
          name: pluginName,
          uniqueKey: 'key',
          verified: true
        }
      : undefined
  }
}

describe('NativeCapabilitiesModule', () => {
  it('registers native screenshot handlers and allows internal renderer calls', async () => {
    const { NativeCapabilitiesModule } = await import('./index')
    const module = new NativeCapabilitiesModule()

    module.onInit({} as any)
    const handler = mocks.handlers.get(NativeEvents.screenshot.capture.toEventName())
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({ target: 'cursor-display' }, createContext())

    expect(mocks.enforcePermission).not.toHaveBeenCalled()
    expect(mocks.capture).toHaveBeenCalledWith({ target: 'cursor-display' })
    expect(result).toMatchObject({ tfileUrl: 'tfile:///tmp/shot.png' })
  })

  it('enforces window.capture permission for plugin calls', async () => {
    const { NativeCapabilitiesModule } = await import('./index')
    const module = new NativeCapabilitiesModule()

    module.onInit({} as any)
    const handler = mocks.handlers.get(NativeEvents.screenshot.capture.toEventName())
    await handler?.({ target: 'cursor-display' }, createContext('demo.plugin'))

    expect(mocks.enforcePermission).toHaveBeenCalledWith(
      'demo.plugin',
      'native:screenshot:capture'
    )
  })

  it('registers capability, file-index, file, and media handlers', async () => {
    const { NativeCapabilitiesModule } = await import('./index')
    const module = new NativeCapabilitiesModule()

    module.onInit({} as any)

    expect(mocks.handlers.has(NativeEvents.capabilities.list.toEventName())).toBe(true)
    expect(mocks.handlers.has(NativeEvents.fileIndex.query.toEventName())).toBe(true)
    expect(mocks.handlers.has(NativeEvents.file.stat.toEventName())).toBe(true)
    expect(mocks.handlers.has(NativeEvents.media.probe.toEventName())).toBe(true)
    expect(mocks.streamHandlers.has(NativeEvents.fileIndex.progress.toEventName())).toBe(true)
  })

  it('bridges native file-index query and enforces fs.index for plugins', async () => {
    const { NativeCapabilitiesModule } = await import('./index')
    const module = new NativeCapabilitiesModule()

    module.onInit({} as any)
    const handler = mocks.handlers.get(NativeEvents.fileIndex.query.toEventName())
    const result = await handler?.({ text: 'demo', limit: 2 }, createContext('demo.plugin'))

    expect(mocks.enforcePermission).toHaveBeenCalledWith(
      'demo.plugin',
      'native:file-index:query'
    )
    expect(mocks.fileIndexSearch).toHaveBeenCalledWith(
      { text: 'demo' },
      expect.any(AbortSignal)
    )
    expect(result).toMatchObject({
      provider: 'auto',
      result: { items: [] }
    })
  })

  it('routes native file and media calls through services with permissions', async () => {
    const { NativeCapabilitiesModule } = await import('./index')
    const module = new NativeCapabilitiesModule()

    module.onInit({} as any)
    await mocks.handlers.get(NativeEvents.file.stat.toEventName())?.(
      { path: '/tmp/a.png' },
      createContext('demo.plugin')
    )
    await mocks.handlers.get(NativeEvents.media.probe.toEventName())?.(
      { path: '/tmp/a.png' },
      createContext('demo.plugin')
    )

    expect(mocks.enforcePermission).toHaveBeenCalledWith('demo.plugin', 'native:file:stat')
    expect(mocks.enforcePermission).toHaveBeenCalledWith('demo.plugin', 'native:media:probe')
    expect(mocks.stat).toHaveBeenCalledWith({ path: '/tmp/a.png' })
    expect(mocks.probeMedia).toHaveBeenCalledWith({ path: '/tmp/a.png' })
  })
})
