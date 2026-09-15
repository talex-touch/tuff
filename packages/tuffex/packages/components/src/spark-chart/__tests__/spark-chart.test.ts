import type { SparkSeries } from '../src/types'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { drawSparkChart } from '../src/draw'
import {
  clampAnchorCenter,
  indexFromPointerX,
  indexFromRatio,
  plotX,
  projectSeries,
  ratioFromIndex,
  resolvePadding,
  resolveTimeDomain,
  resolveValueDomain,
} from '../src/geometry'
import TxChartScrubber from '../src/TxChartScrubber.vue'
import TxSparkChart from '../src/TxSparkChart.vue'

function makeSeries(values: number[], gap = 6, id = 's'): SparkSeries {
  return {
    id,
    data: values.map((value, index) => ({ time: index * gap, value })),
  }
}

/** Records the draw-call surface — jsdom has no 2d context to assert pixels against. */
function stubContext() {
  const calls: string[] = []
  const ctx = {
    setTransform: vi.fn((...args: number[]) => calls.push(`setTransform(${args.join(',')})`)),
    clearRect: vi.fn(() => calls.push('clearRect')),
    beginPath: vi.fn(() => calls.push('beginPath')),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo(${x},${y})`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo(${x},${y})`)),
    bezierCurveTo: vi.fn(() => calls.push('bezierCurveTo')),
    rect: vi.fn((...args: number[]) => calls.push(`rect(${args.join(',')})`)),
    clip: vi.fn(() => calls.push('clip')),
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    arc: vi.fn(() => calls.push('arc')),
    fill: vi.fn(() => calls.push('fill')),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 }) as TextMetrics),
    fillText: vi.fn((text: string) => {
      calls.push(`align(${ctx.textAlign})@${text}`)
      calls.push(`fillText(${text})`)
    }),
    stroke: vi.fn(() => calls.push('stroke')),
    lineJoin: '',
    lineCap: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  }
  return { ctx, calls }
}

describe('sparkChart geometry', () => {
  it('fills unset padding sides from the upstream defaults', () => {
    expect(resolvePadding()).toEqual({ top: 24, right: 0, bottom: 22, left: 0 })
    expect(resolvePadding({ top: 18 })).toEqual({ top: 18, right: 0, bottom: 22, left: 0 })
    expect(resolvePadding({ top: 0 })).toEqual({ top: 0, right: 0, bottom: 22, left: 0 })
  })

  it('fits one shared value domain across every series', () => {
    const domain = resolveValueDomain([makeSeries([-4, 2]), makeSeries([0, 9], 6, 'b')])
    expect(domain).toEqual([-4, 9])
  })

  it('pads a flat series so it draws through the middle', () => {
    expect(resolveValueDomain([makeSeries([5, 5, 5])])).toEqual([4, 6])
  })

  it('falls back to a unit domain with no finite samples', () => {
    expect(resolveValueDomain([])).toEqual([0, 1])
    expect(resolveValueDomain([{ id: 'a', data: [] }])).toEqual([0, 1])
  })

  it('honours an explicit domain over the data', () => {
    expect(resolveValueDomain([makeSeries([1, 2])], [0, 100])).toEqual([0, 100])
  })

  it('spans the time axis across every series', () => {
    expect(resolveTimeDomain([makeSeries([1, 2, 3], 7)])).toEqual([0, 14])
    expect(resolveTimeDomain([])).toEqual([0, 0])
  })

  it('projects samples inside the padded box, y inverted', () => {
    const series = makeSeries([0, 10])
    const points = projectSeries(
      series,
      { width: 100, height: 100, padding: { top: 20, right: 0, bottom: 20, left: 0 } },
      resolveTimeDomain([series]),
      resolveValueDomain([series]),
    )

    expect(points).toEqual([
      { x: 0, y: 80 },
      { x: 100, y: 20 },
    ])
  })

  it('spaces samples by index when every timestamp matches', () => {
    const series: SparkSeries = {
      id: 'flat-time',
      data: [
        { time: 5, value: 0 },
        { time: 5, value: 5 },
        { time: 5, value: 10 },
      ],
    }
    const points = projectSeries(
      series,
      { width: 100, height: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      resolveTimeDomain([series]),
      resolveValueDomain([series]),
    )

    expect(points.map(point => point.x)).toEqual([0, 50, 100])
  })

  it('centres a single sample instead of pinning it to the left edge', () => {
    const series = makeSeries([3])
    const [point] = projectSeries(
      series,
      { width: 80, height: 40, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      resolveTimeDomain([series]),
      resolveValueDomain([series]),
    )

    expect(point?.x).toBe(40)
  })

  it('maps pointer progress onto the nearest sample index', () => {
    expect(indexFromRatio(0, 8)).toBe(0)
    expect(indexFromRatio(0.5, 8)).toBe(4)
    expect(indexFromRatio(1, 8)).toBe(7)
    expect(indexFromRatio(-2, 8)).toBe(0)
    expect(indexFromRatio(2, 8)).toBe(7)
    expect(indexFromRatio(0.5, 1)).toBe(0)
  })

  it('maps a sample index back to cursor progress', () => {
    expect(ratioFromIndex(0, 8)).toBe(0)
    expect(ratioFromIndex(7, 8)).toBe(1)
    expect(ratioFromIndex(1, 1)).toBe(0)
  })

  it('maps the pointer through the plot box, not the stage', () => {
    const rect = { left: 0, width: 200 }
    const inset = { left: 40, right: 20 }

    // Inside the gutter the sample clamps to the edge instead of drifting.
    expect(indexFromPointerX(0, rect, 8, inset)).toBe(0)
    expect(indexFromPointerX(40, rect, 8, inset)).toBe(0)
    expect(indexFromPointerX(180, rect, 8, inset)).toBe(7)
    expect(indexFromPointerX(200, rect, 8, inset)).toBe(7)
    // Halfway across the plot box, not halfway across the stage.
    expect(indexFromPointerX(110, rect, 8, inset)).toBe(4)
    // A collapsed stage falls back to the first sample rather than dividing by zero.
    expect(indexFromPointerX(50, { left: 0, width: 60 }, 8, inset)).toBe(0)
  })

  it('places a sample inside the plot box', () => {
    expect(plotX(0, 8, { left: 40, right: 20 }, 200)).toBe(40)
    expect(plotX(7, 8, { left: 40, right: 20 }, 200)).toBe(180)
    expect(plotX(4, 8, { left: 0, right: 0 }, 200)).toBe((4 / 7) * 200)
    expect(plotX(3, 1, { left: 10, right: 10 }, 200)).toBe(10)
  })

  it('clamps the tooltip only when it would overhang the stage', () => {
    // Free travel across everything the box fits.
    expect(clampAnchorCenter(300, 80, 700, 8)).toBe(300)
    // Pinned at the edges, minus the margin.
    expect(clampAnchorCenter(0, 80, 700, 8)).toBe(88)
    expect(clampAnchorCenter(700, 80, 700, 8)).toBe(612)
    // Wider tooltip than stage: centred, not oscillating.
    expect(clampAnchorCenter(10, 90, 120, 0)).toBe(60)
  })
})

describe('sparkChart drawing', () => {
  const base = {
    width: 100,
    height: 50,
    dpr: 2,
    lineWidth: 2.25,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    grid: false,
    gridLines: 4,
    gridColor: '#ecedef',
    curve: 'monotone' as const,
    xAxis: false,
    yAxis: false,
    xTicks: [],
    yTicks: [],
    axisColor: '#e0e2e5',
    axisTextColor: '#9a9da3',
    axisFont: '10px system-ui',
    activeIndex: null,
    activeColor: '#62656b',
    revealProgress: 1,
  }

  it('scales by dpr, clears, then strokes one path per series', () => {
    const { ctx, calls } = stubContext()

    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      series: [
        { color: '#f00', points: [{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 10 }] },
        { color: '#0f0', points: [{ x: 0, y: 5 }, { x: 10, y: 15 }] },
      ],
    })

    expect(calls[0]).toBe('setTransform(2,0,0,2,0,0)')
    expect(calls[1]).toBe('clearRect')
    expect(calls).toContain('moveTo(0,0)')
    expect(calls).toContain('bezierCurveTo')
    expect(ctx.lineWidth).toBe(2.25)
    // Identity restored so anything painting after us is not silently scaled.
    expect(calls.at(-1)).toBe('setTransform(1,0,0,1,0,0)')
  })

  it('skips painting entirely on a zero-sized box', () => {
    const { ctx } = stubContext()
    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, { ...base, width: 0, series: [] })
    expect(ctx.clearRect).not.toHaveBeenCalled()
  })

  it('draws one hairline per grid line before the series', () => {
    const { ctx } = stubContext()

    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      grid: true,
      gridLines: 3,
      series: [],
    })

    expect(ctx.stroke).toHaveBeenCalledTimes(3)
  })

  it('repeats a lone sample so the round cap paints it as a dot', () => {
    const { ctx, calls } = stubContext()

    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      series: [{ color: '#00f', points: [{ x: 4, y: 6 }] }],
    })

    expect(calls).toContain('moveTo(4,6)')
    expect(calls).toContain('lineTo(4,6)')
    expect(ctx.lineCap).toBe('round')
  })

  it('draws bounded axes and an active crosshair with series dots', () => {
    const { ctx, calls } = stubContext()
    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      padding: { top: 8, right: 4, bottom: 18, left: 28 },
      xAxis: true,
      yAxis: true,
      xTicks: [{ position: 28, label: '12:00' }, { position: 96, label: '12:10' }],
      yTicks: [{ position: 8, label: '4' }, { position: 32, label: '0' }],
      activeIndex: 1,
      series: [
        { color: '#f00', points: [{ x: 28, y: 20 }, { x: 96, y: 10 }] },
        { color: '#0f0', points: [{ x: 28, y: 30 }, { x: 96, y: 24 }] },
      ],
    })

    expect(calls).toContain('fillText(12:00)')
    expect(calls).toContain('fillText(4)')
    expect(calls.filter(call => call === 'arc')).toHaveLength(4)
    // The last tick sits on the canvas edge: centring it would clip half of it.
    expect(calls).toContain('align(right)@12:10')
  })

  it('keeps edge axis labels inside the canvas', () => {
    const { ctx, calls } = stubContext()
    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      padding: { top: 8, right: 0, bottom: 18, left: 0 },
      xAxis: true,
      yAxis: true,
      // A label wider than the inset, and one that starts left of the canvas.
      xTicks: [{ position: 2, label: '12:00' }, { position: 40, label: '12:10' }],
      yTicks: [{ position: 8, label: '123456' }],
      series: [{ color: '#f00', points: [{ x: 0, y: 20 }, { x: 100, y: 10 }] }],
    })

    expect(calls).toContain('align(left)@12:00')
    expect(calls).toContain('align(center)@12:10')
    // Right-aligned at `left - 5` would put a 36px label at x = -5; it moves in.
    expect(ctx.fillText).toHaveBeenCalledWith('123456', 36, 8)
  })

  it('leaves an empty series out of the series stroke work', () => {
    const { ctx } = stubContext()
    drawSparkChart(ctx as unknown as CanvasRenderingContext2D, {
      ...base,
      series: [{ color: '#00f', points: [] }],
    })
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('txSparkChart', () => {
  it('renders a canvas and survives a host without a 2d context', () => {
    const wrapper = mount(TxSparkChart, { props: { series: [makeSeries([1, 2, 3])] } })
    expect(wrapper.find('canvas.tx-bui-spark-chart__canvas').exists()).toBe(true)
  })

  it('hides the canvas from assistive tech unless it is given a name', () => {
    const bare = mount(TxSparkChart, { props: { series: [] } })
    expect(bare.find('canvas').attributes('aria-hidden')).toBe('true')
    expect(bare.find('canvas').attributes('role')).toBeUndefined()

    const named = mount(TxSparkChart, { props: { series: [], ariaLabel: 'Trend snapshot' } })
    expect(named.find('canvas').attributes('role')).toBe('img')
    expect(named.find('canvas').attributes('aria-label')).toBe('Trend snapshot')
    expect(named.find('canvas').attributes('aria-hidden')).toBeUndefined()
  })

  it('exposes redraw for hosts mutating series in place', () => {
    const wrapper = mount(TxSparkChart, { props: { series: [] } })
    expect(typeof (wrapper.vm as unknown as { redraw: () => void }).redraw).toBe('function')
  })

  it('maps pointer and keys into an accessible active sample', async () => {
    const wrapper = mount(TxSparkChart, { props: { series: [makeSeries([1, 2, 3])] } })
    Object.defineProperty(wrapper.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 120, top: 0, height: 60, right: 120, bottom: 60, x: 0, y: 0, toJSON: () => ({}) }),
    })

    await wrapper.trigger('pointermove', { clientX: 120 })
    expect(wrapper.emitted('hover')).toEqual([[2]])
    expect(wrapper.emitted('update:activeIndex')).toEqual([[2]])

    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([1])
    expect(wrapper.find('.tx-bui-spark-chart__announcement').text()).toContain('s: 2')
  })
})

describe('txChartScrubber', () => {
  function mountScrubber(props: Record<string, unknown> = {}) {
    const wrapper = mount(TxChartScrubber, {
      props: { pointCount: 8, ...props },
      slots: { default: '<div class="chart" />' },
    })
    Object.defineProperty(wrapper.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    })
    return wrapper
  }

  it('maps a pointer position onto a sample and reports it once per change', async () => {
    const wrapper = mountScrubber()

    await wrapper.trigger('pointermove', { clientX: 100 })
    expect(wrapper.emitted('scrub')).toEqual([[4]])
    expect(wrapper.emitted('update:activeIndex')).toEqual([[4]])

    // Same sample under the pointer — no repeat events.
    await wrapper.trigger('pointermove', { clientX: 104 })
    expect(wrapper.emitted('scrub')).toHaveLength(1)

    await wrapper.trigger('pointermove', { clientX: 200 })
    expect(wrapper.emitted('scrub')).toEqual([[4], [7]])
  })

  it('places the cursor on the plot box and lets the tooltip follow it', async () => {
    const wrapper = mountScrubber({ rows: [{ label: 'Spend', value: '$2,112', color: 'red' }] })

    await wrapper.trigger('pointermove', { clientX: 0 })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').attributes('style')).toContain('left: 0px')
    // Unmeasured tooltip: percent of the sample position, never a fixed band.
    expect(wrapper.find('.tx-bui-chart-scrubber__anchor').attributes('style')).toContain('left: 0%')

    await wrapper.trigger('pointermove', { clientX: 200 })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').attributes('style')).toContain('left: 200px')
    expect(wrapper.find('.tx-bui-chart-scrubber__anchor').attributes('style')).toContain('left: 100%')
  })

  it('follows the gutters a wrapped chart publishes', async () => {
    const wrapper = mountScrubber({ activeIndex: 0, rows: [{ label: 'Spend', value: '$1' }] })
    await nextTick()

    const style = { getPropertyValue: (name: string) => name === '--tx-bui-plot-left' ? '40px' : '20px' }
    const computed = vi.spyOn(window, 'getComputedStyle')
      .mockReturnValue(style as unknown as CSSStyleDeclaration)
    // Row identity change is what re-reads the chart's published gutters.
    await wrapper.setProps({ rows: [{ label: 'Spend', value: '$2' }] })
    await nextTick()

    // Sample 0 sits at the gutter instead of the stage edge.
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').attributes('style')).toContain('left: 40px')

    await wrapper.setProps({ activeIndex: 7 })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').attributes('style')).toContain('left: 180px')

    computed.mockRestore()
  })

  it('renders tooltip rows with a swatch and a tabular value', async () => {
    const wrapper = mountScrubber({
      rows: [{ label: 'Mint Chip', value: '−4.41%', color: 'var(--tx-bui-orange)' }],
      timeLabel: 'Today, 12:00',
    })

    await wrapper.trigger('pointermove', { clientX: 100 })

    expect(wrapper.find('.tx-bui-chart-scrubber__time').text()).toBe('Today, 12:00')
    expect(wrapper.find('.tx-bui-chart-scrubber__label').text()).toBe('Mint Chip')
    expect(wrapper.find('.tx-bui-chart-scrubber__value').text()).toBe('−4.41%')
    expect(wrapper.find('.tx-bui-chart-scrubber__dot').attributes('style')).toContain('background: var(--tx-bui-orange)')
  })

  it('clears on leave, cancel and pointer up', async () => {
    for (const event of ['pointerleave', 'pointercancel', 'pointerup']) {
      const wrapper = mountScrubber()
      await wrapper.trigger('pointermove', { clientX: 100 })
      await wrapper.trigger(event)

      expect(wrapper.emitted('leave')).toHaveLength(1)
      expect(wrapper.emitted('update:activeIndex')?.at(-1)).toEqual([null])
      expect(wrapper.find('.tx-bui-chart-scrubber__cursor').exists()).toBe(false)
    }
  })

  it('lets a controlled activeIndex own the cursor', async () => {
    const wrapper = mountScrubber({ activeIndex: 2 })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').exists()).toBe(true)

    // The component reports the move but does not move itself.
    await wrapper.trigger('pointermove', { clientX: 200 })
    expect(wrapper.emitted('scrub')).toEqual([[7]])
    await wrapper.setProps({ activeIndex: 2 })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').attributes('style'))
      .toContain(`left: ${(2 / 7) * 200}px`)

    await wrapper.setProps({ activeIndex: null })
    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').exists()).toBe(false)
  })

  it('ignores the pointer while disabled', async () => {
    const wrapper = mountScrubber({ disabled: true })
    await wrapper.trigger('pointermove', { clientX: 100 })
    expect(wrapper.emitted('scrub')).toBeUndefined()
  })

  it('can drop the tooltip and keep the cursor', async () => {
    const wrapper = mountScrubber({ tooltip: false })
    await wrapper.trigger('pointermove', { clientX: 100 })

    expect(wrapper.find('.tx-bui-chart-scrubber__cursor').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-chart-scrubber__anchor').exists()).toBe(false)
  })
})
