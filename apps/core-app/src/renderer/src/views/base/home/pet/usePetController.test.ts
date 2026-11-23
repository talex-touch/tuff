// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- mount harnesses for lifecycle tests */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import type { PetHost } from './usePetController'
import HomePet from './HomePet.vue'
import { usePetController } from './usePetController'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({})
  } as DOMRect
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state
  })
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state !== 'visible'
  })
}

function createHost() {
  const stage = document.createElement('div')
  const body = document.createElement('div')
  const box = document.createElement('div')
  const head = document.createElement('div')
  const input = document.createElement('textarea')

  const stageRect = vi
    .spyOn(stage, 'getBoundingClientRect')
    .mockReturnValue(makeRect(0, 0, 1000, 700))
  const bodyRect = vi
    .spyOn(body, 'getBoundingClientRect')
    .mockReturnValue(makeRect(0, 0, 1000, 700))
  const boxRect = vi
    .spyOn(box, 'getBoundingClientRect')
    .mockReturnValue(makeRect(200, 480, 600, 120))
  vi.spyOn(head, 'getBoundingClientRect').mockReturnValue(makeRect(200, 180, 600, 120))

  const host: PetHost = {
    stage: () => stage,
    body: () => body,
    box: () => box,
    input: () => input,
    empty: () => true,
    head: () => head
  }

  return {
    host,
    totalRectReads: () =>
      stageRect.mock.calls.length + bodyRect.mock.calls.length + boxRect.mock.calls.length,
    resetRectReads: () => {
      stageRect.mockClear()
      bodyRect.mockClear()
      boxRect.mockClear()
    }
  }
}

function createRafHarness() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, cb)
    return id
  })
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  return {
    request,
    cancel,
    pendingCount: () => callbacks.size,
    flush(ts: number) {
      const entries = [...callbacks.entries()]
      callbacks.clear()
      for (const [, cb] of entries) cb(ts)
    }
  }
}

const mountedWrappers: Array<{ unmount: () => void }> = []

function mountTracked(...args: Parameters<typeof mount>) {
  const wrapper = mount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  if (!window.matchMedia) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }))
  }
  document.documentElement.removeAttribute('data-low-battery-motion')
  setVisibility('visible')
})

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount()
  }
  document.documentElement.removeAttribute('data-low-battery-motion')
  setVisibility('visible')
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('usePetController idle pause lifecycle', () => {
  it('drops to 0 Hz on window blur and resumes cleanly on focus', async () => {
    const raf = createRafHarness()
    const { host, totalRectReads, resetRectReads } = createHost()
    let controller!: ReturnType<typeof usePetController>

    const wrapper = mountTracked(
      defineComponent({
        setup() {
          controller = usePetController(
            host,
            (key) => key,
            () => false
          )
          return () => h('div')
        }
      })
    )

    controller.bindPet(document.createElement('button'))
    controller.bindShadow(document.createElement('div'))
    controller.mount()

    expect(controller.paused.value).toBe(false)
    expect(raf.pendingCount()).toBe(1)

    // Advance one frame + idle tick to confirm active loop
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    raf.flush(performance.now() + 250)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)

    // Blur window -> cancels rAF and pending idleTimer immediately
    window.dispatchEvent(new Event('blur'))
    expect(controller.paused.value).toBe(true)
    expect(raf.pendingCount()).toBe(0)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)

    setTimeoutSpy.mockClear()
    resetRectReads()
    raf.request.mockClear()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(raf.request).not.toHaveBeenCalled()
    expect(raf.pendingCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(totalRectReads()).toBe(0)

    // Focus window -> resumes rAF cleanly
    window.dispatchEvent(new Event('focus'))
    expect(controller.paused.value).toBe(false)
    expect(raf.pendingCount()).toBe(1)
    expect(totalRectReads()).toBeGreaterThan(0)

    wrapper.unmount()
    expect(raf.pendingCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops to 0 Hz on data-low-battery-motion="1" and resumes when cleared', async () => {
    const raf = createRafHarness()
    const { host, totalRectReads, resetRectReads } = createHost()
    let controller!: ReturnType<typeof usePetController>

    const wrapper = mountTracked(
      defineComponent({
        setup() {
          controller = usePetController(
            host,
            (key) => key,
            () => false
          )
          return () => h('div')
        }
      })
    )

    controller.bindPet(document.createElement('button'))
    controller.bindShadow(document.createElement('div'))
    controller.mount()
    expect(raf.pendingCount()).toBe(1)

    document.documentElement.setAttribute('data-low-battery-motion', '1')
    await Promise.resolve()

    expect(controller.paused.value).toBe(true)
    expect(raf.pendingCount()).toBe(0)

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    resetRectReads()
    raf.request.mockClear()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(raf.request).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(totalRectReads()).toBe(0)

    document.documentElement.removeAttribute('data-low-battery-motion')
    await Promise.resolve()

    expect(controller.paused.value).toBe(false)
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
  })

  it('starts at 0 Hz when mounted while window is unfocused, with static placement', async () => {
    const raf = createRafHarness()
    const focusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const { host, totalRectReads, resetRectReads } = createHost()
    let controller!: ReturnType<typeof usePetController>

    const wrapper = mountTracked(
      defineComponent({
        setup() {
          controller = usePetController(
            host,
            (key) => key,
            () => false
          )
          return () => h('div')
        }
      })
    )

    const petEl = document.createElement('button')
    controller.bindPet(petEl)
    controller.bindShadow(document.createElement('div'))
    controller.mount()

    expect(controller.paused.value).toBe(true)
    expect(raf.pendingCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(petEl.style.transform).toContain('translate3d(')

    resetRectReads()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(raf.request).not.toHaveBeenCalled()
    expect(totalRectReads()).toBe(0)

    focusSpy.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    expect(controller.paused.value).toBe(false)
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
  })

  it('pauses on KeepAlive deactivation and does not resume if blurred during activation', async () => {
    const raf = createRafHarness()
    const { host, totalRectReads, resetRectReads } = createHost()
    const show = ref(true)

    const Host = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () => (show.value ? h(HomePet, { key: 'pet', host }) : null)
          })
      }
    })

    const wrapper = mountTracked(Host)
    await nextTick()
    expect(raf.pendingCount()).toBe(1)
    expect(wrapper.find('.HomePet').classes()).not.toContain('is-paused')

    show.value = false
    await nextTick()
    expect(raf.pendingCount()).toBe(0)

    // Blur while deactivated, then reactivate -> must remain paused until focus
    window.dispatchEvent(new Event('blur'))
    show.value = true
    await nextTick()
    expect(raf.pendingCount()).toBe(0)
    expect(wrapper.find('.HomePet').classes()).toContain('is-paused')

    resetRectReads()
    raf.request.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(raf.request).not.toHaveBeenCalled()
    expect(totalRectReads()).toBe(0)

    // Focus restores loop
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(raf.pendingCount()).toBe(1)
    expect(wrapper.find('.HomePet').classes()).not.toContain('is-paused')

    wrapper.unmount()
  })

  it('drops to 0 Hz on visibilitychange hidden and resumes on visible', async () => {
    const raf = createRafHarness()
    const { host, totalRectReads, resetRectReads } = createHost()
    let controller!: ReturnType<typeof usePetController>

    const wrapper = mountTracked(
      defineComponent({
        setup() {
          controller = usePetController(
            host,
            (key) => key,
            () => false
          )
          return () => h('div')
        }
      })
    )

    controller.bindPet(document.createElement('button'))
    controller.bindShadow(document.createElement('div'))
    controller.mount()
    expect(raf.pendingCount()).toBe(1)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(controller.paused.value).toBe(true)
    expect(raf.pendingCount()).toBe(0)

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    resetRectReads()
    raf.request.mockClear()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(raf.request).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(totalRectReads()).toBe(0)

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(controller.paused.value).toBe(false)
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
  })
})
