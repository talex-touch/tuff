import type { EChartsOption } from 'echarts'
import { describe, expect, it } from 'vitest'
import { buildPieChartOption } from '../src/echart/src/options/pie'
import { mergeChartOption } from '../src/echart/src/core/shared'

const data = [
  { name: 'Docs', value: 4820 },
  { name: 'Blog', value: 3160 },
  { name: 'Store', value: 2140 },
]

/** Reads a property off an ECharts option node without asserting its union shape. */
function field(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null)
    return undefined
  return Reflect.get(source, key)
}

/** The single pie slice the builder declares. */
function pieSlice(option: EChartsOption): unknown {
  const series = field(option, 'series')
  expect(Array.isArray(series)).toBe(true)
  const list = series as unknown[]
  expect(list).toHaveLength(1)
  return list[0]
}

/** First entry of a radius expressed as `[inner, outer]`. */
function innerRadius(slice: unknown): unknown {
  const radius = field(slice, 'radius')
  return Array.isArray(radius) ? radius[0] : undefined
}

function tooltipValueFormatter(option: EChartsOption): unknown {
  return field(field(option, 'tooltip'), 'valueFormatter')
}


describe('buildPieChartOption', () => {
  it('declares one item-triggered pie series carrying the caller data', () => {
    const option = buildPieChartOption({ data })
    const slice = pieSlice(option)

    expect(field(slice, 'type')).toBe('pie')
    expect(field(slice, 'data')).toEqual(data)
    expect(field(slice, 'avoidLabelOverlap')).toBe(true)
    expect(field(option, 'tooltip')).toMatchObject({ trigger: 'item' })
    expect(field(slice, 'label')).toMatchObject({ position: 'outside' })
  })

  it('keeps a per-slice colour override and passes the rest through untouched', () => {
    const option = buildPieChartOption({
      data: [{ name: 'Docs', value: 10, color: '#ff0000' }, { name: 'Blog', value: 5 }],
    })

    expect(field(pieSlice(option), 'data')).toEqual([
      { name: 'Docs', value: 10, itemStyle: { color: '#ff0000' } },
      { name: 'Blog', value: 5 },
    ])
  })

  it('is a solid pie until a donut is asked for', () => {
    expect(field(pieSlice(buildPieChartOption({ data })), 'radius')).toBe('70%')
    expect(innerRadius(pieSlice(buildPieChartOption({ data, donut: false })))).toBeUndefined()
  })

  it('hollows the centre for `donut: true`', () => {
    expect(innerRadius(pieSlice(buildPieChartOption({ data, donut: true })))).toBe('60%')
  })

  it('honours a numeric donut radius and clamps it to 0–90', () => {
    expect(innerRadius(pieSlice(buildPieChartOption({ data, donut: 35 })))).toBe('35%')
    expect(innerRadius(pieSlice(buildPieChartOption({ data, donut: 140 })))).toBe('90%')
  })

  it('only sets roseType when asked', () => {
    expect(field(pieSlice(buildPieChartOption({ data })), 'roseType')).toBeUndefined()
    expect(field(pieSlice(buildPieChartOption({ data, roseType: true })), 'roseType')).toBe('radius')
  })

  it('shows a legend by default and drops it when hidden', () => {
    expect(field(buildPieChartOption({ data }), 'legend')).toMatchObject({
      data: ['Docs', 'Blog', 'Store'],
    })
    expect(field(buildPieChartOption({ data, showLegend: false }), 'legend')).toBeUndefined()
  })

  it('places slice labels where asked', () => {
    const option = buildPieChartOption({ data, labelPosition: 'center' })
    expect(field(pieSlice(option), 'label')).toMatchObject({ position: 'center' })
  })

  it('renders the centre label as a centred title only for a donut', () => {
    const donut = buildPieChartOption({ data, donut: true, centerLabel: 'Traffic' })
    expect(field(donut, 'title')).toEqual({
      text: 'Traffic',
      left: 'center',
      top: 'center',
      textAlign: 'center',
    })

    expect(field(buildPieChartOption({ data, centerLabel: 'Traffic' }), 'title')).toBeUndefined()
  })

  it('appends the unit to tooltip values', () => {
    const unitFormatter = tooltipValueFormatter(buildPieChartOption({ data, unit: '次' }))
    expect(typeof unitFormatter).toBe('function')
    expect(typeof unitFormatter === 'function' ? unitFormatter(4820) : '').toBe('4820 次')
    expect(tooltipValueFormatter(buildPieChartOption({ data }))).toBeUndefined()
  })
})

describe('mergeChartOption over a built pie option', () => {
  it('lets the caller override a built key', () => {
    const merged = mergeChartOption(buildPieChartOption({ data }), { tooltip: { trigger: 'axis' } })
    expect(field(merged, 'tooltip')).toMatchObject({ trigger: 'axis' })
  })

  it('replaces the series array wholesale', () => {
    const merged = mergeChartOption(buildPieChartOption({ data, donut: true }), {
      series: [{ type: 'pie', data: [{ name: 'Only', value: 1 }] }],
    })
    const slice = pieSlice(merged)
    expect(field(slice, 'data')).toEqual([{ name: 'Only', value: 1 }])
    expect(field(slice, 'radius')).toBeUndefined()
  })
})
