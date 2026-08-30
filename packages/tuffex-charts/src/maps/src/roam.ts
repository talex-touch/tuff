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
  const ratio = targetK / state.k
  return {
    k: targetK,
    tx: point.x - (point.x - state.tx) * ratio,
    ty: point.y - (point.y - state.ty) * ratio,
  }
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
