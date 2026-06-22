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

  it('keeps CoreBox expanded for visible empty search states', async () => {
    document.body.innerHTML = `
      <div class="CoreBox" style="height: 56px"></div>
      <div class="CoreBoxRes-Main">
        <div class="scroll-area">
          <div class="CoreBoxRes-ScrollContent">
            <div class="CoreBoxSearchState" style="height: 160px"></div>
          </div>
        </div>
      </div>
    `
    const searchState = document.querySelector('.CoreBoxSearchState') as HTMLElement
    Object.defineProperty(searchState, 'offsetTop', { configurable: true, value: 0 })
    Object.defineProperty(searchState, 'offsetHeight', { configurable: true, value: 160 })
    vi.spyOn(searchState, 'getBoundingClientRect').mockReturnValue({
      bottom: 160,
      height: 160,
      left: 0,
      right: 720,
      top: 0,
      width: 720,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect)

    const harness = mountResizeHarness([])

    await flushLayoutUpdate()

    expect(mocks.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: expect.any(Number), resultCount: 0 })
    )
    const payload = mocks.send.mock.calls.at(-1)?.[1] as { height?: number } | undefined
    expect(payload?.height).toBeGreaterThan(56)
    harness.cleanup()
  })

  it('uses search state rects when scroll content reports no measurable children', async () => {
    document.body.innerHTML = `
      <div class="CoreBox" style="height: 56px"></div>
      <div class="CoreBoxRes-Main">
        <div class="scroll-area">
          <div class="CoreBoxRes-ScrollContent">
            <div class="CoreBoxSearchState"></div>
          </div>
        </div>
      </div>
    `
    const resultContent = document.querySelector('.CoreBoxRes-ScrollContent') as HTMLElement
    const searchState = document.querySelector('.CoreBoxSearchState') as HTMLElement
    vi.spyOn(resultContent, 'getBoundingClientRect').mockReturnValue({
      bottom: 57,
      height: 0,
      left: 0,
      right: 718,
      top: 57,
      width: 718,
      x: 0,
      y: 57,
      toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(searchState, 'getBoundingClientRect').mockReturnValue({
      bottom: 185,
      height: 128,
      left: 0,
      right: 718,
      top: 57,
      width: 718,
      x: 0,
      y: 57,
      toJSON: () => ({})
    } as DOMRect)

    const harness = mountResizeHarness([])

    await flushLayoutUpdate()

    const payload = mocks.send.mock.calls.at(-1)?.[1] as { height?: number } | undefined
    expect(payload?.height).toBe(195)
    harness.cleanup()
  })

  it('prefers visible search state height over stretched scroll content shells', async () => {
    document.body.innerHTML = `
      <div class="CoreBox" style="height: 56px"></div>
      <div class="CoreBoxRes-Main">
        <div class="scroll-area">
          <div class="CoreBoxRes-ScrollContent">
            <div class="CoreBoxSearchState"></div>
          </div>
        </div>
      </div>
    `
    const resultContent = document.querySelector('.CoreBoxRes-ScrollContent') as HTMLElement
    const searchState = document.querySelector('.CoreBoxSearchState') as HTMLElement

    Object.defineProperty(resultContent, 'offsetTop', { configurable: true, value: 56 })
    Object.defineProperty(resultContent, 'offsetHeight', { configurable: true, value: 1 })
    vi.spyOn(resultContent, 'getBoundingClientRect').mockReturnValue({
      bottom: 57,
      height: 1,
      left: 0,
      right: 720,
      top: 56,
      width: 720,
      x: 0,
      y: 56,
      toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(searchState, 'getBoundingClientRect').mockReturnValue({
      bottom: 185,
      height: 128,
      left: 0,
      right: 718,
      top: 57,
      width: 718,
      x: 0,
      y: 57,
      toJSON: () => ({})
    } as DOMRect)

    const harness = mountResizeHarness([])

    await flushLayoutUpdate()

    const payload = mocks.send.mock.calls.at(-1)?.[1] as { height?: number } | undefined
    expect(payload?.height).toBe(195)
    harness.cleanup()
  })
})
