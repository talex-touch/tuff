// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'
import { computed, createApp, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResize } from './useResize'

const mocks = vi.hoisted(() => ({
  send: vi.fn<(event: unknown, payload: unknown) => Promise<void>>(async () => undefined)
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mocks.send
  })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    diagnostics: {},
    recommendation: { enabled: true },
    searchEngine: {}
  }
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
}))

function mountResizeHarness(
  activations: IProviderActivate[],
  floor?: Ref<number>,
  floorApplied?: Ref<boolean>
) {
  const results = ref<TuffItem[]>([])
  const activeActivations = ref<IProviderActivate[] | null>(activations)
  const loading = ref(false)
  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = createApp({
    setup() {
      useResize({
        activeActivations,
        loading,
        results: computed(() => results.value),
        floor,
        floorApplied
      })
      return () => null
    }
  })
  app.mount(root)

  return {
    activeActivations,
    cleanup: () => {
      app.unmount()
      root.remove()
    },
    loading,
    results
  }
}

async function flushLayoutUpdate(): Promise<void> {
  await nextTick()
  await vi.advanceTimersByTimeAsync(100)
  await vi.runOnlyPendingTimersAsync()
}

describe('useResize forceMax activation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.send.mockClear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    document.body.innerHTML = '<div class="CoreBox" style="height: 56px"></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('does not force max height for widget activation unless requested', async () => {
    const harness = mountResizeHarness([
      {
        id: 'plugin-features',
        meta: {
          feature: {
            meta: {
              interaction: {
                type: 'widget'
              }
            }
          }
        }
      } as IProviderActivate
    ])

    await flushLayoutUpdate()

    expect(mocks.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forceMax: false })
    )
    harness.cleanup()
  })

  it('emits forceMax when activation explicitly requests it', async () => {
    const harness = mountResizeHarness([
      {
        id: 'plugin-features',
        forceMax: true
      } as IProviderActivate
    ])

    await flushLayoutUpdate()

    expect(mocks.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ forceMax: true })
    )
    harness.cleanup()
  })
})

function renderRows(count: number, rowHeight: number): void {
  const content = document.querySelector('.CoreBoxRes-ScrollContent') as HTMLElement
  content.innerHTML = ''
  for (let index = 0; index < count; index += 1) {
    const row = document.createElement('div')
    // jsdom has no layout: give the measurer explicit geometry.
    row.getBoundingClientRect = () =>
      ({
        top: index * rowHeight,
        bottom: (index + 1) * rowHeight,
        height: rowHeight,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect
    Object.defineProperty(row, 'offsetTop', { value: index * rowHeight, configurable: true })
    Object.defineProperty(row, 'offsetHeight', { value: rowHeight, configurable: true })
    content.appendChild(row)
  }
}

function items(count: number): TuffItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${index}` }) as TuffItem)
}

function sentHeights(): number[] {
  return mocks.send.mock.calls.map(([, payload]) => (payload as { height: number }).height)
}

describe('useResize height hysteresis while a search is streaming', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.send.mockClear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    document.body.innerHTML =
      '<div class="CoreBox" style="height: 56px"></div>' +
      '<div class="CoreBoxRes-Main"><div class="scroll-area"><div class="CoreBoxRes-ScrollContent"></div></div></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('holds the last height while results are still arriving, then shrinks once idle', async () => {
    const harness = mountResizeHarness([])
    // Full result set from the previous query is on screen.
    harness.loading.value = false
    renderRows(10, 48)
    harness.results.value = items(10)
    await flushLayoutUpdate()
    const tallHeight = sentHeights().at(-1)!
    expect(tallHeight).toBeGreaterThan(200)

    // New query: the fast-layer snapshot is much shorter, but the stream is still open.
    harness.loading.value = true
    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()
    expect(sentHeights().at(-1)).toBe(tallHeight)

    // Stream ended with the short list as the final answer: now the window may shrink.
    harness.loading.value = false
    await flushLayoutUpdate()
    expect(sentHeights().at(-1)).toBeLessThan(tallHeight)

    harness.cleanup()
  })

  it('still grows while streaming when the new batch is taller', async () => {
    const harness = mountResizeHarness([])
    harness.loading.value = true
    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()
    const shortHeight = sentHeights().at(-1)!

    renderRows(8, 48)
    harness.results.value = items(8)
    await flushLayoutUpdate()
    expect(sentHeights().at(-1)).toBeGreaterThan(shortHeight)

    harness.cleanup()
  })
})

describe('useResize window floor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.send.mockClear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    document.body.innerHTML =
      '<div class="CoreBox" style="height: 56px"></div>' +
      '<div class="CoreBoxRes-Main"><div class="scroll-area"><div class="CoreBoxRes-ScrollContent"></div></div></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function lastSent(): { height: number; source: string } {
    return mocks.send.mock.calls.at(-1)![1] as { height: number; source: string }
  }

  it('keeps the window at least as tall as the floor, and gives the room back at once', async () => {
    const floor = ref(0)
    const harness = mountResizeHarness([], floor)
    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()
    const contentHeight = lastSent().height
    expect(contentHeight).toBe(2 * 48 + 56 + 10)

    // No timers advanced: a floor change skips the throttle that paces measurements.
    floor.value = 416
    await nextTick()
    expect(lastSent()).toEqual(expect.objectContaining({ height: 416, source: 'panel:floor' }))

    floor.value = 0
    await nextTick()
    expect(lastSent()).toEqual(
      expect.objectContaining({ height: contentHeight, source: 'panel:floor' })
    )

    harness.cleanup()
  })

  it('never asks for more than the window maximum', async () => {
    const floor = ref(0)
    const harness = mountResizeHarness([], floor)
    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()

    floor.value = 900
    await nextTick()
    expect(lastSent().height).toBe(600)

    harness.cleanup()
  })

  it('does not hold a closed panel’s room while results stream', async () => {
    const floor = ref(0)
    const harness = mountResizeHarness([], floor)
    renderRows(3, 48)
    harness.results.value = items(3)
    await flushLayoutUpdate()
    const contentHeight = lastSent().height

    floor.value = 416
    await nextTick()
    // A refresh starts streaming under the open panel; the window keeps the panel's room.
    harness.loading.value = true
    await flushLayoutUpdate()
    expect(lastSent().height).toBe(416)

    // The panel closes mid-stream: the hold keeps the results' height, not the panel's.
    floor.value = 0
    await nextTick()
    expect(lastSent().height).toBe(contentHeight)

    harness.cleanup()
  })

  it('says whether the floor is what holds the window up, above what the results want', async () => {
    const floor = ref(0)
    const floorApplied = ref(false)
    const harness = mountResizeHarness([], floor, floorApplied)
    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()
    expect(floorApplied.value).toBe(false)

    floor.value = 416
    await nextTick()
    expect(floorApplied.value).toBe(true)

    // Results taller than the floor hold the window themselves.
    renderRows(9, 48)
    harness.results.value = items(9)
    await flushLayoutUpdate()
    expect(lastSent().height).toBe(9 * 48 + 56 + 10)
    expect(floorApplied.value).toBe(false)

    renderRows(2, 48)
    harness.results.value = items(2)
    await flushLayoutUpdate()
    expect(floorApplied.value).toBe(true)

    floor.value = 0
    await nextTick()
    expect(floorApplied.value).toBe(false)

    harness.cleanup()
  })
})
