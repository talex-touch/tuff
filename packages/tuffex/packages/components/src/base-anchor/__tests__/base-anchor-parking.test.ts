import type { BaseAnchorAnimationOptions } from '../src/types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import gsap from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxBaseAnchor from '../src/TxBaseAnchor.vue'

const CardStub = defineComponent({
  name: 'TxCard',
  template: '<div><slot /></div>',
})

const mountedAnchors: Array<{ unmount: () => void }> = []
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
  const pending = [...frames.entries()]
  for (const [id, callback] of pending) {
    if (!frames.delete(id))
      continue
    callback(now)
  }
  await drain()
}

// Wait on rendered state, not a real-clock delay. The cap reports a stalled
// positioning/import pipeline instead of silently asserting before it runs.
async function until(predicate: () => boolean) {
  await vi.dynamicImportSettled()
  await drain()
  for (let index = 0; index < 12 && !predicate(); index++)
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
      virtualReference: { getBoundingClientRect: () => rect(40, 100, 200, 40) },
      animation,
    },
    slots: {
      reference: '<button>Reference</button>',
      default: '<button class="panel-action">Panel action</button>',
    },
    global: { stubs: { TxCard: CardStub } },
  })
  mountedAnchors.push(wrapper)
  const root = document.body.querySelector<HTMLElement>('.tx-base-anchor')!
  const content = root.querySelector<HTMLElement>('.tx-base-anchor__content')!
  const clip = root.querySelector<HTMLElement>('.tx-base-anchor__clip')!

  // jsdom supplies no layout. Feed measured dimensions at the DOM boundary;
  // floating-ui, Vue rendering, SVG measurement and the motion engine stay real.
  for (const element of [root, content]) {
    Object.defineProperty(element, 'offsetWidth', { configurable: true, get: () => Number.parseFloat(root.style.width) || 480 })
    Object.defineProperty(element, 'offsetHeight', { configurable: true, get: () => 146 })
  }
  vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => rect(40, 148, root.offsetWidth, 146))
  return { wrapper, root, content, clip }
}

function expectParked(root: HTMLElement) {
  const style = getComputedStyle(root)
  expect(style.visibility).toBe('hidden')
  expect(style.display).not.toBe('none')
}

function expectPositioned(root: HTMLElement) {
  const style = getComputedStyle(root)
  expect(style.visibility).toBe('visible')
  expect(style.transform).toMatch(/^translate\(/)
}

// GSAP timelines are thenables; box them so awaiting the fixture does not wait for playback.
async function openTimeline(anchor: AnchorFixture) {
  const count = timelines.length
  await anchor.wrapper.setProps({ modelValue: true })
  await until(() => timelines.length > count)
  const timeline = timelines.at(-1)!
  timeline.progress(1)
  await drain()
  expectPositioned(anchor.root)
  expect(anchor.clip.style.visibility).toBe('visible')
  return { timeline }
}

async function closeTimeline(anchor: AnchorFixture) {
  const count = timelines.length
  await anchor.wrapper.setProps({ modelValue: false })
  await until(() => timelines.length > count)
  const timeline = timelines.at(-1)!
  return { timeline }
}

describe('txBaseAnchor retained-root parking', () => {
  beforeEach(() => {
    now = 1000
    frameId = 0
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
    document.body.innerHTML = ''
  })

  it('parks an unopened eager panel without removing its measurable content, then restores positioning and sizing on reopen', async () => {
    const anchor = mountAnchor({ type: 'none' })
    await drain()
    await frame()
    expectParked(anchor.root)
    expect(getComputedStyle(anchor.content).display).not.toBe('none')
    expect(anchor.root.querySelector('.tx-base-anchor__outline')?.getAttribute('viewBox')).toBe('0 0 480 146')
    expect(anchor.root.querySelector('.panel-action')?.textContent).toBe('Panel action')

    await anchor.wrapper.setProps({ modelValue: true })
    await until(() => anchor.clip.style.visibility === 'visible')
    expectPositioned(anchor.root)
    const initialPosition = anchor.root.style.transform
    expect(anchor.root.style.width).toBe('480px')

    await anchor.wrapper.setProps({ modelValue: false })
    expectParked(anchor.root)
    await anchor.wrapper.setProps({ width: 520, modelValue: true })
    await until(() => anchor.clip.style.visibility === 'visible' && anchor.root.style.width === '520px')
    expectPositioned(anchor.root)
    expect(anchor.root.style.transform).toBe(initialPosition)
    expect(anchor.root.querySelector('.tx-base-anchor__outline')?.getAttribute('viewBox')).toBe('0 0 520 146')
  })

  it('keeps the retained panel positioned and visibly collapsing until the real leave timeline completes', async () => {
    const anchor = mountAnchor({ type: 'expand', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none' })
    await openTimeline(anchor)
    const { timeline: close } = await closeTimeline(anchor)
    close.progress(0.5)
    await drain()
    expectPositioned(anchor.root)
    expect(anchor.clip.style.visibility).toBe('visible')
    expect(Number.parseFloat(anchor.clip.style.height)).toBeCloseTo(73)

    close.progress(1)
    await drain()
    expectParked(anchor.root)
    expect(anchor.clip.style.visibility).toBe('hidden')
    expect(anchor.root.querySelector('.panel-action')?.textContent).toBe('Panel action')
  })

  it('ignores an old leave completion after rapid reopen, including during the next leave run', async () => {
    const anchor = mountAnchor({ type: 'opacity', duration: 400, closeDuration: 240, ease: 'none', closeEase: 'none' })
    await openTimeline(anchor)
    const { timeline: oldClose } = await closeTimeline(anchor)
    oldClose.progress(0.5)
    const queuedCompletion = oldClose.eventCallback('onComplete')!
    await openTimeline(anchor)

    // Deliver the real timeline's old completion as if it had already been
    // queued when cancellation occurred. Assert rendered state, not calls.
    queuedCompletion.call(oldClose)
    await drain()
    expectPositioned(anchor.root)
    expect(anchor.clip.style.visibility).toBe('visible')

    const { timeline: currentClose } = await closeTimeline(anchor)
    currentClose.progress(0.5)
    await drain()
    expectPositioned(anchor.root)
    expect(anchor.clip.style.visibility).toBe('visible')
    expect(Number.parseFloat(anchor.content.style.opacity)).toBeCloseTo(0.5)
    currentClose.progress(1)
    await drain()
    expectParked(anchor.root)
  })

  it.each(['expand', 'drip'] as const)('clears the retained root position when reduced motion snaps %s closed', async (type) => {
    vi.mocked(window.matchMedia).mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    const anchor = mountAnchor({ type, duration: 400, closeDuration: 240 })
    await anchor.wrapper.setProps({ modelValue: true })
    await until(() => anchor.clip.style.visibility === 'visible')
    expectPositioned(anchor.root)
    await anchor.wrapper.setProps({ modelValue: false })
    expectParked(anchor.root)
    expect(anchor.clip.style.visibility).toBe('hidden')
  })

  it.each(['drip', 'bead'] as const)('keeps %s leave geometry alive until its controlled frame loop settles', async (type) => {
    const anchor = mountAnchor({ type, duration: 400, closeDuration: 240, ease: 'linear', closeEase: 'linear' })
    const stage = anchor.root.querySelector<HTMLElement>('.tx-base-anchor__liquid')!
    const panel = anchor.root.querySelector<SVGRectElement>('.tx-base-anchor__liquid-goo defs g rect:nth-of-type(2)')!
    await anchor.wrapper.setProps({ modelValue: true })
    await until(() => stage.style.visibility === 'visible')
    await frame(400)
    const openHeight = Number(panel.getAttribute('height'))
    expect(openHeight).toBe(146)

    await anchor.wrapper.setProps({ modelValue: false })
    await frame(120)
    expectPositioned(anchor.root)
    expect(anchor.clip.style.visibility).toBe('visible')
    const leavingHeight = Number(panel.getAttribute('height'))
    expect(leavingHeight).toBeGreaterThan(0)
    expect(leavingHeight).toBeLessThan(openHeight)

    await frame(120)
    expectParked(anchor.root)
    expect(anchor.clip.style.visibility).toBe('hidden')
    expect(stage.style.visibility).toBe('hidden')
  })
})
