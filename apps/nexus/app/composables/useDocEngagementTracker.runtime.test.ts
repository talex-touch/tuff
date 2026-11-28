import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import { computed, effectScope, nextTick, reactive, readonly, ref, watch } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * How often a docs page reports engagement, and how much time it reports, when nobody touches it. The
 * composable runs as a plain function in the browser's place (`import.meta.client`), with the Vue,
 * Nuxt and VueUse pieces it uses passed in and the clock under the test's control.
 */

const source = readFileSync(new URL('./useDocEngagementTracker.ts', import.meta.url), 'utf8')
const body = source
  .replace(/^import[\s\S]*?from [^\n]+\n/gm, '')
  .replace(/^export /gm, '')
  .replaceAll('import.meta.client', 'true')
  .replaceAll('import.meta.url', JSON.stringify(import.meta.url))

type UseTracker = (options: Record<string, unknown>) => {
  hasSession: { value: boolean }
  flush: (reason?: string) => Promise<void>
  refreshSections: () => void
}
let createTracker: (dependencies: Record<string, unknown>) => UseTracker

beforeAll(async () => {
  const { code } = await transform(`
export function createTracker(dependencies) {
  const { computed, onBeforeUnmount, onMounted, readonly, ref, watch } = dependencies.vue
  const { useRoute } = dependencies.nuxt
  const { useDebounceFn, useEventListener } = dependencies.vueuse
  const { requestJson } = dependencies.request
${body}
  return useDocEngagementTracker
}
`, { format: 'esm', loader: 'ts', target: 'esnext' })
  createTracker = (await import(`data:text/javascript,${encodeURIComponent(code)}`) as { createTracker: typeof createTracker }).createTracker
})

interface Report {
  reason: string
  totalDurationMs: number
  powNonce?: string
}

let reports: Report[]
let viewCalls: number
let listeners: Map<string, Array<(event?: unknown) => void>>
let documentStub: { hidden: boolean, querySelector: (selector: string) => unknown }
let stopScope: () => void
let unmounts: Array<() => void>
let nextChallenge: { challengeId: string, seed: string, difficulty: number } | null

function dispatch(type: string, event?: unknown) {
  for (const listener of listeners.get(type) ?? [])
    listener(event)
}

/** The real digest, captured before any test spies on it. */
const realDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
/** Digests still running; `drain()` waits for them. They settle between turns, not in its loop. */
const pending = { digests: 0 }

/** The real digest, counted while it runs. */
const trackedDigest: SubtleCrypto['digest'] = async (algorithm, data) => {
  pending.digests += 1
  try {
    return await realDigest(algorithm, data)
  }
  finally {
    pending.digests -= 1
  }
}

/**
 * Lets the flushes the timers started finish. Hashing runs off the microtask queue, on the thread
 * pool, so it does not settle within a fixed number of turns: on a slow runner a fixed drain
 * returned before the report arrived, and it landed after the test had already cleared `reports`.
 */
async function drain() {
  for (let index = 0; index < 20 || pending.digests > 0; index += 1)
    await new Promise(resolve => setImmediate(resolve))
}

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 15_000) {
    vi.advanceTimersByTime(Math.min(15_000, ms - elapsed))
    await drain()
  }
}

function mountTracker(options: Record<string, unknown> = {}) {
  const mounted: Array<() => void> = []
  unmounts = []
  const target = {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    removeEventListener: () => {},
  }
  vi.stubGlobal('document', Object.assign(documentStub, target))
  vi.stubGlobal('window', Object.assign({ scrollY: 0, innerHeight: 800, location: { hash: '' } }, target))

  const useTracker = createTracker({
    vue: {
      computed,
      onBeforeUnmount: (callback: () => void) => unmounts.push(callback),
      onMounted: (callback: () => void) => mounted.push(callback),
      readonly,
      ref,
      watch,
    },
    nuxt: { useRoute: () => reactive({ fullPath: '/docs/guide' }) },
    vueuse: {
      useDebounceFn: (fn: (...args: unknown[]) => unknown) => fn,
      useEventListener: (eventTarget: typeof target, type: string, listener: () => void) => eventTarget.addEventListener(type, listener),
    },
    request: {
      requestJson: vi.fn(async (url: string, requestOptions: { body?: Record<string, unknown> }) => {
        if (url === '/api/docs/view') {
          viewCalls += 1
          return { sessionId: 'session_1', token: 'token_1', views: viewCalls, challenge: nextChallenge, riskLevel: 0 }
        }
        reports.push({
          reason: String(requestOptions.body?.reason),
          totalDurationMs: Number(requestOptions.body?.totalDurationMs),
          powNonce: typeof requestOptions.body?.powNonce === 'string' ? requestOptions.body.powNonce : undefined,
        })
        return {}
      }),
    },
  })

  const scope = effectScope()
  const tracker = scope.run(() =>
    useTracker({
      source: 'docs_page',
      path: () => 'docs/guide',
      clientId: () => 'device_1',
      trackSections: false,
      ...options,
    }),
  )!
  stopScope = () => {
    for (const cb of unmounts)
      cb()
    scope.stop()
  }
  for (const callback of mounted)
    callback()
  return tracker
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  pending.digests = 0
  viewCalls = 0
  nextChallenge = null
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(trackedDigest)
  vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'))
  reports = []
  listeners = new Map()
  documentStub = { hidden: false, querySelector: () => null }

  mountTracker()
  await nextTick()
  // Satisfy the 3s visible dwell gate before exercising ongoing engagement reporting.
  vi.advanceTimersByTime(3_000)
  await drain()
})

afterEach(() => {
  stopScope()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('docs engagement reports', () => {
  it('stops reporting a page nobody touches once the idle limit has passed', async () => {
    await advance(30 * 60_000)

    // Three minutes of reading time at most, reported over at most a dozen 15-second flushes.
    expect(reports.length).toBeGreaterThan(0)
    expect(reports.length).toBeLessThanOrEqual(13)
    const counted = reports.reduce((sum, report) => sum + report.totalDurationMs, 0)
    expect(counted).toBeLessThanOrEqual(3 * 60_000)
    expect(counted).toBeGreaterThan(2 * 60_000)
  })

  it('reports again when someone comes back, without the idle gap', async () => {
    await advance(30 * 60_000)
    reports.length = 0

    dispatch('pointerdown')
    await advance(15_000)

    expect(reports).toHaveLength(1)
    expect(reports[0]!.totalDurationMs).toBeLessThanOrEqual(15_000)
  })

  it('reports nothing while the tab is hidden, and not the hidden time once it is shown', async () => {
    await advance(15_000)
    documentStub.hidden = true
    dispatch('visibilitychange')
    await drain()
    reports.length = 0

    await advance(20 * 60_000)
    expect(reports).toEqual([])

    documentStub.hidden = false
    dispatch('visibilitychange')
    await advance(15_000)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.totalDurationMs).toBeLessThanOrEqual(15_000)
  })

  it('does not report the same time twice when the next flush starts while one is still hashing', async () => {
    // Hashing a report is asynchronous; hold every hash until the next interval has fired.
    const held: Array<() => void> = []
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation((algorithm, data) =>
      new Promise(resolve => held.push(() => resolve(trackedDigest(algorithm, data)))))

    await advance(15_000)
    await advance(15_000)
    while (held.length > 0) {
      held.shift()!()
      await drain()
    }

    const counted = reports.reduce((sum, report) => sum + report.totalDurationMs, 0)
    expect(counted).toBeGreaterThan(0)
    expect(counted).toBeLessThanOrEqual(30_000)
  })

  it('skips async pagehide flush when entering bfcache and resumes on persisted pageshow', async () => {
    vi.advanceTimersByTime(5_000)
    reports.length = 0

    dispatch('pagehide', { persisted: true })
    await drain()
    expect(reports).toEqual([])

    // While frozen in bfcache, interval timers must not fire.
    await advance(60_000)
    expect(reports).toEqual([])

    // Returning from bfcache preserves pre-hide reading time and excludes frozen time.
    dispatch('pageshow', { persisted: true })
    await advance(15_000)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.totalDurationMs).toBeGreaterThanOrEqual(19_000)
    expect(reports[0]!.totalDurationMs).toBeLessThanOrEqual(20_500)
  })
})

describe('docs engagement R9 performance guards', () => {
  it('defers POST /api/docs/view until 3s of visible dwell and skips instant bounces', async () => {
    stopScope()
    viewCalls = 0
    reports = []
    listeners = new Map()
    documentStub = { hidden: false, querySelector: () => null }

    const tracker = mountTracker()
    await nextTick()

    // Before 3s: zero view writes.
    vi.advanceTimersByTime(2_900)
    await drain()
    expect(viewCalls).toBe(0)
    expect(tracker.hasSession.value).toBe(false)

    // Hide tab before reaching 3s: pauses countdown and never fires while hidden.
    documentStub.hidden = true
    dispatch('visibilitychange')
    vi.advanceTimersByTime(10_000)
    await drain()
    expect(viewCalls).toBe(0)

    // Returning to visible resumes for the remaining ~100ms only.
    documentStub.hidden = false
    dispatch('visibilitychange')
    vi.advanceTimersByTime(100)
    await drain()
    expect(viewCalls).toBe(1)
    expect(tracker.hasSession.value).toBe(true)
  })

  it('caches heading offsets so 15s flushes trigger zero getBoundingClientRect layout reads', async () => {
    stopScope()
    viewCalls = 0
    reports = []
    listeners = new Map()

    const h1RectSpy = vi.fn(() => ({ top: 100 }))
    const h2RectSpy = vi.fn(() => ({ top: 600 }))
    const fakeRoot = {
      querySelectorAll: () => [
        { id: 'intro', textContent: 'Intro', isConnected: true, getBoundingClientRect: h1RectSpy },
        { id: 'usage', textContent: 'Usage', isConnected: true, getBoundingClientRect: h2RectSpy },
      ],
    }
    documentStub = { hidden: false, querySelector: () => fakeRoot }

    mountTracker({ trackSections: true })
    await nextTick()
    vi.advanceTimersByTime(3_000)
    await drain()

    // Clear initial mount/session-init measurement counts.
    h1RectSpy.mockClear()
    h2RectSpy.mockClear()

    // Two 15s flush cycles must perform 0 layout reads.
    await advance(30_000)
    expect(reports.length).toBeGreaterThanOrEqual(2)
    expect(h1RectSpy).not.toHaveBeenCalled()
    expect(h2RectSpy).not.toHaveBeenCalled()
  })

  it('spawns the PoW worker only when difficulty > 0 and terminates it on unmount', async () => {
    stopScope()
    viewCalls = 0
    reports = []
    listeners = new Map()
    documentStub = { hidden: false, querySelector: () => null }

    const terminateSpy = vi.fn()
    const postMessageSpy = vi.fn()
    let messageHandler: ((event: { data: { id: number, nonce: string } }) => void) | null = null

    class MockWorker {
      addEventListener(type: string, handler: any) {
        if (type === 'message')
          messageHandler = handler
      }

      postMessage(payload: { id: number }) {
        postMessageSpy(payload)
        queueMicrotask(() => {
          messageHandler?.({ data: { id: payload.id, nonce: 'w42' } })
        })
      }

      terminate = terminateSpy
    }

    vi.stubGlobal('Worker', MockWorker)
    nextChallenge = { challengeId: 'c1', seed: 'seed-1', difficulty: 2 }

    mountTracker()
    await nextTick()
    vi.advanceTimersByTime(3_000)
    await drain()

    // Worker is not spawned until a flush actually needs difficulty > 0.
    expect(postMessageSpy).not.toHaveBeenCalled()

    await advance(15_000)
    expect(postMessageSpy).toHaveBeenCalledTimes(1)
    expect(reports).toHaveLength(1)
    expect(reports[0]!.powNonce).toBe('w42')

    // Unmounting terminates the worker cleanly.
    stopScope()
    expect(terminateSpy).toHaveBeenCalledTimes(1)
  })

  it('uses macrotask yielding instead of microtask Promise.resolve spin in the PoW fallback', () => {
    expect(source).not.toContain('await Promise.resolve()')
    expect(source).toContain('schedulerApi?.yield')
    expect(source).toContain('setTimeout(resolve, 0)')
  })
})
