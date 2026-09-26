import type { Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'
import {
  animateElement,
  COMPOSER_MOTION,
  prefersReducedMotion,
  readScale,
  releaseCurve
} from './composer-motion'

export interface ComposerPressOptions {
  /** How deep a press goes; a getter when it depends on state (the send key: circle vs capsule). */
  scale?: number | (() => number)
  /** An `aria-disabled` control does not press. */
  disabled?: () => boolean
}

export interface ComposerPress {
  press: (durationMs?: number) => void
  release: () => void
  /** A press nobody's finger made (Enter in the field, the send shortcut): in, hold, spring back. */
  pulse: () => void
  /** A press started within `press.recentMs` — the launch then leaves the press story alone. */
  pressedRecently: () => boolean
}

const PRESS_KEYS = new Set([' ', 'Enter'])

/**
 * The toolbar's one press: shrink under the finger in 90ms, spring back past rest on release.
 *
 * WAAPI on the individual `scale` property, wired to pointer and key events rather than `:active`:
 * `:active` never sees Enter in the text field or the send shortcut, and a CSS transition reversed
 * mid-way shortens itself, which squashes the release spring into a jitter. A `scale` of its own
 * also leaves `transform` / `width` free for the capsules. Reduced motion presses nothing — the
 * instant hover / pressed colours carry the feedback.
 */
export function useComposerPress(
  target: Ref<HTMLElement | null>,
  options: ComposerPressOptions = {}
): ComposerPress {
  const { press: score } = COMPOSER_MOTION
  let pressAnimation: Animation | null = null
  let releaseAnimation: Animation | null = null
  let pressed = false
  let lastPressAt = Number.NEGATIVE_INFINITY
  let pulseTimer: ReturnType<typeof setTimeout> | null = null

  function depth(): number {
    const { scale } = options
    if (typeof scale === 'function') return scale()
    return scale ?? score.scale
  }

  function press(durationMs: number = score.inMs): void {
    if (options.disabled?.()) return
    lastPressAt = performance.now()
    pressed = true
    const el = target.value
    if (!el || prefersReducedMotion()) return
    const from = readScale(el)
    releaseAnimation?.cancel()
    releaseAnimation = null
    pressAnimation?.cancel()
    pressAnimation = animateElement(el, [{ scale: from }, { scale: depth() }], {
      duration: durationMs,
      easing: score.inEasing,
      fill: 'forwards'
    })
  }

  function release(): void {
    if (!pressed) return
    pressed = false
    const el = target.value
    const held = pressAnimation
    pressAnimation = null
    if (!el || prefersReducedMotion()) {
      held?.cancel()
      return
    }
    // Read before the cancel: the held press is what is on screen.
    const from = readScale(el)
    held?.cancel()
    if (Math.abs(from - 1) < 0.001) return
    const curve = releaseCurve()
    releaseAnimation = animateElement(el, [{ scale: from }, { scale: 1 }], {
      duration: curve.duration,
      easing: curve.easing
    })
  }

  function pulse(): void {
    if (prefersReducedMotion()) return
    if (pulseTimer !== null) clearTimeout(pulseTimer)
    press(score.pulseMs)
    pulseTimer = setTimeout(() => {
      pulseTimer = null
      release()
    }, score.pulseMs)
  }

  function pressedRecently(): boolean {
    return performance.now() - lastPressAt < score.recentMs
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || event.isPrimary === false) return
    press()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || !PRESS_KEYS.has(event.key)) return
    press()
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (PRESS_KEYS.has(event.key)) release()
  }

  const onRelease = (): void => release()

  function attach(el: HTMLElement): void {
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onRelease)
    el.addEventListener('pointercancel', onRelease)
    el.addEventListener('pointerleave', onRelease)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('keyup', onKeyUp)
    el.addEventListener('blur', onRelease)
  }

  function detach(el: HTMLElement): void {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointerup', onRelease)
    el.removeEventListener('pointercancel', onRelease)
    el.removeEventListener('pointerleave', onRelease)
    el.removeEventListener('keydown', onKeyDown)
    el.removeEventListener('keyup', onKeyUp)
    el.removeEventListener('blur', onRelease)
  }

  watch(
    target,
    (el, previous) => {
      if (previous) detach(previous)
      if (el) attach(el)
    },
    { immediate: true, flush: 'post' }
  )

  onBeforeUnmount(() => {
    if (pulseTimer !== null) clearTimeout(pulseTimer)
    pulseTimer = null
    if (target.value) detach(target.value)
    pressAnimation?.cancel()
    releaseAnimation?.cancel()
    pressAnimation = null
    releaseAnimation = null
  })

  return { press, release, pulse, pressedRecently }
}
