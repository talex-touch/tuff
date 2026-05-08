import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxEdgeFadeMask from '../src/TxEdgeFadeMask.vue'

function defineReadonlyNumber(target: HTMLElement, key: string, value: number) {
  Object.defineProperty(target, key, {
    configurable: true,
    value,
  })
}

function setVerticalMetrics(element: HTMLElement, metrics: { scrollHeight: number, clientHeight: number, scrollTop: number }) {
  defineReadonlyNumber(element, 'scrollHeight', metrics.scrollHeight)
  defineReadonlyNumber(element, 'clientHeight', metrics.clientHeight)
  element.scrollTop = metrics.scrollTop
}

function setHorizontalMetrics(element: HTMLElement, metrics: { scrollWidth: number, clientWidth: number, scrollLeft: number }) {
  defineReadonlyNumber(element, 'scrollWidth', metrics.scrollWidth)
  defineReadonlyNumber(element, 'clientWidth', metrics.clientWidth)
  element.scrollLeft = metrics.scrollLeft
}

describe('txEdgeFadeMask', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the configured root tag, axis class, viewport, and slot content', () => {
    const wrapper = mount(TxEdgeFadeMask, {
      props: {
        as: 'section',
      },
      slots: {
        default: '<p>Scrollable content</p>',
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toContain('tx-edge-fade-mask--vertical')
    expect(wrapper.find('.tx-edge-fade-mask__viewport').exists()).toBe(true)
    expect(wrapper.text()).toContain('Scrollable content')
  })

  it('renders no mask when content is not scrollable', async () => {
    const wrapper = mount(TxEdgeFadeMask)
    const viewport = wrapper.find<HTMLElement>('.tx-edge-fade-mask__viewport')

    setVerticalMetrics(viewport.element, {
      scrollHeight: 100,
      clientHeight: 100,
      scrollTop: 0,
    })
    await viewport.trigger('scroll')

    expect(viewport.attributes('style')).toBeUndefined()
  })

  it('updates vertical mask stops at top, middle, and bottom boundaries', async () => {
    const wrapper = mount(TxEdgeFadeMask, {
      props: {
        size: 32,
        threshold: 2,
      },
    })
    const viewport = wrapper.find<HTMLElement>('.tx-edge-fade-mask__viewport')

    setVerticalMetrics(viewport.element, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 0,
    })
    await viewport.trigger('scroll')
    expect(viewport.attributes('style')).toContain('linear-gradient(to bottom, black 0, black 32px, black calc(100% - 32px), transparent 100%)')

    viewport.element.scrollTop = 50
    await viewport.trigger('scroll')
    expect(viewport.attributes('style')).toContain('linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)')

    viewport.element.scrollTop = 199
    await viewport.trigger('scroll')
    expect(viewport.attributes('style')).toContain('linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), black 100%)')
  })

  it('updates horizontal mask stops and supports string fade size', async () => {
    const wrapper = mount(TxEdgeFadeMask, {
      props: {
        axis: 'horizontal',
        size: '3rem',
      },
    })
    const viewport = wrapper.find<HTMLElement>('.tx-edge-fade-mask__viewport')

    expect(wrapper.classes()).toContain('tx-edge-fade-mask--horizontal')

    setHorizontalMetrics(viewport.element, {
      scrollWidth: 360,
      clientWidth: 120,
      scrollLeft: 80,
    })
    await viewport.trigger('scroll')

    expect(viewport.attributes('style')).toContain('linear-gradient(to right, transparent 0, black 3rem, black calc(100% - 3rem), transparent 100%)')
  })

  it('removes mask when disabled and restores it when re-enabled', async () => {
    const wrapper = mount(TxEdgeFadeMask, {
      props: {
        disabled: true,
      },
    })
    const viewport = wrapper.find<HTMLElement>('.tx-edge-fade-mask__viewport')

    setVerticalMetrics(viewport.element, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 50,
    })
    await viewport.trigger('scroll')
    expect(viewport.attributes('style')).toBeUndefined()

    await wrapper.setProps({ disabled: false })
    await nextTick()
    expect(viewport.attributes('style')).toContain('linear-gradient(to bottom')
  })

  it('observes viewport and first child resize and disconnects on prop change and unmount', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const ResizeObserverMock = vi.fn(() => ({ observe, disconnect }))

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const wrapper = mount(TxEdgeFadeMask, {
      slots: {
        default: '<div class="inner">content</div>',
      },
    })
    await nextTick()

    expect(ResizeObserverMock).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith(wrapper.find('.tx-edge-fade-mask__viewport').element)
    expect(observe).toHaveBeenCalledWith(wrapper.find('.inner').element)

    await wrapper.setProps({ observeResize: false })
    expect(disconnect).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ observeResize: true })
    expect(ResizeObserverMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
