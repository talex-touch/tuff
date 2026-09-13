import { describe, expect, it } from 'vitest'
import { buildScatterChartOption } from '../src/echart/src/options/scatter'
import { mergeChartOption } from '../src/echart/src/core/shared'

const device: Array<[number, number]> = [[12, 140], [24, 186], [38, 214]]
const cloud: Array<[number, number]> = [[42, 305], [70, 415], [96, 476]]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function seriesOf(option: object): Record<string, unknown>[] {
  const list = isRecord(option) ? option.series : undefined
  return Array.isArray(list) ? list.filter(isRecord) : []
}

describe('buildScatterChartOption', () => {
  it('declares one scatter series per input and passes [x, y] pairs through', () => {
    const option = buildScatterChartOption({
      series: [{ name: 'On-device', data: device }, { name: 'Cloud', data: cloud }],
    })

    const series = seriesOf(option)
    expect(series).toHaveLength(2)
    expect(series.map(entry => entry.type)).toEqual(['scatter', 'scatter'])
    expect(series[0].name).toBe('On-device')
    expect(series[0].data).toEqual(device)
    expect(series[1].data).toEqual(cloud)
  })

  it('uses a value axis on both coordinates', () => {
    const option = buildScatterChartOption({ series: [{ name: 'A', data: device }] })

    expect(record(option.xAxis).type).toBe('value')
    expect(record(option.yAxis).type).toBe('value')
  })

  it('applies the chart-level symbol size and lets a series override it', () => {
    const option = buildScatterChartOption({
      series: [
        { name: 'Default', data: device },
        { name: 'Large', data: cloud, symbolSize: 18 },
      ],
    })

    const series = seriesOf(option)
    expect(series[0].symbolSize).toBe(8)
    expect(series[1].symbolSize).toBe(18)
  })

  it('accepts an explicit chart-level symbol size', () => {
    const option = buildScatterChartOption({
      series: [{ name: 'A', data: device }],
      symbolSize: 5,
    })

    expect(seriesOf(option)[0].symbolSize).toBe(5)
  })

  it('only declares an axis bound when the caller passed one', () => {
    const unbounded = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    expect(record(unbounded.xAxis)).not.toHaveProperty('min')
    expect(record(unbounded.xAxis)).not.toHaveProperty('max')
    expect(record(unbounded.yAxis)).not.toHaveProperty('min')
    expect(record(unbounded.yAxis)).not.toHaveProperty('max')

    const bounded = buildScatterChartOption({
      series: [{ name: 'A', data: device }],
      xMin: 0,
      xMax: 100,
      yMax: 500,
    })
    expect(record(bounded.xAxis).min).toBe(0)
    expect(record(bounded.xAxis).max).toBe(100)
    expect(record(bounded.yAxis)).not.toHaveProperty('min')
    expect(record(bounded.yAxis).max).toBe(500)
  })

  it('shows a legend by default only when more than one series is passed', () => {
    const single = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    expect(single).not.toHaveProperty('legend')

    const paired = buildScatterChartOption({
      series: [{ name: 'A', data: device }, { name: 'B', data: cloud }],
    })
    expect(paired).toHaveProperty('legend')

    const hidden = buildScatterChartOption({
      series: [{ name: 'A', data: device }, { name: 'B', data: cloud }],
      showLegend: false,
    })
    expect(hidden).not.toHaveProperty('legend')
  })

  it('hides the split lines when the grid is turned off', () => {
    const withGrid = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    expect(record(record(withGrid.xAxis).splitLine).show).not.toBe(false)

    const withoutGrid = buildScatterChartOption({
      series: [{ name: 'A', data: device }],
      grid: false,
    })
    expect(record(record(withoutGrid.xAxis).splitLine).show).toBe(false)
    expect(record(record(withoutGrid.yAxis).splitLine).show).toBe(false)
  })

  it('uses an item tooltip with a cross axis pointer', () => {
    const option = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    const tooltip = record(option.tooltip)

    expect(tooltip.trigger).toBe('item')
    expect(record(tooltip.axisPointer).type).toBe('cross')
  })

  it('names the axes only when asked', () => {
    const unnamed = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    expect(record(unnamed.xAxis)).not.toHaveProperty('name')
    expect(record(unnamed.yAxis)).not.toHaveProperty('name')

    const named = buildScatterChartOption({
      series: [{ name: 'A', data: device }],
      xAxisName: 'Latency (ms)',
      yAxisName: 'Throughput (req/s)',
    })
    expect(record(named.xAxis).name).toBe('Latency (ms)')
    expect(record(named.yAxis).name).toBe('Throughput (req/s)')
  })
})

describe('scatter option overrides', () => {
  it('lets a caller tweak a key while a series array replaces wholesale', () => {
    const built = buildScatterChartOption({ series: [{ name: 'A', data: device }] })
    const merged = mergeChartOption(built, {
      tooltip: { trigger: 'axis' },
      series: [{ name: 'Replacement', type: 'scatter', data: cloud }],
    })

    expect(record(merged.tooltip).trigger).toBe('axis')
    const series = seriesOf(merged)
    expect(series).toHaveLength(1)
    expect(series[0].name).toBe('Replacement')
    expect(series[0].data).toEqual(cloud)
  })
})
