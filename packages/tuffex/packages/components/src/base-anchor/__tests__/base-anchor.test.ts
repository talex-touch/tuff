import type { BaseAnchorAnimationOptions } from '../src/types'
import { flushPromises, mount } from '@vue/test-utils'
import gsap from 'gsap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { useBaseAnchorMotion } from '../src/base-anchor-motion'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

vi.mock('gsap', () => {
  const timelines: Array<{ to: ReturnType<typeof vi.fn>, kill: ReturnType<typeof vi.fn> }> = []
  const timeline = () => {
    const instance = { to: vi.fn().mockReturnThis(), kill: vi.fn() }
    timelines.push(instance)
    return instance
  }

  return {
    default: {
      set: vi.fn(),
      timeline,
      __timelines: timelines,
    },
  }
})

/** Tween recorder attached by the gsap mock above; lets tests inspect timeline.to payloads. */
function lastTimeline() {
  const timelines = (gsap as unknown as { __timelines: Array<{ to: ReturnType<typeof vi.fn> }> }).__timelines
  return timelines.at(-1)
}

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
    alignment: computed(() => 'center' as const),
    arrowSize: computed(() => 10),
    showArrow: computed(() => false),
    animation: computed(() => animation),
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

  it('supports animation object variants', async () => {
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
        animation: { type: 'opacity', duration: 280, ease: 'power2.out' },
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

describe('txBaseAnchor expand motion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanupAnchors()
  })

  it('is the untyped default, symmetric in both directions', () => {
    // Decision 08-15: only the tooltip zooms with boom (it pins the type
    // itself); everything untyped springs open AND closed as expand.
    expect(createMotion({}).resolvedAnimation.value).toMatchObject({
      type: 'expand',
      closeType: 'expand',
      closeDuration: 240,
      closeEase: 'power2.in',
    })
  })

  it('resolves its own timing when pinned explicitly', () => {
    expect(createMotion({ type: 'expand' }).resolvedAnimation.value).toMatchObject({
      type: 'expand',
      duration: 400,
      closeDuration: 240,
      ease: 'spring(10, 0.6)',
      closeEase: 'power2.in',
      scale: 0.88,
      distance: 12,
    })
  })

  it('springs open and leaves on plain acceleration, faster than it arrived', () => {
    const { resolvedAnimation } = createMotion({ type: 'expand' })
    const { duration, closeDuration, ease, closeEase } = resolvedAnimation.value

    // The bounce is the point: a damped spring on the open...
    expect(ease).toMatch(/^spring\(/)
    // ...and a non-overshooting exit that undercuts the entrance.
    expect(closeEase.endsWith('.in')).toBe(true)
    expect(closeDuration).toBeLessThan(duration)
  })

  it('honours explicit overrides and stays expand on every side', () => {
    const { resolvedAnimation } = createMotion({ type: 'expand', duration: 300, scale: 0.9 })
    expect(resolvedAnimation.value.duration).toBe(300)
    expect(resolvedAnimation.value.scale).toBe(0.9)

    // No degradation: the clip reveal is defined on all four sides.
    for (const side of ['top', 'bottom', 'left', 'right'] as const)
      expect(createMotion({ type: 'expand' }, side).effectiveAnimationType.value).toBe('expand')
  })

  it('seeds drift, settle scale, and a bled clip around the anchored corner', async () => {
    const wrapper = mountAnchor({
      props: {
        animation: { type: 'expand' },
        placement: 'bottom-end',
      },
    })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    // bottom-end: the panel hangs below the reference, right edges aligned —
    // so it grows around its top-right corner, drifting down from -12px. The
    // opacity seeds separately (on the fade layer, never with the transform).
    expect(gsap.set).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      x: 0,
      y: -12,
      scale: 0.88,
      transformOrigin: '100% 0%',
    }))
    expect(gsap.set).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ opacity: 0 }))

    // Reveal edge at the bottom, shadow bleed on the other three sides. The
    // timeline is mocked so this is the seed frame, untouched by onUpdate.
    const clip = document.body.querySelector<HTMLElement>('.tx-base-anchor__clip')!
    expect(clip.style.clipPath).toBe('inset(-40px -40px 100% -40px)')
    expect(clip.style.overflow).toBe('visible')
  })

  it('resolves spring and bezier strings to functions; gsap vocabulary passes through', async () => {
    // Default: spring(10, 0.72) is not gsap vocabulary — it must arrive as a
    // function, and one that actually overshoots before landing on exactly 1.
    const spring = mountAnchor({ props: { animation: { type: 'expand' } } })
    await spring.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    const springTo = lastTimeline()!.to
    expect(springTo).toHaveBeenCalled()
    for (const call of springTo.mock.calls) {
      const vars = call[1] as { ease: unknown, duration: number }
      expect(vars.duration).toBeCloseTo(0.4, 5)
      const ease = vars.ease as (t: number) => number
      expect(typeof ease).toBe('function')
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      const peak = Math.max(...Array.from({ length: 41 }, (_, i) => ease(i / 40)))
      expect(peak).toBeGreaterThan(1.02)
      expect(peak).toBeLessThan(1.12)
    }

    // gsap's own vocabulary is handed over untouched...
    const native = mountAnchor({
      props: { animation: { type: 'expand', ease: 'back.out(2)' } },
    })
    await native.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    const nativeTo = lastTimeline()!.to
    expect(nativeTo).toHaveBeenCalled()
    for (const call of nativeTo.mock.calls)
      expect((call[1] as { ease: unknown }).ease).toBe('back.out(2)')

    // ...while CSS beziers resolve through the kernel's bezier engine.
    const bezier = mountAnchor({
      props: { animation: { type: 'expand', ease: 'cubic-bezier(0.32, 0.72, 0, 1)' } },
    })
    await bezier.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    const bezierTo = lastTimeline()!.to
    expect(bezierTo).toHaveBeenCalled()
    for (const call of bezierTo.mock.calls) {
      const ease = (call[1] as { ease: unknown }).ease as (t: number) => number
      expect(typeof ease).toBe('function')
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      expect(ease(0.6)).toBeGreaterThan(0.85)
    }
  })

  it('grows the real box when the panel height is measurable, so the height itself can bounce', async () => {
    const wrapper = mountAnchor({ props: { eager: true, animation: { type: 'expand' } } })
    const content = document.body.querySelector<HTMLElement>('.tx-base-anchor__content')!
    Object.defineProperty(content, 'offsetHeight', { configurable: true, value: 146 })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    // Box mode: no clip window at all — the card crops and carries the edge.
    // All overrides are inline so the motion cannot depend on a stylesheet
    // having been delivered.
    const clip = document.body.querySelector<HTMLElement>('.tx-base-anchor__clip')!
    expect(clip.style.clipPath).toBe('none')
    expect(clip.dataset.expandFullHeight).toBe('146')
    expect(content.style.height).toBe('100%')
    const card = document.body.querySelector<HTMLElement>('.tx-base-anchor__card')!
    expect(card.style.height).toBe('100%')
    expect(card.style.overflow).toBe('hidden')
    // The hairline ring rides the card as an inset shadow while the outline
    // svg sits out — same colour formula, so the settle swap has no seam.
    expect(card.style.boxShadow).toContain('inset 0 0 0 1px')

    // The fade lives INSIDE the card: the body seeds at opacity 0 while the
    // content's transform seed carries no opacity at all — an animated
    // opacity above the card would make Chrome drop its backdrop-filter.
    const bodyEl = document.body.querySelector<HTMLElement>('.tx-base-anchor__body')!
    expect(gsap.set).toHaveBeenCalledWith(bodyEl, expect.objectContaining({ opacity: 0 }))
    const contentSeed = vi.mocked(gsap.set).mock.calls.find(call =>
      call[0] === content && 'transformOrigin' in (call[1] as object))
    expect(contentSeed).toBeTruthy()
    expect('opacity' in (contentSeed![1] as object)).toBe(false)
    // Seeded collapsed. The tween drives a PROGRESS proxy, not a pixel
    // target: the box height is derived per frame from the body's natural
    // height, so content that finishes rendering mid-flight moves the
    // landing spot instead of causing a snap at reset.
    expect(clip.style.height).toBe('0px')
    const heightTween = lastTimeline()!.to.mock.calls
      .find(call => call[0] !== content && 'p' in (call[1] as object))
    expect(heightTween).toBeTruthy()
    expect((heightTween![1] as { p: number }).p).toBe(1)

    // Closing collapses the same box rather than re-clipping it.
    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()
    const closeTween = lastTimeline()!.to.mock.calls
      .find(call => call[0] !== content && 'p' in (call[1] as object))
    expect(closeTween).toBeTruthy()
    expect((closeTween![1] as { p: number }).p).toBe(0)
  })

  it('pins the trigger-facing edge on top placements by pairing height with a translate', async () => {
    const wrapper = mountAnchor({
      props: { eager: true, placement: 'top', animation: { type: 'expand' } },
    })
    const content = document.body.querySelector<HTMLElement>('.tx-base-anchor__content')!
    Object.defineProperty(content, 'offsetHeight', { configurable: true, value: 146 })

    await wrapper.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()

    const clip = document.body.querySelector<HTMLElement>('.tx-base-anchor__clip')!
    // The panel sits above the trigger, so the box hangs from its bottom:
    // height and translateY move in opposition and their sum stays put.
    // This is the seed frame (progress 0): fully translated, zero height.
    expect(clip.style.height).toBe('0px')
    expect(clip.style.transform).toBe('translateY(146px)')
    const tween = lastTimeline()!.to.mock.calls.find(call => 'p' in (call[1] as object))
    expect(tween).toBeTruthy()
    expect((tween![1] as { p: number }).p).toBe(1)
  })

  it('keeps the live glass in box mode and only swaps it on the fallback paths', async () => {
    // Box mode (vertical + card): the glass never sits under an animated
    // opacity, so the surface swap — and its solid-to-glass settle fade —
    // must not engage. The mocked timeline never completes, so this is the
    // mid-motion state.
    const box = mountAnchor({ props: { animation: { type: 'expand' } } })
    await box.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()
    expect(box.findComponent(CardStub).props('surfaceMoving')).toBe(false)

    // Horizontal placements fall back to the window reveal, which still fades
    // the whole content — there the swap keeps protecting the backdrop.
    const fallback = mountAnchor({
      props: { placement: 'left', animation: { type: 'expand' } },
    })
    await fallback.find('.tx-base-anchor__reference').trigger('click')
    await nextTick()
    await vi.dynamicImportSettled()
    expect(fallback.findComponent(CardStub).props('surfaceMoving')).toBe(true)
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
