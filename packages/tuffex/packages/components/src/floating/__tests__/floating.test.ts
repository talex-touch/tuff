import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Floating, {
  FloatingElement,
  Floating as InstalledFloating,
  FloatingElement as InstalledFloatingElement,
  TxFloating,
  TxFloatingElement,
} from '../index'
import { TX_FLOATING_CONTEXT_KEY } from '../src/context'

describe('txFloating', () => {
  let rafCallbacks: FrameRequestCallback[] = []
  let rafId = 0

  beforeEach(() => {
    rafCallbacks = []
    rafId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      rafId += 1
      return rafId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function runFrame() {
    const callback = rafCallbacks.shift()
    if (callback)
      callback(16)
  }

  function mockRect(container: HTMLElement) {
    container.getBoundingClientRect = vi.fn(() => ({
      left: 10,
      top: 20,
      width: 200,
      height: 100,
      right: 210,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect))
  }

  it('registers elements and applies eased pointer transforms', async () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :sensitivity="2" :easing-factor="0.5">
          <TxFloatingElement class-name="layer" :depth="2">Layer</TxFloatingElement>
        </TxFloating>
      `,
    })

    mockRect(wrapper.find('.tx-floating').element as HTMLElement)

    // Bottom-right corner of the container: 100px right and 50px below its centre.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 120 }))
    runFrame()
    await nextTick()

    expect(wrapper.find('.tx-floating-element').attributes('style')).toContain('translate3d(10px, 5px, 0)')
  })

  it('keeps elements at rest while the pointer sits on the container centre', async () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :sensitivity="2" :easing-factor="0.5">
          <TxFloatingElement class-name="layer" :depth="2">Layer</TxFloatingElement>
        </TxFloating>
      `,
    })

    mockRect(wrapper.find('.tx-floating').element as HTMLElement)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 70 }))
    runFrame()
    await nextTick()

    expect(wrapper.find('.tx-floating-element').attributes('style')).toContain('translate3d(0px, 0px, 0)')
  })

  it('mirrors the offset on opposite sides of the container centre', async () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :sensitivity="2" :easing-factor="1">
          <TxFloatingElement class-name="layer" :depth="2">Layer</TxFloatingElement>
        </TxFloating>
      `,
    })

    mockRect(wrapper.find('.tx-floating').element as HTMLElement)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }))
    runFrame()
    await nextTick()

    expect(wrapper.find('.tx-floating-element').attributes('style')).toContain('translate3d(-20px, -10px, 0)')
  })

  it('stops listeners and resets transforms while disabled', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :disabled="disabled">
          <TxFloatingElement class-name="layer">Layer</TxFloatingElement>
        </TxFloating>
      `,
      data() {
        return { disabled: false }
      },
    })

    const element = wrapper.find('.tx-floating-element').element as HTMLElement
    element.style.transform = 'translate3d(12px, 8px, 0)'

    await wrapper.setData({ disabled: true })

    expect(remove).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('touchmove', expect.any(Function))
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
    expect(element.style.transform).toBe('translate3d(0px, 0px, 0)')

    await wrapper.setData({ disabled: false })

    expect(add).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true })
    expect(add).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: true })
  })

  it('does not start listeners when initially disabled', () => {
    const add = vi.spyOn(window, 'addEventListener')

    mount({
      components: { TxFloating, TxFloatingElement },
      template: '<TxFloating disabled><TxFloatingElement>Layer</TxFloatingElement></TxFloating>',
    })

    expect(add).not.toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true })
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('parks the animation loop once elements settle and wakes it on pointer input', async () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :sensitivity="2" :easing-factor="1">
          <TxFloatingElement class-name="layer" :depth="2">Layer</TxFloatingElement>
        </TxFloating>
      `,
    })

    mockRect(wrapper.find('.tx-floating').element as HTMLElement)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 120 }))

    // An easing factor of 1 lands on the target in a single frame.
    runFrame()
    await nextTick()
    expect(wrapper.find('.tx-floating-element').attributes('style')).toContain('translate3d(20px, 10px, 0)')

    // Nothing left to travel, so the loop must not queue another frame.
    runFrame()
    expect(rafCallbacks).toHaveLength(0)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 70 }))
    expect(rafCallbacks).toHaveLength(1)
  })

  it('stays still when the user prefers reduced motion', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    try {
      const add = vi.spyOn(window, 'addEventListener')

      mount({
        components: { TxFloating, TxFloatingElement },
        template: '<TxFloating><TxFloatingElement>Layer</TxFloatingElement></TxFloating>',
      })

      expect(add).not.toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true })
      expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    }
    finally {
      window.matchMedia = original
    }
  })

  it('suspends off-screen work and wakes when the container returns', () => {
    const originalObserver = globalThis.IntersectionObserver
    let observerCallback!: IntersectionObserverCallback
    const observe = vi.fn()
    const disconnect = vi.fn()
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }

      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ''
      thresholds = []
    } as unknown as typeof IntersectionObserver

    try {
      const wrapper = mount({
        components: { TxFloating, TxFloatingElement },
        template: '<TxFloating><TxFloatingElement>Layer</TxFloatingElement></TxFloating>',
      })
      expect(observe).toHaveBeenCalledWith(wrapper.find('.tx-floating').element)

      observerCallback([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver)
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
      rafCallbacks = []

      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
      expect(rafCallbacks).toHaveLength(0)

      observerCallback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver)
      expect(rafCallbacks).toHaveLength(1)

      wrapper.unmount()
      expect(disconnect).toHaveBeenCalledOnce()
    }
    finally {
      globalThis.IntersectionObserver = originalObserver
    }
  })

  it('reacts to reduced-motion changes at runtime', async () => {
    const original = window.matchMedia
    let motionListener!: (event: MediaQueryListEvent) => void
    const removeMotionListener = vi.fn()
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: EventListener) => {
        motionListener = listener as (event: MediaQueryListEvent) => void
      },
      removeEventListener: removeMotionListener,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    try {
      const wrapper = mount({
        components: { TxFloating, TxFloatingElement },
        template: '<TxFloating :easing-factor="1"><TxFloatingElement>Layer</TxFloatingElement></TxFloating>',
      })
      const element = wrapper.find('.tx-floating-element').element as HTMLElement
      mockRect(wrapper.find('.tx-floating').element as HTMLElement)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 120 }))
      runFrame()
      await nextTick()
      expect(element.style.transform).not.toBe('translate3d(0px, 0px, 0)')

      motionListener({ matches: true } as MediaQueryListEvent)
      expect(element.style.transform).toBe('translate3d(0px, 0px, 0)')
      rafCallbacks = []
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 70 }))
      expect(rafCallbacks).toHaveLength(0)

      motionListener({ matches: false } as MediaQueryListEvent)
      expect(rafCallbacks).toHaveLength(1)

      wrapper.unmount()
      expect(removeMotionListener).toHaveBeenCalledWith('change', expect.any(Function))
    }
    finally {
      window.matchMedia = original
    }
  })

  it('updates registered depth and unregisters on unmount', async () => {
    const registerElement = vi.fn()
    const unregisterElement = vi.fn()
    const wrapper = mount(TxFloatingElement, {
      props: {
        depth: 1,
      },
      global: {
        provide: {
          [TX_FLOATING_CONTEXT_KEY as symbol]: {
            registerElement,
            unregisterElement,
          },
        },
      },
    })

    expect(registerElement).toHaveBeenCalledWith(expect.any(String), expect.any(HTMLDivElement), 1)

    await wrapper.setProps({ depth: -0.5 })

    expect(registerElement).toHaveBeenLastCalledWith(expect.any(String), expect.any(HTMLDivElement), -0.5)

    wrapper.unmount()

    expect(unregisterElement).toHaveBeenCalledWith(expect.any(String))
  })

  it('renders className and slot content', () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating class-name="stage">
          <TxFloatingElement class-name="layer">Content</TxFloatingElement>
        </TxFloating>
      `,
    })

    expect(wrapper.find('.tx-floating').classes()).toContain('stage')
    expect(wrapper.find('.tx-floating-element').classes()).toContain('layer')
    expect(wrapper.find('.tx-floating-element').text()).toBe('Content')
  })

  it('registers floating components through install', () => {
    const app = { component: vi.fn() }

    InstalledFloating.install?.(app as any)
    InstalledFloatingElement.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxFloating', Floating)
    expect(app.component).toHaveBeenCalledWith('TxFloatingElement', FloatingElement)
  })
})
