// @vitest-environment jsdom
import type { MorphBoxFrame, UseMorphBoxOptions, UseMorphBoxReturn } from '../use-morph-box'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useMorphBox } from '../use-morph-box'

// jsdom has no layout and no ResizeObserver. The stub hands the engine what a
// browser would: the content's border box, delivered after "layout".
let observerCallback: ResizeObserverCallback | null = null
class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    observerCallback = callback
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

function mountEngine(options: UseMorphBoxOptions = {}, boxStyle: Record<string, string> = { padding: '4px 6px', boxSizing: 'border-box' }) {
  let api!: UseMorphBoxReturn
  const frames: MorphBoxFrame[] = []
  const box = ref<HTMLElement | null>(null)
  const content = ref<HTMLElement | null>(null)
  const Host = defineComponent({
    setup() {
      api = useMorphBox(box, content, { ...options, onFrame: frame => frames.push(frame) })
      return () => h('div', { ref: box, style: options.width === false ? undefined : boxStyle }, [h('div', { ref: content })])
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  const resize = (width: number, height: number) => {
    const el = content.value!
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
    observerCallback?.([{ target: el, borderBoxSize: [{ inlineSize: width, blockSize: height }] } as unknown as ResizeObserverEntry], {} as ResizeObserver)
  }
  return { api, frames, box, wrapper, resize }
}

const px = (value: string) => Number.parseFloat(value)

describe('useMorphBox', () => {
  let originalObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.ResizeObserver = originalObserver as typeof ResizeObserver
    observerCallback = null
  })

  it('takes the first measurement as it is', () => {
    const { api, box, resize, wrapper } = mountEngine()
    resize(100, 30)
    expect(api.morphing.value).toBe(false)
    expect(box.value!.style.width).toBe('')
    wrapper.unmount()
  })

  it('pins the old size before the new one can paint, then springs to it and returns to auto', () => {
    const { api, box, frames, resize, wrapper } = mountEngine()
    resize(100, 30)
    resize(200, 60)

    // Same tick, no frame yet: the box shows its old size plus its padding (6+6, 4+4).
    expect(api.morphing.value).toBe(true)
    expect(px(box.value!.style.width)).toBe(112)
    expect(px(box.value!.style.height)).toBe(38)

    let peak = 0
    for (let i = 0; i < 120 && api.morphing.value; i++) {
      vi.advanceTimersByTime(16)
      if (box.value!.style.width)
        peak = Math.max(peak, px(box.value!.style.width))
    }
    expect(api.morphing.value).toBe(false)
    // The default spring overshoots once, by a few percent of the travel, never more.
    expect(peak).toBeGreaterThan(212)
    expect(peak).toBeLessThan(212 + 100 * 0.05)
    // Landed: the inline size is gone, the box is auto again, and that was said once.
    expect(box.value!.style.width).toBe('')
    expect(box.value!.style.height).toBe('')
    expect(frames.filter(f => f.settled)).toEqual([{ width: 212, height: 68, settled: true }])
    wrapper.unmount()
  })

  it('retargets mid-flight without a jump and keeps its momentum', () => {
    const { api, box, resize, wrapper } = mountEngine()
    resize(100, 30)
    resize(300, 30)
    for (let i = 0; i < 5; i++)
      vi.advanceTimersByTime(16)
    const before = px(box.value!.style.width)
    vi.advanceTimersByTime(16)
    const moving = px(box.value!.style.width) - before
    expect(moving).toBeGreaterThan(0)

    // The content shrinks back while the box is still growing.
    const atRetarget = px(box.value!.style.width)
    resize(150, 30)
    expect(px(box.value!.style.width)).toBe(atRetarget) // no jump on the change itself
    vi.advanceTimersByTime(16)
    // It keeps travelling outward for a moment (velocity carried), not snapping back.
    expect(px(box.value!.style.width)).toBeGreaterThan(atRetarget)

    for (let i = 0; i < 200 && api.morphing.value; i++)
      vi.advanceTimersByTime(16)
    expect(api.morphing.value).toBe(false)
    expect(box.value!.style.width).toBe('')
    wrapper.unmount()
  })

  it('starts from the padding the box had at rest when the padding changes with the content', () => {
    const { box, resize, wrapper } = mountEngine()
    resize(100, 30)
    box.value!.style.padding = '10px 20px'
    resize(200, 60)
    // The old content inside the old padding (6+6, 4+4), not inside the new one.
    expect(px(box.value!.style.width)).toBe(112)
    expect(px(box.value!.style.height)).toBe(38)
    for (let i = 0; i < 200 && box.value!.style.width; i++)
      vi.advanceTimersByTime(16)
    expect(box.value!.style.width).toBe('')
    wrapper.unmount()
  })

  it('writes a content-box box its size without the padding', () => {
    const { box, resize, wrapper } = mountEngine({}, { padding: '4px 6px', boxSizing: 'content-box' })
    resize(100, 30)
    resize(200, 60)
    expect(px(box.value!.style.width)).toBe(100)
    expect(px(box.value!.style.height)).toBe(30)
    wrapper.unmount()
  })

  it('springs only the axes it is given', () => {
    const { box, resize, wrapper } = mountEngine({ width: false })
    resize(100, 30)
    resize(200, 90)
    expect(box.value!.style.width).toBe('')
    expect(px(box.value!.style.height)).toBe(30)
    wrapper.unmount()
  })

  it('follows the content without motion when reduced motion is asked for', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    try {
      const { api, box, resize, wrapper } = mountEngine()
      resize(100, 30)
      resize(200, 60)
      expect(api.morphing.value).toBe(false)
      expect(box.value!.style.width).toBe('')
      wrapper.unmount()
    }
    finally {
      window.matchMedia = original
    }
  })

  it('lands at once when it is turned off mid-flight', async () => {
    const enabled = ref(true)
    const { api, box, resize, wrapper } = mountEngine({ enabled })
    resize(100, 30)
    resize(200, 60)
    vi.advanceTimersByTime(16)
    expect(api.morphing.value).toBe(true)
    enabled.value = false
    await nextTick()
    expect(api.morphing.value).toBe(false)
    expect(box.value!.style.width).toBe('')
    wrapper.unmount()
  })

  it('lands at once on settle()', () => {
    const { api, box, resize, wrapper } = mountEngine()
    resize(100, 30)
    resize(200, 60)
    vi.advanceTimersByTime(16)
    api.settle()
    expect(api.morphing.value).toBe(false)
    expect(box.value!.style.width).toBe('')
    wrapper.unmount()
  })
})
