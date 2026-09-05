import { ref } from 'vue'
import { JELLY, jellyScale } from '../../../../utils/animation/jelly'

export interface ThumbJellyHost {
  /** Whether the jelly runs at all — off under `prefers-reduced-motion` and on the flat path. */
  isEnabled: () => boolean
}

type Phase = 'idle' | 'emerge' | 'sink'

/** A frame longer than this is a stalled tab; integrating it would blow the spring up. */
const MAX_FRAME_S = 0.024

/**
 * The indicator stretches 1.8× harder while held (`JELLY.heldStretchBoost`):
 * it has a whole group to fill. The thumb has a track to sit on and a tooltip
 * a few px above its crown, so while held it keeps the indicator's free-travel
 * stretch — still visibly taller at speed, never up into the tooltip.
 */
const HELD_STRETCH_BOOST = 1

/**
 * The slider thumb's jelly — the Radio button-group indicator's motion, mapped
 * onto a slider's events.
 *
 * The indicator deforms from two sources: how fast it travels, and how hard it
 * lands (an overshoot reversal, a slam into the group's end). A slider thumb
 * travels exactly as far as the pointer, so its position is never sprung; what
 * is sprung is the uniform scale — up to `heldScale` on grab, back to 1 on
 * release, on the indicator's own spring — while the stretch reads the pointer
 * velocity and the landings come from direction reversals, the track ends and
 * a fast release. Every frame goes through `jellyScale`, shared with the
 * indicator, and every number is `JELLY`'s.
 */
export function useThumbJelly(host: ThumbJellyHost) {
  const scaleX = ref(1)
  const scaleY = ref(1)
  /** True while the loop runs — the only time the host writes an inline transform. */
  const active = ref(false)

  let held = false
  let pointerVelocity = 0
  let impact = 0
  let base = 1
  let baseVelocity = 0
  let phase: Phase = 'idle'
  let landed = false
  let phaseTimer: ReturnType<typeof setTimeout> | null = null
  let rafId: number | null = null
  let lastTs: number | null = null

  function setPhase(next: Phase, ttlMs: number): void {
    phase = next
    if (phaseTimer != null) {
      clearTimeout(phaseTimer)
      phaseTimer = null
    }
    if (ttlMs > 0) {
      phaseTimer = setTimeout(() => {
        phase = 'idle'
        phaseTimer = null
      }, ttlMs)
    }
  }

  function land(energy: number): void {
    impact = Math.min(1, Math.max(impact, energy))
  }

  function stop(): void {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (phaseTimer != null) {
      clearTimeout(phaseTimer)
      phaseTimer = null
    }
    lastTs = null
    phase = 'idle'
    held = false
    landed = false
    base = 1
    baseVelocity = 0
    impact = 0
    pointerVelocity = 0
    scaleX.value = 1
    scaleY.value = 1
    active.value = false
  }

  function step(ts: number): void {
    const dt = Math.min((ts - (lastTs ?? ts)) / 1000, MAX_FRAME_S)
    lastTs = ts

    // Pointer velocity is a sample, not a state: between moves it bleeds away,
    // so a thumb parked mid-drag relaxes instead of staying stretched.
    if (held)
      pointerVelocity *= Math.exp(-dt * JELLY.velocityDecay)

    const target = held ? JELLY.heldScale : 1
    baseVelocity += ((target - base) * JELLY.stiffness - baseVelocity * JELLY.damping) * dt
    base += baseVelocity * dt

    impact *= Math.exp(-dt * (held ? JELLY.impactDecayHeld : JELLY.impactDecayFree))

    const scale = jellyScale({
      speed: Math.abs(pointerVelocity),
      impact,
      impactAxis: 'x',
      elastic: true,
      moving: held,
      dragBoost: HELD_STRETCH_BOOST,
      baseScale: base,
      phaseScale: phase === 'emerge' ? JELLY.emergeScale : phase === 'sink' ? JELLY.sinkScale : 1,
    })
    scaleX.value = scale.scaleX
    scaleY.value = scale.scaleY

    if (held) {
      rafId = requestAnimationFrame(step)
      return
    }

    const settled = Math.abs(base - 1) < 0.001 && Math.abs(baseVelocity) < 0.01 && impact < 0.01
    if (!settled) {
      rafId = requestAnimationFrame(step)
      return
    }

    if (!landed) {
      // The indicator's landing thud: a two-frame dip, then rest.
      landed = true
      setPhase('sink', JELLY.sinkMs)
      rafId = requestAnimationFrame(step)
      return
    }

    if (phase === 'sink') {
      rafId = requestAnimationFrame(step)
      return
    }

    stop()
  }

  function start(): void {
    if (rafId != null)
      return
    active.value = true
    lastTs = null
    rafId = requestAnimationFrame(step)
  }

  /** Pointer down on the thumb: the grab pop, then the held scale on the spring. */
  function press(): void {
    if (!host.isEnabled())
      return
    held = true
    landed = false
    pointerVelocity = 0
    setPhase('emerge', JELLY.emergeMs)
    start()
  }

  /**
   * A pointer sample while held. `velocity` is px/s along the track; `atEnd`
   * says the value is pinned at min or max, so speed here is a slam into it.
   */
  function move(velocity: number, atEnd: boolean): void {
    if (!held)
      return
    const previous = pointerVelocity
    pointerVelocity = velocity
    const speed = Math.abs(velocity)
    const reversed = previous !== 0 && velocity !== 0 && Math.sign(previous) !== Math.sign(velocity)
    if (reversed && speed > JELLY.reversalSpeed)
      land(speed / JELLY.reversalImpactScale)
    if (atEnd && speed > JELLY.edgeSpeed)
      land(JELLY.edgeImpact)
  }

  /** Pointer up: a fast release lands like a slam; the spring then carries the scale home. */
  function release(): void {
    if (!held)
      return
    held = false
    land(Math.min(1, Math.abs(pointerVelocity) / JELLY.edgeSpeed) * JELLY.edgeImpact)
    pointerVelocity = 0
    start()
  }

  return {
    scaleX,
    scaleY,
    active,
    press,
    move,
    release,
    stop,
  }
}
