import type { Ref } from 'vue'
import { getCurrentScope, onBeforeUnmount, onScopeDispose, ref, watch } from 'vue'
import { stepSpring } from '../../../../utils/animation/spring'
import { responseSpring } from '../../../../utils/gesture'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'

// How the preview comes and goes. One progress carries it: a picture flying out of its thumbnail
// and back rides it on a spring, which overshoots by the host's bounce on the way out and lands
// where it is going on the way home; a fade eases it over a fixed time. The chrome, the menu and
// the status take short fades of their own. All of them run on one frame loop.

/** A picture flying between its thumbnail and the stage, or a fade. */
export type PreviewTransitionKind = 'zoom' | 'fade'

export interface PreviewTransitionOptions {
  /** How far the flight out of the thumbnail overshoots, 0 to 1. */
  bounce: () => number
}

export interface PreviewTransition {
  /**
   * How far the preview has come in: 0 out, 1 in. A flight's progress, which passes 1 as it
   * overshoots, or a fade's eased progress.
   */
  presence: Ref<number>
  /** How the preview comes in or goes. */
  kind: Ref<PreviewTransitionKind>
  /** A flight or a fade is under way. */
  running: Ref<boolean>
  /** Comes in from where it is, keeping the speed of a flight going the other way, and calls `done` once in. */
  enter: (kind: PreviewTransitionKind, done?: () => void) => void
  /**
   * Goes from where it is and calls `done` once out. `velocity` is a flight's speed home in
   * progress per second, negative toward the thumbnail; without one, a flight under way keeps its own.
   */
  leave: (kind: PreviewTransitionKind, done: () => void, velocity?: number) => void
  /** Lands where it is heading at once, calling `done` if that is out. */
  finish: () => void
  /** Out and still, without calling `done`. */
  reset: () => void
  /** A fade toward shown or hidden as `shown` turns, over `ms`; 0 to 1. It ends with the component that asked for it. */
  level: (shown: () => boolean, ms: number) => Ref<number>
}

const FADE_IN_MS = 200
const FADE_OUT_MS = 170
/** The flight out of the thumbnail (s); its damping is the host's bounce. */
const OPEN_RESPONSE = 0.36
/** The flight home lands where it is going, with no overshoot to carry it past the thumbnail. */
const CLOSE_SPRING = responseSpring(0.3, 1)

interface Level {
  value: Ref<number>
  shown: () => boolean
  ms: number
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeIn(t: number): number {
  return t ** 3
}

export function usePreviewTransition(options: PreviewTransitionOptions): PreviewTransition {
  const reduced = useReducedMotion()
  const presence = ref(0)
  const kind = ref<PreviewTransitionKind>('fade')
  const running = ref(false)

  let goal: 0 | 1 = 0
  let spring: { velocity: number, params: { stiffness: number, damping: number } } | null = null
  let fade: { from: number, start: number, ms: number, ease: (t: number) => number } | null = null
  let done: (() => void) | null = null
  const levels: Level[] = []
  let frame = 0
  let last = 0

  function hasFrames(): boolean {
    return typeof requestAnimationFrame !== 'undefined'
  }

  function settle(): void {
    spring = null
    fade = null
    presence.value = goal
    running.value = false
    const callback = done
    done = null
    callback?.()
  }

  function stepLevels(dt: number): boolean {
    let moving = false
    for (const level of levels) {
      const target = level.shown() ? 1 : 0
      const value = level.value.value
      if (value === target)
        continue
      const step = level.ms > 0 ? (dt * 1000) / level.ms : 1
      level.value.value = target > value ? Math.min(target, value + step) : Math.max(target, value - step)
      if (level.value.value !== target)
        moving = true
    }
    return moving
  }

  function tick(now: number): void {
    frame = 0
    const dt = Math.min(0.064, Math.max(0, (now - last) / 1000))
    last = now
    if (spring) {
      const [p, v] = stepSpring(presence.value, spring.velocity, goal, spring.params, dt)
      if (Math.abs(goal - p) < 5e-4 && Math.abs(v) < 5e-3) {
        settle()
      }
      else {
        presence.value = p
        spring.velocity = v
      }
    }
    else if (fade) {
      const t = fade.ms > 0 ? Math.min(1, (now - fade.start) / fade.ms) : 1
      if (t >= 1)
        settle()
      else
        presence.value = fade.from + (goal - fade.from) * fade.ease(t)
    }
    const levelsMoving = stepLevels(dt)
    if (spring || fade || levelsMoving)
      frame = requestAnimationFrame(tick)
  }

  function run(): void {
    if (frame || !hasFrames())
      return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  function startFade(ms: number, ease: (t: number) => number): void {
    spring = null
    // A fade turned round part of the way goes back at the same pace.
    fade = { from: presence.value, start: performance.now(), ms: ms * Math.min(1, Math.abs(goal - presence.value)), ease }
    running.value = true
    run()
  }

  function enter(next: PreviewTransitionKind, callback?: () => void): void {
    // Reduced motion fades in, with nothing flying across the screen.
    kind.value = next === 'zoom' && !reduced.value ? 'zoom' : 'fade'
    goal = 1
    done = callback ?? null
    if (!hasFrames()) {
      settle()
      return
    }
    if (kind.value === 'zoom') {
      const bounce = Math.min(0.9, Math.max(0, options.bounce()))
      spring = { velocity: spring?.velocity ?? 0, params: responseSpring(OPEN_RESPONSE, 1 - bounce) }
      fade = null
      running.value = true
      run()
      return
    }
    startFade(FADE_IN_MS, easeOut)
  }

  function leave(next: PreviewTransitionKind, callback: () => void, velocity?: number): void {
    kind.value = next
    goal = 0
    done = callback
    if (reduced.value || !hasFrames()) {
      settle()
      return
    }
    if (next === 'zoom') {
      spring = { velocity: velocity ?? spring?.velocity ?? 0, params: CLOSE_SPRING }
      fade = null
      running.value = true
      run()
      return
    }
    startFade(FADE_OUT_MS, easeIn)
  }

  function finish(): void {
    if (spring || fade || presence.value !== goal)
      settle()
  }

  function reset(): void {
    spring = null
    fade = null
    done = null
    goal = 0
    presence.value = 0
    running.value = false
  }

  function level(shown: () => boolean, ms: number): Ref<number> {
    const value = ref(shown() ? 1 : 0)
    const entry: Level = { value, shown, ms }
    levels.push(entry)
    watch(shown, (visible) => {
      if (hasFrames())
        run()
      else
        value.value = visible ? 1 : 0
    })
    // The toolbar, mounted afresh with each opening, asks for one too.
    if (getCurrentScope()) {
      onScopeDispose(() => {
        const at = levels.indexOf(entry)
        if (at >= 0)
          levels.splice(at, 1)
      })
    }
    return value
  }

  onBeforeUnmount(() => {
    if (frame && typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(frame)
    frame = 0
  })

  return { presence, kind, running, enter, leave, finish, reset, level }
}
