import type { BaseAnchorAnimationOptions, BaseAnchorProps } from '../src/types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import gsap from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { createCubicBezier, createSpringEase } from '../../../../utils/animation/easing'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

const CardStub = defineComponent({ name: 'TxCard', template: '<div><slot /></div>' })
const mountedAnchors: Array<{ unmount: () => void }> = []
const timelines: gsap.core.Timeline[] = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let now = 1000

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) } as DOMRect
}

async function drain() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

async function frame(elapsed = 16) {
  now += elapsed
  vi.advanceTimersByTime(elapsed)
  for (const [id, callback] of [...frames.entries()]) {
    if (frames.delete(id))
      callback(now)
  }
  await drain()
}

async function until(predicate: () => boolean) {
  await vi.dynamicImportSettled()
  await drain()
  for (let index = 0; index < 20 && !predicate(); index++)
    await frame()
  expect(predicate(), 'anchor did not reach the requested rendered state').toBe(true)
}

function mountAnchor(props: BaseAnchorProps = {}, attrs: Record<string, unknown> = {}): AnchorFixture {
  const wrapper = mount(TxBaseAnchor, {
    attachTo: document.body,
    attrs,
    props: {
      eager: true,
      keepAliveContent: true,
      width: 480,
      placement: 'bottom',
      disableFlip: true,
      showArrow: false,
      panelBackground: 'pure',
      animation: { type: 'none' },
      virtualReference: { getBoundingClientRect: () => rect(40, 100, 200, 40) },
      ...props,
    },
    slots: {
      reference: '<button class="reference-button">Reference</button>',
      default: '<button class="panel-action">Panel action</button>',
    },
    global: { stubs: { TxCard: CardStub } },
  })
  mountedAnchors.push(wrapper)
  const root = Array.from(document.body.querySelectorAll<HTMLElement>('.tx-base-anchor')).at(-1)!
  const content = root.querySelector<HTMLElement>('.tx-base-anchor__content')!
  const clip = root.querySelector<HTMLElement>('.tx-base-anchor__clip')!
  const body = root.querySelector<HTMLElement>('.tx-base-anchor__body')!
  let naturalHeight = 146
  for (const element of [root, content, body].filter(Boolean)) {
    Object.defineProperty(element, 'offsetWidth', { configurable: true, get: () => Number.parseFloat(root.style.width) || 480 })
    Object.defineProperty(element, 'offsetHeight', { configurable: true, get: () => naturalHeight })
  }
  vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(40, 148, root.offsetWidth, naturalHeight))
  return { wrapper, root, content, clip, body, setHeight: (height: number) => { naturalHeight = height } }
}

interface AnchorFixture {
  wrapper: VueWrapper
  root: HTMLElement
  content: HTMLElement
  clip: HTMLElement
  body: HTMLElement
  setHeight: (height: number) => void
}

async function openTimeline(anchor: AnchorFixture) {
  const count = timelines.length
  await anchor.wrapper.setProps({ modelValue: true })
  await until(() => timelines.length > count)
  return { timeline: timelines.at(-1)! }
}

async function closeTimeline(anchor: AnchorFixture) {
  const count = timelines.length
  await anchor.wrapper.setProps({ modelValue: false })
  await until(() => timelines.length > count)
  return { timeline: timelines.at(-1)! }
}

beforeEach(() => {
  now = 1000
  frameId = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
  const realTimeline = gsap.timeline.bind(gsap)
  vi.spyOn(gsap, 'timeline').mockImplementation((options) => {
    const timeline = realTimeline({ ...options, paused: true })
    timelines.push(timeline)
    return timeline
  })
})

afterEach(() => {
  while (mountedAnchors.length)
    mountedAnchors.pop()?.unmount()
  for (const timeline of timelines)
    timeline.kill()
  timelines.length = 0
  frames.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('txBaseAnchor', () => {
  it('toggles uncontrolled content from the reference and emits the matching state transitions', async () => {
    const anchor = mountAnchor({ toggleOnReferenceClick: true })
    await anchor.wrapper.find('.reference-button').trigger('click')
    await until(() => anchor.clip.style.visibility === 'visible')
    expect(anchor.wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(anchor.wrapper.emitted('open')).toEqual([[]])
    expect(anchor.root.querySelector('.panel-action')?.textContent).toBe('Panel action')

    await anchor.wrapper.find('.reference-button').trigger('click')
    expect(anchor.wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
    expect(anchor.wrapper.emitted('close')).toEqual([[]])
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
  })

  it('makes a panel mounted already open visible, not just a later toggled panel', async () => {
    const anchor = mountAnchor({ modelValue: true })
    await until(() => anchor.clip.style.visibility === 'visible')
    expect(getComputedStyle(anchor.root).visibility).toBe('visible')
    expect(anchor.root.querySelector('.panel-action')?.textContent).toBe('Panel action')
  })

  it('blocks disabled opening and closes an uncontrolled panel disabled during use', async () => {
    const anchor = mountAnchor({ disabled: true, toggleOnReferenceClick: true })
    await anchor.wrapper.find('.reference-button').trigger('click')
    expect(anchor.wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')

    await anchor.wrapper.setProps({ disabled: false })
    await anchor.wrapper.find('.reference-button').trigger('click')
    await until(() => anchor.clip.style.visibility === 'visible')
    await anchor.wrapper.setProps({ disabled: true })
    expect(anchor.wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
    expect(anchor.wrapper.emitted('close')).toEqual([[]])
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
  })

  it('requests controlled closure for outside clicks and Escape without mutating the parent-owned state', async () => {
    const anchor = mountAnchor({ modelValue: true, closeOnClickOutside: true, closeOnEsc: true })
    await until(() => anchor.clip.style.visibility === 'visible')
    await frame(200)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(anchor.wrapper.emitted('update:modelValue')).toEqual([[false], [false]])
    expect(anchor.wrapper.emitted('close')).toEqual([[], []])
    expect(getComputedStyle(anchor.root).visibility).toBe('visible')
  })

  it('keeps an open controlled panel when outside, Escape and reference toggles are explicitly disabled', async () => {
    const anchor = mountAnchor({ modelValue: true, closeOnClickOutside: false, closeOnEsc: false, toggleOnReferenceClick: false })
    await until(() => anchor.clip.style.visibility === 'visible')
    await frame(200)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await anchor.wrapper.find('.reference-button').trigger('click')
    expect(anchor.wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(anchor.wrapper.emitted('close')).toBeUndefined()
    expect(getComputedStyle(anchor.root).visibility).toBe('visible')
  })

  it('puts consumer attrs on the floating panel and reference classes on the trigger', () => {
    const anchor = mountAnchor({ referenceClass: ['custom-reference', { active: true }] }, {
      'id': 'floating-panel',
      'class': 'custom-floating',
      'data-testid': 'panel',
      'style': 'color: red;',
    })
    const reference = anchor.wrapper.find('.tx-base-anchor__reference')
    expect(reference.classes()).toContain('custom-reference')
    expect(reference.classes()).toContain('active')
    expect(reference.attributes('id')).toBeUndefined()
    expect(anchor.root.id).toBe('floating-panel')
    expect(anchor.root.classList.contains('custom-floating')).toBe(true)
    expect(anchor.root.dataset.testid).toBe('panel')
    expect(anchor.root.style.color).toBe('red')
  })

  it('keeps an explicit panel width larger than the implicit width cap', async () => {
    const anchor = mountAnchor({ modelValue: true, width: 480 })
    await until(() => anchor.clip.style.visibility === 'visible' && anchor.root.style.width === '480px')
    expect(anchor.root.style.width).toBe('480px')
    expect(anchor.root.style.maxWidth).toBe('')
  })
})

describe('txBaseAnchor rendered motion', () => {
  it.each(['transfer', 'boom', 'opacity', 'expand'] as const)('runs an authored spring and CSS bezier through real %s motion', async (type) => {
    const anchor = mountAnchor({
      modelValue: false,
      animation: { type, duration: 400, closeDuration: 240, ease: 'spring(10, 0.6)', closeEase: 'cubic-bezier(0.4, 0, 1, 1)', scale: 0.8, opacity: 0, distance: 20 },
    })
    const { timeline: open } = await openTimeline(anchor)
    open.progress(0.125)
    const springProgress = createSpringEase(10, 0.6)(0.125)
    const sample = type === 'opacity'
      ? Number.parseFloat(anchor.content.style.opacity)
      : Number(gsap.getProperty(anchor.content, 'scaleX'))
    expect(sample).toBeCloseTo(type === 'opacity' ? springProgress : 0.8 + 0.2 * springProgress, 4)
    let peak = 0
    for (let index = 1; index < 40; index++) {
      open.progress(index / 40)
      const value = type === 'opacity'
        ? Number.parseFloat(anchor.content.style.opacity)
        : Number(gsap.getProperty(anchor.content, 'scaleX'))
      peak = Math.max(peak, value)
    }
    if (type !== 'opacity')
      expect(peak).toBeGreaterThan(1)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.progress(0.5)
    const eased = createCubicBezier(0.4, 0, 1, 1)(0.5)
    const value = type === 'opacity'
      ? Number.parseFloat(anchor.content.style.opacity)
      : Number(gsap.getProperty(anchor.content, 'scaleX'))
    expect(value).toBeCloseTo(type === 'opacity' ? 1 - eased : 1 - 0.2 * eased, 4)
  })

  it('uses native GSAP easing for the real box rather than replacing it with the spring parser', async () => {
    const anchor = mountAnchor({ modelValue: false, animation: { type: 'expand', duration: 400, closeDuration: 240, ease: 'back.out(2)', closeEase: 'power3.in', scale: 0.8, opacity: 0 } })
    const { timeline: open } = await openTimeline(anchor)
    open.progress(0.5)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(146 * gsap.parseEase('back.out(2)')(0.5), 4)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.progress(0.5)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(146 * (1 - gsap.parseEase('power3.in')(0.5)), 4)
  })

  it.each([
    { type: 'drip', placement: 'left' },
    { type: 'bead', placement: 'right' },
  ] as const)('renders a safe fade for $type on a $placement placement', async ({ type, placement }) => {
    const anchor = mountAnchor({ modelValue: false, placement, animation: { type, duration: 400, closeDuration: 240, opacity: 0 } })
    const { timeline: open } = await openTimeline(anchor)
    open.progress(0.5)
    expect(anchor.root.querySelector('.tx-base-anchor__liquid')).toBeNull()
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeGreaterThan(0)
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeLessThan(1)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.progress(0.5)
    expect(anchor.clip.style.visibility).toBe('visible')
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeGreaterThan(0)
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeLessThan(1)
    close.progress(1)
    await drain()
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
  })

  it.each(['bottom', 'top'] as const)('grows and collapses a measured %s box while fading inside its card', async (placement) => {
    const anchor = mountAnchor({
      modelValue: false,
      placement,
      animation: { type: 'expand', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none', scale: 0.8, distance: 20, opacity: 0 },
    })
    const { timeline: open } = await openTimeline(anchor)
    open.progress(0.5)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(73)
    expect(Number.parseFloat(anchor.body.style.opacity)).toBeCloseTo(0.5)
    expect(Number(anchor.content.style.opacity || '1')).toBe(1)
    if (placement === 'top')
      expect(Number.parseFloat(anchor.clip.style.transform.match(/translateY\(([-\d.]+)px\)/)![1]!) + Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(146)

    // Late slot layout must move the landing target, not snap only at completion.
    anchor.setHeight(200)
    open.progress(0.75)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(150)
    if (placement === 'top')
      expect(Number.parseFloat(anchor.clip.style.transform.match(/translateY\(([-\d.]+)px\)/)![1]!) + Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(200)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.progress(0.5)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(100)
    expect(Number.parseFloat(anchor.body.style.opacity)).toBeCloseTo(0.5)
    if (placement === 'top')
      expect(Number.parseFloat(anchor.clip.style.transform.match(/translateY\(([-\d.]+)px\)/)![1]!) + Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(200)
    close.progress(1)
    await drain()
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
  })

  it.each(['drip', 'bead'] as const)('seeds %s inside the reference and remeasures live panel geometry', async (type) => {
    const animation: BaseAnchorAnimationOptions = { type, duration: 400, closeDuration: 240, ease: 'linear', closeEase: 'linear', seedHeight: 12 }
    const anchor = mountAnchor({ modelValue: false, animation })
    let panelTop = 148
    let panelWidth = 480
    // jsdom layout is supplied at the DOM boundary. Keep offsetWidth and the
    // bounding rect coherent: the live liquid measurement consumes both.
    for (const element of [anchor.root, anchor.content])
      Object.defineProperty(element, 'offsetWidth', { configurable: true, get: () => panelWidth })
    vi.mocked(anchor.root.getBoundingClientRect).mockImplementation(() => rect(40, panelTop, panelWidth, 146))
    await anchor.wrapper.setProps({ modelValue: true })
    const stage = anchor.root.querySelector<HTMLElement>('.tx-base-anchor__liquid')!
    await until(() => stage.style.visibility === 'visible')
    const panel = anchor.root.querySelector<SVGRectElement>('.tx-base-anchor__liquid-goo defs g rect:nth-of-type(2)')!
    const ghost = anchor.root.querySelector<SVGRectElement>('.tx-base-anchor__liquid-goo defs g rect')!
    const seedTop = Number(panel.getAttribute('y')) + 48
    const seedHeight = Number(panel.getAttribute('height'))
    expect(seedHeight).toBeCloseTo(12)
    expect(seedTop).toBeGreaterThanOrEqual(0)
    expect(seedTop + seedHeight).toBeLessThanOrEqual(40)

    panelTop = 168
    panelWidth = 520
    await frame(200)
    // A bead is still pinched at this timestamp. Its symmetric visible span
    // must nevertheless be derived from the NEW measured width, not the old one.
    expect(Number(panel.getAttribute('width')) + 2 * Number(panel.getAttribute('x'))).toBeCloseTo(520)
    expect(Number(ghost.getAttribute('y'))).toBeCloseTo(-69)
    expect(Number(panel.getAttribute('height'))).toBeGreaterThan(seedHeight)
    expect(Number(panel.getAttribute('height'))).toBeLessThan(146)
    await frame(200)
    expect(Number(panel.getAttribute('height'))).toBe(146)
    expect(Number(panel.getAttribute('width'))).toBe(520)
    expect(Number(panel.getAttribute('x'))).toBe(0)
    expect(Number(panel.getAttribute('y'))).toBe(0)
    expect(Number(ghost.getAttribute('y'))).toBeCloseTo(-69)
  })
})
