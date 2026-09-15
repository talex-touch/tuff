import { describe, expect, it } from 'vitest'
import { buildBarChartOption } from '../src/echart/src/options/bar'
import { mergeChartOption } from '../src/echart/src/core/shared'

/** Reads a field off an option fragment without asserting its shape. */
function readField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null)
    return undefined
  return Reflect.get(value, key)
}

function readSeries(option: object): unknown[] {
  const series = readField(option, 'series')
  return Array.isArray(series) ? series : []
}

const twoSeries = [
  { name: 'A', data: [1, 2, 3] },
  { name: 'B', data: [4, 5, 6] },
]

describe('buildBarChartOption', () => {
  it('draws every series as a bar with the caller data', () => {
    const option = buildBarChartOption({ series: twoSeries, categories: ['x', 'y', 'z'] })
    const series = readSeries(option)

    expect(series.map(entry => readField(entry, 'type'))).toEqual(['bar', 'bar'])
    expect(readField(series[0], 'data')).toEqual([1, 2, 3])
    expect(readField(series[1], 'data')).toEqual([4, 5, 6])
    expect(readField(readField(option, 'xAxis'), 'data')).toEqual(['x', 'y', 'z'])
    expect(readField(readField(option, 'tooltip'), 'trigger')).toBe('axis')
  })

  it('shows the legend only when asked', () => {
    expect(readField(buildBarChartOption({ series: twoSeries }), 'legend')).toBeDefined()
    expect(readField(buildBarChartOption({ series: [{ name: 'A', data: [1] }] }), 'legend')).toBeUndefined()

    const forcedOff = buildBarChartOption({ series: twoSeries, showLegend: false })
    expect(readField(forcedOff, 'legend')).toBeUndefined()

    const forcedOn = buildBarChartOption({ series: [{ name: 'A', data: [1] }], showLegend: true })
    expect(readField(forcedOn, 'legend')).toBeDefined()
  })

  it('keeps the category axis vertical by default and swaps it when horizontal', () => {
    const vertical = buildBarChartOption({ series: twoSeries, categories: ['x'] })
    expect(readField(readField(vertical, 'xAxis'), 'type')).toBe('category')
    expect(readField(readField(vertical, 'yAxis'), 'type')).toBe('value')

    const horizontal = buildBarChartOption({ series: twoSeries, categories: ['x'], horizontal: true })
    expect(readField(readField(horizontal, 'xAxis'), 'type')).toBe('value')
    expect(readField(readField(horizontal, 'yAxis'), 'type')).toBe('category')
  })

  it('stacks every series under one id, letting a series keep its own', () => {
    const stacked = readSeries(buildBarChartOption({ series: twoSeries, stacked: true }))
    expect(stacked.map(entry => readField(entry, 'stack'))).toEqual(['total', 'total'])

    const owned = readSeries(buildBarChartOption({
      series: [{ name: 'A', data: [1], stack: 'own' }, { name: 'B', data: [2] }],
      stacked: true,
    }))
    expect(owned.map(entry => readField(entry, 'stack'))).toEqual(['own', 'total'])

    const unstacked = readSeries(buildBarChartOption({ series: twoSeries }))
    expect(unstacked.map(entry => readField(entry, 'stack'))).toEqual([undefined, undefined])
  })

  it('draws value labels on top, or to the right when horizontal', () => {
    const vertical = readSeries(buildBarChartOption({ series: twoSeries, showLabel: true }))
    expect(readField(readField(vertical[0], 'label'), 'show')).toBe(true)
    expect(readField(readField(vertical[0], 'label'), 'position')).toBe('top')

    const horizontal = readSeries(buildBarChartOption({ series: twoSeries, showLabel: true, horizontal: true }))
    expect(readField(readField(horizontal[0], 'label'), 'position')).toBe('right')

    const hidden = readSeries(buildBarChartOption({ series: twoSeries }))
    expect(readField(hidden[0], 'label')).toBeUndefined()
  })

  it('passes an explicit bar width through to every series', () => {
    const series = readSeries(buildBarChartOption({ series: twoSeries, barWidth: 12 }))
    expect(series.map(entry => readField(entry, 'barWidth'))).toEqual([12, 12])
  })

  it('lets a caller override a built key and replace the series array wholesale', () => {
    const base = buildBarChartOption({ series: twoSeries, categories: ['x', 'y', 'z'] })

    const keyOverride = mergeChartOption(base, { tooltip: { trigger: 'item' } })
    expect(readField(readField(keyOverride, 'tooltip'), 'trigger')).toBe('item')
    expect(readSeries(keyOverride)).toHaveLength(2)

    const seriesOverride = mergeChartOption(base, { series: [{ name: 'only', type: 'bar', data: [9] }] })
    expect(readSeries(seriesOverride)).toHaveLength(1)
    expect(readField(readSeries(seriesOverride)[0], 'name')).toBe('only')
  })
})
