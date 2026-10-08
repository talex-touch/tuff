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

type UseTracker = (options: Record<string, unknown>) => { hasSession: { value: boolean } }
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
}

let reports: Report[]
let listeners: Map<string, Array<() => void>>
let documentStub: { hidden: boolean }
let stopScope: () => void

function dispatch(type: string) {
  for (const listener of listeners.get(type) ?? [])
    listener()
}

/** Lets the flushes the timers started finish: hashing runs off the microtask queue. */
async function drain() {
  for (let index = 0; index < 20; index += 1)
    await new Promise(resolve => setImmediate(resolve))
}

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 15_000) {
    vi.advanceTimersByTime(Math.min(15_000, ms - elapsed))
    await drain()
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'))
  reports = []
  listeners = new Map()
  documentStub = { hidden: false }
  const target = {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    removeEventListener: () => {},
  }
  vi.stubGlobal('document', Object.assign(documentStub, target, { querySelector: () => null }))
  vi.stubGlobal('window', Object.assign({ scrollY: 0, innerHeight: 800, location: { hash: '' } }, target))

  const mounted: Array<() => void> = []
  const useTracker = createTracker({
    vue: { computed, onBeforeUnmount: () => {}, onMounted: (callback: () => void) => mounted.push(callback), readonly, ref, watch },
    nuxt: { useRoute: () => reactive({ fullPath: '/docs/guide' }) },
    vueuse: {
      useDebounceFn: (fn: (...args: unknown[]) => unknown) => fn,
      useEventListener: (eventTarget: typeof target, type: string, listener: () => void) => eventTarget.addEventListener(type, listener),
    },
    request: {
      requestJson: vi.fn(async (url: string, options: { body?: Record<string, unknown> }) => {
        if (url === '/api/docs/view')
          return { sessionId: 'session_1', token: 'token_1', views: 1, challenge: null, riskLevel: 0 }
        reports.push({ reason: String(options.body?.reason), totalDurationMs: Number(options.body?.totalDurationMs) })
        return {}
      }),
    },
  })

  const scope = effectScope()
  scope.run(() => useTracker({ source: 'docs_page', path: () => 'docs/guide', clientId: () => 'device_1', trackSections: false }))
  stopScope = () => scope.stop()
  for (const callback of mounted)
    callback()
  await nextTick()
  await drain()
})

afterEach(() => {
  stopScope()
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
})
