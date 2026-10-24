import { stepSpring } from './animation/spring'
import { glideAxis, responseSpring, rubberband } from './gesture'

// A view drawn as `translate(tx, ty) scale(k)` that pointers pan and zoom, and its motion once let
// go. The maps' roam and the image preview move on this: the same spring, rubber band and glide.

export interface PanZoomView {
  k: number
  tx: number
  ty: number
}

/** How far each translation may go at one scale: `[min, max]` per axis. */
export interface PanZoomBounds {
  tx: [number, number]
  ty: [number, number]
}

/** Rescales about a point, so what is under it stays put. */
export function scaleAbout(view: PanZoomView, k: number, point: { x: number, y: number }): PanZoomView {
  const ratio = k / view.k
  return {
    k,
    tx: point.x - (point.x - view.tx) * ratio,
    ty: point.y - (point.y - view.ty) * ratio,
  }
}

function clampAxis(value: number, [lo, hi]: [number, number]): number {
  return Math.max(lo, Math.min(hi, value))
}

/** The view moved inside `bounds`; the scale is left as it is. */
export function clampView(view: PanZoomView, bounds: PanZoomBounds): PanZoomView {
  return { k: view.k, tx: clampAxis(view.tx, bounds.tx), ty: clampAxis(view.ty, bounds.ty) }
}

function resistAxis(value: number, [lo, hi]: [number, number], size: number): number {
  if (value < lo)
    return lo + rubberband(value - lo, size)
  if (value > hi)
    return hi + rubberband(value - hi, size)
  return value
}

/**
 * A dragged view as drawn: the part pulled past `bounds` resists like a rubber band, measured
 * against the size of what it is dragged across.
 */
export function resistView(view: PanZoomView, bounds: PanZoomBounds, size: { width: number, height: number }): PanZoomView {
  return {
    k: view.k,
    tx: resistAxis(view.tx, bounds.tx, size.width),
    ty: resistAxis(view.ty, bounds.ty, size.height),
  }
}

// -- Motion ----------------------------------------------------------------------------------

/** Zooms, resets, key presses, wheel notches and anything let go past an edge settle on this. */
export const VIEW_SPRING = responseSpring(0.35, 1)
/** A gliding axis slower than this (units/s) has stopped. */
const GLIDE_REST = 10

/** One value in motion: at rest, coasting on from a flick, or springing to `target`. */
export interface MotionAxis {
  mode: 'rest' | 'glide' | 'spring'
  value: number
  velocity: number
  target: number
}

export function restingAxis(value: number): MotionAxis {
  return { mode: 'rest', value, velocity: 0, target: value }
}

/**
 * One frame (`dt`, s) of an axis. A glide that coasts past `limits` hands its velocity to a spring,
 * which brings it back inside, and one nearly stopped rests; a spring rests once it is within
 * `epsilon` of its target and slower than 16 `epsilon` a second.
 */
export function stepAxis(
  axis: MotionAxis,
  dt: number,
  spring: { stiffness: number, damping: number },
  limits: [number, number] | null,
  epsilon: number,
): void {
  if (axis.mode === 'glide') {
    ;[axis.value, axis.velocity] = glideAxis(axis.value, axis.velocity, dt)
    if (limits && (axis.value < limits[0] || axis.value > limits[1])) {
      axis.mode = 'spring'
      axis.target = clampAxis(axis.value, limits)
    }
    else if (Math.abs(axis.velocity) < GLIDE_REST) {
      axis.mode = 'rest'
      axis.velocity = 0
    }
  }
  else if (axis.mode === 'spring') {
    ;[axis.value, axis.velocity] = stepSpring(axis.value, axis.velocity, axis.target, spring, dt)
    if (Math.abs(axis.target - axis.value) < epsilon && Math.abs(axis.velocity) < epsilon * 16) {
      axis.value = axis.target
      axis.velocity = 0
      axis.mode = 'rest'
    }
  }
}

/**
 * An axis let go at `value` with `velocity`: from past `limits` it springs back inside, carrying
 * the velocity; inside, it glides on if it `glides` and is moving, and rests otherwise.
 */
export function releaseAxis(value: number, velocity: number, limits: [number, number], glides = true): MotionAxis {
  if (value < limits[0] || value > limits[1])
    return { mode: 'spring', value, velocity, target: clampAxis(value, limits) }
  if (glides && Math.abs(velocity) > GLIDE_REST)
    return { mode: 'glide', value, velocity, target: value }
  return restingAxis(value)
}

/** A view in motion, axis by axis. A translation gliding past `bounds` springs back inside them. */
export interface ViewMotion {
  k: MotionAxis
  tx: MotionAxis
  ty: MotionAxis
  bounds: PanZoomBounds
}

export function restingView(view: PanZoomView, bounds: PanZoomBounds): ViewMotion {
  return { k: restingAxis(view.k), tx: restingAxis(view.tx), ty: restingAxis(view.ty), bounds }
}

/** One frame (`dt`, s) of `motion`. Returns whether all of it has come to rest. */
export function stepView(motion: ViewMotion, dt: number): boolean {
  stepAxis(motion.k, dt, VIEW_SPRING, null, 1e-4)
  stepAxis(motion.tx, dt, VIEW_SPRING, motion.bounds.tx, 0.1)
  stepAxis(motion.ty, dt, VIEW_SPRING, motion.bounds.ty, 0.1)
  return motion.k.mode === 'rest' && motion.tx.mode === 'rest' && motion.ty.mode === 'rest'
}

/** Where `motion` has got to. */
export function viewNow(motion: ViewMotion): PanZoomView {
  return { k: motion.k.value, tx: motion.tx.value, ty: motion.ty.value }
}

/** Where `motion` is heading: a key press or a notch builds on the last one. */
export function viewGoal(motion: ViewMotion): PanZoomView {
  const pick = (axis: MotionAxis): number => (axis.mode === 'spring' ? axis.target : axis.value)
  return { k: pick(motion.k), tx: pick(motion.tx), ty: pick(motion.ty) }
}

/** Springs every axis of `motion` to `target`, keeping the velocity it has. */
export function springView(motion: ViewMotion, target: PanZoomView): void {
  for (const key of ['k', 'tx', 'ty'] as const) {
    motion[key].mode = 'spring'
    motion[key].target = target[key]
  }
}
