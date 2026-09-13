import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface HeatmapChartProps extends EChartSharedProps {
  /**
   * Cell values as a row-major matrix: `values[row][column]`, so the outer
   * array follows `rows` and the inner array follows `columns`.
   */
  values: number[][]
  /**
   * Y-axis category labels, passed through untouched — ECharts plots the first
   * category on the bottom, so the first entry reads as the lowest row.
   */
  rows: string[]
  /** X-axis category labels, left to right. */
  columns: string[]
  xAxisName?: string
  yAxisName?: string
  /** Continuous colour scale under the plot. @default true */
  visualMap?: boolean
  /** Bottom of the colour scale; ECharts derives it from the data when omitted. */
  min?: number
  /** Top of the colour scale; ECharts derives it from the data when omitted. */
  max?: number
  /** Print each cell's value inside its cell. @default false */
  showLabel?: boolean
  /** Suffix appended to tooltip values, e.g. `'次'`. */
  unit?: string
}

/** Pure option builder — colours, axes and grid chrome come from TxEChart. */
export function buildHeatmapChartOption(props: HeatmapChartProps): EChartsOption {
  const { values, rows, columns, xAxisName, yAxisName, unit } = props
  const showVisualMap = props.visualMap ?? true
  const showLabel = props.showLabel ?? false

  return mergeChartOption<EChartsOption>({
    tooltip: {
      trigger: 'item',
      ...(unit ? { valueFormatter: (value: unknown) => valueText(value, unit) } : {}),
    },
    grid: {},
    ...(showVisualMap
      ? {
          visualMap: {
            type: 'continuous',
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            ...(props.min === undefined ? {} : { min: props.min }),
            ...(props.max === undefined ? {} : { max: props.max }),
          },
        }
      : {}),
    xAxis: {
      type: 'category',
      data: columns,
      ...(xAxisName ? { name: xAxisName } : {}),
    },
    yAxis: {
      type: 'category',
      data: rows,
      ...(yAxisName ? { name: yAxisName } : {}),
    },
    series: [
      {
        type: 'heatmap',
        data: heatmapCells(values),
        label: { show: showLabel },
        emphasis: { focus: 'self' },
      },
    ],
  })
}

/**
 * Flattens the matrix into the `[columnIndex, rowIndex, value]` triples ECharts
 * plots, in `values` order — row by row, left to right.
 */
function heatmapCells(values: number[][]): Array<[number, number, number]> {
  const cells: Array<[number, number, number]> = []
  values.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      cells.push([columnIndex, rowIndex, value])
    })
  })
  return cells
}

/** Tooltip text for one value: the raw value with the caller's unit appended. */
function valueText(value: unknown, unit: string): string {
  return value === undefined || value === null ? '' : `${String(value)}${unit}`
}
