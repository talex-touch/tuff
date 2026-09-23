// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
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

function mountResizeHarness(activations: IProviderActivate[]) {
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
        results: computed(() => results.value)
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
