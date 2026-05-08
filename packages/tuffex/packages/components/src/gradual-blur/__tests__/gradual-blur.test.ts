import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxGradualBlur from '../src/TxGradualBlur.vue'

describe('txGradualBlur', () => {
  afterEach(() => {
    vi.useRealTimers()
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
})
