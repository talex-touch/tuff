import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FILE_SOURCE_ID = 'file-provider'
const RECONCILE_MESSAGE = 'Reconciling invalidated file watch subtree'

vi.mock('./app-indexed-source', () => ({ APP_INDEXED_SOURCE_ID: 'app-provider' }))
vi.mock('./file-indexed-source', () => ({ FILE_INDEXED_SOURCE_ID: FILE_SOURCE_ID }))

const { logMock, touchEventBusMock, TalexEventsMock } = vi.hoisted(() => ({
  logMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  touchEventBusMock: { on: vi.fn(), off: vi.fn() },
  TalexEventsMock: {
    FILE_ADDED: 'FILE_ADDED',
    FILE_CHANGED: 'FILE_CHANGED',
    FILE_UNLINKED: 'FILE_UNLINKED',
    FILE_WATCH_ROOT_RECOVERED: 'FILE_WATCH_ROOT_RECOVERED',
    FILE_WATCH_SUBTREE_INVALIDATED: 'FILE_WATCH_SUBTREE_INVALIDATED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED'
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({ getLogger: () => logMock }))
vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: TalexEventsMock,
  touchEventBus: touchEventBusMock
}))

type InvalidationReason = 'directory-change' | 'event-loss' | 'overflow' | 'symlink-change'

async function createRouter(reconcile: () => Promise<unknown> = async () => undefined) {
  const runtime = {
    routeWatchEventWithResult: vi.fn(),
    getSource: vi.fn(() => ({ shouldHandleWatchEvent: vi.fn(() => true) })),
    reconcileSource: vi.fn(reconcile)
  }
  const { IndexedSourceEventRouter, FILE_WATCH_COALESCE_WINDOW_MS } =
    await import('./indexed-source-event-router')
  const router = new IndexedSourceEventRouter(() => runtime as never)
  router.subscribe()

  const invalidate = (
    filePath: string,
    reason: InvalidationReason,
    rootPath = '/fixture'
  ): void => {
    for (const [subscribedEvent, handler] of touchEventBusMock.on.mock.calls) {
      if (subscribedEvent !== TalexEventsMock.FILE_WATCH_SUBTREE_INVALIDATED) continue
      ;(handler as (event: unknown) => void)({
        name: TalexEventsMock.FILE_WATCH_SUBTREE_INVALIDATED,
        filePath,
        rootPath,
        reason
      })
    }
  }

  return { router, runtime, invalidate, windowMs: FILE_WATCH_COALESCE_WINDOW_MS }
}

async function settle(windowMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(windowMs)
  await vi.runOnlyPendingTimersAsync()
  for (let index = 0; index < 4; index += 1) await Promise.resolve()
}

const reconcileLogs = (): Array<Record<string, unknown>> =>
  logMock.info.mock.calls
    .filter(([message]) => message === RECONCILE_MESSAGE)
    .map(([, meta]) => meta as Record<string, unknown>)

describe('IndexedSourceEventRouter subtree reconcile log', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each<InvalidationReason>(['directory-change', 'event-loss', 'overflow', 'symlink-change'])(
    'logs %s as the reason its scope is reconciled',
    async (reason) => {
      const { router, invalidate, windowMs } = await createRouter()

      invalidate('/fixture/docs', reason)
      await settle(windowMs)

      expect(reconcileLogs()).toEqual([{ reason, atWatchRoot: false, depth: 1, coalesced: 1 }])
      await router.unsubscribe()
    }
  )

  it('marks a reconcile of the watch root itself, at depth 0', async () => {
    const { router, invalidate, windowMs } = await createRouter()

    invalidate('/fixture', 'event-loss')
    await settle(windowMs)

    expect(reconcileLogs()).toEqual([
      { reason: 'event-loss', atWatchRoot: true, depth: 0, coalesced: 1 }
    ])
    await router.unsubscribe()
  })

  it('counts the directory levels between the watch root and the scope', async () => {
    const { router, invalidate, windowMs } = await createRouter()

    invalidate('/fixture/a/b/c', 'directory-change')
    await settle(windowMs)

    expect(reconcileLogs()).toEqual([
      { reason: 'directory-change', atWatchRoot: false, depth: 3, coalesced: 1 }
    ])
    await router.unsubscribe()
  })

  it('counts every invalidation folded into a scope, descendants and later arrivals alike', async () => {
    const { router, invalidate, windowMs } = await createRouter()

    invalidate('/fixture/docs/a', 'directory-change')
    invalidate('/fixture/docs/b', 'directory-change')
    // The ancestor replaces both pending scopes and carries their count.
    invalidate('/fixture/docs', 'event-loss')
    // Already covered by the pending ancestor: counted, not scheduled.
    invalidate('/fixture/docs/c/d', 'directory-change')
    await settle(windowMs)

    expect(reconcileLogs()).toEqual([
      { reason: 'event-loss', atWatchRoot: false, depth: 1, coalesced: 4 }
    ])
    await router.unsubscribe()
  })

  it('reports the collapse of an invalidation burst into one overflow pass over the root', async () => {
    const { router, runtime, invalidate, windowMs } = await createRouter()

    for (let index = 0; index < 300; index += 1)
      invalidate(`/fixture/dir-${index}`, 'directory-change')
    await settle(windowMs)

    expect(runtime.reconcileSource).toHaveBeenCalledOnce()
    expect(reconcileLogs()).toEqual([
      { reason: 'overflow', atWatchRoot: true, depth: 0, coalesced: 300 }
    ])
    await router.unsubscribe()
  })

  it('logs one line per scope, in the order the scopes reconcile', async () => {
    const { router, invalidate, windowMs } = await createRouter()

    invalidate('/fixture/first', 'symlink-change')
    invalidate('/fixture/second/inner', 'directory-change')
    await settle(windowMs)

    expect(reconcileLogs()).toEqual([
      { reason: 'symlink-change', atWatchRoot: false, depth: 1, coalesced: 1 },
      { reason: 'directory-change', atWatchRoot: false, depth: 2, coalesced: 1 }
    ])
    await router.unsubscribe()
  })

  it('logs when the reconcile starts, not when it finishes', async () => {
    // Never settles, so the router is left subscribed: awaiting its drain would wait forever.
    const { runtime, invalidate, windowMs } = await createRouter(
      () => new Promise<never>(() => undefined)
    )

    invalidate('/fixture/docs', 'overflow')
    await settle(windowMs)

    expect(runtime.reconcileSource).toHaveBeenCalledOnce()
    expect(reconcileLogs()).toHaveLength(1)
  })

  it('keeps the user paths out of the line', async () => {
    const { router, invalidate, windowMs } = await createRouter()

    invalidate('/fixture/private-folder/deep', 'directory-change')
    await settle(windowMs)

    const serialized = JSON.stringify(logMock.info.mock.calls)
    expect(serialized).toContain(RECONCILE_MESSAGE)
    expect(serialized).not.toContain('fixture')
    expect(serialized).not.toContain('private-folder')
    await router.unsubscribe()
  })
})
