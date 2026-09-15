// Animation primitives for the chart layer.
//
// kumo renders through Apache ECharts, so every chart animates for free with
// ECharts' defaults. This package renders SVG directly and has no framework to
// borrow from, so the same defaults are reproduced here explicitly. Values are
// taken from the ECharts sources kumo pins (`echarts ^6.0.0`):
//
//   echarts@6 src/model/globalDefault.ts
//     animationDuration       1000  (first render)
//     animationEasing         cubicInOut
//     animationDurationUpdate  500  (data update)
//     animationEasingUpdate   cubicInOut
//     animationThreshold      2000  (above this, render without animation)
//     stateAnimation          { duration: 300, easing: 'cubicOut' }  (hover/focus)
//   echarts@6 src/chart/line/LineSeries.ts
//     animationEasing         linear
//   echarts@6 src/component/tooltip/TooltipModel.ts
//     showDelay 0ms, hideDelay 100ms, transitionDuration 0.4s
//   echarts@6 tooltip DOM
//     transform transition    cubic-bezier(0.23, 1, 0.32, 1)
//
// `prefers-reduced-motion: reduce` disables all of it, matching the existing
// shimmer handling in `style/index.scss`.

import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** ECharts' built-in easing names, restricted to the ones the defaults use. */
export type EasingName = 'linear' | 'cubicIn' | 'cubicOut' | 'cubicInOut'

export type Easing = (t: number) => number

/** Cubic easing functions matching zrender's implementations. */
export const easings: Record<EasingName, Easing> = {
  linear: t => t,
  cubicIn: t => t * t * t,
  cubicOut: t => --t * t * t + 1,
  cubicInOut: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
}

/**
 * Cubic-bezier easing in the CSS sense — `cubicBezier(0.23, 1, 0.32, 1)` is the
 * curve ECharts' tooltip uses for position transitions.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t
  const derivativeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx

  return (x) => {
    if (x <= 0)
      return 0
    if (x >= 1)
      return 1
    // Newton-Raphson first, bisection when the curve is too flat to converge.
    let t = x
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x
      if (Math.abs(error) < 1e-5)
        return sampleY(t)
      const slope = derivativeX(t)
      if (Math.abs(slope) < 1e-6)
        break
      t -= error / slope
    }
    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 20; i++) {
      const error = sampleX(t) - x
      if (Math.abs(error) < 1e-5)
        break
      if (error > 0)
        hi = t
      else
        lo = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

/** ECharts renders without animation above this many points. */
export const ANIMATION_THRESHOLD = 2000

/** First-render animation timing (ECharts `animationDuration`). */
export const ENTER_DURATION = 1000
/** Data-update animation timing (ECharts `animationDurationUpdate`). */
export const UPDATE_DURATION = 500
/** Hover/focus state timing (ECharts `stateAnimation.duration`). */
export const STATE_DURATION = 300
/** Tooltip fade timing (ECharts tooltip DOM transitions). */
export const TOOLTIP_FADE_DURATION = 200
/** Tooltip position timing (ECharts `tooltip.transitionDuration`). */
export const TOOLTIP_MOVE_DURATION = 400
/** ECharts tooltip hide delay, in milliseconds. */
export const TOOLTIP_HIDE_DELAY = 100
/** ECharts throttles tooltip pointer tracking to this interval. */
export const TOOLTIP_TRACK_THROTTLE = 50

/** Tooltip position easing: `cubic-bezier(0.23, 1, 0.32, 1)`. */
export const tooltipMoveEasing = cubicBezier(0.23, 1, 0.32, 1)

/** True when the host asks for reduced motion, or when there is no DOM. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface TweenOptions {
  /** Duration in milliseconds. */
  duration: number
  /** Easing applied to the normalised progress. */
  easing?: Easing
  /** Milliseconds before the tween starts. */
  delay?: number
  /** Called with the eased progress on every frame. */
  onUpdate: (progress: number) => void
  /** Called once the tween reaches 1 (not called when cancelled). */
  onComplete?: () => void
}

/**
 * Run a one-shot animation; returns a cancel function. Returns a no-op cancel
 * when reduced motion is requested, after applying the final frame.
 */
export function tween(options: TweenOptions): () => void {
  const { duration, easing = easings.cubicInOut, delay = 0, onUpdate, onComplete } = options

  if (duration <= 0 || prefersReducedMotion()) {
    onUpdate(1)
    onComplete?.()
    return () => {}
  }

  let frame = 0
  let start = 0
  let cancelled = false

  const step = (now: number): void => {
    if (cancelled)
      return
    if (start === 0)
      start = now
    const elapsed = now - start - delay
    if (elapsed < 0) {
      frame = requestAnimationFrame(step)
      return
    }
    const progress = Math.min(1, elapsed / duration)
    onUpdate(easing(progress))
    if (progress < 1) {
      frame = requestAnimationFrame(step)
    }
    else {
      onComplete?.()
    }
  }

  frame = requestAnimationFrame(step)
  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
  }
}

export interface EnterProgressOptions {
  duration?: number
  easing?: Easing
  /** Return false to skip the enter animation (e.g. data above threshold). */
  enabled?: () => boolean
}

/**
 * Progress of the series' first render: 0 on the first frame, 1 once the enter
 * animation finished. Stays at 1 when reduced motion is requested or the data
 * exceeds ECharts' animation threshold.
 */
export function useEnterProgress(options: EnterProgressOptions = {}): Ref<number> {
  const { duration = ENTER_DURATION, easing = easings.cubicInOut, enabled } = options
  const progress = ref(1)

  let cancel: (() => void) | null = null
  onMounted(() => {
    if (enabled && !enabled())
      return
    if (duration <= 0 || prefersReducedMotion())
      return
    progress.value = 0
    cancel = tween({
      duration,
      easing,
      onUpdate: (value) => {
        progress.value = value
      },
    })
  })
  onBeforeUnmount(() => cancel?.())

  return progress
}

export interface TweenedNumbersOptions {
  /** Update duration in milliseconds. */
  duration?: number
  easing?: Easing
  /**
   * Starting value for indices that have no previous sample (a series that
   * just mounted, a data point that just appeared). Defaults to the target, so
   * new entries appear in place while existing ones animate.
   */
  enter?: (index: number, target: number) => number
  /**
   * Return false to update without animating (e.g. the series just mounted and
   * is already running its enter animation).
   */
  enabled?: () => boolean
}

/**
 * Tween a flat array of numbers towards its latest source on every change.
 *
 * Series flatten their geometry into a number array (`[x0, y0, x1, y1, …]`) and
 * read the tweened values back, which reproduces ECharts' `updateProps` morph
 * for data updates. Values are matched by index, so appending a point to a time
 * series animates only the new tail.
 */
export function useTweenedNumbers(
  source: () => readonly number[],
  options: TweenedNumbersOptions = {},
): Ref<number[]> {
  const { duration = UPDATE_DURATION, easing = easings.cubicInOut, enter, enabled } = options

  const displayed = ref<number[]>([...source()])
  // `current` mirrors the values on screen without being reactive: reading a ref
  // inside the watcher below would track it, and the per-frame writes would then
  // re-trigger the watcher and restart the tween on every frame.
  let current: number[] = [...displayed.value]
  let cancel: (() => void) | null = null
  let mounted = false

  onMounted(() => {
    mounted = true
    current = [...source()]
    displayed.value = [...current]
  })

  watch(source, (target) => {
    if (!mounted) {
      current = [...target]
      displayed.value = [...current]
      return
    }

    const start = target.map((value, index) => {
      const previous = current[index]
      if (previous !== undefined && Number.isFinite(previous))
        return previous
      return enter ? enter(index, value) : value
    })

    cancel?.()
    cancel = null
    current = [...target]
    if (enabled && !enabled()) {
      displayed.value = [...target]
      return
    }
    if (duration <= 0 || prefersReducedMotion() || sameNumbers(start, target)) {
      displayed.value = [...target]
      return
    }

    cancel = tween({
      duration,
      easing,
      onUpdate: (progress) => {
        const frame = target.map((value, index) => {
          const from = start[index] as number
          return from + (value - from) * progress
        })
        current = frame
        displayed.value = frame
      },
    })
  })

  onBeforeUnmount(() => cancel?.())

  return displayed
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length)
    return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i])
      return false
  }
  return true
}
