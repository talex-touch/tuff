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

  it('registers elements and applies eased pointer transforms', async () => {
    const wrapper = mount({
      components: { TxFloating, TxFloatingElement },
      template: `
        <TxFloating :sensitivity="2" :easing-factor="0.5">
          <TxFloatingElement class-name="layer" :depth="2">Layer</TxFloatingElement>
        </TxFloating>
      `,
    })

    const container = wrapper.find('.tx-floating').element as HTMLElement
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

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 70 }))
    runFrame()
    await nextTick()

    expect(wrapper.find('.tx-floating-element').attributes('style')).toContain('translate3d(10px, 5px, 0)')
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
