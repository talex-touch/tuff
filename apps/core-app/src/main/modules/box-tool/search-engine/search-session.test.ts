import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCachedSearchResultSnapshot,
  materializeCachedSearchResult,
  SearchSessionRegistry
} from './search-session'
import {
  hasActiveForegroundSearches,
  isIndexMaintenanceIdle,
  markSearchActivity
} from './search-activity'
import type { SearchCallerKind, SearchSession } from './search-session'

const query: TuffQuery = { text: 'session query', inputs: [] }
const coreBoxCaller = { kind: 'core-box' as const, id: 'core-box:sender:1', senderId: 1 }
const aiCaller = { kind: 'ai-agent' as const, id: 'agent:search' }

function createResult(sessionId: string): TuffSearchResult {
  return {
    sessionId,
    query,
    duration: 1,
    sources: [],
    items: [
      {
        id: 'cached-item',
        kind: 'app',
        source: { id: 'app-provider', type: 'application' },
        render: { mode: 'default', basic: { title: 'Cached item' } }
      } as TuffItem
    ]
  }
}

describe('SearchSessionRegistry', () => {
  it('creates fresh ids for detached cache snapshots', () => {
    const cached = createCachedSearchResultSnapshot(createResult('old-session'))
    const first = materializeCachedSearchResult(cached, 'new-session-a')
    const second = materializeCachedSearchResult(cached, 'new-session-b')

    first.items[0].render.basic!.title = 'Mutated by caller'

    expect(cached).not.toHaveProperty('sessionId')
    expect(first.sessionId).toBe('new-session-a')
    expect(second.sessionId).toBe('new-session-b')
    expect(second.items[0].render.basic?.title).toBe('Cached item')
  })

  it('isolates concurrent callers and rejects stale or foreign cancellation', () => {
    const registry = new SearchSessionRegistry()
    const first = registry.create({ caller: coreBoxCaller, query, activations: [] })
    const second = registry.create({ caller: aiCaller, query, activations: [] })

    expect(first.id).not.toBe(second.id)
    expect(registry.cancel(first.id, aiCaller)).toBe(false)
    expect(first.signal.aborted).toBe(false)
    expect(second.signal.aborted).toBe(false)

    first.complete()
    void first.publishSnapshot(createResult(first.id))

    expect(registry.cancel(first.id, coreBoxCaller)).toBe(false)
    expect(registry.cancel(second.id, coreBoxCaller)).toBe(false)
    expect(second.signal.aborted).toBe(false)
    expect(registry.cancel(second.id, aiCaller)).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  it('keeps the request activation snapshot local and merges provider activation into it', async () => {
    const requestedActivations = [{ id: 'requested-provider', meta: { feature: 'requested' } }]
    const registry = new SearchSessionRegistry()
    const session = registry.create({
      caller: coreBoxCaller,
      query,
      activations: requestedActivations
    })

    requestedActivations[0].meta.feature = 'mutated-outside-request'
    session.mergeActivations([
      { activate: [{ id: 'result-provider', meta: { feature: 'result' } }] }
    ])

    expect(session.getActivationState()).toEqual([
      { id: 'requested-provider', meta: { feature: 'requested' } },
      { id: 'result-provider', meta: { feature: 'result' } }
    ])
    session.complete()
    await session.publishSnapshot(createResult(session.id))
    await session.completed
  })

  it('buffers pre-snapshot updates and publishes exactly one terminal completion in order', async () => {
    const deliveries: string[] = []
    const registry = new SearchSessionRegistry()
    const session = registry.create({
      caller: coreBoxCaller,
      query,
      activations: [],
      sink: {
        start: (id) => {
          deliveries.push(`session:${id}`)
        },
        snapshot: () => {
          deliveries.push('snapshot')
        },
        update: () => {
          deliveries.push('update')
        },
        complete: () => {
          deliveries.push('complete')
        }
      }
    })

    expect(session.publishUpdate(createResult(session.id).items)).toBe(true)
    expect(session.complete()).toBe(true)
    expect(session.complete()).toBe(false)
    await session.publishSnapshot(createResult(session.id))
    await session.completed

    expect(deliveries).toEqual([`session:${session.id}`, 'snapshot', 'update', 'complete'])
  })

  it('aborts live sessions and waits for their cancellation completion during destroy', async () => {
    const completeDelivery = Promise.withResolvers<void>()
    const registry = new SearchSessionRegistry()
    const session = registry.create({
      caller: coreBoxCaller,
      query,
      activations: [],
      sink: { complete: () => completeDelivery.promise }
    })
    const gatherAbort = vi.fn()
    const gatherController = {
      abort: gatherAbort,
      promise: Promise.resolve(0),
      signal: new AbortController().signal
    }

    session.attachGather(gatherController)
    session.signal.addEventListener('abort', () => session.complete({ cancelled: true }), {
      once: true
    })
    await session.publishSnapshot(createResult(session.id))

    let destroySettled = false
    const destroying = registry.destroy().then(() => {
      destroySettled = true
    })
    await Promise.resolve()

    expect(gatherAbort).toHaveBeenCalledTimes(1)
    expect(session.signal.aborted).toBe(true)
    expect(destroySettled).toBe(false)

    completeDelivery.resolve()
    await destroying
    expect(registry.size).toBe(0)
  })
})

describe('SearchSession cancellation terminal', () => {
  it('reports an aborted session as cancelled even when completion is asked for plainly', async () => {
    // The gather's own completion callback calls `complete()` without a cancelled flag; if the
    // session had been cancelled meanwhile the renderer was told the search finished normally
    // and kept the stale items instead of resetting.
    const completions: Array<{ cancelled?: boolean }> = []
    const registry = new SearchSessionRegistry()
    const session = registry.create({
      caller: coreBoxCaller,
      query,
      activations: [],
      sink: {
        complete: (payload) => {
          completions.push({ cancelled: payload.cancelled })
        }
      }
    })
    await session.publishSnapshot(createResult(session.id))

    expect(session.cancel(coreBoxCaller)).toBe(true)
    expect(session.complete()).toBe(true)
    await session.completed

    expect(session.state).toBe('cancelled')
    expect(completions).toEqual([{ cancelled: true }])
  })
})

describe('SearchSessionRegistry shutdown guard', () => {
  it('keeps refusing new sessions after the drain finishes', async () => {
    // destroyPromise is nulled in a finally so repeat destroy() calls re-drain.
    // That also reopened the shutdown guard the moment the drain completed, so a
    // late request built a live session against torn-down services (#678).
    const registry = new SearchSessionRegistry()

    await registry.destroy()

    expect(() => registry.create({ caller: coreBoxCaller, query, activations: [] })).toThrow(
      /shutting down/
    )
  })
})

describe('SearchSession maintenance protection', () => {
  const liveSessions: SearchSession[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    markSearchActivity(0)
  })

  afterEach(async () => {
    for (const session of liveSessions.splice(0)) {
      session.cancel()
      session.complete()
      await session.publishSnapshot(createResult(session.id))
      await session.completed
    }
    markSearchActivity(0)
    vi.useRealTimers()
  })

  it.each<SearchCallerKind>([
    'core-box',
    'application-index',
    'division-box',
    'background',
    'ai-agent'
  ])(
    'only protects maintenance for foreground caller %s, including long-running searches',
    async (kind) => {
      const session = new SearchSessionRegistry().create({
        caller: { kind, id: `maintenance:${kind}` },
        query,
        activations: []
      })
      liveSessions.push(session)
      const foreground =
        kind === 'core-box' || kind === 'application-index' || kind === 'division-box'
      expect(hasActiveForegroundSearches()).toBe(foreground)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(isIndexMaintenanceIdle()).toBe(!foreground)
      session.complete()
      expect(isIndexMaintenanceIdle()).toBe(true)
    }
  )

  it.each(['complete', 'fail', 'cancel'] as const)(
    'releases foreground protection on %s before a blocked sink drains',
    async (terminal) => {
      const sinkEntered = Promise.withResolvers<void>()
      const sinkRelease = Promise.withResolvers<void>()
      const session = new SearchSessionRegistry().create({
        caller: coreBoxCaller,
        query,
        activations: [],
        sink: {
          start: async () => {
            sinkEntered.resolve()
            await sinkRelease.promise
          }
        }
      })
      liveSessions.push(session)
      await sinkEntered.promise
      await vi.advanceTimersByTimeAsync(10_000)
      let delivered = false
      void session.completed.then(() => {
        delivered = true
      })
      try {
        expect(isIndexMaintenanceIdle()).toBe(false)
        if (terminal === 'fail') session.fail(new Error('provider failed'))
        else session[terminal]()
        expect(isIndexMaintenanceIdle()).toBe(true)
        expect(delivered).toBe(false)
      } finally {
        sinkRelease.resolve()
      }
    }
  )

  it('does not release a different active foreground session when cancelling one caller', async () => {
    const registry = new SearchSessionRegistry()
    const first = registry.create({ caller: coreBoxCaller, query, activations: [] })
    const second = registry.create({
      caller: { kind: 'division-box', id: 'division:independent' },
      query,
      activations: []
    })
    liveSessions.push(first, second)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(first.cancel(second.caller)).toBe(false)
    expect(first.signal.aborted).toBe(false)
    first.cancel()
    expect(isIndexMaintenanceIdle()).toBe(false)
    second.cancel()
    expect(isIndexMaintenanceIdle()).toBe(true)
  })
})
