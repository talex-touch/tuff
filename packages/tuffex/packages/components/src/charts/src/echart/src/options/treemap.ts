import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface TreemapNode {
  name: string
  /** Node magnitude; parents without one are sized by their children. */
  value?: number
  /** Tile colour for this node, overriding the theme palette. */
  color?: string
  /** Nested nodes; leaf node values are summed into the parent area. */
  children?: TreemapNode[]
}

export interface TreemapChartProps extends EChartSharedProps {
  data: TreemapNode[]
  /**
   * Render only the first N levels and enable ECharts' drill-down; omitted, the
   * whole tree is drawn at once. Maps onto the series' `leafDepth`.
   */
  maxDepth?: number
  /** Drill-down breadcrumb above the tiles. @default false */
  showBreadcrumb?: boolean
  /** Tile labels. @default true */
  showLabel?: boolean
  /** Suffix appended to values in the tooltip, e.g. `GB`. */
  unit?: string
  /** Zoom and pan the tiles. @default false */
  roam?: boolean
}

/** A treemap node in the shape the series consumes: colours live on `itemStyle`. */
interface TreemapSeriesNode {
  name: string
  value?: number
  itemStyle?: { color: string }
  children?: TreemapSeriesNode[]
}

/** Pure option builder — colours, borders and tooltip chrome come from TxEChart. */
export function buildTreemapChartOption(props: TreemapChartProps): EChartsOption {
  const { data, maxDepth, showBreadcrumb = false, showLabel = true, unit, roam = false } = props
  const hasChildren = data.some(node => (node.children?.length ?? 0) > 0)
  // ECharts limits treemap depth through `leafDepth` — `maxDepth` is not a
  // treemap series option, so the public prop maps onto the real one.
  const depthLimit: { leafDepth?: number } = maxDepth === undefined ? {} : { leafDepth: maxDepth }

  return mergeChartOption<EChartsOption>({
    tooltip: {
      trigger: 'item',
      ...(unit ? { valueFormatter: (value: unknown) => `${String(value)}${unit}` } : {}),
    },
    series: [
      {
        type: 'treemap',
        roam,
        breadcrumb: { show: showBreadcrumb },
        label: { show: showLabel },
        upperLabel: { show: showLabel && hasChildren },
        data: data.map(toSeriesNode),
        ...depthLimit,
      },
    ],
  })
}

/** Maps the public node shape onto the series shape, recursing through `children`. */
function toSeriesNode(node: TreemapNode): TreemapSeriesNode {
  return {
    name: node.name,
    ...(node.value === undefined ? {} : { value: node.value }),
    ...(node.color ? { itemStyle: { color: node.color } } : {}),
    ...(node.children ? { children: node.children.map(toSeriesNode) } : {}),
  }
}
