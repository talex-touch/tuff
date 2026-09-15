import type { EChartsOption } from 'echarts'
import { describe, expect, it } from 'vitest'
import { mergeChartOption } from '../src/echart/src/core/shared'
import { buildGaugeChartOption } from '../src/echart/src/options/gauge'

interface GaugeSeriesView {
  type: string
  min?: number
  max?: number
  splitNumber?: number
  startAngle?: number
  endAngle?: number
  pointer: Record<string, unknown>
  progress: Record<string, unknown>
  axisLine: Record<string, unknown>
  splitLine: Record<string, unknown>
  axisTick: Record<string, unknown>
  axisLabel: Record<string, unknown>
  detail: Record<string, unknown>
  title: Record<string, unknown>
  data: Array<Record<string, unknown>>
}

describe('buildGaugeChartOption', () => {
  it('draws a single gauge series for the reading', () => {
    const option = buildGaugeChartOption({ value: 72 })
    const series = gaugeSeries(option)

    expect(option.series).toHaveLength(1)
    expect(series.type).toBe('gauge')
    expect(series.data).toEqual([{ value: 72 }])
  })

  it('defaults the scale to 0–100 and carries explicit bounds through', () => {
    const defaults = gaugeSeries(buildGaugeChartOption({ value: 5 }))
    expect(defaults.min).toBe(0)
    expect(defaults.max).toBe(100)
    expect(defaults.splitNumber).toBe(5)

    const custom = gaugeSeries(buildGaugeChartOption({ value: 5, min: -40, max: 60, segments: 8 }))
    expect(custom.min).toBe(-40)
    expect(custom.max).toBe(60)
    expect(custom.splitNumber).toBe(8)
  })

  it('shows the name as a label and appends the unit to the reading', () => {
    const series = gaugeSeries(buildGaugeChartOption({ value: 72, name: 'P95 命中率', unit: '%' }))

    expect(series.data).toEqual([{ value: 72, name: 'P95 命中率' }])
    expect(series.title.show).toBe(true)
    expect(readingText(series, 72)).toBe('72%')
  })

  it('leaves the name label out when the caller did not pass one', () => {
    const series = gaugeSeries(buildGaugeChartOption({ value: 42 }))

    expect(series.data).toEqual([{ value: 42 }])
    expect(series.title.show).toBeUndefined()
    expect(readingText(series, 42)).toBe('42')
  })

  it('renders the reading at the requested precision', () => {
    const rounded = gaugeSeries(buildGaugeChartOption({ value: 72.6 }))
    expect(readingText(rounded, 72.6)).toBe('73')

    const precise = gaugeSeries(buildGaugeChartOption({ value: 0.5, precision: 2, unit: 's' }))
    expect(readingText(precise, 0.5)).toBe('0.50s')
  })

  it('switches to the thin ring look when progress is on', () => {
    const dial = gaugeSeries(buildGaugeChartOption({ value: 30 }))
    expect(dial.progress.show).toBeUndefined()
    expect(dial.pointer.show).toBeUndefined()

    const ring = gaugeSeries(buildGaugeChartOption({ value: 30, progress: true }))
    expect(ring.startAngle).toBe(90)
    expect(ring.endAngle).toBe(-270)
    expect(ring.pointer.show).toBe(false)
    expect(ring.progress.show).toBe(true)
    expect(ring.progress.width).toBe(10)
    expect(asRecord(ring.axisLine.lineStyle).width).toBe(10)
    expect(ring.splitLine.show).toBe(false)
    expect(ring.axisTick.show).toBe(false)
    expect(ring.axisLabel.show).toBe(false)
  })

  it('colours the progress arc and the reading, never the dial', () => {
    const ring = gaugeSeries(buildGaugeChartOption({ value: 30, progress: true, color: '#10b981' }))
    expect(asRecord(ring.progress.itemStyle).color).toBe('#10b981')
    expect(ring.detail.color).toBe('#10b981')

    const dial = gaugeSeries(buildGaugeChartOption({ value: 30, color: '#10b981' }))
    expect(dial.detail.color).toBe('#10b981')
    expect(asRecord(dial.axisLine.lineStyle).color).toBeUndefined()
    expect(dial.axisLine).toEqual({})
  })

  it('lets a caller option win and replaces the series wholesale', () => {
    const built = buildGaugeChartOption({ value: 72, name: 'P95 命中率' })

    const patched = mergeChartOption(built, { animation: false, aria: { enabled: true } })
    expect(patched.animation).toBe(false)
    expect(patched.aria).toEqual({ enabled: true })
    expect(gaugeSeries(patched).data).toEqual([{ value: 72, name: 'P95 命中率' }])

    const replaced = mergeChartOption(built, { series: [{ type: 'gauge', max: 500 }] })
    expect(replaced.series).toEqual([{ type: 'gauge', max: 500 }])
    expect(gaugeSeries(replaced).title.show).toBeUndefined()
  })
})

function gaugeSeries(option: EChartsOption): GaugeSeriesView {
  const list = option.series
  const first = asRecord(Array.isArray(list) ? list[0] : list)

  return {
    type: typeof first.type === 'string' ? first.type : '',
    min: asNumber(first.min),
    max: asNumber(first.max),
    splitNumber: asNumber(first.splitNumber),
    startAngle: asNumber(first.startAngle),
    endAngle: asNumber(first.endAngle),
    pointer: asRecord(first.pointer),
    progress: asRecord(first.progress),
    axisLine: asRecord(first.axisLine),
    splitLine: asRecord(first.splitLine),
    axisTick: asRecord(first.axisTick),
    axisLabel: asRecord(first.axisLabel),
    detail: asRecord(first.detail),
    title: asRecord(first.title),
    data: Array.isArray(first.data) ? first.data.map(asRecord) : [],
  }
}

/** ECharts hands the gauge reading to the detail formatter as a plain number. */
function readingText(series: GaugeSeriesView, value: number): string | undefined {
  const formatter = series.detail.formatter
  if (typeof formatter !== 'function')
    return undefined
  return (formatter as (value: number) => string)(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
