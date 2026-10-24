import { clampView, resistView, scaleAbout } from '../../../../../../utils/pan-zoom'

// The view math is the shared pan-zoom's. The types are declared here, not taken from it: the
// published declarations carry no internal util, so roam's must stand on their own.

/** Pan/zoom state applied as `translate(tx, ty) scale(k)` over the fitted map. */
export interface RoamState {
  k: number
  tx: number
  ty: number
}

export const IDENTITY_ROAM: RoamState = { k: 1, tx: 0, ty: 0 }

/** kumo scaleLimit: zoom back to at most `min(1, zoom)`, in to `zoom × 8`. */
export function clampScale(k: number, zoom: number, maxZoomFactor: number): number {
  return Math.max(Math.min(1, zoom), Math.min(k, zoom * maxZoomFactor))
}

/**
 * Rescales about a fixed point (cursor or container center) so that point
 * stays put on screen.
 */
export function scaleAboutPoint(
  state: RoamState,
  targetK: number,
  point: { x: number, y: number },
): RoamState {
  return scaleAbout(state, targetK, point)
}

export function panBy(state: RoamState, dx: number, dy: number): RoamState {
  return { ...state, tx: state.tx + dx, ty: state.ty + dy }
}

/** Applies the roam transform to a fitted-projection point. */
export function applyRoam(state: RoamState, point: [number, number]): [number, number] {
  return [point[0] * state.k + state.tx, point[1] * state.k + state.ty]
}

/**
 * Initial state: zoomed to `zoom` about the container center, then panned so
 * an optional projected center point lands mid-container.
 */
export function initialRoam(
  zoom: number,
  containerWidth: number,
  containerHeight: number,
  projectedCenter?: [number, number],
): RoamState {
  const mid = { x: containerWidth / 2, y: containerHeight / 2 }
  let state = scaleAboutPoint(IDENTITY_ROAM, zoom, mid)
  if (projectedCenter) {
    const onScreen = applyRoam(state, projectedCenter)
    state = panBy(state, mid.x - onScreen[0], mid.y - onScreen[1])
  }
  return state
}

/** The fitted map's displayed window, in pre-roam pixels. */
export interface RoamBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** How far each translation may go at one scale: `[min, max]` per axis. */
export interface RoamBounds {
  tx: [number, number]
  ty: [number, number]
}

function axisBounds(size: number, start: number, end: number, anchor?: number): [number, number] {
  // `0 - start`, not `-start`: a window starting at 0 bounds at +0, not -0.
  let lo = Math.min(size - end, 0 - start)
  let hi = Math.max(size - end, 0 - start)
  if (anchor !== undefined && Number.isFinite(anchor)) {
    lo = Math.min(lo, anchor)
    hi = Math.max(hi, anchor)
  }
  return [lo, hi]
}

/**
 * Pan limits at scale `k`. Along an axis where the map is larger than the
 * container it keeps the container covered; where it is smaller it stays
 * inside. `home`, the view the caller asked for with `zoom` and `center`,
 * stays reachable at every scale (rescaled about the container centre), so an
 * off-centre `center` never springs back once the map is touched.
 */
export function roamBounds(
  k: number,
  box: RoamBox,
  width: number,
  height: number,
  home?: RoamState,
): RoamBounds {
  const anchor = home ? scaleAboutPoint(home, k, { x: width / 2, y: height / 2 }) : undefined
  return {
    tx: axisBounds(width, k * box.x0, k * box.x1, anchor?.tx),
    ty: axisBounds(height, k * box.y0, k * box.y1, anchor?.ty),
  }
}

/** The state moved inside `bounds`; the scale is left as it is. */
export function clampRoam(state: RoamState, bounds: RoamBounds): RoamState {
  return clampView(state, bounds)
}

/**
 * A dragged state as drawn: the part pulled past `bounds` resists like a
 * rubber band (c = 0.55), measured against the container's size.
 */
export function resistRoam(state: RoamState, bounds: RoamBounds, width: number, height: number): RoamState {
  return resistView(state, bounds, { width, height })
}
