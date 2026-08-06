import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const APP_SOURCE_ID = 'app-provider'
const FILE_SOURCE_ID = 'file-provider'

vi.mock('./app-indexed-source', () => ({ APP_INDEXED_SOURCE_ID: APP_SOURCE_ID }))
vi.mock('./file-indexed-source', () => ({ FILE_INDEXED_SOURCE_ID: FILE_SOURCE_ID }))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

const { touchEventBusMock, TalexEventsMock } = vi.hoisted(() => ({
  touchEventBusMock: {
    on: vi.fn(),
    off: vi.fn()
  },
  TalexEventsMock: {
    FILE_ADDED: 'FILE_ADDED',
    FILE_CHANGED: 'FILE_CHANGED',
    FILE_UNLINKED: 'FILE_UNLINKED',
    FILE_WATCH_ROOT_RECOVERED: 'FILE_WATCH_ROOT_RECOVERED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED'
  }
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: TalexEventsMock,
  touchEventBus: touchEventBusMock
}))

type WatchEvent = { sourceId: string; action: string; path: string; occurredAt: number }

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}

async function createRouter() {
  const routeWatchEventWithResult = vi.fn(async (_event: WatchEvent) => ({
    deltas: [],
    matchedSources: 1,
    handledSources: 1,
    failedSources: 0,
    skippedSources: 0,
    appliedDeltas: 0,
    failedDeltas: 0,
    skippedDeltas: 0,
    errors: [],
    skipped: [],
    deltaSummaries: []
  }))
  const runtime = {
    routeWatchEventWithResult,
    getSource: vi.fn(() => ({ shouldHandleWatchEvent: vi.fn(() => true) })),
    reconcileSource: vi.fn(async () => undefined)
  }
  const { IndexedSourceEventRouter, APP_WATCH_COALESCE_WINDOW_MS, FILE_WATCH_COALESCE_WINDOW_MS } =
    await import('./indexed-source-event-router')
  const router = new IndexedSourceEventRouter(() => runtime as never)
  router.subscribe()

  const emit = (eventName: string, filePath: string): void => {
    for (const [subscribedEvent, handler] of touchEventBusMock.on.mock.calls) {
      if (subscribedEvent !== eventName) continue
      ;(handler as (event: unknown) => void)({ name: eventName, filePath })
    }
  }

  const routedTo = (sourceId: string): WatchEvent[] =>
    routeWatchEventWithResult.mock.calls
      .map(([event]) => event)
      .filter((event) => event.sourceId === sourceId)

  return {
    router,
    emit,
    routedTo,
    routeWatchEventWithResult,
    appWindowMs: APP_WATCH_COALESCE_WINDOW_MS,
    fileWindowMs: FILE_WATCH_COALESCE_WINDOW_MS
  }
}

async function settleWindows(windowMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(windowMs)
  for (let index = 0; index < 4; index += 1) await Promise.resolve()
}

describe('IndexedSourceEventRouter watch coalescing', () => {
  let restorePlatform: () => void

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    restorePlatform = withPlatform('darwin')
  })

  afterEach(() => {
    restorePlatform()
    vi.useRealTimers()
  })

  it('collapses an app install burst into one resolution pass for the bundle', async () => {
    const { emit, routedTo, appWindowMs } = await createRouter()

    // What one `cp -R` into /Applications looks like at the watcher: the bundle plus a tail of
    // events for files inside it, all describing the same app.
    emit('DIRECTORY_ADDED', '/Applications/Probe.app')
    for (let index = 0; index < 15; index += 1) {
      emit('FILE_ADDED', `/Applications/Probe.app/Contents/Resources/asset-${index}.bin`)
    }

    expect(routedTo(APP_SOURCE_ID)).toHaveLength(0)

    await settleWindows(appWindowMs)

    const appRoutes = routedTo(APP_SOURCE_ID)
    expect(appRoutes).toHaveLength(1)
    expect(appRoutes[0]).toMatchObject({ sourceId: APP_SOURCE_ID, action: 'add' })
    expect(appRoutes[0]?.path.startsWith('/Applications/Probe.app')).toBe(true)
  })

  it('keeps one timer while a window is open and releases it when the window closes', async () => {
    const { emit, appWindowMs } = await createRouter()

    expect(vi.getTimerCount()).toBe(0)

    // DIRECTORY_ADDED only feeds the app queue, so the count is unambiguous.
    emit('DIRECTORY_ADDED', '/Applications/Probe.app')
    emit('DIRECTORY_ADDED', '/Applications/Other.app')
    expect(vi.getTimerCount()).toBe(1)

    await settleWindows(appWindowMs)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves an in-place bundle replacement to the add rather than the delete', async () => {
    const { emit, routedTo, appWindowMs } = await createRouter()

    emit('FILE_UNLINKED', '/Applications/Probe.app')
    emit('DIRECTORY_ADDED', '/Applications/Probe.app')

    await settleWindows(appWindowMs)

    const appRoutes = routedTo(APP_SOURCE_ID)
    expect(appRoutes).toHaveLength(1)
    expect(appRoutes[0]?.action).toBe('add')
  })

  it('routes file events on their own window, keyed by the exact path', async () => {
    const { emit, routedTo, fileWindowMs } = await createRouter()

    emit('FILE_CHANGED', '/tmp/a.md')
    emit('FILE_CHANGED', '/tmp/a.md')
    emit('FILE_CHANGED', '/tmp/b.md')

    expect(routedTo(FILE_SOURCE_ID)).toHaveLength(0)

    await settleWindows(fileWindowMs)

    const fileRoutes = routedTo(FILE_SOURCE_ID)
    expect(fileRoutes.map((event) => event.path).sort()).toEqual(['/tmp/a.md', '/tmp/b.md'])
  })

  it('opens no window while idle and drops open windows on unsubscribe', async () => {
    const { router, emit, routeWatchEventWithResult, appWindowMs } = await createRouter()

    expect(vi.getTimerCount()).toBe(0)

    emit('DIRECTORY_ADDED', '/Applications/Probe.app')
    expect(vi.getTimerCount()).toBe(1)

    router.unsubscribe()
    expect(vi.getTimerCount()).toBe(0)

    await settleWindows(appWindowMs)
    expect(routeWatchEventWithResult).not.toHaveBeenCalled()
  })
})
