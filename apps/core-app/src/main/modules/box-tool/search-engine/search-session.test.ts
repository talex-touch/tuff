import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import {
  createCachedSearchResultSnapshot,
  materializeCachedSearchResult,
  SearchSessionRegistry
} from './search-session'

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

  it('keeps the request activation snapshot local and merges provider activation into it', () => {
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
