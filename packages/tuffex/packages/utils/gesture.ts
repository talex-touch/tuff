/**
 * Physics shared by everything a pointer can drag: resistance past an edge,
 * the velocity a release hands over, where a flick comes to rest, springs
 * described the way a designer tunes them, and the wheel read as zoom.
 * After Apple's Designing Fluid Interfaces (WWDC 2018).
 */

/**
 * Resistance past an edge: the further an element is pulled beyond it, the
 * less it follows. `offset` is how far past the edge the pointer is;
 * `dimension` is the size that resistance is measured against.
 */
export function rubberband(offset: number, dimension: number, constant = 0.55): number {
  if (!(dimension > 0))
    return 0
  return (offset * dimension * constant) / (dimension + constant * Math.abs(offset))
}

/**
 * How far a flick at `velocity` (units per second) carries under scroll-like
 * deceleration: 0.998 is a scroll view's, 0.99 a snappier stop. Snap to the
 * target nearest the release point plus this, not to the one nearest the release.
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate)
}

/**
 * One frame (`dt`, in seconds) of a released pan coasting to a stop with a
 * scroll view's exponential deceleration (`rate` per millisecond). In total it
 * carries `projectMomentum(velocity, rate)`. Returns `[position, velocity]`.
 */
export function glideAxis(position: number, velocity: number, dt: number, rate = 0.998): [number, number] {
  const tau = -0.001 / Math.log(rate)
  const decay = Math.exp(-dt / tau)
  return [position + velocity * tau * (1 - decay), velocity * decay]
}

/**
 * Unit-mass stiffness and damping for a spring given as response (seconds, the
 * period it would swing at undamped) and damping ratio: 1 settles without
 * overshoot, below 1 overshoots. Use a ratio below 1 only where a release
 * carried momentum.
 */
export function responseSpring(response: number, dampingRatio = 1): { stiffness: number, damping: number } {
  const omega = (2 * Math.PI) / Math.max(1e-3, response)
  return { stiffness: omega * omega, damping: 2 * dampingRatio * omega }
}

export interface VelocityTracker {
  /** Starts a new gesture at this sample. */
  reset: (time: number, x: number, y?: number) => void
  push: (time: number, x: number, y?: number) => void
  /**
   * Units per second over the last window, `[x, y]`. A pointer that stopped
   * before `now` hands over no momentum.
   */
  velocity: (now: number) => [number, number]
}

/** Pointer velocity over the last `windowMs` of samples (event timestamps, in ms). */
export function createVelocityTracker(windowMs = 100, maxSpeed = 4000): VelocityTracker {
  const samples: { time: number, x: number, y: number }[] = []
  const clamp = (value: number) => Math.max(-maxSpeed, Math.min(maxSpeed, value))
  return {
    reset(time, x, y = 0) {
      samples.length = 0
      samples.push({ time, x, y })
    },
    push(time, x, y = 0) {
      samples.push({ time, x, y })
      while (samples.length > 2 && time - samples[0]!.time > windowMs)
        samples.shift()
    },
    velocity(now) {
      const last = samples[samples.length - 1]
      const first = samples.find(sample => last && last.time - sample.time <= windowMs)
      if (!last || !first || last === first || now - last.time > windowMs / 2)
        return [0, 0]
      const seconds = (last.time - first.time) / 1000
      return [clamp((last.x - first.x) / seconds), clamp((last.y - first.y) / seconds)]
    },
  }
}

/**
 * Whether a wheel event asks to zoom. A trackpad pinch arrives as a wheel
 * event with `ctrlKey`; a mouse zooms with ⌘ or Ctrl held. A plain wheel
 * belongs to the page, so a chart or map never traps scrolling.
 */
export function isZoomWheel(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

/** A wheel delta in pixels, whatever unit the device reported. */
export function wheelPixels(event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>, page = 800): { x: number, y: number } {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? page : 1
  return { x: event.deltaX * unit, y: event.deltaY * unit }
}

/**
 * Scale for one zoom-wheel event: a mouse notch (about 100 px) zooms by √2,
 * and the small, frequent deltas of a pinch add up to the same. Exponential,
 * so the same delta in and out cancels.
 */
export function wheelZoomFactor(deltaPixels: number): number {
  return 2 ** (-Math.max(-100, Math.min(100, deltaPixels)) / 200)
}
