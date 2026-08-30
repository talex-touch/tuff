import type { SankeyLinkData, SankeyNodeData } from './types'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'

export interface SankeyLayoutOptions {
  width: number
  height: number
  nodeWidth: number
  nodePadding: number
  /** Pixel number or percent string (of `width`). */
  left: number | string
  right: number | string
}

export interface PositionedSankeyNode {
  index: number
  datum: SankeyNodeData
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface PositionedSankeyLink {
  index: number
  datum: SankeyLinkData
  sourceIndex: number
  targetIndex: number
  path: string
  /** Stroke width for the ribbon. */
  width: number
  /** Gradient bounds (source right edge → target left edge). */
  x1: number
  x2: number
}

export interface SankeyLayoutResult {
  nodes: PositionedSankeyNode[]
  links: PositionedSankeyLink[]
}

/** Resolves a px-or-percent edge inset against the container size. */
export function resolveEdgeInset(value: number | string, size: number): number {
  if (typeof value === 'number')
    return value
  const percent = Number.parseFloat(value)
  return Number.isFinite(percent) ? (percent / 100) * size : 0
}

interface LayoutNode {
  index: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
}

interface LayoutLink {
  source: number | LayoutNode
  target: number | LayoutNode
  value: number
  index?: number
  width?: number
}

/**
 * Runs the d3-sankey layout on copies of the inputs (it mutates them).
 * Returns `null` for degenerate input, including circular links — d3-sankey
 * throws on cycles and a chart should degrade, not crash the host.
 */
export function computeSankeyLayout(
  nodes: SankeyNodeData[],
  links: SankeyLinkData[],
  options: SankeyLayoutOptions,
): SankeyLayoutResult | null {
  if (nodes.length === 0 || options.width <= 0 || options.height <= 0)
    return { nodes: [], links: [] }

  const leftInset = resolveEdgeInset(options.left, options.width)
  const rightInset = resolveEdgeInset(options.right, options.width)

  const layoutNodes: LayoutNode[] = nodes.map((_, index) => ({ index }))
  const layoutLinks: LayoutLink[] = links.map(link => ({
    source: link.source,
    target: link.target,
    value: link.value,
  }))

  const generator = sankey<LayoutNode, LayoutLink>()
    .nodeWidth(options.nodeWidth)
    .nodePadding(options.nodePadding)
    .extent([
      [leftInset, 8],
      [Math.max(leftInset + 1, options.width - rightInset), Math.max(9, options.height - 8)],
    ])

  let layout: { nodes: LayoutNode[], links: LayoutLink[] }
  try {
    layout = generator({ nodes: layoutNodes, links: layoutLinks })
  }
  catch (error) {
    console.warn('[tuffex-charts] TxSankeyChart: invalid sankey input (circular links?)', error)
    return null
  }

  const pathGenerator = sankeyLinkHorizontal()

  return {
    nodes: layout.nodes.map(node => ({
      index: node.index,
      datum: nodes[node.index] as SankeyNodeData,
      x0: node.x0 ?? 0,
      x1: node.x1 ?? 0,
      y0: node.y0 ?? 0,
      y1: node.y1 ?? 0,
    })),
    links: layout.links.map((link, index) => {
      const source = link.source as LayoutNode
      const target = link.target as LayoutNode
      return {
        index,
        datum: links[index] as SankeyLinkData,
        sourceIndex: source.index,
        targetIndex: target.index,
        path: pathGenerator(link as never) ?? '',
        width: Math.max(1, link.width ?? 1),
        x1: source.x1 ?? 0,
        x2: target.x0 ?? 0,
      }
    }),
  }
}
