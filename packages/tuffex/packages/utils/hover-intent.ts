import { hasDocument } from './env'

/**
 * Pointer intent for hover-opened panels.
 *
 * A hover panel has to forgive the trip from its trigger to the panel, and a
 * close timer alone forgives it badly: travel a little slowly and the panel
 * closes under the pointer; travel diagonally across a sibling trigger and the
 * sibling opens instead. Two pieces cover the trip:
 *
 * - The bridge. The trough between the trigger's facing edge and the panel's
 *   facing edge counts as part of the panel: the anchor renders it as an
 *   invisible hit area, so crossing the gap never leaves the panel at all.
 * - The transit. Once the pointer leaves the trigger towards the panel it is on
 *   its way for as long as it stays inside the triangle running from where it
 *   left to the panel's facing edge, and keeps moving. Meanwhile the panel stays
 *   open, and no other hover anchor opens under the pointer.
 *
 * Geometry is in client (viewport) pixels throughout, matching `clientX/Y`.
 */

export type HoverIntentSide = 'top' | 'right' | 'bottom' | 'left'

export interface HoverIntentPoint {
  x: number
  y: number
}

/** Any DOMRect-shaped box. */
export interface HoverIntentRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * How long the pointer may sit still inside the triangle before it counts as
 * having stopped short. A moving pointer reports every 8–16ms, so this only
 * fires on an actual stop — and stopping on a sibling trigger is how the user
 * says that sibling is the one they meant.
 */
export const HOVER_TRANSIT_STALL_MS = 100

/**
 * Half-width of the triangle's apex, and how far it reaches back behind the
 * exit point. A triangle that starts as a point rejects the first few pixels
 * of any path that sets off slightly sideways or jitters backwards.
 */
export const HOVER_TRANSIT_APEX_PAD = 4

/** Ray casting. A point exactly on an edge may land either way. */
export function isPointInPolygon(point: HoverIntentPoint, polygon: readonly HoverIntentPoint[]): boolean {
  let inside = false
  let previous = polygon.at(-1)
  for (const current of polygon) {
    if (previous
      && (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x) {
      inside = !inside
    }
    previous = current
  }
  return inside
}

/**
 * The trough between a trigger and its panel: the hull of the trigger's edge
 * that faces the panel and the panel's edge that faces the trigger. A
 * trapezoid rather than a strip under the panel, so it never reaches over a
 * neighbour that merely sits beside the trigger.
 *
 * `overlap` pushes both ends a pixel into the boxes they join, so no sub-pixel
 * seam is left between the three hit areas. `null` when the two boxes touch or
 * overlap along the axis — there is no gap to cross.
 */
export function hoverBridgePolygon(
  reference: HoverIntentRect,
  panel: HoverIntentRect,
  side: HoverIntentSide,
  overlap = 1,
): HoverIntentPoint[] | null {
  switch (side) {
    case 'bottom': {
      if (panel.top - reference.bottom <= 0)
        return null
      const near = reference.bottom - overlap
      const far = panel.top + overlap
      return [
        { x: reference.left, y: near },
        { x: reference.right, y: near },
        { x: panel.right, y: far },
        { x: panel.left, y: far },
      ]
    }
    case 'top': {
      if (reference.top - panel.bottom <= 0)
        return null
      const near = reference.top + overlap
      const far = panel.bottom - overlap
      return [
        { x: panel.left, y: far },
        { x: panel.right, y: far },
        { x: reference.right, y: near },
        { x: reference.left, y: near },
      ]
    }
    case 'right': {
      if (panel.left - reference.right <= 0)
        return null
      const near = reference.right - overlap
      const far = panel.left + overlap
      return [
        { x: near, y: reference.top },
        { x: far, y: panel.top },
        { x: far, y: panel.bottom },
        { x: near, y: reference.bottom },
      ]
    }
    case 'left': {
      if (reference.left - panel.right <= 0)
        return null
      const near = reference.left + overlap
      const far = panel.right - overlap
      return [
        { x: far, y: panel.top },
        { x: near, y: reference.top },
        { x: near, y: reference.bottom },
        { x: far, y: panel.bottom },
      ]
    }
  }
}

/** A polygon laid out as an absolutely positioned box plus the `clip-path` that cuts it back to shape. */
export interface HoverBridgeBox {
  left: number
  top: number
  width: number
  height: number
  clipPath: string
}

function px(value: number): string {
  return `${Number(value.toFixed(2))}px`
}

/**
 * `origin` is the top-left of whatever the box is positioned in, in the same
 * space as the polygon. `clip-path` also clips hit testing, which is the point:
 * the box's bounding rectangle is wider than the bridge at one end.
 */
export function hoverBridgeBox(polygon: readonly HoverIntentPoint[], origin: HoverIntentPoint): HoverBridgeBox {
  const xs = polygon.map(point => point.x)
  const ys = polygon.map(point => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const points = polygon.map(point => `${px(point.x - left)} ${px(point.y - top)}`).join(', ')
  return {
    left: left - origin.x,
    top: top - origin.y,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
    clipPath: `polygon(${points})`,
  }
}

/** The slice of a floating-ui middleware pass the bridge reads. */
export interface HoverBridgePosition {
  x: number
  y: number
  placement: string
  rects: {
    reference: { x: number, y: number, width: number, height: number }
    floating: { width: number, height: number }
  }
}

/**
 * The bridge for one floating-ui pass, run as the last middleware so it sees
 * the panel where flip, shift, and the arrow left it: the same coordinates and
 * the same frame as the panel, with no measurement of its own.
 *
 * `inside` lays the box out as a child of the floating element; otherwise as
 * its sibling, in the floating element's own containing block.
 */
export function hoverBridgeAt(position: HoverBridgePosition, inside: boolean): HoverBridgeBox | null {
  const { x, y, rects } = position
  const polygon = hoverBridgePolygon(
    {
      left: rects.reference.x,
      top: rects.reference.y,
      right: rects.reference.x + rects.reference.width,
      bottom: rects.reference.y + rects.reference.height,
    },
    { left: x, top: y, right: x + rects.floating.width, bottom: y + rects.floating.height },
    position.placement.split('-')[0] as HoverIntentSide,
  )
  if (!polygon)
    return null
  return hoverBridgeBox(polygon, inside ? { x, y } : { x: 0, y: 0 })
}

/**
 * Whether the pointer left through the trigger's edge facing away from the
 * panel. That is a deliberate exit, not a trip to the panel: no triangle.
 */
export function leftAwayFromPanel(
  point: HoverIntentPoint,
  reference: HoverIntentRect,
  side: HoverIntentSide,
): boolean {
  switch (side) {
    case 'bottom':
      return point.y <= reference.top + 1
    case 'top':
      return point.y >= reference.bottom - 1
    case 'right':
      return point.x <= reference.left + 1
    case 'left':
      return point.x >= reference.right - 1
  }
}

/**
 * The safe triangle: from where the pointer left the trigger to the panel's
 * whole facing edge. Every straight path from the exit point to that edge lies
 * inside it, whatever part of the panel it aims at.
 */
export function safeTrianglePolygon(
  exit: HoverIntentPoint,
  panel: HoverIntentRect,
  side: HoverIntentSide,
  apexPad = HOVER_TRANSIT_APEX_PAD,
): HoverIntentPoint[] {
  switch (side) {
    case 'bottom':
      return [
        { x: exit.x - apexPad, y: exit.y - apexPad },
        { x: exit.x + apexPad, y: exit.y - apexPad },
        { x: panel.right, y: panel.top },
        { x: panel.left, y: panel.top },
      ]
    case 'top':
      return [
        { x: panel.left, y: panel.bottom },
        { x: panel.right, y: panel.bottom },
        { x: exit.x + apexPad, y: exit.y + apexPad },
        { x: exit.x - apexPad, y: exit.y + apexPad },
      ]
    case 'right':
      return [
        { x: exit.x - apexPad, y: exit.y - apexPad },
        { x: panel.left, y: panel.top },
        { x: panel.left, y: panel.bottom },
        { x: exit.x - apexPad, y: exit.y + apexPad },
      ]
    case 'left':
      return [
        { x: panel.right, y: panel.top },
        { x: exit.x + apexPad, y: exit.y - apexPad },
        { x: exit.x + apexPad, y: exit.y + apexPad },
        { x: panel.right, y: panel.bottom },
      ]
  }
}

/**
 * How a transit ended:
 * - `arrived`: the pointer reached the panel (or its bridge), or came back to
 *   the trigger — the panel stays open.
 * - `abandoned`: it left the triangle or stopped short — close as if it had just
 *   left the trigger.
 * - `cancelled`: the panel closed some other way, or the anchor went away.
 */
export type HoverTransitOutcome = 'arrived' | 'abandoned' | 'cancelled'

export interface HoverTransitHandlers {
  /** The trigger the pointer left. */
  reference: () => Element | null
  /** Whether `target` is part of the panel: the panel box, its bridge, anything inside them. */
  contains: (target: Node) => boolean
  /** The panel's box as currently drawn; the triangle's base is its facing edge. */
  panelRect: () => HoverIntentRect | null
  /** Which side of the trigger the panel sits on. */
  side: () => HoverIntentSide
  /** The pointer set off towards the panel: hold it open. */
  onStart: () => void
  onEnd: (outcome: HoverTransitOutcome) => void
}

interface HoverTransit {
  owner: object
  handlers: HoverTransitHandlers
  exit: HoverIntentPoint
  stallTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Module state rather than per-app state like the anchor-delay service: there
 * is one pointer per document, and a transit only ever starts from a pointer
 * event, so nothing here exists during SSR.
 */
let active: HoverTransit | null = null
const waiting = new Map<object, () => void>()

function hasArea(rect: HoverIntentRect | null): rect is HoverIntentRect {
  return !!rect && rect.right - rect.left > 0 && rect.bottom - rect.top > 0
}

function triangleOf(transit: HoverTransit): HoverIntentPoint[] | null {
  const panel = transit.handlers.panelRect()
  if (!hasArea(panel))
    return null
  return safeTrianglePolygon(transit.exit, panel, transit.handlers.side())
}

function armStall(transit: HoverTransit) {
  if (transit.stallTimer != null)
    clearTimeout(transit.stallTimer)
  transit.stallTimer = setTimeout(() => {
    transit.stallTimer = null
    finish(transit, 'abandoned')
  }, HOVER_TRANSIT_STALL_MS)
}

function onPointerMove(event: PointerEvent) {
  const transit = active
  if (!transit)
    return
  // A touch has no hover to aim with.
  if (event.pointerType === 'touch')
    return

  // The enter handlers settle these too; a move can be dispatched first.
  const target = event.target instanceof Node ? event.target : null
  if (target && (transit.handlers.contains(target) || transit.handlers.reference()?.contains(target))) {
    finish(transit, 'arrived')
    return
  }

  const triangle = triangleOf(transit)
  if (triangle && isPointInPolygon({ x: event.clientX, y: event.clientY }, triangle)) {
    armStall(transit)
    return
  }
  finish(transit, 'abandoned')
}

function finish(transit: HoverTransit, outcome: HoverTransitOutcome) {
  if (active !== transit)
    return
  active = null
  if (transit.stallTimer != null) {
    clearTimeout(transit.stallTimer)
    transit.stallTimer = null
  }
  document.removeEventListener('pointermove', onPointerMove, true)
  transit.handlers.onEnd(outcome)

  const retries = [...waiting.values()]
  waiting.clear()
  // An arrival kept the pointer: whatever it crossed on the way was crossed,
  // not chosen. Otherwise the pointer is free, and a trigger it is resting on
  // gets the open it asked for.
  if (outcome !== 'arrived') {
    for (const retry of retries)
      retry()
  }
}

/**
 * Start a transit for `owner` as the pointer leaves its trigger. Returns false
 * when there is nothing to protect — no measurable panel, or an exit through the
 * far edge — and the caller should close as usual.
 */
export function beginHoverTransit(
  owner: object,
  exit: { clientX: number, clientY: number },
  handlers: HoverTransitHandlers,
): boolean {
  if (!hasDocument())
    return false
  const reference = handlers.reference()
  const panel = handlers.panelRect()
  if (!reference || !hasArea(panel))
    return false

  const point = { x: exit.clientX, y: exit.clientY }
  if (leftAwayFromPanel(point, reference.getBoundingClientRect(), handlers.side()))
    return false

  // One pointer, one trip.
  if (active)
    finish(active, 'abandoned')

  const transit: HoverTransit = { owner, handlers, exit: point, stallTimer: null }
  active = transit
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
  handlers.onStart()
  armStall(transit)
  return true
}

/** The owner's own enter handlers: the pointer reached the panel, or came back to the trigger. */
export function settleHoverTransit(owner: object): void {
  if (active?.owner === owner)
    finish(active, 'arrived')
}

/** The owner's panel closed some other way, or the owner is going away. */
export function cancelHoverTransit(owner: object): void {
  if (active?.owner === owner)
    finish(active, 'cancelled')
}

/**
 * Whether another anchor's transit has this pointer: it sits inside that
 * anchor's triangle, on its way to that panel. Opening here would yank the
 * panel it is aiming at out from under it.
 */
export function isHoverClaimed(asker: object, event: { clientX: number, clientY: number }): boolean {
  const transit = active
  if (!transit || transit.owner === asker)
    return false
  const triangle = triangleOf(transit)
  return !!triangle && isPointInPolygon({ x: event.clientX, y: event.clientY }, triangle)
}

/**
 * Run `retry` when the claiming transit ends without arriving. Callers check in
 * `retry` that the pointer is still on them; leaving should call
 * `stopWaitingForHoverTransit`.
 */
export function waitForHoverTransit(asker: object, retry: () => void): void {
  if (active)
    waiting.set(asker, retry)
  else
    retry()
}

export function stopWaitingForHoverTransit(asker: object): void {
  waiting.delete(asker)
}

/** Test-only: drop the active transit and every waiter without running anything. */
export function resetHoverIntent(): void {
  if (active?.stallTimer != null)
    clearTimeout(active.stallTimer)
  active = null
  waiting.clear()
  if (hasDocument())
    document.removeEventListener('pointermove', onPointerMove, true)
}
