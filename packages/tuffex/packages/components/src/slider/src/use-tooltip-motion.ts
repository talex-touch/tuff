import type { Ref } from 'vue'
import { ref } from 'vue'

/** Tuning knobs for the elastic tooltip; mirrors the `tooltip*` props of `TxSlider`. */
export interface TooltipMotionConfig {
  tiltMaxDeg: number
  offsetMaxPx: number
  springStiffness: number
  springDamping: number
  distortSkewDeg: number
  jelly: boolean
  jellyFrequency: number
  jellyDecay: number
}

export interface TooltipMotionHost {
  /** Whether elastic motion is enabled at all (`tooltipTilt`). */
  isEnabled: () => boolean
  /** Whether the tooltip is on screen; the loop parks itself once this goes false. */
  isActive: () => boolean
  /** Thumb centre in px — the follow spring's target. */
  target: () => number
  config: () => TooltipMotionConfig
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Semi-implicit Euler step of a damped spring toward `target`. */
function integrate(
  position: Ref<number>,
  velocity: Ref<number>,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): void {
  const acceleration = -stiffness * (position.value - target) - damping * velocity.value
  velocity.value += acceleration * dt
  position.value += velocity.value * dt
}

/**
 * Spring-follow, elastic lean and jelly wobble for the slider tooltip.
 *
 * Lifted out of `TxSlider.vue` so the component keeps only slider semantics. The
 * integrator and its rAF loop live here and are driven entirely through
 * `settle()` (steady lean target) and `impulse()` (one-off wobble kick).
 */
export function useTooltipMotion(host: TooltipMotionHost) {
  /** Rendered state — everything `TxSlider` needs to build the tooltip transform. */
  const followX = ref(0)
  const offsetX = ref(0)
  const tiltDeg = ref(0)
  const squash = ref(0)
  const skewDeg = ref(0)
  const wobble = ref(0)
  const wobbleDir = ref(1)

  /** Integrator state. */
  const followVelocity = ref(0)
  const offsetVelocity = ref(0)
  const tiltVelocity = ref(0)
  const targetOffsetX = ref(0)
  const targetTiltDeg = ref(0)
  const jellyAmplitude = ref(0)
  const jellyPhase = ref(0)

  let rafId: number | null = null
  let lastFrameTs: number | null = null

  function reset(): void {
    lastFrameTs = null

    followX.value = host.target()
    targetOffsetX.value = 0
    targetTiltDeg.value = 0
    offsetX.value = 0
    tiltDeg.value = 0
    squash.value = 0
    skewDeg.value = 0

    followVelocity.value = 0
    offsetVelocity.value = 0
    tiltVelocity.value = 0

    jellyAmplitude.value = 0
    jellyPhase.value = 0
    wobble.value = 0
    wobbleDir.value = 1
  }

  function stop(): void {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    lastFrameTs = null
  }

  function step(ts: number): void {
    const config = host.config()
    const previous = lastFrameTs ?? ts
    lastFrameTs = ts
    // Clamp to a ~32ms ceiling so a stalled tab cannot blow the spring up on resume.
    const dt = clamp01((ts - previous) / 1000 / 0.032) * 0.032

    const stiffness = Math.max(1, config.springStiffness)
    const damping = Math.max(0, config.springDamping)

    integrate(followX, followVelocity, host.target(), stiffness, damping, dt)
    integrate(offsetX, offsetVelocity, targetOffsetX.value, stiffness * 1.1, damping * 0.95, dt)
    integrate(tiltDeg, tiltVelocity, targetTiltDeg.value, stiffness * 1.05, damping * 0.95, dt)

    const speed = Math.abs(followVelocity.value) * 0.9 + Math.abs(offsetVelocity.value) * 0.35
    squash.value = clamp01(speed / 1600)
    const direction = followVelocity.value >= 0 ? 1 : -1
    skewDeg.value = -direction * squash.value * Math.max(0, config.distortSkewDeg)

    if (config.jelly && jellyAmplitude.value > 0.0008) {
      jellyPhase.value += 2 * Math.PI * Math.max(0, config.jellyFrequency) * dt
      jellyAmplitude.value *= Math.exp(-Math.max(0, config.jellyDecay) * dt)
      wobble.value = Math.sin(jellyPhase.value) * jellyAmplitude.value
    }
    else {
      jellyAmplitude.value = 0
      wobble.value = 0
    }
  }

  function start(): void {
    if (rafId != null)
      return

    lastFrameTs = null
    rafId = requestAnimationFrame(function loop(ts) {
      if (!host.isEnabled() || !host.isActive()) {
        rafId = null
        lastFrameTs = null
        return
      }

      step(ts)
      rafId = requestAnimationFrame(loop)
    })
  }

  /** Steady-state lean: the tooltip trails the thumb by `intensity` in the opposite direction. */
  function settle(direction: number, intensity: number): void {
    const amount = clamp01(intensity)
    const config = host.config()
    targetTiltDeg.value = -direction * amount * config.tiltMaxDeg
    targetOffsetX.value = -direction * amount * config.offsetMaxPx
  }

  /** One-off wobble kick, e.g. on a hard direction reversal. */
  function impulse(kick: number, direction: number): void {
    if (!host.isEnabled() || !host.config().jelly)
      return

    const amount = clamp01(kick)
    if (amount <= 0)
      return

    wobbleDir.value = direction === 0 ? 1 : direction
    jellyAmplitude.value = Math.min(1, jellyAmplitude.value + amount)
    // A kick landing on a settled tooltip restarts the sine; one landing mid-wobble
    // rides the existing phase so the two do not fight each other.
    if (jellyAmplitude.value === amount)
      jellyPhase.value = 0
  }

  return {
    followX,
    offsetX,
    tiltDeg,
    squash,
    skewDeg,
    wobble,
    wobbleDir,
    reset,
    start,
    stop,
    settle,
    impulse,
  }
}
