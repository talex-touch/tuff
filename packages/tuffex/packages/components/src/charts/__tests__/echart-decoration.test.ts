import type { EChartsOption } from 'echarts'
import { describe, expect, it } from 'vitest'
import { decorateChartOption, mergeChartOption } from '../src/echart/src/core/shared'
import { ECHART_THEME_FALLBACKS } from '../src/echart/src/core/theme'
import { buildGaugeChartOption } from '../src/echart/src/options/gauge'
import { buildHeatmapChartOption } from '../src/echart/src/options/heatmap'

const tokens = ECHART_THEME_FALLBACKS.dark

function decorate(option: EChartsOption, override?: object): EChartsOption {
  return decorateChartOption(mergeChartOption(option, override), tokens)
}

function heatmap(override?: object): EChartsOption {
  return decorate(buildHeatmapChartOption({
    values: [[1, 2], [3, 4]],
    rows: ['low', 'high'],
    columns: ['a', 'b'],
  }), override)
}

function gauge(override?: object): EChartsOption {
  return decorate(buildGaugeChartOption({ value: 42, name: 'Latency' }), override)
}

/** Reads one field off an ECharts component without asserting its shape. */
function readField(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined
}

function firstSeries(option: EChartsOption): Record<string, unknown> {
  const series = option.series
  return (Array.isArray(series) ? series[0] : series) as Record<string, unknown>
}

function gridBottom(option: EChartsOption): unknown {
  return readField(readField(option, 'grid'), 'bottom')
}

describe('decorateChartOption', () => {
  it('reserves a grid row for the colour scale docked under a heatmap', () => {
    const option = heatmap()
    expect(readField(readField(option, 'visualMap'), 'bottom')).toBe(0)
    expect(gridBottom(option)).toBe(54)
  })

  it('keeps the tight grid when the heatmap drops its colour scale', () => {
    expect(gridBottom(heatmap({ visualMap: false }))).toBe(4)
  })

  it('reserves nothing for a colour scale that lives beside the plot', () => {
    const option = heatmap({ visualMap: { type: 'continuous', orient: 'vertical', right: 0 } })
    expect(gridBottom(option)).toBe(4)
  })

  it('lets a caller reserve its own grid box', () => {
    expect(gridBottom(heatmap({ grid: { bottom: 80 } }))).toBe(80)
  })

  it('paints a gauge dial from tokens instead of ECharts hard-coded colours', () => {
    const series = firstSeries(gauge())
    const lineStyle = readField(readField(series, 'axisLine'), 'lineStyle')
    expect(readField(lineStyle, 'color')).toEqual([[1, tokens.splitLine]])
    expect(readField(readField(series, 'axisLabel'), 'color')).toBe(tokens.text)
    expect(readField(readField(series, 'splitLine'), 'lineStyle')).toEqual({ color: tokens.splitLine })
    expect(readField(readField(series, 'detail'), 'color')).toBe(tokens.text)
    expect(readField(readField(series, 'title'), 'color')).toBe(tokens.textMuted)
  })

  it('keeps an accent reading when the caller passes one', () => {
    const series = firstSeries(gauge({ series: [{ type: 'gauge', detail: { color: '#10b981' } }] }))
    expect(readField(readField(series, 'detail'), 'color')).toBe('#10b981')
  })

  it('leaves a caller-styled dial untouched', () => {
    const accent = '#ff8800'
    const series = firstSeries(gauge({ series: [{ type: 'gauge', axisLine: { lineStyle: { color: [[1, accent]] } } }] }))
    expect(readField(readField(readField(series, 'axisLine'), 'lineStyle'), 'color')).toEqual([[1, accent]])
  })

  it('grows no dial chrome on series that are not gauges', () => {
    const option = decorate({ series: [{ type: 'line', data: [1, 2] }] } as EChartsOption)
    expect(readField(firstSeries(option), 'axisLine')).toBeUndefined()
    expect(readField(firstSeries(option), 'axisLabel')).toBeUndefined()
  })
})
