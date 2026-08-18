import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxBadge from '../src/TxBadge.vue'

interface ResizeObserverControl {
  ResizeObserverMock: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  emitWidth: (width: number) => void
  observe: ReturnType<typeof vi.fn>
}

function installResizeObserver(): ResizeObserverControl {
  let callback: ResizeObserverCallback | undefined
  const observe = vi.fn()
  const disconnect = vi.fn()
  const ResizeObserverMock = vi.fn((nextCallback: ResizeObserverCallback) => {
    callback = nextCallback
    return { disconnect, observe }
  })

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)

  return {
    ResizeObserverMock,
    disconnect,
    observe,
    emitWidth(width: number): void {
      callback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
    },
  }
}

describe('txBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('renders value and variant class', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 'New',
        variant: 'primary',
      },
    })

    expect(wrapper.text()).toBe('New')
    expect(wrapper.classes()).toContain('tx-badge--primary')
  })

  it('renders default slot as custom pill content', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 8,
      },
      slots: {
        default: '<strong>Beta</strong>',
      },
    })

    expect(wrapper.text()).toBe('Beta')
    expect(wrapper.find('strong').exists()).toBe(true)
  })

  it('renders dot mode without value text', () => {
    const wrapper = mount(TxBadge, {
      props: {
        dot: true,
        value: 8,
        variant: 'error',
      },
    })

    expect(wrapper.classes()).toContain('tx-badge--dot')
    expect(wrapper.find('.tx-badge__dot').exists()).toBe(true)
    expect(wrapper.text()).toBe('')
  })

  it('applies custom color variables', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 3,
        color: '#111827',
      },
    })

    expect(wrapper.attributes('style')).toContain('--tx-badge-bg: #111827')
    expect(wrapper.attributes('style')).toContain('--tx-badge-text: #ffffff')
  })

  it('keeps a custom-color dot visible via a dedicated dot color variable', () => {
    const wrapper = mount(TxBadge, {
      props: {
        dot: true,
        color: '#22c55e',
      },
    })

    // Before the fix the dot inherited the forced white text color and vanished
    // against the white-filled badge. Its color must derive from the custom color.
    expect(wrapper.attributes('style')).toContain('--tx-badge-dot: #22c55e')
    expect(wrapper.attributes('style')).toContain('--tx-badge-bg: #22c55e')
    expect(wrapper.find('.tx-badge__dot').exists()).toBe(true)
  })

  it('renders numeric values through NumberFlow and strings as plain text', async () => {
    const NumberFlow = (await import('@number-flow/vue')).default
    const numeric = mount(TxBadge, { props: { value: 8 } })
    expect(numeric.findComponent(NumberFlow).exists()).toBe(true)

    const text = mount(TxBadge, { props: { value: 'New' } })
    expect(text.findComponent(NumberFlow).exists()).toBe(false)
    expect(text.text()).toBe('New')
  })

  it('marks numeric badges and binds their measured width after ResizeObserver reports it', async () => {
    const observer = installResizeObserver()
    const wrapper = mount(TxBadge, { props: { value: 8 } })
    await nextTick()

    expect(wrapper.classes()).toContain('tx-badge--numeric')
    expect(observer.ResizeObserverMock).toHaveBeenCalledTimes(1)
    expect(observer.observe).toHaveBeenCalledWith(wrapper.find('.tx-badge__number').element)
    expect(wrapper.element.style.width).toBe('')

    observer.emitWidth(42)
    await nextTick()

    expect(wrapper.element.style.width).toBe('42px')

    wrapper.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('keeps text, slotted, and dot badges intrinsically sized', async () => {
    const observer = installResizeObserver()
    const text = mount(TxBadge, { props: { value: 'New' } })
    const slotted = mount(TxBadge, {
      props: { value: 8 },
      slots: { default: '<strong>Custom</strong>' },
    })
    const dot = mount(TxBadge, { props: { dot: true, value: 8 } })
    await nextTick()

    for (const wrapper of [text, slotted, dot]) {
      expect(wrapper.classes()).not.toContain('tx-badge--numeric')
      expect(wrapper.element.style.width).toBe('')
    }
    expect(observer.ResizeObserverMock).not.toHaveBeenCalled()
  })

  it('pops closed via open=false and only animates the entrance after a real toggle', async () => {
    const wrapper = mount(TxBadge, { props: { value: 3, open: true } })
    // First mount never plays the entrance.
    expect(wrapper.classes()).not.toContain('is-open')
    expect(wrapper.classes()).not.toContain('is-closed')

    await wrapper.setProps({ open: false })
    expect(wrapper.classes()).toContain('is-closed')

    await wrapper.setProps({ open: true })
    expect(wrapper.classes()).toContain('is-open')
    expect(wrapper.classes()).not.toContain('is-closed')
  })
})
