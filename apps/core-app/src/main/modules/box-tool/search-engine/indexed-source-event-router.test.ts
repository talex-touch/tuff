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

async function createRouter(options: { getAppWatchRoots?: () => readonly string[] } = {}) {
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
  const router = new IndexedSourceEventRouter(() => runtime as never, options)
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

  it('opens no window while idle and flushes an open window on unsubscribe', async () => {
    // This used to assert routeWatchEventWithResult was NOT called — it recorded
    // the behaviour rather than requiring it. Dropping the window closes the timer
    // but also throws the coalesced delta away, and since unsubscribe detaches the
    // producers first, the "next flush" the queue's own doc promises can never
    // arrive. An app dropped in during the 400ms window vanished from the index
    // with no reconcile marker (#676). The timer-leak half of the assertion is
    // still here; only the data-loss half changed.
    const { router, emit, routeWatchEventWithResult, appWindowMs } = await createRouter()

    expect(vi.getTimerCount()).toBe(0)

    emit('DIRECTORY_ADDED', '/Applications/Probe.app')
    expect(vi.getTimerCount()).toBe(1)

    await router.unsubscribe()
    expect(vi.getTimerCount()).toBe(0)

    await settleWindows(appWindowMs)
    expect(routeWatchEventWithResult).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/Applications/Probe.app' })
    )
  })
})

describe('IndexedSourceEventRouter app root gate', () => {
  const APP_ROOTS = ['/Applications', '/Users/demo/Applications'] as const
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

  it('keeps build output outside the app roots out of the app queue entirely', async () => {
    const { emit, routedTo, appWindowMs, fileWindowMs } = await createRouter({
      getAppWatchRoots: () => APP_ROOTS
    })

    // What a tuffex build looks like at the watcher: a directory recreated under the workspace and
    // files re-emitted inside it. None of it can ever be an application.
    emit('DIRECTORY_ADDED', '/Users/demo/Workspace/tuffex/dist')
    expect(vi.getTimerCount()).toBe(0)
    emit('FILE_ADDED', '/Users/demo/Workspace/tuffex/dist/index.mjs')
    emit('FILE_CHANGED', '/Users/demo/Workspace/tuffex/dist/style.css')
    emit('FILE_UNLINKED', '/Users/demo/Workspace/tuffex/dist/old.mjs')

    await settleWindows(Math.max(appWindowMs, fileWindowMs))

    expect(routedTo(APP_SOURCE_ID)).toEqual([])
    // The file source still sees every one of them; only the app queue is gated.
    expect(
      routedTo(FILE_SOURCE_ID)
        .map((event) => event.path)
        .sort()
    ).toEqual([
      '/Users/demo/Workspace/tuffex/dist/index.mjs',
      '/Users/demo/Workspace/tuffex/dist/old.mjs',
      '/Users/demo/Workspace/tuffex/dist/style.css'
    ])
  })

  it('routes events under either app root', async () => {
    const { emit, routedTo, appWindowMs } = await createRouter({
      getAppWatchRoots: () => APP_ROOTS
    })

    emit('FILE_ADDED', '/Applications/Probe.app/Contents/Info.plist')
    emit('DIRECTORY_ADDED', '/Users/demo/Applications/Local.app')
    // Same containment rule as the runtime: case-insensitive on darwin.
    emit('FILE_UNLINKED', '/applications/Gone.app')

    await settleWindows(appWindowMs)

    expect(
      routedTo(APP_SOURCE_ID)
        .map((event) => [event.path, event.action])
        .sort()
    ).toEqual([
      ['/Applications/Probe.app/Contents/Info.plist', 'add'],
      ['/Users/demo/Applications/Local.app', 'add'],
      ['/applications/Gone.app', 'delete']
    ])
  })

  it('does not treat a sibling that merely shares the root prefix as inside it', async () => {
    const { emit, routedTo, appWindowMs } = await createRouter({
      getAppWatchRoots: () => APP_ROOTS
    })

    emit('DIRECTORY_ADDED', '/Applications Backup/Old.app')
    await settleWindows(appWindowMs)

    expect(routedTo(APP_SOURCE_ID)).toEqual([])
  })

  it('reads the roots on every event instead of caching them', async () => {
    let roots: readonly string[] = ['/Applications']
    const { emit, routedTo, appWindowMs } = await createRouter({
      getAppWatchRoots: () => roots
    })

    emit('DIRECTORY_ADDED', '/Volumes/Apps/Tool.app')
    roots = ['/Applications', '/Volumes/Apps']
    emit('DIRECTORY_ADDED', '/Volumes/Apps/Next.app')
    await settleWindows(appWindowMs)

    expect(routedTo(APP_SOURCE_ID).map((event) => event.path)).toEqual(['/Volumes/Apps/Next.app'])
  })

  it('routes unfiltered when the roots cannot be read, leaving the decision to the runtime', async () => {
    const { emit, routedTo, appWindowMs } = await createRouter({
      getAppWatchRoots: () => {
        throw new Error('roots unavailable')
      }
    })

    emit('DIRECTORY_ADDED', '/Users/demo/Workspace/app/out')
    await settleWindows(appWindowMs)

    expect(routedTo(APP_SOURCE_ID).map((event) => event.path)).toEqual([
      '/Users/demo/Workspace/app/out'
    ])
  })
})
