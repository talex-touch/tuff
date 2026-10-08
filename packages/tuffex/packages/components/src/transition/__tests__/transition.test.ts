import type { Component, PropType } from 'vue'
import type { TransitionPushDirection } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxTransition from '../src/TxTransition.vue'
import TxTransitionFade from '../src/TxTransitionFade.vue'
import TxTransitionPush from '../src/TxTransitionPush.vue'
import TxTransitionRebound from '../src/TxTransitionRebound.vue'
import TxTransitionSlideFade from '../src/TxTransitionSlideFade.vue'
import TxTransitionSmoothSize from '../src/TxTransitionSmoothSize.vue'

enableAutoUnmount(afterEach)

function mountTransition(component: Component, options: Record<string, unknown>) {
  return mount(component, options)
}

describe('txTransition', () => {
  it('maps presets to transition names and timing CSS variables', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'slide-fade',
        duration: 260,
        easing: 'linear',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        class: 'external-transition',
        style: 'color: red;',
        'data-track': 'panel',
      },
      slots: {
        default: '<span>Panel</span>',
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['tx-transition', 'external-transition']))
    expect(wrapper.attributes('style')).toContain('--tx-transition-duration: 260ms')
    expect(wrapper.attributes('style')).toContain('--tx-transition-easing: linear')
    expect(wrapper.attributes('style')).toContain('color: red')
    expect(wrapper.attributes('data-track')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
      name: 'tx-slide-fade',
      appear: false,
      mode: 'in-out',
    })
    expect(wrapper.text()).toBe('Panel')
  })

  it('renders TransitionGroup with the configured tag when group is enabled', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'rebound',
        group: true,
        tag: 'ul',
      },
      attrs: {
        'data-list': 'items',
      },
      slots: {
        default: '<li>Alpha</li><li>Beta</li>',
      },
    })

    expect(wrapper.findComponent({ name: 'TransitionGroup' }).props()).toMatchObject({
      name: 'tx-rebound',
      tag: 'ul',
      appear: true,
    })
    expect(wrapper.attributes('data-list')).toBeUndefined()
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
  })

  it('uses the smooth-size component for non-group smooth-size preset', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'smooth-size',
        duration: 320,
        easing: 'ease-out',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        id: 'smooth-panel',
      },
      slots: {
        default: '<span>Sized panel</span>',
      },
    })
    const smooth = wrapper.findComponent(TxTransitionSmoothSize)

    expect(smooth.exists()).toBe(true)
    expect(smooth.props()).toMatchObject({
      duration: 320,
      easing: 'ease-out',
      appear: false,
      mode: 'in-out',
    })
    expect(smooth.attributes('id')).toBe('smooth-panel')
    expect(wrapper.text()).toBe('Sized panel')
  })

  it('merges caller class and style into the smooth-size preset', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'smooth-size',
        duration: 240,
      },
      attrs: {
        class: 'external-smooth',
        style: 'color: red;',
      },
      slots: {
        default: '<span>Sized</span>',
      },
    })

    const transition = wrapper.find('.tx-transition')

    expect(transition.classes()).toContain('external-smooth')
    expect(transition.attributes('style')).toContain('color: red')
    expect(transition.attributes('style')).toContain('--tx-transition-duration: 240ms')
  })

  it('forwards smooth-size sizing props through TxAutoSizer', () => {
    const wrapper = mountTransition(TxTransitionSmoothSize, {
      props: {
        width: true,
        height: false,
        duration: 280,
        easing: 'ease-in',
        motion: 'rebound',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        class: 'size-motion',
        style: 'opacity: 0.8;',
        'data-size': 'card',
      },
      slots: {
        default: '<strong>Auto sized</strong>',
      },
    })
    const autoSizer = wrapper.findComponent({ name: 'TxAutoSizer' })
    const transition = wrapper.find('.tx-transition')

    expect(autoSizer.props()).toMatchObject({
      width: true,
      height: false,
      durationMs: 280,
      easing: 'ease-in',
      outerClass: 'overflow-hidden',
    })
    expect(autoSizer.attributes('data-size')).toBe('card')
    expect(transition.classes()).toEqual(expect.arrayContaining(['tx-transition', 'tx-transition-smooth-size', 'size-motion']))
    expect(transition.attributes('style')).toContain('--tx-transition-duration: 280ms')
    expect(transition.attributes('style')).toContain('--tx-transition-easing: ease-in')
    expect(transition.attributes('style')).toContain('opacity: 0.8')
    expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
      name: 'tx-rebound',
      appear: false,
      mode: 'in-out',
    })
  })

  it('degrades smooth-size to tx-fade inside a TransitionGroup instead of a dead name', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'smooth-size',
        group: true,
        tag: 'ul',
      },
      slots: {
        default: '<li>Alpha</li><li>Beta</li>',
      },
    })

    // tx-smooth-size-* classes don't exist, so a grouped smooth-size must fall back to a
    // real, -move-capable name rather than emitting a silent no-op transition.
    expect(wrapper.findComponent({ name: 'TransitionGroup' }).props()).toMatchObject({
      name: 'tx-fade',
    })
  })

  it('semantic components pin their preset while forwarding attrs and slots', () => {
    const cases = [
      [TxTransitionFade, 'tx-fade'],
      [TxTransitionSlideFade, 'tx-slide-fade'],
      [TxTransitionRebound, 'tx-rebound'],
    ] as const

    for (const [component, name] of cases) {
      const wrapper = mountTransition(component, {
        attrs: {
          mode: 'in-out',
          'data-kind': name,
        },
        slots: {
          default: `<span>${name}</span>`,
        },
      })

      expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
        name,
        mode: 'in-out',
      })
      expect(wrapper.attributes('data-kind')).toBeUndefined()
      expect(wrapper.text()).toBe(name)
    }
  })
})

const PUSH_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)'
const PAGE_WIDTH = 320
const PAGE_HEIGHTS: Record<string, number> = { a: 90, b: 180, c: 60 }

interface FakeAnimation {
  /** Eased progress the test sets to stand for a frame mid-way. */
  progress: number
  cancelled: boolean
  finished: boolean
  onfinish: (() => void) | null
  effect: { getComputedTiming: () => { progress: number | null } }
  cancel: () => void
  finish: () => void
}

interface AnimateCall {
  element: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: FakeAnimation
}

let animateCalls: AnimateCall[] = []

/** jsdom ships no Web Animations API; the stub records what the component asked for. */
function installWaapiStub(): void {
  animateCalls = []
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: FakeAnimation = {
        progress: 0,
        cancelled: false,
        finished: false,
        onfinish: null,
        effect: { getComputedTiming: () => ({ progress: animation.cancelled ? null : animation.progress }) },
        cancel() {
          this.cancelled = true
        },
        finish() {
          this.finished = true
          this.progress = 1
          this.onfinish?.()
        },
      }
      animateCalls.push({ element: this, keyframes, options, animation })
      return animation
    },
  })
}

function rect(width: number, height: number): DOMRect {
  return { x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRect
}

function running(element: HTMLElement): AnimateCall | undefined {
  return animateCalls.filter(call => call.element === element && !call.animation.cancelled && !call.animation.finished).at(-1)
}

/**
 * jsdom lays nothing out and reports no used size, so the component reads the box. This
 * answers like a browser would: a page is as tall as its `data-height`, and the container is
 * its pages in flow (a pinned page holds no space), or the frame a running height tween draws.
 */
function installLayoutStub(): void {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      if (this.classList.contains('tx-transition-push')) {
        const tween = running(this)
        if (tween) {
          const [from, to] = tween.keyframes.map(frame => Number.parseFloat(String(frame.height)))
          return rect(PAGE_WIDTH, from! + (to! - from!) * tween.animation.progress)
        }
        const inFlow = Array.from(this.children as HTMLCollectionOf<HTMLElement>)
          .filter(child => child.style.position !== 'absolute')
        return rect(PAGE_WIDTH, inFlow.reduce((sum, child) => sum + Number(child.dataset.height ?? 0), 0))
      }
      if (this.dataset.height)
        return rect(PAGE_WIDTH, Number(this.dataset.height))
      return rect(0, 0)
    },
  })
}

const originalMatchMedia = window.matchMedia

function stubReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

const PushHost = defineComponent({
  props: {
    page: { type: String, default: 'a' },
    direction: { type: String as PropType<TransitionPushDirection>, default: 'forward' },
    duration: { type: Number, default: undefined },
    height: { type: Boolean, default: true },
    appear: { type: Boolean, default: false },
    rtl: { type: Boolean, default: false },
  },
  setup(props) {
    return () => h(
      TxTransitionPush,
      {
        direction: props.direction,
        duration: props.duration,
        height: props.height,
        appear: props.appear,
        style: props.rtl ? 'direction: rtl' : undefined,
      },
      {
        default: () => props.page
          ? h('div', { 'key': props.page, 'class': 'push-page', 'data-page': props.page, 'data-height': PAGE_HEIGHTS[props.page] }, props.page)
          : null,
      },
    )
  },
})

function mountPush(props: Record<string, unknown> = {}) {
  return mount(PushHost, {
    props,
    attachTo: document.body,
    // The real Transition (VTU stubs it), so the hooks run and the leaving page lingers.
    global: { stubs: { transition: false } },
  })
}

type PushWrapper = ReturnType<typeof mountPush>

function pageElement(wrapper: PushWrapper, page: string): HTMLElement {
  return wrapper.get(`[data-page="${page}"]`).element as HTMLElement
}

function rootElement(wrapper: PushWrapper): HTMLElement {
  return wrapper.get('.tx-transition-push').element as HTMLElement
}

function callsOn(element: HTMLElement): AnimateCall[] {
  return animateCalls.filter(call => call.element === element)
}

describe('txTransitionPush', () => {
  beforeEach(() => {
    installWaapiStub()
    installLayoutStub()
    stubReducedMotion(false)
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect')
    window.matchMedia = originalMatchMedia
  })

  it('pushes the next page in from the inline end and the current one out to the start', async () => {
    const wrapper = mountPush()
    const leaving = pageElement(wrapper, 'a')

    await wrapper.setProps({ page: 'b' })
    const entering = pageElement(wrapper, 'b')

    expect(callsOn(entering).map(call => call.keyframes)).toEqual([
      [{ translate: '100% 0' }, { translate: '0% 0' }],
    ])
    expect(callsOn(entering)[0]!.options).toEqual({ duration: 220, easing: PUSH_EASING, fill: 'none' })
    expect(callsOn(leaving).map(call => call.keyframes)).toEqual([
      [{ translate: '0% 0' }, { translate: '-100% 0' }],
    ])
    // The leave holds its last frame until the page is removed.
    expect(callsOn(leaving)[0]!.options).toEqual({ duration: 220, easing: PUSH_EASING, fill: 'forwards' })
  })

  it('brings the page in from the inline start when going back', async () => {
    const wrapper = mountPush()
    const leaving = pageElement(wrapper, 'a')

    await wrapper.setProps({ page: 'b', direction: 'back' })

    expect(callsOn(pageElement(wrapper, 'b'))[0]!.keyframes).toEqual([{ translate: '-100% 0' }, { translate: '0% 0' }])
    expect(callsOn(leaving)[0]!.keyframes).toEqual([{ translate: '0% 0' }, { translate: '100% 0' }])
  })

  it('mirrors both directions in a right-to-left container', async () => {
    const wrapper = mountPush({ rtl: true })

    await wrapper.setProps({ page: 'b' })
    expect(callsOn(pageElement(wrapper, 'b'))[0]!.keyframes).toEqual([{ translate: '-100% 0' }, { translate: '0% 0' }])

    await wrapper.setProps({ page: 'c', direction: 'back' })
    expect(callsOn(pageElement(wrapper, 'c'))[0]!.keyframes).toEqual([{ translate: '100% 0' }, { translate: '0% 0' }])
  })

  it('pins the leaving page out of flow where it stands, inert', async () => {
    const wrapper = mountPush()
    const leaving = pageElement(wrapper, 'a')

    await wrapper.setProps({ page: 'b' })

    expect(leaving.isConnected).toBe(true)
    expect(leaving.style.position).toBe('absolute')
    expect(leaving.style.top).toBe('0px')
    expect(leaving.style.left).toBe('0px')
    expect(leaving.style.width).toBe(`${PAGE_WIDTH}px`)
    expect(leaving.style.height).toBe('90px')
    expect(leaving.style.marginTop).toBe('0px')
    expect(leaving.hasAttribute('inert')).toBe(true)
    const entering = pageElement(wrapper, 'b')
    expect(entering.style.position).toBe('')
    expect(entering.hasAttribute('inert')).toBe(false)
  })

  it('tweens the container from the old page height to the new one, then lets it go', async () => {
    const wrapper = mountPush()
    const root = rootElement(wrapper)
    const push = wrapper.findComponent(TxTransitionPush)

    await wrapper.setProps({ page: 'b' })

    expect(callsOn(root).map(call => call.keyframes)).toEqual([[{ height: '90px' }, { height: '180px' }]])
    expect(callsOn(root)[0]!.options).toEqual({ duration: 220, easing: PUSH_EASING })
    expect(root.classList.contains('is-pushing')).toBe(true)

    for (const call of [...animateCalls])
      call.animation.finish()
    await nextTick()

    expect(wrapper.findAll('.push-page').map(page => page.attributes('data-page'))).toEqual(['b'])
    expect(root.classList.contains('is-pushing')).toBe(false)
    expect(root.style.height).toBe('')
    expect(push.emitted('before-enter')?.map(([el]) => (el as HTMLElement).dataset.page)).toEqual(['b'])
    expect(push.emitted('after-enter')?.map(([el]) => (el as HTMLElement).dataset.page)).toEqual(['b'])
    expect(push.emitted('after-leave')?.map(([el]) => (el as HTMLElement).dataset.page)).toEqual(['a'])
  })

  it('leaves the height alone when height is false', async () => {
    const wrapper = mountPush({ height: false })
    const root = rootElement(wrapper)

    await wrapper.setProps({ page: 'b' })

    expect(callsOn(root)).toEqual([])
    expect(callsOn(pageElement(wrapper, 'b'))).toHaveLength(1)
  })

  it('lands the container even when nothing enters', async () => {
    const wrapper = mountPush()
    const root = rootElement(wrapper)

    await wrapper.setProps({ page: '' })
    await nextTick()

    expect(callsOn(root).map(call => call.keyframes)).toEqual([[{ height: '90px' }, { height: '0px' }]])
  })

  it('swaps the page at once when duration is 0', async () => {
    const wrapper = mountPush({ duration: 0 })
    const push = wrapper.findComponent(TxTransitionPush)

    await wrapper.setProps({ page: 'b' })

    expect(animateCalls).toEqual([])
    expect(wrapper.findAll('.push-page').map(page => page.attributes('data-page'))).toEqual(['b'])
    expect(rootElement(wrapper).classList.contains('is-pushing')).toBe(false)
    expect(push.emitted('after-leave')).toHaveLength(1)
    expect(push.emitted('after-enter')).toHaveLength(1)
  })

  it('crossfades in place under reduced motion and lands the height at once', async () => {
    stubReducedMotion(true)
    const wrapper = mountPush()
    const root = rootElement(wrapper)
    const leaving = pageElement(wrapper, 'a')

    await wrapper.setProps({ page: 'b' })
    const entering = pageElement(wrapper, 'b')

    expect(callsOn(entering).map(call => call.keyframes)).toEqual([[{ opacity: 0 }, { opacity: 1 }]])
    expect(callsOn(entering)[0]!.options).toEqual({ duration: 120, easing: PUSH_EASING, fill: 'none' })
    expect(callsOn(leaving).map(call => call.keyframes)).toEqual([[{ opacity: 1 }, { opacity: 0 }]])
    expect(callsOn(root)).toEqual([])
    expect(animateCalls.flatMap(call => call.keyframes).some(frame => 'translate' in frame)).toBe(false)
  })

  it('picks an interrupted switch up from where it is drawn', async () => {
    const wrapper = mountPush()
    const root = rootElement(wrapper)

    await wrapper.setProps({ page: 'b' })
    const b = pageElement(wrapper, 'b')
    const firstTween = callsOn(root)[0]!
    const bEnter = callsOn(b)[0]!
    // Half-way: the container is drawn at 135px and b at 50%.
    firstTween.animation.progress = 0.5
    bEnter.animation.progress = 0.5

    await wrapper.setProps({ page: 'c' })

    expect(firstTween.animation.cancelled).toBe(true)
    expect(callsOn(root).at(-1)!.keyframes).toEqual([{ height: '135px' }, { height: '60px' }])
    expect(bEnter.animation.cancelled).toBe(true)
    expect(callsOn(b).at(-1)!.keyframes).toEqual([{ translate: '50% 0' }, { translate: '-100% 0' }])
    expect(callsOn(pageElement(wrapper, 'c'))[0]!.keyframes).toEqual([{ translate: '100% 0' }, { translate: '0% 0' }])
  })

  it('brings a page back from where it was drawn when the push turns around mid-way', async () => {
    const wrapper = mountPush()
    const push = wrapper.findComponent(TxTransitionPush)
    const firstA = pageElement(wrapper, 'a')

    await wrapper.setProps({ page: 'b' })
    const b = pageElement(wrapper, 'b')
    callsOn(firstA)[0]!.animation.progress = 0.5
    callsOn(b)[0]!.animation.progress = 0.5

    await wrapper.setProps({ page: 'a', direction: 'back' })
    const secondA = pageElement(wrapper, 'a')

    // Vue removes the half-gone page early to let the same key in; the new one starts there.
    expect(secondA).not.toBe(firstA)
    expect(firstA.isConnected).toBe(false)
    expect(push.emitted('after-leave')?.[0]).toEqual([firstA])
    expect(callsOn(secondA).map(call => call.keyframes)).toEqual([[{ translate: '-50% 0' }, { translate: '0% 0' }]])
    expect(callsOn(b).at(-1)!.keyframes).toEqual([{ translate: '50% 0' }, { translate: '100% 0' }])
  })

  it('hands nothing over from an enter that an instant leave dropped', async () => {
    const wrapper = mountPush()

    await wrapper.setProps({ page: 'b' })
    callsOn(pageElement(wrapper, 'b'))[0]!.animation.progress = 0.5

    // Motion switched off while b is still entering, and the slot emptied: nothing replaces b.
    await wrapper.setProps({ page: '', duration: 0 })
    await wrapper.setProps({ page: 'c', duration: undefined })

    expect(callsOn(pageElement(wrapper, 'c'))[0]!.keyframes).toEqual([{ translate: '100% 0' }, { translate: '0% 0' }])
  })

  it('slides the first page in on mount only with appear', async () => {
    const wrapper = mountPush({ appear: true })
    await nextTick()

    expect(callsOn(pageElement(wrapper, 'a')).map(call => call.keyframes)).toEqual([
      [{ translate: '100% 0' }, { translate: '0% 0' }],
    ])
    expect(callsOn(rootElement(wrapper))).toEqual([])

    mountPush()
    await nextTick()
    expect(animateCalls).toHaveLength(1)
  })

  it('stops every motion when it unmounts mid-push', async () => {
    const wrapper = mountPush()

    await wrapper.setProps({ page: 'b' })
    const inFlight = [...animateCalls]
    expect(inFlight).toHaveLength(3)

    wrapper.unmount()

    expect(inFlight.every(call => call.animation.cancelled)).toBe(true)
  })
})
