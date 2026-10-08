import type { BaseAnchorAnimationOptions } from '../src/types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import gsap from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { EXPAND_BOUNCE_PX, expandBounceBudget, expandSpringFor } from '../src/base-anchor-motion'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

const CardStub = defineComponent({ name: 'TxCard', template: '<div><slot /></div>' })
const mountedAnchors: VueWrapper[] = []
const timelines: gsap.core.Timeline[] = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let now = 1000

interface AnchorFixture {
  wrapper: VueWrapper
  root: HTMLElement
  content: HTMLElement
  clip: HTMLElement
}

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

function mountAnchor(animation: BaseAnchorAnimationOptions): AnchorFixture {
  const wrapper = mount(TxBaseAnchor, {
    attachTo: document.body,
    props: {
      modelValue: false,
      eager: true,
      keepAliveContent: true,
      width: 480,
      placement: 'bottom',
      disableFlip: true,
      showArrow: false,
      panelBackground: 'pure',
      virtualReference: { getBoundingClientRect: () => rect(40, 100, 200, 40) },
      animation,
    },
    slots: { reference: '<button>Reference</button>', default: '<button class="panel-action">Panel action</button>' },
    global: { stubs: { TxCard: CardStub } },
  })
  mountedAnchors.push(wrapper)
  const root = document.body.querySelector<HTMLElement>('.tx-base-anchor')!
  const content = root.querySelector<HTMLElement>('.tx-base-anchor__content')!
  const clip = root.querySelector<HTMLElement>('.tx-base-anchor__clip')!
  const body = root.querySelector<HTMLElement>('.tx-base-anchor__body')
  for (const element of [root, content, body].filter(Boolean) as HTMLElement[]) {
    Object.defineProperty(element, 'offsetWidth', { configurable: true, get: () => 480 })
    Object.defineProperty(element, 'offsetHeight', { configurable: true, get: () => 146 })
  }
  vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(40, 148, 480, 146))
  return { wrapper, root, content, clip }
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

describe('base anchor animation phases', () => {
  it('opens as boom but closes as a measured expand box on the separately authored clock', async () => {
    const anchor = mountAnchor({ type: 'boom', closeType: 'expand', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none', scale: 0.8, blur: 10, opacity: 0 })
    const { timeline: open } = await openTimeline(anchor)
    open.time(0.2)
    expect(Number(gsap.getProperty(anchor.content, 'scaleX'))).toBeCloseTo(0.9)
    expect(anchor.content.style.filter).toBe('blur(5px)')
    expect(anchor.clip.style.height).toBe('')
    open.progress(1)
    await drain()

    const { timeline: close } = await closeTimeline(anchor)
    close.time(0.12)
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(73)
    expect(anchor.clip.style.visibility).toBe('visible')
    close.time(0.24)
    await drain()
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
    expect(anchor.root.querySelector('.panel-action')?.textContent).toBe('Panel action')
  })

  it.each([
    { name: 'partial exit keeps the explicitly shared blur and opacity', exit: { scale: 0.6 }, blur: 5, opacity: 0.6 },
    { name: 'named exit fields beat the explicitly shared fields', exit: { scale: 0.6, blur: 4, opacity: 0.4 }, blur: 2, opacity: 0.7 },
  ])('$name without changing the opening geometry', async ({ exit, blur, opacity }) => {
    const anchor = mountAnchor({ type: 'boom', closeType: 'boom', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none', scale: 0.8, blur: 10, opacity: 0.2, exit })
    const { timeline: open } = await openTimeline(anchor)
    open.time(0.2)
    expect(Number(gsap.getProperty(anchor.content, 'scaleX'))).toBeCloseTo(0.9)
    expect(anchor.content.style.filter).toBe('blur(5px)')
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeCloseTo(0.6)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.time(0.12)
    expect(Number(gsap.getProperty(anchor.content, 'scaleX'))).toBeCloseTo(0.8)
    expect(Number.parseFloat(anchor.content.style.filter.match(/blur\(([-\d.]+)px\)/)![1]!)).toBeCloseTo(blur)
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeCloseTo(opacity)
  })

  it('keeps invalid exit geometry from mirroring the panel, blurring below zero or prematurely hiding it', async () => {
    const anchor = mountAnchor({ type: 'boom', closeType: 'boom', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none', exit: { scale: -5, blur: -3, opacity: -2 } })
    const { timeline: open } = await openTimeline(anchor)
    open.progress(1)
    await drain()
    const { timeline: close } = await closeTimeline(anchor)
    close.time(0.12)
    const scale = Number(gsap.getProperty(anchor.content, 'scaleX'))
    expect(scale).toBeGreaterThan(0)
    expect(scale).toBeLessThan(1)
    expect(anchor.content.style.filter).toBe('blur(0px)')
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeCloseTo(0.5)
  })

  it.each([
    { type: 'drip', closeType: 'expand' },
    { type: 'boom', closeType: 'bead' },
    { type: 'drip', closeType: 'bead' },
  ] as const)('rejects $type/$closeType with a diagnostic and a complete symmetric rendered close', async ({ type, closeType }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const anchor = mountAnchor({ type, closeType, duration: 400, closeDuration: 240, ease: 'linear', closeEase: 'linear', scale: 0.8, blur: 10, opacity: 0 })
    if (type === 'boom') {
      const { timeline: open } = await openTimeline(anchor)
      open.progress(1)
      await drain()
      const { timeline: close } = await closeTimeline(anchor)
      close.progress(0.5)
      expect(anchor.clip.style.height).toBe('')
      expect(Number(gsap.getProperty(anchor.content, 'scaleX'))).toBeLessThan(1)
      close.progress(1)
      await drain()
    }
    else {
      const stage = anchor.root.querySelector<HTMLElement>('.tx-base-anchor__liquid')!
      const panel = anchor.root.querySelector<SVGRectElement>('.tx-base-anchor__liquid-goo defs g rect:nth-of-type(2)')!
      await anchor.wrapper.setProps({ modelValue: true })
      await until(() => stage.style.visibility === 'visible')
      await frame(400)
      expect(Number(panel.getAttribute('height'))).toBe(146)
      await anchor.wrapper.setProps({ modelValue: false })
      await frame(120)
      expect(stage.style.visibility).toBe('visible')
      expect(Number(panel.getAttribute('height'))).toBeGreaterThan(0)
      expect(Number(panel.getAttribute('height'))).toBeLessThan(146)
      await frame(120)
      expect(stage.style.visibility).toBe('hidden')
    }
    expect(getComputedStyle(anchor.root).visibility).toBe('hidden')
    expect(anchor.clip.style.visibility).toBe('hidden')
    expect(warn.mock.calls.map(([message]) => String(message)).join('\n')).toContain(`animation.closeType "${closeType}" cannot pair with type "${type}"`)
  })
})

/** Steps an open timeline and reads the box: its tallest frame, and when it first reaches full size. */
function sampleBox(anchor: AnchorFixture, open: gsap.core.Timeline, natural: number) {
  let peak = 0
  let firstFull = Number.POSITIVE_INFINITY
  for (let ms = 0; ms <= 400; ms += 2) {
    open.time(ms / 1000)
    const height = Number.parseFloat(anchor.clip.style.height)
    // The last frame completes the run, and settling clears the inline box.
    if (!Number.isFinite(height))
      continue
    peak = Math.max(peak, height)
    if (height >= natural && firstFull === Number.POSITIVE_INFINITY)
      firstFull = ms
  }
  return { overshoot: peak - natural, firstFull }
}

describe('expand bounce budget', () => {
  it('keeps the base spring where its overshoot already fits the budget', () => {
    expect(expandSpringFor(48)).toEqual({ omega: 10, zeta: 0.6 })
    expect(expandSpringFor(0)).toEqual({ omega: 10, zeta: 0.6 })
  })

  it('holds the budget flat up to three rows and grows it with the square root past them', () => {
    expect(expandBounceBudget(48)).toBe(EXPAND_BOUNCE_PX)
    expect(expandBounceBudget(130)).toBe(EXPAND_BOUNCE_PX)
    // Five rows and ten rows of the docs harness menu.
    expect(expandBounceBudget(206)).toBeCloseTo(7.55, 2)
    expect(expandBounceBudget(394)).toBeCloseTo(10.45, 2)
    // Still nowhere near the proportional ~10% it replaced (20px and 38px).
    expect(expandBounceBudget(394) / 394).toBeLessThan(0.03)
  })

  it('damps taller panels down to the budget and keeps the crossing time', () => {
    const crossing = ({ omega, zeta }: { omega: number, zeta: number }) =>
      (Math.PI - Math.acos(zeta)) / (omega * Math.sqrt(1 - zeta * zeta))
    const base = crossing(expandSpringFor(48))

    for (const height of [130, 260, 420]) {
      const spring = expandSpringFor(height)
      const overshoot = Math.exp(-spring.zeta * Math.PI / Math.sqrt(1 - spring.zeta ** 2))
      expect(overshoot * height).toBeCloseTo(expandBounceBudget(height), 5)
      expect(crossing(spring)).toBeCloseTo(base, 5)
    }
  })

  it('stretches a tall default panel by the budget, reaching full size on the same beat', async () => {
    const anchor = mountAnchor({ type: 'expand' })
    const { timeline: open } = await openTimeline(anchor)
    const { overshoot, firstFull } = sampleBox(anchor, open, 146)

    // One bounce still — just not ~10% of the panel (14px here).
    expect(overshoot).toBeGreaterThan(expandBounceBudget(146) - 0.5)
    expect(overshoot).toBeLessThan(expandBounceBudget(146) + 0.5)
    // spring(10, 0.6) first reaches its target at ~111ms of 400.
    expect(firstFull).toBeGreaterThanOrEqual(104)
    expect(firstFull).toBeLessThanOrEqual(118)
  })

  it('runs a pinned ease as written', async () => {
    const anchor = mountAnchor({ type: 'expand', ease: 'spring(10, 0.6)' })
    const { timeline: open } = await openTimeline(anchor)
    const { overshoot } = sampleBox(anchor, open, 146)

    expect(overshoot).toBeGreaterThan(13)
  })
})
