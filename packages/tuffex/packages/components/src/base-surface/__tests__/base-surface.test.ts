import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxBaseSurface from '../src/TxBaseSurface.vue'

const GlassSurfaceStub = defineComponent({
  name: 'TxGlassSurface',
  props: {
    width: { type: [String, Number], default: undefined },
    height: { type: [String, Number], default: undefined },
    borderRadius: { type: Number, default: undefined },
    blur: { type: Number, default: undefined },
    saturation: { type: Number, default: undefined },
    brightness: { type: Number, default: undefined },
    opacity: { type: Number, default: undefined },
    backgroundOpacity: { type: Number, default: undefined },
    borderWidth: { type: Number, default: undefined },
    displace: { type: Number, default: undefined },
    distortionScale: { type: Number, default: undefined },
    redOffset: { type: Number, default: undefined },
    greenOffset: { type: Number, default: undefined },
    blueOffset: { type: Number, default: undefined },
    xChannel: { type: String, default: undefined },
    yChannel: { type: String, default: undefined },
    mixBlendMode: { type: String, default: undefined },
  },
  template: '<div class="tx-glass-surface-stub" />',
})

function mountSurface(options: Parameters<typeof mount<typeof TxBaseSurface>>[1] = {}) {
  return mount(TxBaseSurface, {
    slots: {
      default: '<span class="surface-content">Content</span>',
      ...(options.slots ?? {}),
    },
    ...options,
    global: {
      ...(options.global ?? {}),
      stubs: {
        TxGlassSurface: GlassSurfaceStub,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
}

describe('txBaseSurface', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the requested root tag, slot content, radius, color, and transition variables', () => {
    const wrapper = mountSurface({
      props: {
        tag: 'section',
        mode: 'pure',
        radius: 16,
        color: 'rgb(1, 2, 3)',
        transitionDuration: 120,
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'tx-base-surface',
      'tx-base-surface--preset-default',
      'tx-base-surface--pure',
    ]))
    expect(wrapper.find('.surface-content').text()).toBe('Content')
    expect(wrapper.attributes('style')).toContain('--tx-surface-radius: 16px')
    expect(wrapper.attributes('style')).toContain('--tx-surface-color: rgb(1, 2, 3)')
    expect(wrapper.attributes('style')).toContain('--tx-surface-transition: 120ms')
  })

  it('renders mask mode with clamped opacity variables', () => {
    const wrapper = mountSurface({
      props: {
        mode: 'mask',
        opacity: 1.5,
      },
    })

    expect(wrapper.classes()).toContain('tx-base-surface--mask')
    expect(wrapper.classes()).toContain('tx-base-surface--with-mask')
    expect(wrapper.find('.tx-base-surface__layer--mask').exists()).toBe(true)
    expect(wrapper.attributes('style')).toContain('--tx-surface-mask-opacity: 1')
    expect(wrapper.attributes('style')).toContain('--tx-surface-mask-opacity-percent: 100%')
  })

  it('renders blur mode filter variables and degrades moving blur to fallback mask opacity', async () => {
    const wrapper = mountSurface({
      props: {
        mode: 'blur',
        blur: 14,
        filterSaturation: 2,
        filterContrast: 1.2,
        filterBrightness: 0.8,
      },
    })

    expect(wrapper.classes()).toContain('tx-base-surface--blur')
    expect(wrapper.find('.tx-base-surface__layer--filter').exists()).toBe(true)
    expect(wrapper.attributes('style')).toContain('--tx-surface-filter-blur: 14px')
    expect(wrapper.attributes('style')).toContain('--tx-surface-filter-saturation: 2')
    expect(wrapper.attributes('style')).toContain('--tx-surface-filter-contrast: 1.2')
    expect(wrapper.attributes('style')).toContain('--tx-surface-filter-brightness: 0.8')

    await wrapper.setProps({
      moving: true,
      fallbackMaskOpacity: 0.42,
    })

    expect(wrapper.classes()).toContain('tx-base-surface--mask')
    expect(wrapper.attributes('style')).toContain('--tx-surface-mask-opacity: 0.42')
  })

  it('supports pure fallback while moving without a mask layer', async () => {
    const wrapper = mountSurface({
      props: {
        mode: 'glass',
        moving: true,
        fallbackMode: 'pure',
      },
    })

    expect(wrapper.classes()).toContain('tx-base-surface--pure')
    expect(wrapper.find('.tx-base-surface__layer--mask').exists()).toBe(false)
    expect(wrapper.findComponent(GlassSurfaceStub).exists()).toBe(false)
  })

  it('renders glass mode and forwards normalized GlassSurface props', () => {
    const wrapper = mountSurface({
      props: {
        mode: 'glass',
        radius: '18px',
        blur: 12,
        saturation: 2.2,
        brightness: 1.4,
        backgroundOpacity: 0.2,
        borderWidth: 0.1,
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'tx-base-surface--glass',
      'tx-base-surface--with-glass',
    ]))
    expect(wrapper.find('.tx-base-surface__layer--mask').exists()).toBe(false)
    expect(wrapper.findComponent(GlassSurfaceStub).props()).toMatchObject({
      width: '100%',
      height: '100%',
      borderRadius: 18,
      blur: 12,
      saturation: 2.2,
      brightness: 140,
      backgroundOpacity: 0.2,
      borderWidth: 0.1,
    })
  })

  it('renders refraction classes, light variables, and computed GlassSurface model', () => {
    const wrapper = mountSurface({
      props: {
        mode: 'refraction',
        preset: 'card',
        refractionRenderer: 'css',
        refractionProfile: 'cinematic',
        refractionTone: 'vivid',
        refractionStrength: 100,
        refractionAngle: 540,
        refractionLightX: 0.25,
        refractionLightY: 0.75,
        overlayOpacity: 0.2,
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'tx-base-surface--refraction',
      'tx-base-surface--with-glass',
      'tx-base-surface--with-filter',
      'tx-base-surface--with-mask',
      'tx-base-surface--with-refraction-edge',
      'tx-base-surface--refraction-renderer-css',
      'tx-base-surface--refraction-profile-cinematic',
      'tx-base-surface--refraction-tone-vivid',
    ]))
    expect(wrapper.attributes('style')).toContain('--tx-surface-refraction-light-x: 25%')
    expect(wrapper.attributes('style')).toContain('--tx-surface-refraction-light-y: 75%')
    expect(wrapper.attributes('style')).toContain('--tx-surface-refraction-streak-angle: -88deg')
    expect(wrapper.findComponent(GlassSurfaceStub).props()).toMatchObject({
      mixBlendMode: 'difference',
      xChannel: 'R',
      yChannel: 'G',
    })
  })

  it('auto-detects parent transform motion and tears observers down on unmount', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const removeEventListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener')

    vi.stubGlobal('MutationObserver', vi.fn(() => ({ observe, disconnect })))

    const wrapper = mountSurface({
      attachTo: document.body,
      props: {
        autoDetect: true,
      },
    })
    await nextTick()

    expect(observe).toHaveBeenCalled()
    expect(addEventListener).toHaveBeenCalledWith('transitionstart', expect.any(Function))

    wrapper.unmount()

    expect(removeEventListener).toHaveBeenCalledWith('transitionstart', expect.any(Function))
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
