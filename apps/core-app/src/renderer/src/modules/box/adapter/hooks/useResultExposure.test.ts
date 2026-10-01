// @vitest-environment jsdom

import type { TuffItem } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'

/**
 * The exposure report is only as trustworthy as the "actually visible" claim behind it. These
 * tests drive the real hook over a fake IntersectionObserver and the real native-visibility
 * subscription: a rendered-but-offscreen row must never be reported, a row that stays on screen
 * across re-renders must not be reported twice in one display session, and hiding then re-showing
 * the window must open a new session that reports it again.
 */

const state = vi.hoisted(() => {
  const activityListeners = new Set<(active: boolean) => void>()
  return {
    listeners: new Map<string, (payload?: unknown) => void>(),
    send: vi.fn(),
    /** Resolves the native `getVisibility` probe. Replaceable so a test can hold it open. */
    visibility: Promise.resolve({ visible: true }) as Promise<{ visible?: boolean }>,
    activity: {
      active: true,
      listeners: activityListeners,
      set(active: boolean) {
        if (state.activity.active === active) return
        state.activity.active = active
        for (const listener of activityListeners) listener(active)
      },
      subscribe(listener: (active: boolean) => void) {
        listener(state.activity.active)
        activityListeners.add(listener)
        return () => activityListeners.delete(listener)
      }
    },
    rafQueue: [] as Array<((time: number) => void) | null>,
    uuid: 0,
    unmountCallbacks: [] as Array<() => void>
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName?: () => string } | string, callback: (payload?: unknown) => void) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      state.listeners.set(key, callback)
      return () => {
        state.listeners.delete(key)
      }
    },
    send: state.send
  })
}))

vi.mock('@talex-touch/utils/transport/event/builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/transport/event/builder')>()
  return {
    ...actual,
    defineRawEvent: (name: string) => ({ toString: () => name, toEventName: () => name })
  }
})

vi.mock('@talex-touch/utils/transport/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/transport/events')>()
  // The real event objects stringify to `core-box:<module>:<action>`; a raw name is enough for the
  // hook, which only ever passes them to transport.send.
  return {
    ...actual,
    CoreBoxEvents: {
      ...actual.CoreBoxEvents,
      ui: {
        ...actual.CoreBoxEvents.ui,
        getVisibility: { toString: () => 'core-box:ui:get-visibility' }
      },
      item: {
        ...actual.CoreBoxEvents.item,
        usageChanged: { toString: () => 'core-box:item:usage-changed' }
      },
      recommendation: {
        ...actual.CoreBoxEvents.recommendation,
        reportExposure: { toString: () => 'core-box:recommendation:report-exposure' }
      }
    }
  }
})

vi.mock('~/modules/telemetry/renderer-activity', () => ({
  subscribeRendererActivity: state.activity.subscribe,
  setRendererActivity: state.activity.set
}))

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onMounted: (callback: () => void) => callback(),
    onBeforeUnmount: (callback: () => void) => {
      state.unmountCallbacks.push(callback)
    }
  }
})

type FakeEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number }

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly options: IntersectionObserverInit | undefined
  readonly observed = new Set<Element>()
  disconnected = false

  constructor(
    private readonly callback: (entries: FakeEntry[]) => void,
    options?: IntersectionObserverInit
  ) {
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element): void {
    this.observed.add(el)
  }

  unobserve(el: Element): void {
    this.observed.delete(el)
  }

  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }

  /** One IO delivery. `ratio` drives both `isIntersecting` and `intersectionRatio`. */
  deliver(el: Element, ratio: number): void {
    this.callback([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }])
  }
}

import { useResultExposure } from './useResultExposure'

function createItem(id: string, overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id,
    kind: 'app',
    source: { id: 'app-provider', type: 'application', name: 'App provider' },
    render: { mode: 'default', basic: { title: id } },
    ...overrides
  } as TuffItem
}

function exposureReports() {
  return state.send.mock.calls
    .filter(([event]) => String(event) === 'core-box:recommendation:report-exposure')
    .map(
      ([, payload]) =>
        payload as {
          sessionId: string
          kind: string
          surface: string
          items: Array<{ sourceId: string; itemId: string; sourceType: string; pinned: boolean }>
        }
    )
}

/** Last observer the hook created, or null when it has not created one (e.g. while hidden). */
const currentObserver = () => FakeIntersectionObserver.instances.at(-1) ?? null

async function flush(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

function flushRaf(): void {
  const queued = state.rafQueue.splice(0)
  // A cancelled frame leaves a null placeholder in the queue; the browser never invokes it, so the
  // harness must not either or it would drive a callback the real runtime drops.
  for (const callback of queued) {
    if (callback) callback(0)
  }
}

/** Mounts the hook over real DOM rows and returns the refs a test drives. */
function mountHarness(items: TuffItem[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const elements = new Map<string, HTMLElement>()
  for (const item of items) {
    const el = document.createElement('div')
    el.setAttribute('data-corebox-item-id', item.id)
    container.appendChild(el)
    elements.set(item.id, el)
  }

  const itemRef = shallowRef(items)
  const rootRef = ref<HTMLElement | null>(container)
  const query = ref('')
  const kind = ref<'search' | 'recommendation'>('recommendation')

  useResultExposure({
    items: itemRef,
    root: rootRef,
    query,
    kind,
    surface: () => 'core-box'
  })

  return { container, elements, itemRef, rootRef, query, kind }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.listeners.clear()
  state.rafQueue.length = 0
  state.uuid = 0
  state.unmountCallbacks.length = 0
  FakeIntersectionObserver.instances.length = 0
  state.activity.listeners.clear()
  state.activity.active = true
  state.visibility = Promise.resolve({ visible: true })
  state.send.mockImplementation(async (event: unknown) => {
    const name = String(event)
    if (name === 'core-box:ui:get-visibility') return state.visibility
    return undefined
  })
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    state.rafQueue.push(callback)
    return state.rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    state.rafQueue[handle - 1] = null
  })
  vi.stubGlobal('crypto', { randomUUID: () => `session-${++state.uuid}` })
})

describe('useResultExposure visibility session', () => {
  it('observes the rendered rows and reports an item only once it is half visible', async () => {
    const { elements } = mountHarness([createItem('app-a')])
    await flush()

    const observer = currentObserver()
    expect(observer).not.toBeNull()
    // Every rendered row is observed up front; visibility is decided per entry, not per render.
    expect(observer!.observed.has(elements.get('app-a')!)).toBe(true)

    // A row that peeks in at 40% is not "seen": below the 0.5 threshold, nothing is reported.
    observer!.deliver(elements.get('app-a')!, 0.4)
    flushRaf()
    expect(exposureReports()).toHaveLength(0)

    observer!.deliver(elements.get('app-a')!, 0.5)
    flushRaf()
    expect(exposureReports()).toHaveLength(1)
    expect(exposureReports()[0].items).toEqual([
      { sourceId: 'app-provider', itemId: 'app-a', sourceType: 'application', pinned: false }
    ])
  })

  it('does not report again when only the row metadata changes', async () => {
    const { elements, itemRef } = mountHarness([createItem('app-a')])
    await flush()

    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()
    expect(exposureReports()).toHaveLength(1)

    // A usage-count push replaces the items array with new row objects but the same identity. The
    // watcher re-observes, yet the row was already counted in this display session.
    itemRef.value = [createItem('app-a', { meta: { usageStats: { executeCount: 9 } } as never })]
    await flush()
    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()

    expect(exposureReports()).toHaveLength(1)
  })

  it('reports each newly visible item in its own update, not the whole session each time', async () => {
    const { elements } = mountHarness([createItem('app-a'), createItem('app-b')])
    await flush()

    const observer = currentObserver()!
    // Two rows become visible in two separate observer deliveries, as a scroll produces.
    observer.deliver(elements.get('app-a')!, 1)
    flushRaf()
    observer.deliver(elements.get('app-b')!, 1)
    flushRaf()

    const reports = exposureReports()
    // Sending the accumulated session twice would re-count app-a as a fresh impression.
    expect(reports.map((report) => report.items.map((entry) => entry.itemId))).toEqual([
      ['app-a'],
      ['app-b']
    ])
    expect(reports[0].sessionId).toBe(reports[1].sessionId)
  })

  it('reports an item at most once per display session however often it re-enters view', async () => {
    const { elements } = mountHarness([createItem('app-a')])
    await flush()

    const observer = currentObserver()!
    observer.deliver(elements.get('app-a')!, 1)
    flushRaf()
    // Re-entering view (a scroll away and back) is the same impression, not a second one.
    observer.deliver(elements.get('app-a')!, 1)
    observer.deliver(elements.get('app-a')!, 1)
    flushRaf()

    expect(exposureReports()).toHaveLength(1)
  })

  it('reports rows under their original identity and keeps pinned flags', async () => {
    const { elements } = mountHarness([
      createItem('rebuilt-app', {
        meta: {
          _originalSourceId: 'file-provider',
          _originalItemId: '/Users/x/Rebuilt.app',
          recommendation: { source: 'frequent' }
        } as TuffItem['meta']
      }),
      createItem('pinned-app', {
        meta: { pinned: { isPinned: true } } as TuffItem['meta']
      })
    ])
    await flush()

    const observer = currentObserver()!
    observer.deliver(elements.get('rebuilt-app')!, 1)
    observer.deliver(elements.get('pinned-app')!, 1)
    flushRaf()

    expect(exposureReports()[0].items).toEqual([
      {
        sourceId: 'file-provider',
        itemId: '/Users/x/Rebuilt.app',
        sourceType: 'application',
        pinned: false
      },
      { sourceId: 'app-provider', itemId: 'pinned-app', sourceType: 'application', pinned: true }
    ])
  })

  it('never reports transient rows such as notifications or previews', async () => {
    const { elements } = mountHarness([
      createItem('notice', { kind: 'notification' }),
      createItem('preview', { kind: 'preview' })
    ])
    await flush()

    const observer = currentObserver()!
    observer.deliver(elements.get('notice')!, 1)
    observer.deliver(elements.get('preview')!, 1)
    flushRaf()

    expect(exposureReports()).toHaveLength(0)
  })

  it('opens a new display session when CoreBox is shown again, and reports the row again', async () => {
    const { elements } = mountHarness([createItem('app-a')])
    await flush()

    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()
    expect(exposureReports()).toHaveLength(1)

    window.dispatchEvent(new CustomEvent('corebox:shown'))
    await flush()
    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()

    const reports = exposureReports()
    expect(reports).toHaveLength(2)
    // A reopen is a fresh session: the same item is a new impression, under a new session id.
    expect(reports[1].sessionId).not.toBe(reports[0].sessionId)
    expect(reports[1].items[0].itemId).toBe('app-a')
  })

  it('rotates the session when the result kind changes, and labels the report with it', async () => {
    const { elements, kind } = mountHarness([createItem('app-a')])
    await flush()

    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()

    kind.value = 'search'
    await flush()
    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()

    const reports = exposureReports()
    expect(reports).toHaveLength(2)
    expect(reports[0].kind).toBe('recommendation')
    expect(reports[1].kind).toBe('search')
    expect(reports[1].sessionId).not.toBe(reports[0].sessionId)
  })

  it('stops reporting while the native window is hidden and starts a new session when shown', async () => {
    const { elements } = mountHarness([createItem('app-a')])
    await flush()

    const first = currentObserver()!
    first.deliver(elements.get('app-a')!, 1)
    flushRaf()
    const firstSession = exposureReports()[0].sessionId

    state.activity.set(false)
    // The observer the hide disconnected must not be able to report afterwards.
    first.deliver(elements.get('app-a')!, 1)
    flushRaf()
    expect(exposureReports()).toHaveLength(1)

    state.activity.set(true)
    await flush()
    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()

    const reports = exposureReports()
    expect(reports).toHaveLength(2)
    expect(reports[1].sessionId).not.toBe(firstSession)
  })

  it('trusts the visibility subscription over an in-flight probe that resolves visible', async () => {
    const held = Promise.withResolvers<{ visible?: boolean }>()
    state.visibility = held.promise

    const { elements } = mountHarness([createItem('app-a')])
    await flush()
    // Nothing is observed until the native visibility is known.
    expect(currentObserver()).toBeNull()

    // The window hides before the probe answers; the probe then says visible.
    state.activity.set(false)
    held.resolve({ visible: true })
    await flush()

    expect(currentObserver()).toBeNull()
    expect(exposureReports()).toHaveLength(0)

    state.activity.set(true)
    await flush()
    currentObserver()!.deliver(elements.get('app-a')!, 1)
    flushRaf()
    expect(exposureReports()).toHaveLength(1)
    expect(exposureReports()[0].items[0].itemId).toBe('app-a')
  })

  it('does not report once the surface unmounts', async () => {
    const { elements } = mountHarness([createItem('app-a')])
    await flush()

    const observer = currentObserver()!
    for (const callback of state.unmountCallbacks) callback()
    observer.deliver(elements.get('app-a')!, 1)
    flushRaf()

    expect(exposureReports()).toHaveLength(0)
  })
})
