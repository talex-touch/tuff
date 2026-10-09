import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { ENTER_DURATION } from '../src/core/animate'
import { TxChart } from '../src/chart'
import { TxLineSeries } from '../src/series'

// width 400 / height 300 / padding 20 → plot x:20 y:20 w:360 h:260.
const frame = { width: 400, height: 300, padding: 20 }

interface Point { t: number, v: number }
// Two equal legs: the middle point sits halfway along the line.
const data: Point[] = [{ t: 0, v: 0 }, { t: 1, v: 10 }, { t: 2, v: 0 }]

let reduce = false

beforeEach(() => {
  reduce = false
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function mountLine(props: Record<string, unknown>) {
  return mount(TxChart, {
    props: { ...frame, yDomain: [0, 10] as [number, number], yNice: false },
    slots: { default: () => h(TxLineSeries<Point>, { data, x: 't', y: 'v', showSymbol: true, ...props }) },
  })
}

describe('txLineSeries draw enter', () => {
  it('traces the stroke along its length and brings each symbol in as the line reaches it', async () => {
    const wrapper = mountLine({ enter: 'draw' })
    await nextTick()
    const stroke = () => wrapper.find('path.tx-series__stroke')
    const pending = () => wrapper.findAll('circle.tx-series__symbol').map(c => c.classes().includes('is-pending'))

    expect(stroke().attributes('pathLength')).toBe('1')
    expect(stroke().attributes('stroke-dasharray')).toBe('1 1')
    // The plot is not wiped open: the stroke itself does the revealing.
    expect(wrapper.find('clipPath[id^="tx-line-enter"] rect').attributes('width')).toBe('360')

    vi.advanceTimersByTime(ENTER_DURATION * 0.15)
    await nextTick()
    const early = Number(stroke().attributes('stroke-dashoffset'))
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(1)
    // Past the first point, short of the middle one.
    expect(pending()).toEqual([false, true, true])

    vi.advanceTimersByTime(ENTER_DURATION)
    await nextTick()
    // Done: no dash left behind to clip a later update, every symbol shown.
    expect(stroke().attributes('pathLength')).toBeUndefined()
    expect(stroke().attributes('stroke-dasharray')).toBeUndefined()
    expect(pending()).toEqual([false, false, false])
  })

  it('keeps the clip wipe by default and for a dashed stroke', async () => {
    for (const props of [{}, { enter: 'draw', dashed: true }]) {
      const wrapper = mountLine(props)
      await nextTick()
      vi.advanceTimersByTime(ENTER_DURATION * 0.5)
      await nextTick()
      expect(Number(wrapper.find('clipPath[id^="tx-line-enter"] rect').attributes('width'))).toBeLessThan(360)
      expect(wrapper.find('path.tx-series__stroke').attributes('pathLength')).toBeUndefined()
      wrapper.unmount()
      vi.advanceTimersByTime(ENTER_DURATION)
    }
  })

  it('draws nothing under reduced motion', async () => {
    reduce = true
    const wrapper = mountLine({ enter: 'draw' })
    await nextTick()
    expect(wrapper.find('path.tx-series__stroke').attributes('stroke-dasharray')).toBeUndefined()
    expect(wrapper.findAll('circle.is-pending')).toHaveLength(0)
  })
})
