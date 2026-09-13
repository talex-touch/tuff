import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { TxAxis } from '../src/axis'
import { TOOLTIP_FADE_DURATION, TOOLTIP_HIDE_DELAY } from '../src/core/animate'
import { TxArcSeries, TxBarSeries, TxLineSeries } from '../src/series'
import { TxChartTooltip } from '../src/tooltip'
import { TxChart } from '../src/chart'

// width 400 / height 300 / padding 20 → plot x:20 y:20 w:360 h:260.
const frame = { width: 400, height: 300, padding: 20 }

interface Point { t: number, v: number }

afterEach(() => {
  vi.useRealTimers()
})

describe('txChart + series', () => {
  it('renders a line path spanning the derived domain', () => {
    const data: Point[] = [{ t: 0, v: 0 }, { t: 1, v: 10 }]
    const wrapper = mount(TxChart, {
      props: { ...frame, yDomain: [0, 10] as [number, number], yNice: false },
      slots: {
        default: () => h(TxLineSeries<Point>, { data, x: 't', y: 'v', color: '#111111' }),
      },
    })
    const path = wrapper.find('path.tx-series__stroke')
    expect(path.attributes('d')).toBe('M20,280L380,20')
    expect(path.attributes('stroke')).toBe('#111111')
  })

  it('allocates categorical palette slots to series without explicit colors', () => {
    const data: Point[] = [{ t: 0, v: 1 }, { t: 1, v: 2 }]
    const wrapper = mount(TxChart, {
      props: frame,
      slots: {
        default: () => [
          h(TxLineSeries<Point>, { data, x: 't', y: 'v' }),
          h(TxLineSeries<Point>, { data, x: 't', y: 'v' }),
        ],
      },
    })
    const strokes = wrapper.findAll('path.tx-series__stroke').map(p => p.attributes('stroke'))
    expect(strokes[0]).toBe('var(--tx-chart-categorical-1, #4290F0)')
    expect(strokes[1]).toBe('var(--tx-chart-categorical-2, #F5B647)')
  })

  it('stacks bar series sharing a stack key', async () => {
    interface Row { cat: string, v: number }
    const first: Row[] = [{ cat: 'A', v: 2 }, { cat: 'B', v: 3 }]
    const second: Row[] = [{ cat: 'A', v: 1 }, { cat: 'B', v: 1 }]
    const wrapper = mount(TxChart, {
      props: { ...frame, xType: 'band' as const, yDomain: [0, 4] as [number, number], yNice: false },
      slots: {
        default: () => [
          h(TxBarSeries<Row>, { data: first, x: 'cat', y: 'v', stack: 'total' }),
          h(TxBarSeries<Row>, { data: second, x: 'cat', y: 'v', stack: 'total' }),
        ],
      },
    })
    // The second series' registration re-renders the first; flush that patch.
    await nextTick()
    const rects = wrapper.findAll('rect.tx-series__bar')
    expect(rects).toHaveLength(4)

    // y range [280, 20] over domain [0, 4] → 65 px per unit.
    const [a1, , a2] = [rects[0]!, rects[1]!, rects[2]!, rects[3]!]
    expect(Number(a1.attributes('y'))).toBeCloseTo(150) // value 2 → top at ys(2)
    expect(Number(a1.attributes('height'))).toBeCloseTo(130)
    // Second series' A bar sits on top of the first one's.
    expect(Number(a2.attributes('y'))).toBeCloseTo(85) // ys(3)
    expect(Number(a2.attributes('height'))).toBeCloseTo(65)
    // Same lane: identical x.
    expect(a2.attributes('x')).toBe(a1.attributes('x'))
  })

  it('lays unstacked bar series side by side', async () => {
    interface Row { cat: string, v: number }
    const data: Row[] = [{ cat: 'A', v: 2 }]
    const wrapper = mount(TxChart, {
      props: { ...frame, xType: 'band' as const },
      slots: {
        default: () => [
          h(TxBarSeries<Row>, { data, x: 'cat', y: 'v' }),
          h(TxBarSeries<Row>, { data, x: 'cat', y: 'v' }),
        ],
      },
    })
    // Lane count settles once both series are registered; flush the re-render.
    await nextTick()
    const rects = wrapper.findAll('rect.tx-series__bar')
    expect(rects).toHaveLength(2)
    const first = rects[0]!
    const second = rects[1]!
    expect(first.attributes('width')).toBe(second.attributes('width'))
    expect(Number(second.attributes('x')))
      .toBeCloseTo(Number(first.attributes('x')) + Number(first.attributes('width')))
    // Both rest on the zero baseline.
    expect(first.attributes('y')).toBe(second.attributes('y'))
  })

  it('renders donut slices with palette fills and emits clicks', async () => {
    interface Slice { label: string, count: number }
    const data: Slice[] = [
      { label: 'a', count: 1 },
      { label: 'b', count: 2 },
      { label: 'c', count: 3 },
    ]
    const clicked: string[] = []
    const wrapper = mount(TxChart, {
      props: frame,
      slots: {
        default: () => h(TxArcSeries<Slice>, {
          data,
          value: 'count',
          name: 'label',
          onSliceClick: (slice: { name?: string }) => clicked.push(slice.name ?? ''),
        }),
      },
    })
    const slices = wrapper.findAll('path.tx-series__slice')
    expect(slices).toHaveLength(3)
    expect(slices[1]!.attributes('fill')).toBe('var(--tx-chart-categorical-2, #F5B647)')
    await slices[2]!.trigger('click')
    expect(clicked).toEqual(['c'])
  })

  it('reports the hovered donut slice and clears it once the pointer leaves the arc', async () => {
    interface Slice { label: string, count: number }
    const data: Slice[] = [
      { label: 'a', count: 1 },
      { label: 'b', count: 2 },
      { label: 'c', count: 3 },
    ]
    const hovered: Array<{ name?: string, index: number, value: number } | null> = []
    const wrapper = mount(TxChart, {
      props: frame,
      slots: {
        default: () => h(TxArcSeries<Slice>, {
          data,
          value: 'count',
          name: 'label',
          onSliceHover: slice => hovered.push(slice),
        }),
      },
    })
    const slices = wrapper.findAll('path.tx-series__slice')
    const arc = wrapper.find('g.tx-series--arc')

    await slices[1]!.trigger('pointerenter')
    expect(hovered).toEqual([{ datum: data[1], index: 1, name: 'b', value: 2 }])
    // Emphasis: the hovered slice is pushed 5px out along its mid angle.
    expect(slices[1]!.attributes('transform')).toMatch(/^translate\(/)
    expect(slices[0]!.attributes('transform')).toBeUndefined()

    // Moving between neighbours must not emit an intermediate `null`.
    await slices[2]!.trigger('pointerenter')
    expect(hovered.map(entry => entry?.index ?? null)).toEqual([1, 2])
    expect(slices[1]!.attributes('transform')).toBeUndefined()

    await arc.trigger('pointerleave')
    expect(hovered).toHaveLength(3)
    expect(hovered[2]).toBeNull()
    // A second leave (already cleared) stays silent.
    await arc.trigger('pointerleave')
    expect(hovered).toHaveLength(3)
  })

  it('renders axis tick labels with custom formatting', () => {
    const data: Point[] = [{ t: 0, v: 0 }, { t: 100, v: 50 }]
    const wrapper = mount(TxChart, {
      props: { ...frame, yDomain: [0, 50] as [number, number] },
      slots: {
        default: () => [
          h(TxLineSeries<Point>, { data, x: 't', y: 'v' }),
          h(TxAxis, { position: 'left', ticks: 2, format: (v: number | Date | string) => `${v}%`, name: 'Share' }),
        ],
      },
    })
    const labels = wrapper.findAll('.tx-axis__label').map(t => t.text())
    expect(labels).toContain('0%')
    expect(labels.some(label => label.endsWith('%'))).toBe(true)
    expect(wrapper.find('.tx-axis__name').text()).toBe('Share')
  })

  it('shows the overlay tooltip while the pointer is inside', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxChart, {
      props: frame,
      slots: {
        overlay: () => h(TxChartTooltip, {
          rows: [{ name: 'Requests', color: '#4290F0', value: '42' }],
          hiddenCount: 2,
          footer: 'Sampled every 60s',
        }),
      },
    })
    const tooltip = wrapper.find('.tx-chart-tooltip')
    expect(tooltip.attributes('style')).toContain('display: none')

    await wrapper.trigger('pointermove', { clientX: 100, clientY: 80 })
    expect(tooltip.attributes('style')).not.toContain('display: none')
    // jsdom rects are zero-based, so pointer = client coords + offset 12.
    // Position travels on `transform` so the browser can interpolate it
    // (ECharts transitions the tooltip over 400ms).
    expect(tooltip.attributes('style')).toContain('translate3d(112px, 92px, 0)')
    expect(tooltip.text()).toContain('Requests')
    expect(tooltip.text()).toContain('+2 more')
    expect(tooltip.text()).toContain('Sampled every 60s')

    await wrapper.trigger('pointerleave')
    // ECharts' hideDelay (100ms) keeps the tooltip mounted so brief pointer
    // excursions don't flicker it; the fade then runs for 200ms.
    expect(tooltip.attributes('style')).not.toContain('display: none')
    await vi.advanceTimersByTimeAsync(TOOLTIP_HIDE_DELAY + TOOLTIP_FADE_DURATION)
    await nextTick()
    expect(tooltip.attributes('style')).toContain('display: none')
  })
})
