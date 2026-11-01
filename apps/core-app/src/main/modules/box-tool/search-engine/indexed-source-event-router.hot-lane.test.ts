import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FILE_SOURCE_ID = 'file-provider'

vi.mock('./app-indexed-source', () => ({ APP_INDEXED_SOURCE_ID: 'app-provider' }))
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
    FILE_WATCH_SUBTREE_INVALIDATED: 'FILE_WATCH_SUBTREE_INVALIDATED',
    DIRECTORY_ADDED: 'DIRECTORY_ADDED',
    DIRECTORY_UNLINKED: 'DIRECTORY_UNLINKED'
  }
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: TalexEventsMock,
  touchEventBus: touchEventBusMock
}))

interface ReconcileRequest {
  reason: string
  roots: Array<{ path: string }>
  signal?: AbortSignal
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}

async function createRouter(options: { subscribe?: boolean; runtime?: boolean } = {}) {
  const shouldHandleWatchEvent = vi.fn(() => true)
  const reconcileSource = vi.fn(
    async (_sourceId: string, _request: ReconcileRequest): Promise<unknown> => undefined
  )
  const runtime = {
    routeWatchEventWithResult: vi.fn(async () => ({})),
    getSource: vi.fn(() => ({ shouldHandleWatchEvent })),
    reconcileSource
  }
  const { IndexedSourceEventRouter, FILE_WATCH_COALESCE_WINDOW_MS } =
    await import('./indexed-source-event-router')
  const router = new IndexedSourceEventRouter(() =>
    options.runtime === false ? null : (runtime as never)
  )
  if (options.subscribe !== false) router.subscribe()

  const emit = (filePath: string): void => {
    for (const [subscribedEvent, handler] of touchEventBusMock.on.mock.calls) {
      if (subscribedEvent !== 'FILE_WATCH_SUBTREE_INVALIDATED') continue
      if (typeof handler !== 'function') continue
      ;(handler as (event: unknown) => void)({
        name: subscribedEvent,
        filePath,
        rootPath: '/fixture',
        reason: 'directory-change'
      })
    }
  }
  const scopes = (): string[] =>
    reconcileSource.mock.calls.map(([, request]) => request.roots[0].path)
  return {
    router,
    emit,
    scopes,
    reconcileSource,
    shouldHandleWatchEvent,
    windowMs: FILE_WATCH_COALESCE_WINDOW_MS
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('IndexedSourceEventRouter hot subtree lane', () => {
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

  it('reconciles a hot folder as an ordinary scoped reconcile and returns its result', async () => {
    const { router, reconcileSource } = await createRouter()
    const result = { sourceId: FILE_SOURCE_ID, added: 2, changed: 0, deleted: 1 }
    reconcileSource.mockResolvedValueOnce(result)

    const value = await router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/docs'))

    expect(value).toBe(result)
    expect(reconcileSource).toHaveBeenCalledWith(FILE_SOURCE_ID, {
      reason: 'file-watch-subtree',
      roots: [
        {
          sourceId: FILE_SOURCE_ID,
          path: '/fixture/docs',
          permissionState: 'granted',
          reason: 'file-watch-subtree'
        }
      ],
      signal: expect.any(AbortSignal)
    })
    await router.unsubscribe()
  })

  it('answers null when the file source does not own the folder', async () => {
    const { router, reconcileSource, shouldHandleWatchEvent } = await createRouter()
    shouldHandleWatchEvent.mockReturnValue(false)

    const value = await router.withHotSubtreeLane((lane) => lane.reconcile('/elsewhere/docs'))

    expect(value).toBeNull()
    expect(reconcileSource).not.toHaveBeenCalled()
    await router.unsubscribe()
  })

  it('answers null while the runtime is down', async () => {
    const { router, reconcileSource } = await createRouter({ runtime: false })

    const value = await router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/docs'))

    expect(value).toBeNull()
    expect(reconcileSource).not.toHaveBeenCalled()
    await router.unsubscribe()
  })

  it('refuses a lane before subscribe and after unsubscribe', async () => {
    const idle = await createRouter({ subscribe: false })
    await expect(idle.router.withHotSubtreeLane(async () => 'ran')).rejects.toThrow(
      'INDEXED_SOURCE_ROUTER_NOT_SUBSCRIBED'
    )

    const { router } = await createRouter()
    await router.unsubscribe()
    await expect(router.withHotSubtreeLane(async () => 'ran')).rejects.toThrow(
      'INDEXED_SOURCE_ROUTER_NOT_SUBSCRIBED'
    )
  })

  it('does not wait for the coalescing window of pending invalidations', async () => {
    const { router, emit, scopes, windowMs } = await createRouter()
    emit('/fixture/a')

    const hot = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot'))
    await flushMicrotasks()

    expect(scopes()).toEqual(['/fixture/hot'])
    await hot

    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()
    expect(scopes()).toEqual(['/fixture/hot', '/fixture/a'])
    await router.unsubscribe()
  })

  it('takes the next turn ahead of scopes that have not started, without interrupting the running one', async () => {
    const { router, emit, scopes, reconcileSource, windowMs } = await createRouter()
    const gate = deferred()
    reconcileSource.mockImplementation(async (_sourceId, request) => {
      if (request.roots[0].path === '/fixture/a') await gate.promise
      return undefined
    })
    for (const scope of ['/fixture/a', '/fixture/b', '/fixture/c']) emit(scope)
    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()
    expect(scopes()).toEqual(['/fixture/a'])

    const hot = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot'))
    await flushMicrotasks()
    // The running scope keeps its turn; nothing starts behind it yet.
    expect(scopes()).toEqual(['/fixture/a'])
    expect(reconcileSource.mock.calls[0]?.[1]).not.toHaveProperty('signal')

    gate.resolve()
    await hot
    await vi.advanceTimersByTimeAsync(0)
    await flushMicrotasks()

    expect(scopes()).toEqual(['/fixture/a', '/fixture/hot', '/fixture/b', '/fixture/c'])
    await router.unsubscribe()
  })

  it('runs queued lanes in the order they were asked for', async () => {
    const { router, emit, scopes, reconcileSource, windowMs } = await createRouter()
    const gate = deferred()
    reconcileSource.mockImplementation(async (_sourceId, request) => {
      if (request.roots[0].path === '/fixture/a') await gate.promise
      return undefined
    })
    emit('/fixture/a')
    emit('/fixture/b')
    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()

    const first = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot-1'))
    const second = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot-2'))
    gate.resolve()
    await Promise.all([first, second])
    await vi.advanceTimersByTimeAsync(0)
    await flushMicrotasks()

    expect(scopes()).toEqual(['/fixture/a', '/fixture/hot-1', '/fixture/hot-2', '/fixture/b'])
    await router.unsubscribe()
  })

  it('holds later flushes until the lane has finished', async () => {
    const { router, emit, scopes, reconcileSource, windowMs } = await createRouter()
    const gate = deferred()
    reconcileSource.mockImplementation(async (_sourceId, request) => {
      if (request.roots[0].path === '/fixture/hot') await gate.promise
      return undefined
    })

    const hot = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot'))
    await flushMicrotasks()
    emit('/fixture/late')
    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()
    expect(scopes()).toEqual(['/fixture/hot'])

    gate.resolve()
    await hot
    await vi.advanceTimersByTimeAsync(0)
    await flushMicrotasks()
    expect(scopes()).toEqual(['/fixture/hot', '/fixture/late'])
    await router.unsubscribe()
  })

  it('aborts a running lane when the router unsubscribes instead of waiting it out', async () => {
    const { router, reconcileSource } = await createRouter()
    reconcileSource.mockImplementation(
      (_sourceId, request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason), {
            once: true
          })
        })
    )

    const hot = router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot'))
    const outcome = hot.then(
      () => 'resolved',
      (error: Error) => error.message
    )
    await flushMicrotasks()

    await router.unsubscribe()

    await expect(outcome).resolves.toBe('INDEXED_SOURCE_ROUTER_UNSUBSCRIBED')
  })

  it("merges the caller's own signal into the reconcile", async () => {
    const { router, reconcileSource } = await createRouter()
    const caller = new AbortController()
    let seen: AbortSignal | undefined
    reconcileSource.mockImplementation(async (_sourceId, request) => {
      seen = request.signal
      return undefined
    })

    await router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/hot', caller.signal))
    expect(seen?.aborted).toBe(false)
    caller.abort(new Error('caller gave up'))
    expect(seen?.aborted).toBe(true)

    reconcileSource.mockClear()
    await expect(
      router.withHotSubtreeLane((lane) => lane.reconcile('/fixture/again', caller.signal))
    ).rejects.toThrow('caller gave up')
    expect(reconcileSource).not.toHaveBeenCalled()
    await router.unsubscribe()
  })

  it('rejects the caller of a failing lane and leaves the chain usable', async () => {
    const { router, emit, scopes, windowMs } = await createRouter()

    await expect(
      router.withHotSubtreeLane(async () => {
        throw new Error('lane failed')
      })
    ).rejects.toThrow('lane failed')

    emit('/fixture/after')
    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()
    expect(scopes()).toEqual(['/fixture/after'])
    await router.unsubscribe()
  })

  it('leaves ordinary reconcile requests without a signal', async () => {
    const { router, emit, reconcileSource, windowMs } = await createRouter()

    emit('/fixture/a')
    await vi.advanceTimersByTimeAsync(windowMs)
    await flushMicrotasks()

    expect(reconcileSource.mock.calls[0]?.[1]).toEqual({
      reason: 'file-watch-subtree',
      roots: [
        {
          sourceId: FILE_SOURCE_ID,
          path: '/fixture/a',
          permissionState: 'granted',
          reason: 'file-watch-subtree'
        }
      ]
    })
    expect(Object.keys(reconcileSource.mock.calls[0]?.[1] ?? {})).not.toContain('signal')
    await router.unsubscribe()
  })
})
