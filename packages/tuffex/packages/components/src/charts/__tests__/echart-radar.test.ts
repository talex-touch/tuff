import { describe, expect, it } from 'vitest'
import { buildRadarChartOption } from '../src/echart/src/options/radar'
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

const indicators = [
  { name: 'Launch', max: 100 },
  { name: 'Search', max: 100 },
  { name: 'Plugins', max: 100 },
]

const twoSeries = [
  { name: 'Tuff', data: [92, 88, 74] },
  { name: 'Average', data: [78, 72, 86] },
]

describe('buildRadarChartOption', () => {
  it('hands every indicator to the radar component untouched', () => {
    const option = buildRadarChartOption({ indicators, series: twoSeries })
    expect(readField(readField(option, 'radar'), 'indicator')).toEqual(indicators)
  })

  it('draws one radar series per input with the caller data', () => {
    const option = buildRadarChartOption({ indicators, series: twoSeries })
    const series = readSeries(option)

    expect(series.map(entry => readField(entry, 'type'))).toEqual(['radar', 'radar'])
    expect(series.map(entry => readField(entry, 'name'))).toEqual(['Tuff', 'Average'])
    expect(readField(series[0], 'data')).toEqual([[92, 88, 74]])
    expect(readField(series[1], 'data')).toEqual([[78, 72, 86]])
    expect(readField(readField(option, 'tooltip'), 'trigger')).toBe('item')
  })

  it('fills only the series that asked to be filled', () => {
    const filled = readSeries(buildRadarChartOption({
      indicators,
      series: [{ name: 'Tuff', data: [92, 88, 74], area: true }],
    }))
    expect(readField(readField(filled[0], 'areaStyle'), 'opacity')).toBeCloseTo(0.16)

    const plain = readSeries(buildRadarChartOption({ indicators, series: twoSeries }))
    expect(readField(plain[0], 'areaStyle')).toBeUndefined()
    expect(readField(plain[1], 'areaStyle')).toBeUndefined()
  })

  it('passes the shape, split count and radius through to the radar component', () => {
    const option = buildRadarChartOption({ indicators, series: twoSeries })
    const radar = readField(option, 'radar')

    expect(readField(radar, 'shape')).toBe('polygon')
    expect(readField(radar, 'splitNumber')).toBe(4)
    expect(readField(radar, 'radius')).toBe('65%')

    const circle = readField(buildRadarChartOption({
      indicators,
      series: twoSeries,
      shape: 'circle',
      splitNumber: 6,
    }), 'radar')
    expect(readField(circle, 'shape')).toBe('circle')
    expect(readField(circle, 'splitNumber')).toBe(6)
  })

  it('hides the indicator names only when asked', () => {
    const shown = readField(buildRadarChartOption({ indicators, series: twoSeries }), 'radar')
    expect(readField(shown, 'axisName')).toBeUndefined()

    const hidden = readField(
      buildRadarChartOption({ indicators, series: twoSeries, showAxisName: false }),
      'radar',
    )
    expect(readField(readField(hidden, 'axisName'), 'show')).toBe(false)
  })

  it('shows the legend only when asked', () => {
    expect(readField(buildRadarChartOption({ indicators, series: twoSeries }), 'legend')).toBeDefined()
    expect(readField(buildRadarChartOption({ indicators, series: [twoSeries[0]] }), 'legend')).toBeUndefined()

    const forcedOff = buildRadarChartOption({ indicators, series: twoSeries, showLegend: false })
    expect(readField(forcedOff, 'legend')).toBeUndefined()

    const forcedOn = buildRadarChartOption({ indicators, series: [twoSeries[0]], showLegend: true })
    expect(readField(forcedOn, 'legend')).toBeDefined()
  })

  it('lets a caller override a built key and replace the series array wholesale', () => {
    const base = buildRadarChartOption({ indicators, series: twoSeries })

    const keyOverride = mergeChartOption(base, { tooltip: { trigger: 'axis' } })
    expect(readField(readField(keyOverride, 'tooltip'), 'trigger')).toBe('axis')
    expect(readSeries(keyOverride)).toHaveLength(2)

    const seriesOverride = mergeChartOption(base, { series: [{ name: 'only', type: 'radar', data: [9] }] })
    expect(readSeries(seriesOverride)).toHaveLength(1)
    expect(readField(readSeries(seriesOverride)[0], 'name')).toBe('only')
  })
})
