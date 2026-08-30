export interface SankeyNodeData {
  id?: string
  name: string
  color?: string
  /** Optional value/count displayed with the node label. */
  value?: number
  /** Additional rows shown in the tooltip (e.g. `{ Apps: 166, Sessions: 122600 }`). */
  tooltipData?: Record<string, number | string>
  isDrillable?: boolean
  childCount?: number
}

export interface SankeyLinkData {
  id?: string
  /** Index of the source node in the `nodes` array. */
  source: number
  /** Index of the target node in the `nodes` array. */
  target: number
  value: number
  isDrillable?: boolean
}

/** Parameters passed to the tooltip slot / formatter. */
export interface SankeyTooltipParams {
  type: 'node' | 'link'
  name: string
  node?: SankeyNodeData
  link?: { source: string, target: string, value: number }
  color?: string
}

export interface SankeyChartProps {
  /** Nodes of the diagram. */
  nodes: SankeyNodeData[]
  /** Links connecting nodes by index. */
  links: SankeyLinkData[]
  /** Chart height in pixels. @default 400 */
  height?: number
  /** Explicit width in pixels (SSR/tests). Defaults to the measured container. */
  width?: number
  /** Node rectangle width. @default 8 */
  nodeWidth?: number
  /** Vertical gap between nodes in a column. @default 10 */
  nodePadding?: number
  /**
   * Show node values with labels: `'auto'` shows them when any node has a
   * value. (Tri-state because Vue casts an absent Boolean prop to `false`.)
   * @default 'auto'
   */
  showNodeValues?: boolean | 'auto'
  /**
   * Label layout when values are shown: `stacked` puts the value above the
   * name, `inline` renders "value name" on one line. @default 'stacked'
   */
  nodeLabelLayout?: 'stacked' | 'inline'
  /** Format for node/link values. @default value => value.toLocaleString() */
  formatValue?: (value: number) => string
  /** Show the hover tooltip. @default true */
  showTooltip?: boolean
  /** Fallback node color before the categorical palette applies. */
  defaultNodeColor?: string
  /** Left padding of the layout: px number or percent string. @default '5%' */
  left?: number | string
  /** Right padding of the layout: px number or percent string. @default '5%' */
  right?: number | string
  /** Link fill: `gradient` blends source→target colors, `gray` is flat. @default 'gradient' */
  linkColor?: 'gradient' | 'gray'
  /** Link opacity in gradient mode. @default 0.5 */
  linkOpacity?: number
}
