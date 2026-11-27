/**
 * Types for TxFlowchart — an interactive workflow canvas with Bezier/stepped
 * connectors, live signal pulses, execution statuses, and pan/zoom controls.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @public
 */

/**
 * Accent tone shared by node category chips, edge connectors, labels and ports.
 *
 * Mirrors the BUI accent set rather than the `--tx-*` semantic ramp, because
 * chips name a *kind of step* (trigger, branch, action) and connectors carry
 * matching visual semantics.
 *
 * @public
 */
export type FlowNodeTone = 'violet' | 'orange' | 'accent' | 'green' | 'red' | 'neutral'

/**
 * Execution or runtime status ring rendered around a node card.
 *
 * @public
 */
export type FlowNodeStatus = 'idle' | 'active' | 'running' | 'success' | 'warning' | 'error'

/**
 * Connector routing curve geometry.
 *
 * @public
 */
export type FlowEdgeType = 'bezier' | 'smoothstep' | 'straight'

/**
 * Endpoint marker drawn where a connector meets its target node.
 *
 * @public
 */
export type FlowEdgeMarker = 'none' | 'arrow' | 'dot'

/**
 * Primary flow axis determining connector anchor sides.
 *
 * - `'vertical'`: edges exit the bottom edge and enter the top edge.
 * - `'horizontal'`: edges exit the right edge and enter the left edge.
 *
 * @public
 */
export type FlowDirection = 'vertical' | 'horizontal'

/**
 * Canvas backdrop grid pattern.
 *
 * @public
 */
export type FlowBackground = 'dots' | 'lines' | 'cross' | 'none'

/**
 * Camera transform of the canvas viewport.
 *
 * @public
 */
export interface FlowViewport {
  /** Horizontal pan offset in px. */
  x: number
  /** Vertical pan offset in px. */
  y: number
  /** Zoom scale factor (1 = 100%). */
  zoom: number
}

/**
 * Localized accessible labels for the optional HUD controls and minimap.
 *
 * @public
 */
export interface FlowchartLabels {
  zoomIn?: string
  zoomOut?: string
  fitView?: string
  resetView?: string
  minimap?: string
}

/**
 * One node on the canvas.
 *
 * Positions are canvas coordinates in CSS pixels: `x` is the node's horizontal
 * centre (nodes are centred on it, matching upstream's `-translate-x-1/2`), `y`
 * is its top edge.
 *
 * @public
 */
export interface FlowNode {
  /** Stable identity; also what {@link FlowEdge} endpoints reference. */
  id: string

  /** Category chip rendered above the card. Omit for a card with no chip. */
  label?: string

  /**
   * Chip colour.
   * @default 'neutral'
   */
  tone?: FlowNodeTone

  /** Horizontal centre of the node, in canvas coordinates. */
  x: number

  /** Top edge of the node, in canvas coordinates. */
  y: number

  /** Per-node width override, in px. Falls back to the component's `nodeWidth`. */
  width?: number

  /**
   * Whether this node can be dragged. Only consulted when the component's
   * `draggable` is on.
   * @default true
   */
  draggable?: boolean

  /**
   * Runtime/execution state ring around the node card.
   * @default 'idle'
   */
  status?: FlowNodeStatus

  /** Mark this node as selected (in addition to `selectedId` prop). */
  selected?: boolean

  /** Per-node override for showing connection ports. */
  ports?: boolean

  /**
   * Optional built-in card title rendered when the `#node` slot is omitted.
   * Has no effect when the caller supplies a `#node` slot.
   */
  title?: string

  /** Optional built-in card subtitle rendered under `title`. */
  description?: string

  /** Optional built-in compact metadata tag rendered in the default card footer. */
  meta?: string

  /** Optional built-in short status/badge label rendered beside `title`. */
  badge?: string
}

/**
 * A directed connection between two nodes.
 *
 * @public
 */
export interface FlowEdge {
  /** Optional stable key; falls back to `from`/`to` + index when omitted. */
  id?: string

  /** Source {@link FlowNode.id}. */
  from: string

  /** Target {@link FlowNode.id}. */
  to: string

  /**
   * Draw the connector as a dashed line.
   * @default false
   */
  dashed?: boolean

  /**
   * Curve geometry override for this edge. Falls back to the component's `edgeType`.
   */
  type?: FlowEdgeType

  /**
   * Accent colour for the connector stroke, marker, pulse and label.
   * @default 'neutral'
   */
  tone?: FlowNodeTone

  /**
   * Animate dashed strokes marching from `from` toward `to`.
   * Respects `prefers-reduced-motion: reduce`.
   * @default false
   */
  animated?: boolean

  /**
   * Render a luminous signal beam travelling along the connector path.
   * Respects `prefers-reduced-motion: reduce`.
   * @default false
   */
  pulse?: boolean

  /** Emphasise the connector with a stronger stroke and tone colour. */
  active?: boolean

  /** Short pill label rendered at the midpoint of the connector. */
  label?: string

  /** Endpoint marker override. Falls back to the component's `edgeMarker`. */
  markerEnd?: FlowEdgeMarker
}

/**
 * Props for the TxFlowchart component.
 *
 * @public
 */
export interface FlowchartProps {
  /** Nodes to place on the canvas. */
  nodes: FlowNode[]

  /**
   * Connections between nodes. Edges naming an unknown node id are skipped.
   * @default []
   */
  edges?: FlowEdge[]

  /**
   * Canvas height in px.
   * @default 333
   */
  height?: number

  /**
   * Default node width in px, overridable per node.
   * @default 290
   */
  nodeWidth?: number

  /**
   * Grid pitch in px. Also the step positions snap to while dragging.
   * @default 22
   */
  grid?: number

  /**
   * Render the dot grid. Kept for compatibility; superseded when `background` is set.
   * @default true
   */
  dots?: boolean

  /**
   * Canvas backdrop pattern (`'dots' | 'lines' | 'cross' | 'none'`).
   * Defaults to `'dots'` when `dots` is true and `'none'` otherwise.
   */
  background?: FlowBackground

  /**
   * Primary layout axis determining where edges connect on cards.
   * @default 'vertical'
   */
  direction?: FlowDirection

  /**
   * Default routing curve for edges that do not set `edge.type`.
   * @default 'bezier'
   */
  edgeType?: FlowEdgeType

  /**
   * Default endpoint marker for edges that do not set `edge.markerEnd`.
   * @default 'none'
   */
  edgeMarker?: FlowEdgeMarker

  /**
   * Render subtle anchor port dots where edges enter and leave cards.
   * @default false
   */
  ports?: boolean

  /**
   * Controlled selected node id.
   */
  selectedId?: string | null

  /**
   * Allow dragging nodes. The component stays controlled either way — it emits
   * `node-move` and never mutates `nodes`.
   * @default false
   */
  draggable?: boolean

  /**
   * Snap dragged nodes to the grid.
   * @default true
   */
  snap?: boolean

  /**
   * Show subtle alignment guide hairlines while dragging a node in line with peers.
   * @default true
   */
  snapGuides?: boolean

  /**
   * Allow dragging the empty canvas backdrop to pan the viewport.
   * @default false
   */
  pannable?: boolean

  /**
   * Allow zooming the viewport with Ctrl/Cmd + wheel or via the controls HUD.
   * Plain wheel scrolling stays untouched so docs pages remain scrollable.
   * @default false
   */
  zoomable?: boolean

  /**
   * Minimum zoom level when zooming is enabled.
   * @default 0.45
   */
  minZoom?: number

  /**
   * Maximum zoom level when zooming is enabled.
   * @default 1.75
   */
  maxZoom?: number

  /**
   * Show the floating zoom / fit-to-view HUD in the bottom-right corner.
   * @default false
   */
  controls?: boolean

  /**
   * Show a live interactive SVG minimap of all nodes and the current viewport.
   * @default false
   */
  minimap?: boolean

  /**
   * Accessible name for the canvas region.
   * @default 'Workflow'
   */
  ariaLabel?: string

  /**
   * Optional localized accessible labels for HUD buttons and minimap.
   */
  labels?: FlowchartLabels
}

/**
 * Emits for the TxFlowchart component.
 *
 * @public
 */
export interface FlowchartEmits {
  /**
   * A node finished moving. The host owns `nodes`, so it must write these
   * coordinates back for the move to persist.
   */
  (e: 'node-move', payload: { id: string, x: number, y: number }): void

  /** A node was activated by click, Enter or Space. */
  (e: 'node-click', payload: { id: string, node: FlowNode }): void

  /** A connector or its midpoint label was clicked. */
  (e: 'edge-click', payload: { edge: FlowEdge, index: number }): void

  /** The empty canvas background was clicked (not after a drag/pan). */
  (e: 'canvas-click'): void

  /** The viewport pan or zoom changed. */
  (e: 'viewport-change', payload: FlowViewport): void
}
