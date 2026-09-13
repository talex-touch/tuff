import type { EChartsOption } from 'echarts'
import type { FunnelChartDatum } from '../src/echart/src/options/funnel'
import { describe, expect, it } from 'vitest'
import { buildFunnelChartOption } from '../src/echart/src/options/funnel'
import { mergeChartOption } from '../src/echart/src/core/shared'

const data: FunnelChartDatum[] = [
  { name: 'Visit', value: 12000 },
  { name: 'Signup', value: 3600 },
  { name: 'Trial', value: 1800 },
  { name: 'Paid', value: 540 },
  { name: 'Renew', value: 380 },
]

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new Error('expected an object')
  return Object.fromEntries(Object.entries(value))
}

function funnelSeries(option: EChartsOption): Record<string, unknown> {
  const series: unknown = option.series
  if (!Array.isArray(series) || series.length !== 1)
    throw new Error('expected exactly one series')
  const entry = readRecord(series[0])
  expect(entry.type).toBe('funnel')
  return entry
}

function callFunction(holder: unknown, key: string, args: unknown[]): string {
  const fn = readRecord(holder)[key]
  if (typeof fn !== 'function')
    throw new Error(`expected ${key} to be a function`)
  return Reflect.apply(fn, undefined, args)
}

describe('buildFunnelChartOption', () => {
  it('builds one funnel series from the caller data', () => {
    const series = funnelSeries(buildFunnelChartOption({ data }))

    expect(series.data).toEqual(data.map(({ name, value }) => ({ name, value })))
    expect(series.left).toBe('10%')
    expect(series.right).toBe('10%')
    expect(series.top).toBe('8%')
    expect(series.bottom).toBe('8%')
  })

  it('honours a per-stage colour without adding one to the rest', () => {
    const series = funnelSeries(buildFunnelChartOption({
      data: [
        { name: 'Visit', value: 10, color: '#123456' },
        { name: 'Signup', value: 4 },
      ],
    }))

    const stages: unknown = series.data
    if (!Array.isArray(stages))
      throw new Error('expected a data array')
    expect(readRecord(stages[0]).itemStyle).toEqual({ color: '#123456' })
    expect(readRecord(stages[1])).not.toHaveProperty('itemStyle')
  })

  it('sorts descending by default and keeps the caller order when asked', () => {
    expect(funnelSeries(buildFunnelChartOption({ data })).sort).toBe('descending')
    expect(funnelSeries(buildFunnelChartOption({ data, sort: 'ascending' })).sort).toBe('ascending')
    expect(funnelSeries(buildFunnelChartOption({ data, sort: 'none' })).sort).toBe('none')
  })

  it('passes gap, minSize and maxSize through only when configured', () => {
    const plain = funnelSeries(buildFunnelChartOption({ data }))
    expect(plain.gap).toBe(2)
    expect(plain).not.toHaveProperty('minSize')
    expect(plain).not.toHaveProperty('maxSize')

    const sized = funnelSeries(buildFunnelChartOption({ data, gap: 8, minSize: '20%', maxSize: '90%' }))
    expect(sized.gap).toBe(8)
    expect(sized.minSize).toBe('20%')
    expect(sized.maxSize).toBe('90%')
  })

  it('labels each stage with its value and share of the first stage', () => {
    const series = funnelSeries(buildFunnelChartOption({ data }))
    const label = readRecord(series.label)

    expect(label.show).toBe(true)
    expect(label.position).toBe('inside')
    expect(callFunction(label, 'formatter', [{ name: 'Visit', value: 12000, dataIndex: 0 }])).toBe('Visit\n12000 (100%)')
    expect(callFunction(label, 'formatter', [{ name: 'Signup', value: 3600, dataIndex: 1 }])).toBe('Signup\n3600 (30%)')
  })

  it('drops labels when the caller hides them', () => {
    const series = funnelSeries(buildFunnelChartOption({ data, showLabel: false }))

    expect(readRecord(series.label).show).toBe(false)
    expect(readRecord(readRecord(series.emphasis).label).show).toBe(false)
  })

  it('places labels where the caller asks', () => {
    expect(readRecord(funnelSeries(buildFunnelChartOption({ data, labelPosition: 'right' })).label).position).toBe('right')
    expect(readRecord(funnelSeries(buildFunnelChartOption({ data, labelPosition: 'outside' })).label).position).toBe('outer')
  })

  it('lists the stages in the legend by default and drops it on request', () => {
    const legend = readRecord(buildFunnelChartOption({ data }).legend)

    expect(legend.data).toEqual(['Visit', 'Signup', 'Trial', 'Paid', 'Renew'])
    expect(buildFunnelChartOption({ data, showLegend: false })).not.toHaveProperty('legend')
  })

  it('appends the unit to tooltip values', () => {
    const tooltip = readRecord(buildFunnelChartOption({ data, unit: '人' }).tooltip)

    expect(tooltip.trigger).toBe('item')
    expect(callFunction(tooltip, 'valueFormatter', [3600])).toBe('3600人')
    expect(readRecord(buildFunnelChartOption({ data }).tooltip)).not.toHaveProperty('valueFormatter')
  })

  it('lets a caller override win over the built option', () => {
    const merged = mergeChartOption(buildFunnelChartOption({ data }), { tooltip: { trigger: 'axis' } })

    expect(readRecord(merged.tooltip).trigger).toBe('axis')
  })

  it('replaces the series array wholesale when the caller passes one', () => {
    const merged = mergeChartOption(buildFunnelChartOption({ data }), {
      series: [{ type: 'funnel', data: [{ name: 'Only', value: 1 }] }],
    })

    const series: unknown = merged.series
    expect(series).toEqual([{ type: 'funnel', data: [{ name: 'Only', value: 1 }] }])
  })
})
