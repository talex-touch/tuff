/**
 * Pure geometry helpers for TxFlowchart: connector curves, tangent-aligned
 * endpoint markers, alignment snap guides, bounding-box fitView and minimap
 * projection.
 *
 * Kept framework-free so every calculation is deterministic and directly
 * testable without layout or DOM APIs.
 */
import type { FlowDirection, FlowEdgeMarker, FlowEdgeType, FlowViewport } from './types'

export interface NodeBox {
  id: string
  /** Horizontal centre in canvas coordinates (matches `FlowNode.x`). */
  x: number
  /** Top edge in canvas coordinates (matches `FlowNode.y`). */
  y: number
  /** Full node width in px. */
  width: number
  /** Full node height in px (chip + gap + card). */
  height: number
  /** Vertical offset from node top to the card's top edge (0 when no chip or in jsdom). */
  cardTopOffset?: number
  /** Vertical offset from node top to the card's vertical centre (used in horizontal mode). */
  cardMidOffsetY?: number
}

export interface EdgeGeometry {
  d: string
  labelX: number
  labelY: number
  markerType: FlowEdgeMarker
  /** SVG path `d` for `'arrow'` marker. */
  arrowPath?: string
  /** Endpoint dot coordinates for `'dot'` marker. */
  dot?: { cx: number, cy: number }
}

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Canvas coordinate (x for vertical line, y for horizontal line). */
  position: number
  from: number
  to: number
}

/**
 * Upstream Bezier control-point factor: placing both control points slightly
 * past the midpoint (±0.55) keeps aligned pairs straight while offset pairs
 * exit and enter their cards cleanly perpendicular to the anchor edge.
 */
const BEZIER_CONTROL_RATIO = 0.55
const STEP_CORNER_RADIUS = 12
const STEP_STUB = 22
const ARROW_LEN = 7
const ARROW_HALF_W = 4.2

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Build a rounded polyline SVG path from an ordered list of points.
 */
function buildRoundedPolyline(points: readonly [number, number][], maxRadius: number): string {
  if (points.length === 0)
    return ''
  if (points.length === 1)
    return `M ${roundCoord(points[0]![0])} ${roundCoord(points[0]![1])}`

  // Drop consecutive duplicate points so corner math never divides by zero.
  const pts: [number, number][] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1]!
    const curr = points[i]!
    if (Math.hypot(curr[0] - prev[0], curr[1] - prev[1]) > 0.5)
      pts.push(curr)
  }

  if (pts.length === 2) {
    const [a, b] = pts as [[number, number], [number, number]]
    return `M ${roundCoord(a[0])} ${roundCoord(a[1])} L ${roundCoord(b[0])} ${roundCoord(b[1])}`
  }

  let d = `M ${roundCoord(pts[0]![0])} ${roundCoord(pts[0]![1])}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!

    const v1x = prev[0] - curr[0]
    const v1y = prev[1] - curr[1]
    const len1 = Math.hypot(v1x, v1y)

    const v2x = next[0] - curr[0]
    const v2y = next[1] - curr[1]
    const len2 = Math.hypot(v2x, v2y)

    const r = Math.min(maxRadius, len1 / 2, len2 / 2)
    if (r < 0.5) {
      d += ` L ${roundCoord(curr[0])} ${roundCoord(curr[1])}`
      continue
    }

    const startX = curr[0] + (v1x / len1) * r
    const startY = curr[1] + (v1y / len1) * r
    const endX = curr[0] + (v2x / len2) * r
    const endY = curr[1] + (v2y / len2) * r

    d += ` L ${roundCoord(startX)} ${roundCoord(startY)} Q ${roundCoord(curr[0])} ${roundCoord(curr[1])}, ${roundCoord(endX)} ${roundCoord(endY)}`
  }

  const last = pts[pts.length - 1]!
  d += ` L ${roundCoord(last[0])} ${roundCoord(last[1])}`
  return d
}

/**
 * Compute an open chevron arrowhead at `(tipX, tipY)` pointing along unit
 * direction `(ux, uy)`. Drawn directly in the SVG so there are no `<defs>` ID
 * collisions across multiple canvases and tones inherit cleanly via CSS.
 */
function buildArrowPath(tipX: number, tipY: number, ux: number, uy: number): string {
  const bx = tipX - ux * ARROW_LEN
  const by = tipY - uy * ARROW_LEN
  const px = -uy * ARROW_HALF_W
  const py = ux * ARROW_HALF_W
  const lx = roundCoord(bx + px)
  const ly = roundCoord(by + py)
  const rx = roundCoord(bx - px)
  const ry = roundCoord(by - py)
  return `M ${lx} ${ly} L ${roundCoord(tipX)} ${roundCoord(tipY)} L ${rx} ${ry}`
}

/**
 * Compute SVG path, label anchor, and end marker geometry for one edge.
 */
export function computeEdgeGeometry(
  from: NodeBox,
  to: NodeBox,
  direction: FlowDirection,
  type: FlowEdgeType,
  markerEnd: FlowEdgeMarker,
): EdgeGeometry {
  let x1: number
  let y1: number
  let x2: number
  let y2: number

  if (direction === 'horizontal') {
    const fromMidY = from.cardMidOffsetY ?? (from.height / 2)
    const toMidY = to.cardMidOffsetY ?? (to.height / 2)
    x1 = from.x + from.width / 2
    y1 = from.y + fromMidY
    x2 = to.x - to.width / 2
    y2 = to.y + toMidY
  }
  else {
    // Vertical mode: bottom centre of `from` -> top centre of `to`'s card
    // (`cardTopOffset` is 0 when there is no chip or in jsdom, preserving tests).
    x1 = from.x
    y1 = from.y + from.height
    x2 = to.x
    y2 = to.y + (to.cardTopOffset ?? 0)
  }

  // Pull the endpoint back by 1.5px when drawing an arrow so the tip kisses the
  // target card's hairline ring cleanly instead of clipping underneath it.
  let d = ''
  let labelX = (x1 + x2) / 2
  let labelY = (y1 + y2) / 2
  let ux = direction === 'horizontal' ? 1 : 0
  let uy = direction === 'horizontal' ? 0 : 1

  if (type === 'straight') {
    d = `M ${roundCoord(x1)} ${roundCoord(y1)} L ${roundCoord(x2)} ${roundCoord(y2)}`
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len > 0.01) {
      ux = dx / len
      uy = dy / len
    }
  }
  else if (type === 'smoothstep') {
    if (direction === 'horizontal') {
      if (x2 >= x1 + STEP_STUB) {
        const midX = (x1 + x2) / 2
        d = buildRoundedPolyline([[x1, y1], [midX, y1], [midX, y2], [x2, y2]], STEP_CORNER_RADIUS)
        labelX = midX
        labelY = (y1 + y2) / 2
      }
      else {
        // Loopback / backward horizontal step: route gracefully around the card.
        const detourY = y1 <= y2
          ? Math.min(from.y, to.y) - STEP_STUB
          : Math.max(from.y + from.height, to.y + to.height) + STEP_STUB
        d = buildRoundedPolyline(
          [[x1, y1], [x1 + STEP_STUB, y1], [x1 + STEP_STUB, detourY], [x2 - STEP_STUB, detourY], [x2 - STEP_STUB, y2], [x2, y2]],
          STEP_CORNER_RADIUS,
        )
        labelX = (x1 + x2) / 2
        labelY = detourY
      }
    }
    else {
      if (y2 >= y1 + STEP_STUB) {
        const midY = (y1 + y2) / 2
        d = buildRoundedPolyline([[x1, y1], [x1, midY], [x2, midY], [x2, y2]], STEP_CORNER_RADIUS)
        labelX = (x1 + x2) / 2
        labelY = midY
      }
      else {
        const detourX = x1 <= x2
          ? Math.max(from.x + from.width / 2, to.x + to.width / 2) + STEP_STUB
          : Math.min(from.x - from.width / 2, to.x - to.width / 2) - STEP_STUB
        d = buildRoundedPolyline(
          [[x1, y1], [x1, y1 + STEP_STUB], [detourX, y1 + STEP_STUB], [detourX, y2 - STEP_STUB], [x2, y2 - STEP_STUB], [x2, y2]],
          STEP_CORNER_RADIUS,
        )
        labelX = detourX
        labelY = (y1 + y2) / 2
      }
    }
  }
  else {
    // Bezier (default)
    if (direction === 'horizontal') {
      const span = x2 - x1
      const reach = span >= 0
        ? Math.max(span * BEZIER_CONTROL_RATIO, 28)
        : Math.max(Math.abs(span) * 0.45, 56)
      d = `M ${roundCoord(x1)} ${roundCoord(y1)} C ${roundCoord(x1 + reach)} ${roundCoord(y1)}, ${roundCoord(x2 - reach)} ${roundCoord(y2)}, ${roundCoord(x2)} ${roundCoord(y2)}`
      // Exact cubic Bezier midpoint at t = 0.5: (P0 + 3*P1 + 3*P2 + P3) / 8
      labelX = (x1 + 3 * (x1 + reach) + 3 * (x2 - reach) + x2) / 8
      labelY = (y1 + 3 * y1 + 3 * y2 + y2) / 8
    }
    else {
      const gap = y2 - y1
      const drop = gap >= 0 ? gap * BEZIER_CONTROL_RATIO : Math.max(Math.abs(gap) * 0.45, 56)
      const c1y = y1 + drop
      const c2y = y2 - drop
      d = `M ${roundCoord(x1)} ${roundCoord(y1)} C ${roundCoord(x1)} ${roundCoord(c1y)}, ${roundCoord(x2)} ${roundCoord(c2y)}, ${roundCoord(x2)} ${roundCoord(y2)}`
      labelX = (x1 + x2) / 2
      labelY = (y1 + 3 * c1y + 3 * c2y + y2) / 8
    }
  }

  const result: EdgeGeometry = {
    d,
    labelX: roundCoord(labelX),
    labelY: roundCoord(labelY),
    markerType: markerEnd,
  }

  if (markerEnd === 'arrow') {
    // Position the arrow tip slightly back from the target edge so it sits crisp
    // and clear right outside the card hairline shadow.
    const tipX = x2 - ux * 1.5
    const tipY = y2 - uy * 1.5
    result.arrowPath = buildArrowPath(tipX, tipY, ux, uy)
  }
  else if (markerEnd === 'dot') {
    result.dot = {
      cx: roundCoord(x2 - ux * 2.5),
      cy: roundCoord(y2 - uy * 2.5),
    }
  }

  return result
}

/**
 * Detect alignment guides between the currently dragged node and its peers.
 */
export function computeSnapGuides(
  active: NodeBox,
  peers: readonly NodeBox[],
  threshold = 6,
): SnapGuide[] {
  const guides: SnapGuide[] = []
  let bestX: SnapGuide | null = null
  let bestXDist = threshold + 1
  let bestY: SnapGuide | null = null
  let bestYDist = threshold + 1

  for (const peer of peers) {
    if (peer.id === active.id)
      continue

    const dx = Math.abs(peer.x - active.x)
    if (dx <= threshold && dx < bestXDist) {
      bestXDist = dx
      bestX = {
        axis: 'x',
        position: peer.x,
        from: Math.min(active.y, peer.y) - 16,
        to: Math.max(active.y + active.height, peer.y + peer.height) + 16,
      }
    }

    const dy = Math.abs(peer.y - active.y)
    if (dy <= threshold && dy < bestYDist) {
      bestYDist = dy
      bestY = {
        axis: 'y',
        position: peer.y,
        from: Math.min(active.x - active.width / 2, peer.x - peer.width / 2) - 16,
        to: Math.max(active.x + active.width / 2, peer.x + peer.width / 2) + 16,
      }
    }
  }

  if (bestX)
    guides.push(bestX)
  if (bestY)
    guides.push(bestY)
  return guides
}

/**
 * Compute a viewport transform that frames all node boxes cleanly inside the
 * given canvas width and height.
 */
export function computeFitViewport(
  boxes: readonly NodeBox[],
  canvasWidth: number,
  canvasHeight: number,
  minZoom: number,
  maxZoom: number,
  padding = 36,
): FlowViewport {
  if (!boxes.length || canvasWidth <= 0 || canvasHeight <= 0)
    return { x: 0, y: 0, zoom: 1 }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const box of boxes) {
    const left = box.x - box.width / 2
    const right = box.x + box.width / 2
    const top = box.y
    const bottom = box.y + Math.max(box.height, 64)
    if (left < minX) minX = left
    if (right > maxX) maxX = right
    if (top < minY) minY = top
    if (bottom > maxY) maxY = bottom
  }

  const contentW = Math.max(maxX - minX, 1)
  const contentH = Math.max(maxY - minY, 1)
  const availW = Math.max(canvasWidth - padding * 2, 40)
  const availH = Math.max(canvasHeight - padding * 2, 40)

  const rawZoom = Math.min(availW / contentW, availH / contentH, 1)
  const zoom = Math.min(maxZoom, Math.max(minZoom, roundCoord(rawZoom)))

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  return {
    x: roundCoord(canvasWidth / 2 - cx * zoom),
    y: roundCoord(canvasHeight / 2 - cy * zoom),
    zoom,
  }
}

export interface MinimapProjection {
  viewBox: string
  minX: number
  minY: number
  spanX: number
  spanY: number
  viewportRect: { x: number, y: number, width: number, height: number }
}

/**
 * Project canvas bounds + current viewport into a stable SVG viewBox for the minimap.
 */
export function computeMinimapProjection(
  boxes: readonly NodeBox[],
  canvasWidth: number,
  canvasHeight: number,
  viewport: FlowViewport,
  margin = 48,
): MinimapProjection {
  const safeW = Math.max(canvasWidth, 320)
  const safeH = Math.max(canvasHeight, 220)
  const safeZoom = Math.max(viewport.zoom, 0.1)

  const vpLeft = -viewport.x / safeZoom
  const vpTop = -viewport.y / safeZoom
  const vpWidth = safeW / safeZoom
  const vpHeight = safeH / safeZoom

  let minX = vpLeft
  let minY = vpTop
  let maxX = vpLeft + vpWidth
  let maxY = vpTop + vpHeight

  for (const box of boxes) {
    const left = box.x - box.width / 2
    const right = box.x + box.width / 2
    const top = box.y
    const bottom = box.y + Math.max(box.height, 64)
    if (left < minX) minX = left
    if (right > maxX) maxX = right
    if (top < minY) minY = top
    if (bottom > maxY) maxY = bottom
  }

  minX -= margin
  minY -= margin
  maxX += margin
  maxY += margin

  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)

  return {
    viewBox: `${roundCoord(minX)} ${roundCoord(minY)} ${roundCoord(spanX)} ${roundCoord(spanY)}`,
    minX,
    minY,
    spanX,
    spanY,
    viewportRect: {
      x: roundCoord(vpLeft),
      y: roundCoord(vpTop),
      width: roundCoord(vpWidth),
      height: roundCoord(vpHeight),
    },
  }
}
