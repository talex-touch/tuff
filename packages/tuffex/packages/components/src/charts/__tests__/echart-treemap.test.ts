import type { TreemapNode } from '../src/echart/src/options/treemap'
import { describe, expect, it } from 'vitest'
import { mergeChartOption } from '../src/echart/src/core/shared'
import { buildTreemapChartOption } from '../src/echart/src/options/treemap'

type BuiltOption = ReturnType<typeof buildTreemapChartOption>

interface SeriesShape {
  type?: string
  roam?: boolean
  breadcrumb?: { show?: boolean }
  label?: { show?: boolean }
  upperLabel?: { show?: boolean }
  data?: SeriesShape[]
  name?: string
  value?: number
  itemStyle?: { color?: string }
}

interface TooltipShape {
  valueFormatter?: (value: unknown, index: number) => string
}

/** ECharts accepts a component or an array of them, so normalise before reading. */
function seriesList(option: BuiltOption): SeriesShape[] {
  const series: unknown = option.series
  if (Array.isArray(series))
    return series as SeriesShape[]
  return series ? [series as SeriesShape] : []
}

function tooltipOf(option: BuiltOption): TooltipShape {
  const tooltip: unknown = option.tooltip
  const first = Array.isArray(tooltip) ? tooltip[0] : tooltip
  return (first ?? {}) as TooltipShape
}

const tree: TreemapNode[] = [
  { name: '桌面端', children: [
    { name: '工作台', children: [
      { name: '概览', value: 26 },
      { name: '快捷命令', value: 20 },
    ] },
    { name: '插件市场', value: 28, color: '#f59e0b' },
  ] },
  { name: '移动端', value: 12 },
]

describe('buildTreemapChartOption', () => {
  it('declares exactly one treemap series', () => {
    const list = seriesList(buildTreemapChartOption({ data: tree }))

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe('treemap')
  })

  it('preserves nested children at every depth', () => {
    const [series] = seriesList(buildTreemapChartOption({ data: tree }))

    expect(series?.data?.map(node => node.name)).toEqual(['桌面端', '移动端'])
    expect(series?.data?.[0]?.children?.[0]?.name).toBe('工作台')
    expect(series?.data?.[0]?.children?.[0]?.children?.map(node => node.name))
      .toEqual(['概览', '快捷命令'])
    expect(series?.data?.[0]?.children?.[0]?.children?.[1]?.value).toBe(20)
    expect(series?.data?.[1]?.children).toBeUndefined()
  })

  it('maps a node colour onto its itemStyle', () => {
    const [series] = seriesList(buildTreemapChartOption({ data: tree }))
    const nested = series?.data?.[0]?.children

    expect(nested?.[1]?.itemStyle?.color).toBe('#f59e0b')
    expect(nested?.[0]?.itemStyle).toBeUndefined()
  })

  it('keeps the breadcrumb off until it is asked for', () => {
    const off = seriesList(buildTreemapChartOption({ data: tree }))[0]
    const on = seriesList(buildTreemapChartOption({ data: tree, showBreadcrumb: true }))[0]

    expect(off?.breadcrumb?.show).toBe(false)
    expect(on?.breadcrumb?.show).toBe(true)
  })

  it('hides labels when showLabel is false and only shows upper labels for hierarchies', () => {
    const hierarchy = seriesList(buildTreemapChartOption({ data: tree }))[0]
    const leavesOnly = seriesList(buildTreemapChartOption({ data: [{ name: 'A', value: 1 }] }))[0]
    const hidden = seriesList(buildTreemapChartOption({ data: tree, showLabel: false }))[0]

    expect(hierarchy?.label?.show).toBe(true)
    expect(hierarchy?.upperLabel?.show).toBe(true)
    expect(leavesOnly?.upperLabel?.show).toBe(false)
    expect(hidden?.label?.show).toBe(false)
    expect(hidden?.upperLabel?.show).toBe(false)
  })

  it('passes roam through to the series', () => {
    const still = seriesList(buildTreemapChartOption({ data: tree }))[0]
    const roaming = seriesList(buildTreemapChartOption({ data: tree, roam: true }))[0]

    expect(still?.roam).toBe(false)
    expect(roaming?.roam).toBe(true)
  })

  it('appends the unit to tooltip values when one is given', () => {
    const bare = buildTreemapChartOption({ data: tree })
    const withUnit = buildTreemapChartOption({ data: tree, unit: 'GB' })

    expect(tooltipOf(bare).valueFormatter).toBeUndefined()
    expect(tooltipOf(withUnit).valueFormatter?.(12, 0)).toBe('12GB')
  })

  it('lets a caller override win, replacing the series array wholesale', () => {
    const built = buildTreemapChartOption({ data: tree, showBreadcrumb: true })
    const replaced = mergeChartOption(built, { series: [{ type: 'treemap', roam: true }] })
    const patched = mergeChartOption(built, { tooltip: { show: false } })

    expect(replaced.series).toEqual([{ type: 'treemap', roam: true }])
    expect(seriesList(patched)[0]?.breadcrumb?.show).toBe(true)
    expect(tooltipOf(patched)).toMatchObject({ show: false })
  })
})
