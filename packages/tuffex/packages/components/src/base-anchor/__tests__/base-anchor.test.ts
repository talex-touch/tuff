import type { BaseAnchorAnimationOptions } from '../src/types'
import { flushPromises, mount } from '@vue/test-utils'
import gsap from 'gsap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { useBaseAnchorMotion } from '../src/base-anchor-motion'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

vi.mock('gsap', () => {
  const timeline = () => ({
    to: vi.fn().mockReturnThis(),
    kill: vi.fn(),
  })

  return {
    default: {
      set: vi.fn(),
      timeline,
    },
  }
})

const CardStub = defineComponent({
  name: 'TxCard',
  props: {
    variant: { type: String, default: undefined },
    background: { type: String, default: undefined },
    shadow: { type: String, default: undefined },
    radius: { type: Number, default: undefined },
    padding: { type: Number, default: undefined },
    surfaceMoving: { type: Boolean, default: undefined },
    maskOpacity: { type: Number, default: undefined },
  },
  template: '<div class="tx-card-stub"><slot /></div>',
})

// Teleported panels outlive `document.body.innerHTML = ''`; without unmounting,
// a stale instance can re-insert its content and shadow the current test's DOM.
const mountedAnchors: Array<{ unmount: () => void }> = []

function cleanupAnchors() {
  while (mountedAnchors.length) mountedAnchors.pop()?.unmount()
  document.body.innerHTML = ''
}

function mountAnchor(options: Parameters<typeof mount<typeof TxBaseAnchor>>[1] = {}) {
  const wrapper = mount(TxBaseAnchor, {
    attachTo: document.body,
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: '<div class="floating-content">Floating</div>',
      ...(options.slots ?? {}),
    },
    ...options,
    global: {
      ...(options.global ?? {}),
      stubs: {
        TxCard: CardStub,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
  mountedAnchors.push(wrapper)
  return wrapper
}

type MotionSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Drive the motion composable directly. It only needs `computed`, so no component
 * instance is required — and jsdom has no layout, which would make DOM-level
 * timing assertions meaningless anyway.
 */
function createMotion(animation: BaseAnchorAnimationOptions, side: MotionSide = 'bottom') {
  return useBaseAnchorMotion({
    clipRef: ref(null),
    contentRef: ref(null),
    arrowRef: ref(null),
    side: computed(() => side),
    arrowSize: computed(() => 10),
    showArrow: computed(() => false),
    animation: computed(() => animation),
    // The legacy props are always populated by withDefaults — that is exactly what
    // liquid must not inherit.
    duration: computed(() => 432),
    ease: computed(() => 'back.out(2)'),
    panelBackground: computed(() => 'refraction'),
    useCard: computed(() => true),
    keepAliveContent: computed(() => false),
    isUnlimitedHeight: computed(() => false),
    isOpen: computed(() => false),
    isCurrentRun: () => true,
    setMounted: () => {},
    setPanelSurfaceMoving: () => {},
    pulsePanelSurfaceMoving: () => {},
    prepareLiquid: () => false,
    applyLiquidFrame: () => {},
    settleLiquid: () => {},
  })
}

describe('txBaseAnchor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanupAnchors()
  })

  it('toggles uncontrolled state from the reference click and emits open/close updates', async () => {
    const wrapper = mountAnchor()

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(document.body.querySelector('.tx-base-anchor')?.classList.contains('is-open')).toBe(true)

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('blocks opening while disabled and closes if disabled after opening', async () => {
    const wrapper = mountAnchor({
      props: {
        disabled: true,
      },
    })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ disabled: false })
    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    expect(wrapper.emitted('open')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes controlled anchors on outside pointerdown and Escape when enabled', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountAnchor({
      props: {
        modelValue: true,
      },
    })

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('respects close switches and reference click toggle switch', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountAnchor({
      props: {
        modelValue: true,
        closeOnClickOutside: false,
        closeOnEsc: false,
        toggleOnReferenceClick: false,
      },
    })

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.find('.tx-base-anchor__reference').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('forwards floating attrs and reference classes separately', () => {
    mountAnchor({
      props: {
        eager: true,
        referenceClass: ['custom-reference', { active: true }],
      },
      attrs: {
        'id': 'floating-panel',
        'class': 'custom-floating',
        'data-testid': 'panel',
        'style': 'color: red;',
      },
    })

    const reference = document.body.querySelector('.tx-base-anchor__reference')
    const floating = document.body.querySelector<HTMLElement>('#floating-panel')

    expect(reference?.classList.contains('custom-reference')).toBe(true)
    expect(reference?.classList.contains('active')).toBe(true)
    expect(floating?.classList.contains('custom-floating')).toBe(true)
    expect(floating?.dataset.testid).toBe('panel')
    expect(floating?.getAttribute('style')).toContain('color: red')
  })

  it('supports animation object variants and legacy duration/ease fallbacks', async () => {
    const boom = mountAnchor({
      props: {
        animation: { type: 'boom', duration: 360, scale: 1.12, blur: 18, opacity: 0.12 },
      },
    })

    await boom.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    expect(gsap.set).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      scale: 1.12,
      opacity: 0.12,
      filter: 'blur(18px)',
    }))

    vi.mocked(gsap.set).mockClear()

    const opacity = mountAnchor({
      props: {
        animation: { type: 'opacity' },
        duration: 280,
        ease: 'power2.out',
      },
    })

    await opacity.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    expect(gsap.set).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ opacity: 0 }))
  })

  it('hard-cuts surface motion adaptation to auto, manual, and off strategies', () => {
    const auto = mountAnchor({
      props: {
        eager: true,
        panelCard: { surfaceMoving: true, maskOpacity: 0.5 },
      },
    })
    expect(auto.findComponent(CardStub).props()).toMatchObject({
      surfaceMoving: false,
      maskOpacity: 0.5,
    })

    const manual = mountAnchor({
      props: {
        eager: true,
        surfaceMotionAdaptation: 'manual',
        panelCard: { surfaceMoving: true },
      },
    })
    expect(manual.findComponent(CardStub).props('surfaceMoving')).toBe(true)

    const off = mountAnchor({
      props: {
        eager: true,
        surfaceMotionAdaptation: 'off',
        panelCard: { surfaceMoving: true },
      },
    })
    expect(off.findComponent(CardStub).props('surfaceMoving')).toBe(false)
  })

  // `useFloating().update()` returns void, so the panel is not yet positioned when the
  // open path measures it — the `size` middleware writes the floating width afterwards.
  // The outline must therefore be re-measured on the next frame.
  it('re-measures the outline after floating-ui has applied the panel width', async () => {
    const wrapper = mountAnchor({ props: { eager: true } })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()

    const content = document.body.querySelector('.tx-base-anchor__content') as HTMLElement
    expect(content).toBeTruthy()

    // Stale width at open time, then floating-ui's `size` middleware widens the panel.
    let width = 149
    Object.defineProperty(content, 'offsetWidth', { configurable: true, get: () => width })
    Object.defineProperty(content, 'offsetHeight', { configurable: true, get: () => 40 })

    const outline = () => document.body.querySelector('.tx-base-anchor__outline')

    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()
    expect(outline()?.getAttribute('viewBox')).toBe('0 0 149 40')

    width = 200
    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()

    expect(outline()?.getAttribute('viewBox')).toBe('0 0 200 40')
  })

  it('honours an explicit width above the default maxWidth instead of clamping it', async () => {
    const wrapper = mountAnchor({ props: { modelValue: true, width: 480 } })
    await nextTick()
    await flushPromises()
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()

    const floating = document.body.querySelector('.tx-base-anchor') as HTMLElement
    expect(floating).toBeTruthy()
    expect(floating.style.width).toBe('480px')
    // The default maxWidth (360) must not silently clamp the explicit 480 back down.
    expect(floating.style.maxWidth).toBe('')
  })
})

describe('txBaseAnchor drip / bead motion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanupAnchors()
  })

  function mountLiquid(animation: BaseAnchorAnimationOptions = {}) {
    return mountAnchor({
      props: {
        eager: true,
        animation: { type: 'drip', ...animation },
      },
      slots: {
        reference: '<button class="reference-button">Reference</button>',
        default: '<div class="floating-content"><span data-liquid-item>One</span></div>',
      },
    })
  }

  it('resolves its own timing instead of inheriting the transfer-era prop defaults', () => {
    expect(createMotion({ type: 'drip' }).resolvedAnimation.value).toMatchObject({
      duration: 260,
      closeDuration: 150,
      ease: 'linear',
      closeEase: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    })

    // ...and the existing types keep theirs, untouched.
    expect(createMotion({ type: 'transfer' }).resolvedAnimation.value).toMatchObject({
      duration: 432,
      closeDuration: 194.4,
      ease: 'back.out(2)',
      closeEase: 'power3.in',
    })
  })

  it('closes faster than it opens, on a curve that is not the open one', () => {
    const { resolvedAnimation } = createMotion({ type: 'drip' })
    const { duration, closeDuration, ease, closeEase } = resolvedAnimation.value

    expect(closeDuration).toBeLessThan(duration)
    expect(closeDuration / duration).toBeLessThan(0.85)
    expect(closeEase).not.toBe(ease)
    // No springs anywhere: p advances linearly and the close rides a plain cubic-bezier.
    expect(ease).toBe('linear')
    expect(closeEase).toMatch(/^cubic-bezier\(/)
  })

  it('gives bead the same engine and timing as drip', () => {
    const drip = createMotion({ type: 'drip' }).resolvedAnimation.value
    const bead = createMotion({ type: 'bead' }).resolvedAnimation.value

    expect(bead.duration).toBe(drip.duration)
    expect(bead.closeDuration).toBe(drip.closeDuration)
    expect(bead.ease).toBe(drip.ease)
    expect(bead.gooBlur).toBe(drip.gooBlur)
    // Only the width behaviour differs.
    expect(createMotion({ type: 'bead' }).usesBeadMotion.value).toBe(true)
    expect(createMotion({ type: 'drip' }).usesBeadMotion.value).toBe(false)
    expect(createMotion({ type: 'drip' }).usesLiquidMotion.value).toBe(true)
    expect(createMotion({ type: 'bead' }).usesLiquidMotion.value).toBe(true)
  })

  it('still honours an explicit animation override', () => {
    const { resolvedAnimation } = createMotion({ type: 'drip', duration: 300, gooBlur: 6 })
    expect(resolvedAnimation.value.duration).toBe(300)
    expect(resolvedAnimation.value.gooBlur).toBe(6)
  })

  it('degrades to the opacity path on horizontal placements', () => {
    expect(createMotion({ type: 'drip' }, 'bottom').effectiveAnimationType.value).toBe('drip')
    expect(createMotion({ type: 'drip' }, 'top').effectiveAnimationType.value).toBe('drip')
    expect(createMotion({ type: 'bead' }, 'bottom').effectiveAnimationType.value).toBe('bead')
    expect(createMotion({ type: 'bead' }, 'left').effectiveAnimationType.value).toBe('opacity')
    expect(createMotion({ type: 'drip' }, 'left').effectiveAnimationType.value).toBe('opacity')
    expect(createMotion({ type: 'drip' }, 'right').effectiveAnimationType.value).toBe('opacity')

    expect(createMotion({ type: 'drip' }, 'right').usesLiquidMotion.value).toBe(false)
  })

  it('merges the trigger body and the panel into one goo filter', () => {
    mountLiquid()

    const shapes = document.body.querySelector('.tx-base-anchor__liquid-goo defs g')
    expect(shapes).toBeTruthy()

    // Trigger ghost and panel are siblings under one <g>, so a single filter pass
    // blurs them together and the neck emerges from the merged field.
    const rects = shapes!.querySelectorAll('rect')
    expect(rects).toHaveLength(2)

    const blur = document.body.querySelector('feGaussianBlur')
    expect(blur?.getAttribute('stdDeviation')).toBe('4.5')
    expect(document.body.querySelector('feColorMatrix')?.getAttribute('values')).toContain('20 -9')

    // Both filters consume the same <g>.
    const uses = document.body.querySelectorAll('.tx-base-anchor__liquid-goo > use')
    expect(uses).toHaveLength(2)
    const target = shapes!.getAttribute('id')
    for (const use of uses)
      expect(use.getAttribute('href')).toBe(`#${target}`)
  })

  it('derives the outline ring from the merged silhouette rather than the elements', () => {
    mountLiquid()

    const filters = Array.from(document.body.querySelectorAll('filter'))
    const outline = filters.find(filter => filter.querySelector('feMorphology'))
    expect(outline).toBeTruthy()

    // erode 1px, take the difference, flood it: one continuous ring.
    expect(outline!.querySelector('feMorphology')?.getAttribute('operator')).toBe('erode')
    expect(outline!.querySelector('feMorphology')?.getAttribute('radius')).toBe('1')
    expect(outline!.querySelector('feComposite[operator="out"]')).toBeTruthy()
    expect(outline!.querySelector('feFlood')).toBeTruthy()

    // The threshold stage is byte-identical to the fill filter's, so the erosion
    // operates on that exact silhouette.
    const fill = filters.find(filter => !filter.querySelector('feMorphology'))
    expect(outline!.querySelector('feColorMatrix')?.getAttribute('values'))
      .toBe(fill!.querySelector('feColorMatrix')?.getAttribute('values'))

    // Neither shape carries a stroke of its own.
    for (const rect of document.body.querySelectorAll('.tx-base-anchor__liquid-goo rect')) {
      expect(rect.getAttribute('stroke')).toBeNull()
      expect(rect.getAttribute('style') ?? '').not.toContain('border')
    }
  })

  it('rides the shadow on a twin outside the filter', () => {
    mountLiquid()

    const shadow = document.body.querySelector<HTMLElement>('.tx-base-anchor__liquid-shadow')
    expect(shadow).toBeTruthy()

    // A box-shadow fed through the goo would threshold into a hard black slab.
    expect(shadow!.closest('svg')).toBeNull()

    let node: Element | null = shadow
    while (node) {
      expect(node.getAttribute('filter')).toBeNull()
      expect(node.getAttribute('style') ?? '').not.toContain('url(#tx-ba-liquid-goo')
      node = node.parentElement
    }
  })

  it('suppresses the arrow, the rounded-rect outline, and the card surface', () => {
    const wrapper = mountLiquid()

    expect(document.body.querySelector('.tx-base-anchor')?.classList.contains('is-liquid')).toBe(true)
    expect(document.body.querySelector('.tx-base-anchor__arrow')).toBeNull()
    expect(document.body.querySelector('.tx-base-anchor__outline')).toBeNull()
    // liquid paints its own opaque surface through the goo; TxCard would double it up.
    expect(wrapper.findComponent(CardStub).exists()).toBe(false)
    expect(document.body.querySelector('.tx-base-anchor__liquid-panel')).toBeTruthy()
  })

  it('never routes through gsap', async () => {
    const wrapper = mountLiquid()

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    expect(gsap.set).not.toHaveBeenCalled()
  })

  it('leaves the other animation types free of a liquid stage', () => {
    mountAnchor({ props: { eager: true, animation: { type: 'transfer' } } })
    expect(document.body.querySelector('.tx-base-anchor__liquid')).toBeNull()
  })

  /**
   * jsdom reports every offset as 0, so the drop can only be exercised end to end
   * by feeding it the spec's own measurements: a 200x40 trigger with offset 8 and
   * a 200x146 panel.
   */
  it('seeds the drop inside the trigger and lifts the trigger above the goo layer', async () => {
    // Freeze the clock so the assertions cannot race the 260ms open.
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountLiquid()

    const content = document.body.querySelector<HTMLElement>('.tx-base-anchor__content')!
    Object.defineProperty(content, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(content, 'offsetHeight', { configurable: true, value: 146 })

    const stubRect = (el: Element, x: number, y: number, width: number, height: number) => {
      el.getBoundingClientRect = () => ({
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      }) as DOMRect
    }

    stubRect(document.body.querySelector('.tx-base-anchor__reference')!, 40, 100, 200, 40)
    // The panel lands at trigger bottom + offset 8 => y 148, so the trigger sits
    // at local y -48 and the spec frame is recovered by adding 48.
    stubRect(document.body.querySelector('.tx-base-anchor')!, 40, 148, 200, 146)

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    const shape = document.body.querySelector('.tx-base-anchor__liquid-goo defs g rect:nth-of-type(2)')!
    // Spec frame: top 20 (the trigger's own mid-line), height 12.
    expect(Number(shape.getAttribute('y')) + 48).toBeCloseTo(20, 5)
    expect(Number(shape.getAttribute('height'))).toBeCloseTo(12, 5)

    // The seed is entirely inside the trigger body (0..40), so the panel is torn
    // out of the trigger rather than sliding from behind it.
    const top = Number(shape.getAttribute('y')) + 48
    expect(top).toBeGreaterThanOrEqual(0)
    expect(top + Number(shape.getAttribute('height'))).toBeLessThanOrEqual(40)

    // The trigger's interior is punched out of the goo fill so its own opaque
    // fill and text show through no matter how the page stacks the two layers.
    const mask = document.body.querySelector('.tx-base-anchor__liquid-goo mask')!
    const punch = mask.querySelectorAll('rect')[1]!
    expect(punch.getAttribute('fill')).toBe('#000')
    expect(Number(punch.getAttribute('y')) + 48).toBeCloseTo(0, 5)
    expect(Number(punch.getAttribute('height'))).toBe(40)

    // Only the fill is masked; the outline ring still wraps the trigger.
    const uses = document.body.querySelectorAll('.tx-base-anchor__liquid-goo > use')
    expect(uses[0]!.getAttribute('mask')).toContain('tx-ba-liquid-mask-')
    expect(uses[1]!.getAttribute('mask')).toBeNull()
  })

  /**
   * `@floating-ui/vue`'s `update()` returns void, so there is no moment at which
   * the panel is guaranteed to have been positioned and sized. Measuring once up
   * front bakes in the pre-positioned rect and renders the whole silhouette in
   * the wrong place — the stage has to re-derive itself from live layout.
   */
  it('re-derives the stage when the panel is positioned after the drop starts', async () => {
    // Freeze the clock so the assertions cannot race the 260ms open.
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const wrapper = mountLiquid()

    const content = document.body.querySelector<HTMLElement>('.tx-base-anchor__content')!
    const anchorEl = document.body.querySelector('.tx-base-anchor')!
    const referenceEl = document.body.querySelector('.tx-base-anchor__reference')!

    // Pre-positioned state: floating-ui has not run, so the layer is still at the
    // viewport origin and the panel at its intrinsic width.
    let panelWidth = 149
    let panelTop = 0
    Object.defineProperty(content, 'offsetWidth', { configurable: true, get: () => panelWidth })
    Object.defineProperty(content, 'offsetHeight', { configurable: true, value: 146 })

    const rect = (x: number, y: number, width: number, height: number) => ({
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    }) as DOMRect

    referenceEl.getBoundingClientRect = () => rect(60, 60, 200, 40)
    anchorEl.getBoundingClientRect = () => rect(60, panelTop, panelWidth, 146)

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    const ghost = () => document.body.querySelector('.tx-base-anchor__liquid-goo defs g rect')!
    const panel = () => document.body.querySelector('.tx-base-anchor__liquid-goo defs g rect:nth-of-type(2)')!

    // Ghost tracks the stale layout for now (inflated 1px so its ring clears the trigger).
    expect(Number(ghost().getAttribute('y'))).toBeCloseTo(59, 5)

    // floating-ui settles: the panel lands at trigger bottom + offset 8 and takes its width.
    panelTop = 108
    panelWidth = 200
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))

    expect(Number(panel().getAttribute('width'))).toBe(200)
    // Trigger back at local y -48, ghost inflated to -49.
    expect(Number(ghost().getAttribute('y'))).toBeCloseTo(-49, 5)
  })
})
