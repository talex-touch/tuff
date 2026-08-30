import type { TimeseriesData } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { TxTimeseriesChart } from '../index'

const H = Date.UTC(2026, 0, 1)
const HOUR = 3_600_000

const twoSeries: TimeseriesData[] = [
  { name: 'Requests', data: [[H, 10], [H + HOUR, 20], [H + 2 * HOUR, 15]] },
  { name: 'Errors', data: [[H, 1], [H + HOUR, 2], [H + 2 * HOUR, 3]] },
]

describe('txTimeseriesChart', () => {
  it('renders one line path per visible series with stable palette colors', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400 } as never,
    })
    await nextTick()
    const strokes = wrapper.findAll('path.tx-series__stroke')
    expect(strokes).toHaveLength(2)
    expect(strokes[0]!.attributes('stroke')).toBe('var(--tx-chart-categorical-1, #4290F0)')
    expect(strokes[1]!.attributes('stroke')).toBe('var(--tx-chart-categorical-2, #F5B647)')
  })

  it('keeps remaining series colors stable when one is hidden', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400, hiddenSeries: ['Requests'] } as never,
    })
    await nextTick()
    const strokes = wrapper.findAll('path.tx-series__stroke')
    expect(strokes).toHaveLength(1)
    // Errors is the second series and keeps slot 2 even with Requests hidden.
    expect(strokes[0]!.attributes('stroke')).toBe('var(--tx-chart-categorical-2, #F5B647)')
  })

  it('dims non-highlighted series to 30% opacity', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400, highlightedSeries: 'Errors' } as never,
    })
    await nextTick()
    const groups = wrapper.findAll('g.tx-series--line')
    expect(groups[0]!.attributes('opacity')).toBe('0.3')
    expect(groups[1]!.attributes('opacity')).toBeUndefined()
  })

  it('renders stacked bars in bar mode', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, type: 'bar', width: 400 } as never,
    })
    await nextTick()
    const rects = wrapper.findAll('rect.tx-series__bar')
    expect(rects).toHaveLength(6)
  })

  it('renders markers, thresholds and dashed incomplete segments', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: {
        data: twoSeries,
        width: 400,
        markers: [{ timestamp: H + HOUR, label: 'Deploy' }],
        thresholds: [{ value: 18, label: 'SLO', color: '#FC574A' }],
        incomplete: { after: H + 2 * HOUR },
      } as never,
    })
    await nextTick()
    expect(wrapper.findAll('.tx-ts-annotations__marker-line')).toHaveLength(1)
    expect(wrapper.find('.tx-ts-annotations__marker-label').text()).toBe('Deploy')
    expect(wrapper.findAll('.tx-ts-annotations__threshold-line')).toHaveLength(1)
    // Each series gets a dashed tail segment.
    const dashed = wrapper.findAll('path.tx-series__stroke[stroke-dasharray]')
    expect(dashed).toHaveLength(2)
  })

  it('switches to gradient area series when requested', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, gradient: true, width: 400 } as never,
    })
    await nextTick()
    expect(wrapper.findAll('.tx-series--area')).toHaveLength(2)
    expect(wrapper.findAll('linearGradient').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the skeleton instead of the chart while loading', () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, loading: true, width: 400 } as never,
    })
    expect(wrapper.find('.tx-ts-skeleton').exists()).toBe(true)
    expect(wrapper.find('svg.tx-chart__svg').exists()).toBe(false)
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })

  it('mounts the brush only when a time-range listener is attached', async () => {
    const plain = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400 } as never,
    })
    await nextTick()
    expect(plain.find('.tx-ts-brush').exists()).toBe(false)

    const ranges: Array<[number, number]> = []
    const brushed = mount(TxTimeseriesChart, {
      props: {
        data: twoSeries,
        width: 400,
        onTimeRangeChange: (from: number, to: number) => ranges.push([from, to]),
      } as never,
    })
    await nextTick()
    const capture = brushed.find('.tx-ts-brush__capture')
    expect(capture.exists()).toBe(true)

    await capture.trigger('pointerdown', { button: 0, clientX: 100, clientY: 50 })
    await capture.trigger('pointermove', { clientX: 200, clientY: 50 })
    expect(brushed.find('.tx-ts-brush__selection').exists()).toBe(true)
    await capture.trigger('pointerup', { clientX: 200, clientY: 50 })

    expect(ranges).toHaveLength(1)
    const [from, to] = ranges[0]!
    expect(from).toBeLessThan(to)
    expect(from).toBeGreaterThanOrEqual(H)
    expect(to).toBeLessThanOrEqual(H + 2 * HOUR)
  })

  it('opens the tooltip with formatted rows while hovering the plot', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: {
        data: twoSeries,
        width: 400,
        tooltipValueFormat: (value: number) => `${value} rps`,
      } as never,
    })
    await nextTick()
    await wrapper.find('.tx-chart').trigger('pointermove', { clientX: 200, clientY: 100 })
    const tooltip = wrapper.find('.tx-chart-tooltip')
    expect(tooltip.attributes('style')).not.toContain('display: none')
    expect(tooltip.text()).toContain('Requests')
    expect(tooltip.text()).toContain('rps')
  })
})
