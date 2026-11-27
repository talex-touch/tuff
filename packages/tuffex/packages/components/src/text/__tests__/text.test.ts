import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxText from '../src/TxText.vue'

function mockTextMetrics(containerWidth: number, pxPerChar = 8) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(containerWidth)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('tx-text__measure')) {
      const w = (this.textContent?.length ?? 0) * pxPerChar
      return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    }
    return { width: containerWidth, height: 20, top: 0, left: 0, right: containerWidth, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
}

function parseTranslateX(el: HTMLElement): number {
  const m = el.style.transform.match(/translate3d\(([-\d.]+)px/)
  return m ? Number.parseFloat(m[1]!) : Number.NaN
}

describe('TxText', () => {
  let rafQueue: Array<(now: number) => void> = []
  let nowMs = 0

  beforeEach(() => {
    vi.useFakeTimers()
    rafQueue = []
    nowMs = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      rafQueue = []
    })
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function stepFrame(deltaMs: number) {
    nowMs += deltaMs
    const pending = rafQueue.splice(0, rafQueue.length)
    for (const cb of pending)
      cb(nowMs)
    await nextTick()
  }

  it('keeps start-truncated text pixel-aligned on hover and cross-fades the ellipsis smoothly', async () => {
    const sample = '/Users/talex/Workspace/tuffex/packages/components/src/text/TxText.vue'
    // 69 chars * 8px = 552px full width inside 200px container -> displayText = 25 chars (200px)
    mockTextMetrics(200, 8)

    const wrapper = mount(TxText, {
      props: { text: sample, overflow: 'start', scroll: 'hover' },
    })
    await nextTick()

    const valueEl = wrapper.get('.tx-text__value')
    expect(valueEl.text().startsWith('…')).toBe(true)
    expect(wrapper.find('.tx-text__viewport').exists()).toBe(false)

    // Hover triggers soft cross-fade while keeping `.tx-text__value` mounted in flow
    await wrapper.get('.tx-text').trigger('pointerenter', { pointerType: 'mouse' })
    await nextTick()

    expect(wrapper.find('.tx-text__value').exists()).toBe(true)
    const viewport = wrapper.get('.tx-text__viewport')
    expect(viewport.classes()).not.toContain('is-visible')

    // Track starts aligned to exact subpixel rest offset (-(552 - 200) = -352)
    const trackEl = wrapper.get('.tx-text__track--hover').element as HTMLElement
    expect(parseTranslateX(trackEl)).toBe(-352)

    // First rAF flips opacity cross-fade on (ellipsis fades out, track fades in)
    await stepFrame(16)
    expect(wrapper.get('.tx-text__value').classes()).toContain('is-faded')
    expect(wrapper.get('.tx-text__viewport').classes()).toContain('is-visible')
    expect(viewport.attributes('style')).toContain('mask-image')

    // Advance past the 70ms ellipsis-dissolve lead-in and measure velocity over equal frames
    vi.advanceTimersByTime(70)
    await stepFrame(50)
    const x1 = parseTranslateX(trackEl)
    await stepFrame(50)
    const x2 = parseTranslateX(trackEl)
    await stepFrame(50)
    const x3 = parseTranslateX(trackEl)

    // Constant linear velocity: 48 px/s * 0.05s = +2.4px per 50ms frame
    expect(x2 - x1).toBeCloseTo(2.4, 1)
    expect(x3 - x2).toBeCloseTo(2.4, 1)
    expect(x3 - x2).toBeCloseTo(x2 - x1, 2)

    wrapper.unmount()
  })

  it('glides back at constant linear speed on pointer leave and cross-fades the ellipsis back in', async () => {
    const sample = 'Quarterly-financial-report-final-version-v3.pdf'
    mockTextMetrics(160, 8)

    const wrapper = mount(TxText, {
      props: { text: sample, overflow: 'end', scroll: 'hover' },
    })
    await nextTick()

    await wrapper.get('.tx-text').trigger('pointerenter', { pointerType: 'mouse' })
    await nextTick()
    await stepFrame(16)
    vi.advanceTimersByTime(70)
    await stepFrame(50)
    await stepFrame(50)

    const trackEl = wrapper.get('.tx-text__track--hover').element as HTMLElement
    const scrolledX = parseTranslateX(trackEl)
    expect(scrolledX).toBeLessThan(0)

    // Leave mid-scroll -> returns smoothly at constant 140 px/s without crawling
    await wrapper.get('.tx-text').trigger('pointerleave', { pointerType: 'mouse' })
    await stepFrame(50)
    expect(parseTranslateX(trackEl)).toBe(0)
    // Cross-fade back: ellipsis returns to full opacity while track fades out
    expect(wrapper.get('.tx-text__value').classes()).not.toContain('is-faded')
    expect(wrapper.get('.tx-text__viewport').classes()).not.toContain('is-visible')

    vi.advanceTimersByTime(160)
    await nextTick()
    expect(wrapper.find('.tx-text__viewport').exists()).toBe(false)

    wrapper.unmount()
  })

  it('uses constant linear timing for auto scroll mode', async () => {
    mockTextMetrics(120, 8)
    const wrapper = mount(TxText, {
      props: { text: 'Quarterly-financial-report-final-version-v3.pdf', scroll: 'auto' },
    })
    await nextTick()

    expect(wrapper.get('.tx-text__track').classes()).toContain('is-animated')
    wrapper.unmount()
  })
})
