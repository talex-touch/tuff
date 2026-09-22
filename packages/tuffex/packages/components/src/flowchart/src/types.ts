/**
 * Types for TxFlowchart — a dotted-canvas workflow surface.
 *
 * Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
 *
 * @public
 */

/**
 * Chip tone for a node's category label.
 *
 * Mirrors the BUI accent set rather than the `--tx-*` semantic ramp, because the
 * chip names a *kind of step* (trigger, branch, action), not a status.
 *
 * @public
 */
export type FlowNodeTone = 'violet' | 'orange' | 'accent' | 'green' | 'red' | 'neutral'

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
}

/**
 * A directed connection, drawn from the bottom edge of `from` to the top edge
 * of `to`.
 *
 * @public
 */
export interface FlowEdge {
  /** Source {@link FlowNode.id}. */
  from: string

  /** Target {@link FlowNode.id}. */
  to: string

  /**
   * Draw the connector as a dashed line.
   * @default false
   */
  dashed?: boolean
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
   * Dot-grid pitch in px. Also the step positions snap to while dragging.
   * @default 22
   */
  grid?: number

  /**
   * Render the dot grid.
   * @default true
   */
  dots?: boolean

  /**
   * Allow dragging nodes. The component stays controlled either way — it emits
   * `node-move` and never mutates `nodes`.
   * @default false
   */
  draggable?: boolean

  /**
   * Snap dragged nodes to the dot grid.
   * @default true
   */
  snap?: boolean

  /**
   * Accessible name for the canvas region.
   * @default 'Workflow'
   */
  ariaLabel?: string
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
}
