import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxGradualBlur from '../src/TxGradualBlur.vue'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  private callback: ObserverCallback

  constructor(callback: ObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  emit(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }])
  }
}

describe('txGradualBlur', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders configured blur layers, slot content, page target, and gpu styles', () => {
    const wrapper = mount(TxGradualBlur, {
      props: {
        position: 'left',
        width: '5rem',
        height: '7rem',
        divCount: 3,
        strength: 2,
        opacity: 0.75,
        target: 'page',
        zIndex: 12,
        gpuOptimized: true,
        className: 'custom-blur',
        style: {
          backgroundColor: 'red',
        },
      },
      slots: {
        default: '<span>Overlay content</span>',
      },
    })

    expect(wrapper.classes()).toContain('tx-gradual-blur--page')
    expect(wrapper.classes()).toContain('custom-blur')
    expect(wrapper.text()).toContain('Overlay content')

    const style = wrapper.attributes('style')
    expect(style).toContain('position: fixed')
    expect(style).toContain('pointer-events: none')
    expect(style).toContain('z-index: 112')
    expect(style).toContain('will-change: backdrop-filter, opacity')
    expect(style).toContain('transform: translateZ(0)')
    expect(style).toContain('width: 5rem')
    expect(style).toContain('height: 100%')
    expect(style).toContain('background-color: red')

    const layers = wrapper.findAll('.tx-gradual-blur__layer')
    expect(layers).toHaveLength(3)
    expect(layers[0].attributes('style')).toContain('linear-gradient(to left')
    expect(layers[0].attributes('style')).toContain('opacity: 0.75')
  })

  it('applies presets and clamps divCount to at least one layer', () => {
    const wrapper = mount(TxGradualBlur, {
      props: {
        preset: 'intense',
        divCount: 0,
      },
    })

    expect(wrapper.attributes('style')).toContain('height: 10rem')
    expect(wrapper.findAll('.tx-gradual-blur__layer')).toHaveLength(1)
    expect(wrapper.find('.tx-gradual-blur__layer').attributes('style')).toContain('linear-gradient(to bottom')
  })

  it('increases blur strength on hover when hoverIntensity is provided', async () => {
    const wrapper = mount(TxGradualBlur, {
      props: {
        strength: 2,
        divCount: 1,
        hoverIntensity: 3,
      },
    })

    expect(wrapper.attributes('style')).toContain('pointer-events: auto')
    const layer = wrapper.find('.tx-gradual-blur__layer').element as HTMLElement
    expect(layer.style.backdropFilter).toBe('blur(0.250rem)')

    await wrapper.trigger('mouseenter')
    expect(layer.style.backdropFilter).toBe('blur(0.750rem)')

    await wrapper.trigger('mouseleave')
    expect(layer.style.backdropFilter).toBe('blur(0.250rem)')
  })

  it('updates responsive dimensions from viewport breakpoints', async () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 460,
    })

    const wrapper = mount(TxGradualBlur, {
      props: {
        responsive: true,
        height: '8rem',
        mobileHeight: '3rem',
        tabletHeight: '4rem',
        desktopHeight: '5rem',
        width: '80%',
        mobileWidth: '60%',
        tabletWidth: '70%',
        desktopWidth: '75%',
      },
    })
    await nextTick()

    expect(wrapper.attributes('style')).toContain('height: 3rem')
    expect(wrapper.attributes('style')).toContain('width: 60%')

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 760,
    })
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(120)

    expect(wrapper.attributes('style')).toContain('height: 4rem')
    expect(wrapper.attributes('style')).toContain('width: 70%')
  })

  it('fires onAnimationComplete honoring millisecond duration units', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const onAnimationComplete = vi.fn()
    mount(TxGradualBlur, {
      props: {
        animated: 'scroll',
        duration: '300ms',
        onAnimationComplete,
      },
    })
    await nextTick()

    const observer = MockIntersectionObserver.instances[0]
    expect(observer).toBeDefined()

    observer.emit(true)
    await nextTick()

    vi.advanceTimersByTime(299)
    expect(onAnimationComplete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onAnimationComplete).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending animation-complete timer when it scrolls back out of view', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const onAnimationComplete = vi.fn()
    mount(TxGradualBlur, {
      props: {
        animated: 'scroll',
        duration: '0.3s',
        onAnimationComplete,
      },
    })
    await nextTick()

    const observer = MockIntersectionObserver.instances[0]
    observer.emit(true)
    await nextTick()

    vi.advanceTimersByTime(100)
    observer.emit(false)
    await nextTick()

    vi.advanceTimersByTime(500)
    expect(onAnimationComplete).not.toHaveBeenCalled()
  })

  it('does not fire animation-complete after the component unmounts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const onAnimationComplete = vi.fn()
    const wrapper = mount(TxGradualBlur, {
      props: {
        animated: 'scroll',
        duration: '0.3s',
        onAnimationComplete,
      },
    })
    await nextTick()

    const observer = MockIntersectionObserver.instances[0]
    observer.emit(true)
    await nextTick()

    vi.advanceTimersByTime(100)
    wrapper.unmount()

    vi.advanceTimersByTime(500)
    expect(onAnimationComplete).not.toHaveBeenCalled()
  })

  it('attaches the resize listener when responsive is enabled after mount', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const wrapper = mount(TxGradualBlur, {
      props: {
        responsive: false,
      },
    })
    await nextTick()
    expect(add.mock.calls.filter(call => call[0] === 'resize')).toHaveLength(0)

    await wrapper.setProps({ responsive: true })
    await nextTick()
    expect(add.mock.calls.filter(call => call[0] === 'resize')).toHaveLength(1)
  })

  it('removes the resize listener on unmount even after responsive was toggled off', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(TxGradualBlur, {
      props: {
        responsive: true,
      },
    })
    await nextTick()

    // Toggle off, then unmount: the old cleanup keyed off the current responsive value and
    // would skip removal here, leaking the debounced handler.
    await wrapper.setProps({ responsive: false })
    await nextTick()
    wrapper.unmount()

    expect(remove.mock.calls.filter(call => call[0] === 'resize').length).toBeGreaterThanOrEqual(1)
  })

  it('sets up the IntersectionObserver when animated switches to scroll after mount', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    const wrapper = mount(TxGradualBlur, {
      props: {
        animated: false,
      },
    })
    await nextTick()
    expect(MockIntersectionObserver.instances).toHaveLength(0)

    await wrapper.setProps({ animated: 'scroll' })
    await nextTick()
    expect(MockIntersectionObserver.instances).toHaveLength(1)
  })
})
