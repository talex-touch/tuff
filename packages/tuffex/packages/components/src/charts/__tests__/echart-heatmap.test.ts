import type { EChartsOption } from 'echarts'
import type { HeatmapChartProps } from '../src/echart/src/options/heatmap'
import { describe, expect, it } from 'vitest'
import { mergeChartOption } from '../src/echart/src/core/shared'
import { buildHeatmapChartOption } from '../src/echart/src/options/heatmap'

const values = [
  [1, 2, 3],
  [4, 5, 6],
]
const rows = ['row-0', 'row-1']
const columns = ['col-0', 'col-1', 'col-2']

function build(extra: Partial<HeatmapChartProps> = {}): EChartsOption {
  return buildHeatmapChartOption({ values, rows, columns, ...extra })
}

/** Reads one field off an ECharts component without asserting its shape. */
function readField(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined
}

function firstSeries(option: EChartsOption): unknown {
  const series = option.series
  return Array.isArray(series) ? series[0] : series
}

describe('buildHeatmapChartOption', () => {
  it('unpacks the row-major matrix into [columnIndex, rowIndex, value] triples', () => {
    const series = firstSeries(build())
    expect(readField(series, 'type')).toBe('heatmap')
    expect(readField(series, 'data')).toEqual([
      [0, 0, 1],
      [1, 0, 2],
      [2, 0, 3],
      [0, 1, 4],
      [1, 1, 5],
      [2, 1, 6],
    ])
  })

  it('builds category axes from columns and rows, in the order given', () => {
    const option = build()
    expect(readField(option.xAxis, 'type')).toBe('category')
    expect(readField(option.xAxis, 'data')).toEqual(['col-0', 'col-1', 'col-2'])
    expect(readField(option.yAxis, 'type')).toBe('category')
    // ECharts plots the first y category on the bottom, so the order passes through.
    expect(readField(option.yAxis, 'data')).toEqual(['row-0', 'row-1'])
    expect(readField(option.xAxis, 'name')).toBeUndefined()
    expect(readField(option.yAxis, 'name')).toBeUndefined()
  })

  it('names the axes only when asked', () => {
    const option = build({ xAxisName: 'Weekday', yAxisName: 'Bucket' })
    expect(readField(option.xAxis, 'name')).toBe('Weekday')
    expect(readField(option.yAxis, 'name')).toBe('Bucket')
  })

  it('declares a horizontal visual map under the plot by default', () => {
    const option = build()
    expect(readField(option.visualMap, 'type')).toBe('continuous')
    expect(readField(option.visualMap, 'orient')).toBe('horizontal')
    expect(readField(option.visualMap, 'left')).toBe('center')
    expect(readField(option.visualMap, 'bottom')).toBe(0)
  })

  it('drops the visual map when visualMap is false', () => {
    expect(build({ visualMap: false }).visualMap).toBeUndefined()
  })

  it('bounds the colour scale only when min and max are passed', () => {
    expect(readField(build().visualMap, 'min')).toBeUndefined()
    expect(readField(build().visualMap, 'max')).toBeUndefined()

    const bounded = build({ min: 0, max: 6 })
    expect(readField(bounded.visualMap, 'min')).toBe(0)
    expect(readField(bounded.visualMap, 'max')).toBe(6)
  })

  it('shows cell labels only when showLabel is set', () => {
    expect(readField(readField(firstSeries(build()), 'label'), 'show')).toBe(false)
    expect(readField(readField(firstSeries(build({ showLabel: true })), 'label'), 'show')).toBe(true)
  })

  it('appends the unit to tooltip values only when passed', () => {
    const formatter = readField(build({ unit: '次' }).tooltip, 'valueFormatter')
    expect(typeof formatter).toBe('function')
    const text = typeof formatter === 'function' ? String(Reflect.apply(formatter, undefined, [42])) : undefined
    expect(text).toBe('42次')

    expect(readField(build().tooltip, 'valueFormatter')).toBeUndefined()
    expect(readField(build().tooltip, 'trigger')).toBe('item')
  })

  it('lets a caller override win, replacing the series array wholesale', () => {
    const overridden = mergeChartOption(build(), {
      tooltip: { trigger: 'axis' },
      visualMap: { bottom: 24 },
      series: [{ type: 'custom' }],
    })

    expect(readField(overridden.tooltip, 'trigger')).toBe('axis')
    expect(readField(overridden.visualMap, 'bottom')).toBe(24)
    expect(readField(overridden.visualMap, 'orient')).toBe('horizontal')
    expect(overridden.series).toEqual([{ type: 'custom' }])
  })
})
