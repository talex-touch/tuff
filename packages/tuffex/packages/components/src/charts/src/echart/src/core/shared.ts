import type { EChartsOption } from 'echarts'
import type { EChartThemeTokens } from '../core/theme'

/**
 * Merges an override into a built option. Plain objects merge key by key, so an
 * override can touch `series[0].areaStyle` without restating the series; arrays
 * are replaced wholesale, because that is what a caller passing a new `data`
 * array means and index-merging arrays would leave stale entries behind.
 */
export function mergeChartOption<T extends object>(base: T, override?: object): T {
  if (!override)
    return base
  return deepMerge(base, override) as T
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override))
    return override as T

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined)
      continue
    const current = result[key]
    result[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value
  }
  return result as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Family defaults under a caller's component. The defaults are a subset of the
 * component by construction, so the merge only fills keys the caller left out —
 * typed by hand because ECharts declares every component as its own interface
 * and a defaults record has no shape to unify with.
 */
function withDefaults<T extends object>(component: T, defaults: object): T {
  return deepMerge(defaults, component) as T
}

/** ECharts accepts a single component or an array of them. */
function mapComponents<T extends object>(list: T | T[], transform: (component: T) => T): T | T[] {
  return Array.isArray(list) ? list.map(transform) : transform(list)
}

/** `name` is only meaningful on axes; read it without asserting a shape. */
function readName(component: unknown): string | undefined {
  if (typeof component !== 'object' || component === null || !('name' in component))
    return undefined
  const name = component.name
  return typeof name === 'string' ? name : undefined
}

/** `show: false` is how a caller hides a component it still declares. */
function readShow(component: unknown): boolean | undefined {
  if (typeof component !== 'object' || component === null || !('show' in component))
    return undefined
  const show = component.show
  return typeof show === 'boolean' ? show : undefined
}

export interface EChartAxisDefaults {
  name?: string
  nameTextStyle: { color: string, fontSize: number }
  nameGap: number
  axisLine: { lineStyle: { color: string } }
  axisTick: { show: boolean }
  axisLabel: { color: string, fontSize: number }
  splitLine: { lineStyle: { color: string, type: 'dashed' } }
}

/** Axis defaults: dashed split lines, no tick marks, muted labels. */
export function axisDefaults(tokens: EChartThemeTokens, name?: string): EChartAxisDefaults {
  return {
    ...(name ? { name } : {}),
    nameTextStyle: { color: tokens.textMuted, fontSize: 11 },
    nameGap: 24,
    axisLine: { lineStyle: { color: tokens.axisLine } },
    axisTick: { show: false },
    axisLabel: { color: tokens.text, fontSize: 11 },
    splitLine: { lineStyle: { color: tokens.splitLine, type: 'dashed' } },
  }
}

export interface EChartLegendDefaults {
  top: number
  icon: string
  itemWidth: number
  itemHeight: number
  itemGap: number
  textStyle: { color: string, fontSize: number }
}

/** Legend defaults: small round swatches above the plot, muted labels. */
export function legendDefaults(tokens: EChartThemeTokens): EChartLegendDefaults {
  return {
    top: 0,
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 16,
    textStyle: { color: tokens.textMuted, fontSize: 11 },
  }
}

export interface EChartGridDefaults {
  left: number
  right: number
  top: number
  bottom: number
  containLabel: boolean
}

/**
 * Grid defaults: one legend row at the top, one colour-scale row at the bottom,
 * tight but breathable margins elsewhere. The bottom reserve keeps a docked
 * visual map from painting over the lowest plot row and its axis labels.
 */
export function gridDefaults(showLegend: boolean, showVisualMap = false): EChartGridDefaults {
  return {
    left: 8,
    right: 16,
    top: showLegend ? 34 : 12,
    bottom: showVisualMap ? 54 : 4,
    containLabel: true,
  }
}

/** Tooltip defaults: never paint outside the chart box. */
export function tooltipDefaults(): { confine: boolean, appendToBody: boolean } {
  return { confine: true, appendToBody: false }
}

/** Visual map defaults: the sequential token ramp, muted labels. */
export function visualMapDefaults(tokens: EChartThemeTokens): { inRange: { color: string[] }, textStyle: { color: string } } {
  return {
    inRange: { color: [...tokens.sequential] },
    textStyle: { color: tokens.textMuted },
  }
}

/**
 * A horizontal visual map declaring `bottom` sits under the plot and needs its
 * own row; a vertical one lives beside the plot and takes none.
 */
function isBottomDocked(component: unknown): boolean {
  return isPlainObject(component) && component.orient !== 'vertical' && component.bottom !== undefined
}

/**
 * Series chrome ECharts would otherwise paint with its own hard-coded colours:
 * a gauge dial ships a light-blue track, dark tick labels and an `auto` reading
 * that inherits the track, so the whole dial is restyled from tokens like the
 * axes are. The builder's own `detail.color` still wins when the caller asks
 * for an accent.
 */
function seriesDefaults(component: unknown, tokens: EChartThemeTokens): object {
  if (!isPlainObject(component) || component.type !== 'gauge')
    return {}
  return {
    axisLine: { lineStyle: { color: [[1, tokens.splitLine]] } },
    axisTick: { lineStyle: { color: tokens.splitLine } },
    splitLine: { lineStyle: { color: tokens.splitLine } },
    axisLabel: { color: tokens.text },
    detail: { color: tokens.text },
    title: { color: tokens.textMuted },
  }
}

/** Untouched series are returned as-is; only themed families pay for a copy. */
function decorateSeries<T extends object>(series: T, tokens: EChartThemeTokens): T {
  const defaults = seriesDefaults(series, tokens)
  return Object.keys(defaults).length === 0 ? series : withDefaults(series, defaults)
}

/**
 * Fills the family's styling into the components an option already declares —
 * axis lines, split lines, legend, grid chrome, colour scales and gauge dials.
 * Only present components are touched, so a pie chart never grows an axis it
 * never asked for, and anything the caller set wins.
 */
export function decorateChartOption(option: EChartsOption, tokens: EChartThemeTokens): EChartsOption {
  const result: EChartsOption = { ...option }
  const legend = result.legend
  const legendVisible = !!legend && (Array.isArray(legend)
    ? legend.some(entry => readShow(entry) !== false)
    : readShow(legend) !== false)
  const visualMaps = result.visualMap === undefined
    ? []
    : Array.isArray(result.visualMap) ? result.visualMap : [result.visualMap]
  const bottomDocked = visualMaps.some(map => readShow(map) !== false && isBottomDocked(map))

  if (result.tooltip)
    result.tooltip = mapComponents(result.tooltip, tooltip => withDefaults(tooltip, tooltipDefaults()))
  if (result.xAxis)
    result.xAxis = mapComponents(result.xAxis, axis => withDefaults(axis, axisDefaults(tokens, readName(axis))))
  if (result.yAxis)
    result.yAxis = mapComponents(result.yAxis, axis => withDefaults(axis, axisDefaults(tokens, readName(axis))))
  if (legend)
    result.legend = mapComponents(legend, entry => withDefaults(entry, legendDefaults(tokens)))
  if (result.visualMap)
    result.visualMap = mapComponents(result.visualMap, map => withDefaults(map, visualMapDefaults(tokens)))
  if (result.series)
    result.series = mapComponents(result.series, series => decorateSeries(series, tokens))
  if (result.grid || result.xAxis || result.yAxis)
    result.grid = mapComponents(result.grid ?? {}, grid => withDefaults(grid, gridDefaults(legendVisible, bottomDocked)))

  return result
}
