import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, reactive, ref } from 'vue'
import { useBaseSurfaceMotion } from '../src/base-surface-motion'
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

/**
 * The auto-detect MutationObserver watches the root element *and every ancestor*
 * up to <html>, so an unrelated inline-style write on an ancestor used to end the
 * motion state while the surface was still transforming. flip-overlay's body
 * scroll lock (`body.style.overflow = 'hidden'`) triggers exactly that.
 *
 * These drive the observer callback directly — the suite above stubs
 * MutationObserver without ever invoking it, so this branch had no coverage.
 */
describe('txBaseSurface auto-detect motion end', () => {
  let fireMutations: ((records: Array<Partial<MutationRecord>>) => void) | null = null

  function mountMotionHarness() {
    fireMutations = null
    vi.stubGlobal('MutationObserver', vi.fn((cb: MutationCallback) => {
      fireMutations = records => cb(records as MutationRecord[], {} as MutationObserver)
      return { observe: vi.fn(), disconnect: vi.fn() }
    }))

    const Harness = defineComponent({
      setup() {
        const rootRef = ref<HTMLElement | null>(null)
        const props = reactive({ moving: false, autoDetect: true, mode: 'pure' })
        const { isMoving } = useBaseSurfaceMotion({
          props: props as any,
          rootRef,
          needsFallback: computed(() => true),
          settleDelayMs: computed(() => 0),
          refractionRecoveryBlendDurationMs: computed(() => 0),
          refractionRecoveryTotalDurationMs: computed(() => 0),
        })
        return { rootRef, isMoving }
      },
      template: '<div ref="rootRef" />',
    })

    return mount(Harness, { attachTo: document.body })
  }

  afterEach(() => {
    document.body.style.overflow = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the motion state while an ancestor writes an unrelated inline style', async () => {
    const wrapper = mountMotionHarness()
    await nextTick()

    const el = wrapper.element as HTMLElement
    el.style.transform = 'translateX(8px)'
    fireMutations!([{ type: 'attributes', attributeName: 'style', target: el }])
    await nextTick()
    expect(wrapper.vm.isMoving).toBe(true)

    // What flip-overlay's body scroll lock does. body is an observed ancestor.
    document.body.style.overflow = 'hidden'
    fireMutations!([{ type: 'attributes', attributeName: 'style', target: document.body }])
    await nextTick()

    expect(wrapper.vm.isMoving).toBe(true)

    wrapper.unmount()
  })

  it('ends the motion state once nothing under observation is transforming', async () => {
    const wrapper = mountMotionHarness()
    await nextTick()

    const el = wrapper.element as HTMLElement
    el.style.transform = 'translateX(8px)'
    fireMutations!([{ type: 'attributes', attributeName: 'style', target: el }])
    await nextTick()
    expect(wrapper.vm.isMoving).toBe(true)

    // Guards against the fix over-blocking and wedging the surface as "moving".
    el.style.transform = ''
    fireMutations!([{ type: 'attributes', attributeName: 'style', target: el }])
    await nextTick()

    expect(wrapper.vm.isMoving).toBe(false)

    wrapper.unmount()
  })
})

describe('txBaseSurface fake background', () => {
  it('emits a fake background variable for blur/glass/refraction fake modes', () => {
    // pure/mask already emitted it; blur/glass/refraction left the `::before`
    // painting an empty `background: var(--tx-surface-fake-bg)`.
    const glass = mountSurface({ props: { fake: true, mode: 'glass' } })
    expect(glass.attributes('style')).toContain('--tx-surface-fake-bg')

    const refraction = mountSurface({ props: { fake: true, mode: 'refraction' } })
    expect(refraction.attributes('style')).toContain('--tx-surface-fake-bg')
  })
})
