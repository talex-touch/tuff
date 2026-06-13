// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { computed, createApp, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResize } from './useResize'

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => undefined)
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
    document.body.innerHTML = '<div class="CoreBox" style="height: 64px"></div>'
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
