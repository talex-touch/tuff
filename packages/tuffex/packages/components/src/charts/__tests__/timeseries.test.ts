import type { TimeseriesData } from '../src/timeseries/src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { TxTimeseriesChart } from '../src/timeseries'

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

  it('dims non-highlighted series to the ECharts blur opacity', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400, highlightedSeries: 'Errors' } as never,
    })
    await nextTick()
    const groups = wrapper.findAll('g.tx-series--line')
    // ECharts blur leaves `fromState.opacity * 0.1` (src/util/states.ts).
    expect(groups[0]!.attributes('opacity')).toBe('0.1')
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

  it('dims the out-of-brush strips with a single mask over the series layer', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400, onTimeRangeChange: () => {} } as never,
    })
    await nextTick()
    expect(wrapper.find('mask').exists()).toBe(false)

    const capture = wrapper.find('.tx-ts-brush__capture')
    await capture.trigger('pointerdown', { button: 0, clientX: 100, clientY: 50 })
    await capture.trigger('pointermove', { clientX: 200, clientY: 50 })

    const mask = wrapper.find('defs mask')
    expect(mask.exists()).toBe(true)
    const rects = mask.findAll('rect')
    // White plot reveals the series; the two dark strips dim them (ECharts
    // `outOfBrush` via `brushStyle`, applied as luminance).
    expect(rects).toHaveLength(3)
    expect(rects[0]!.attributes('fill')).toBe('#ffffff')
    expect(rects[1]!.attributes('fill')).toBe('#4D4D4D')
    expect(rects[2]!.attributes('fill')).toBe('#4D4D4D')
    // Plot x=56 width=320, selection [100, 200].
    expect(rects[1]!.attributes('x')).toBe('56')
    expect(rects[1]!.attributes('width')).toBe('44')
    expect(rects[2]!.attributes('x')).toBe('200')
    expect(rects[2]!.attributes('width')).toBe('176')

    const masked = wrapper.find('g[mask]')
    expect(masked.attributes('mask')).toBe(`url(#${mask.attributes('id')})`)
    // The dim must not duplicate series — a second copy would steal palette
    // slots and re-register the extent.
    expect(masked.findAll('path.tx-series__stroke')).toHaveLength(2)

    await capture.trigger('pointerup', { clientX: 200, clientY: 50 })
    await nextTick()
    expect(wrapper.find('mask').exists()).toBe(false)
  })

  it('blurs the series the hovered timestamp is not on', async () => {
    const wrapper = mount(TxTimeseriesChart, {
      props: { data: twoSeries, width: 400 } as never,
    })
    await nextTick()
    expect(wrapper.findAll('g.tx-series--line')[1]!.attributes('opacity')).toBeUndefined()

    // Requests (10/20/15) sit near the value at y=45; Errors (1/2/3) do not.
    await wrapper.find('.tx-chart').trigger('pointermove', { clientX: 200, clientY: 45 })
    expect(wrapper.findAll('g.tx-series--line')[0]!.attributes('opacity')).toBeUndefined()
    expect(wrapper.findAll('g.tx-series--line')[1]!.attributes('opacity')).toBe('0.1')

    // Above the plot nothing is hovered, so nothing blurs.
    await wrapper.find('.tx-chart').trigger('pointermove', { clientX: 200, clientY: 5 })
    expect(wrapper.findAll('g.tx-series--line')[1]!.attributes('opacity')).toBeUndefined()
  })

  it('drops fractional y ticks when yAxisMinInterval is set', async () => {
    const counts: TimeseriesData[] = [{ name: 'Hits', data: [[H, 1], [H + HOUR, 3]] }]
    const plain = mount(TxTimeseriesChart, {
      props: { data: counts, width: 400 } as never,
    })
    await nextTick()
    expect(plain.findAll('.tx-axis--left .tx-axis__label').map(n => n.text())).toContain('1.5')

    const discrete = mount(TxTimeseriesChart, {
      props: { data: counts, width: 400, yAxisMinInterval: 1 } as never,
    })
    await nextTick()
    // Integer ticks must not print as `1.0` after the default formatter is
    // re-derived from the surviving tick count.
    expect(discrete.findAll('.tx-axis--left .tx-axis__label').map(n => n.text()))
      .toEqual(['0', '1', '2', '3'])
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
