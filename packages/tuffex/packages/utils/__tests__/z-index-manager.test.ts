import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  DEFAULT_Z_INDEX_SEED,
  configureZIndex,
  getZIndex,
  nextZIndex,
  onZIndexEvent,
  refreshZIndex,
  resetZIndex,
  createZIndexAllocator,
  provideZIndexAllocator,
  useZIndexAllocator,
} from '../z-index-manager'

describe('z-index-manager', () => {
  beforeEach(() => {
    configureZIndex({ overrides: undefined, seedSource: null, seed: 2000 })
    resetZIndex(2000, 'test')
  })

  it('increments monotonically by default', () => {
    const a = nextZIndex()
    const b = nextZIndex()
    expect(b).toBeGreaterThan(a)
  })

  it('supports overrides next/get', () => {
    configureZIndex({
      overrides: {
        next: ctx => ctx.current + 10,
        get: () => 123,
      },
    })

    resetZIndex(2000, 'test')
    expect(nextZIndex()).toBe(2010)
    expect(getZIndex()).toBe(123)
  })

  it('refresh does not decrease current', () => {
    resetZIndex(5000, 'test')
    refreshZIndex(1000, 'test')
    expect(getZIndex()).toBe(5000)
  })

  it('reset can decrease current', () => {
    resetZIndex(5000, 'test')
    resetZIndex(1000, 'test')
    expect(getZIndex()).toBe(1000)
  })

  it('seedSource subscribe triggers refresh', () => {
    let seed = 3000
    let subscribed: (() => void) | null = null
    const unsub = vi.fn()

    configureZIndex({
      seedSource: {
        getSeed: () => seed,
        subscribe: (listener) => {
          subscribed = listener
          return () => unsub()
        },
      },
    })

    resetZIndex(2000, 'test')
    refreshZIndex(undefined, 'manual')
    expect(getZIndex()).toBe(3000)

    seed = 4000
    const trigger: (() => void) | null = subscribed
    if (!trigger) {
      throw new Error('Expected seedSource subscription to be registered')
    }
    trigger()
    expect(getZIndex()).toBe(4000)

    configureZIndex({ seedSource: null })
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('emits events', () => {
    const events: Array<TxEventType> = []
    const off = onZIndexEvent(e => events.push(e.type))

    nextZIndex()
    refreshZIndex(9000, 'test')
    resetZIndex(1000, 'test')

    off()
    expect(events).toEqual(expect.arrayContaining(['next', 'refresh', 'reset']))
  })
})

describe('z-index allocator scoping', () => {
  function probe(seen: number[]) {
    return defineComponent({
      setup() {
        seen.push(useZIndexAllocator().next())
        return () => h('div')
      },
    })
  }

  it('gives each SSR app its own counter, so one request cannot shift another', async () => {
    const seen: number[] = []

    // Two SSR apps stand in for two requests handled by the same process: the
    // module-scope counter used to carry the first request's allocation into
    // every later one, so the client's cold start never matched.
    const first = createSSRApp(probe(seen))
    provideZIndexAllocator(first)
    await renderToString(first)

    const second = createSSRApp(probe(seen))
    provideZIndexAllocator(second)
    await renderToString(second)

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(DEFAULT_Z_INDEX_SEED + 1)
    expect(seen[1]).toBe(seen[0])
  })

  it('falls back to the module allocator when no app provided one', async () => {
    resetZIndex(DEFAULT_Z_INDEX_SEED, 'test')
    const seen: number[] = []

    // A component rendered outside app.use(Tuffex) must still allocate.
    await renderToString(createSSRApp(probe(seen)))

    expect(seen[0]).toBe(DEFAULT_Z_INDEX_SEED + 1)
    expect(getZIndex()).toBe(seen[0])
  })

  it('shares the module allocator across apps that were never provided one', async () => {
    resetZIndex(DEFAULT_Z_INDEX_SEED, 'test')
    const seen: number[] = []

    await renderToString(createSSRApp(probe(seen)))
    await renderToString(createSSRApp(probe(seen)))

    // This is the pre-fix behaviour, kept explicit: without a provided
    // allocator the counter is process-wide and keeps climbing. The contrast
    // with the test above is exactly what install() buys.
    expect(seen).toEqual([DEFAULT_Z_INDEX_SEED + 1, DEFAULT_Z_INDEX_SEED + 2])
  })

  it('keeps standalone allocators independent', () => {
    const one = createZIndexAllocator()
    const two = createZIndexAllocator()

    one.next()
    one.next()

    expect(one.get()).toBe(DEFAULT_Z_INDEX_SEED + 2)
    expect(two.get()).toBe(DEFAULT_Z_INDEX_SEED)
  })
})
