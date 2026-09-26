import type { LiftRect, LiftSpring } from './score'
import { springSteps } from '@talex-touch/tuffex/fusion-surface'
import { fillAt, LIFT_SCORE, rampedSpring, rectGap, travelProgress } from './score'

/**
 * The send lift's frame loop: one spring moves the lifted bubble from where the draft sat to its
 * row; a frame writes a `transform` and the fill's `opacity`, both composited, and reads no
 * layout. The real row is read at launch, once more at about 70% of the travel, and at rest
 * before the swap. Velocity survives a moved landing, so a correction bends the path instead of
 * restarting it.
 */

/** The lifted bubble, declared in the view's template so its scoped styles reach it. */
export interface LiftOverlay {
  /** Fixed and above the composer (the text starts on its surface); moved by `transform` only. */
  ghost: HTMLElement
  /** The bubble's fill, faded in as the bubble leaves the composer. */
  fill: HTMLElement
  /** The message, laid out exactly as the landed bubble lays it out. */
  text: HTMLElement
}

export interface LiftLaunch {
  /** Viewport offset of the fixed layer's own origin (normally 0, 0). */
  originX: number
  originY: number
  /** Where the bubble sits now — laid over the draft at the press — viewport px. */
  from: { left: number; top: number }
  /** The bubble's own size. */
  size: { width: number; height: number }
  /** Viewport y of the composer's top edge: a bubble wholly above it has left the composer. */
  clearY: number
  /** The spring it rides; `LIFT_SCORE.spring` unless the send asks for another (the first one). */
  spring?: LiftSpring
  /** The spring's pull eased in from `floor` of itself over `ms` after launch (a gentle peel-off). */
  ramp?: { ms: number; floor: number }
}

export interface LiftDriverHooks {
  /** The bubble is wholly above the composer: the field's placeholder may come back. */
  onClear: () => void
  /** First touch of the landing, or the end, whichever comes first. */
  onImpact: () => void
  /** The bubble sits on the real row: reveal the row. The overlay clears in the same frame. */
  onLand: () => void
  /**
   * The real bubble's rest pose, viewport px; `null` once the row is gone. `predicted` asks for
   * where it will rest once the stream's glide to the bottom is done.
   */
  readLanding: (predicted: boolean) => LiftRect | null
}

export interface LiftClock {
  now: () => number
  request: (callback: FrameRequestCallback) => number
  cancel: (handle: number) => void
}

interface Channel {
  x: number
  v: number
  to: number
}

/** Rest within a quarter pixel, moving under a quarter pixel per frame, then snap onto the target. */
const REST = { position: 0.25, velocity: 15 }

function atRest(c: Channel): boolean {
  return Math.abs(c.to - c.x) <= REST.position && Math.abs(c.v) <= REST.velocity
}

function advance(c: Channel, config: LiftSpring, dt: number): void {
  if (!atRest(c)) [c.x, c.v] = springSteps(c.x, c.v, c.to, config, dt)
  if (atRest(c)) {
    c.x = c.to
    c.v = 0
  }
}

function fixed(value: number, digits: number): string {
  const r = Number(value.toFixed(digits))
  return String(Number.isFinite(r) ? r : 0)
}

const browserClock: LiftClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle)
}

export class SendLiftDriver {
  private readonly overlay: LiftOverlay
  private readonly launch: LiftLaunch
  private readonly hooks: LiftDriverHooks
  private readonly clock: LiftClock
  private readonly startedAt: number
  private readonly x: Channel
  private readonly y: Channel
  private readonly fromY: number
  private raf = 0
  private lastFrame = 0
  private ended = false
  private cleared = false
  private impacted = false
  private reread = false
  private verifies = 0
  private written = { transform: '', fill: '' }

  constructor(
    overlay: LiftOverlay,
    launch: LiftLaunch,
    hooks: LiftDriverHooks,
    clock: LiftClock = browserClock
  ) {
    this.overlay = overlay
    this.launch = launch
    this.hooks = hooks
    this.clock = clock
    this.x = { x: launch.from.left, v: 0, to: launch.from.left }
    this.y = { x: launch.from.top, v: 0, to: launch.from.top }
    this.fromY = launch.from.top
    this.startedAt = clock.now()
    const landing = hooks.readLanding(true)
    if (!landing) {
      this.finish()
      return
    }
    this.retarget(landing)
    this.draw()
    this.raf = clock.request(this.tick)
  }

  get done(): boolean {
    return this.ended
  }

  /** Lands the lift where it stands: every hook still owed fires and the overlay clears. */
  finish(): void {
    if (this.ended) return
    this.ended = true
    if (this.raf) this.clock.cancel(this.raf)
    this.raf = 0
    if (!this.cleared) {
      this.cleared = true
      this.hooks.onClear()
    }
    if (!this.impacted) {
      this.impacted = true
      this.hooks.onImpact()
    }
    this.hooks.onLand()
    const { ghost, fill, text } = this.overlay
    ghost.classList.remove('is-active')
    ghost.style.transform = ''
    fill.style.opacity = ''
    text.textContent = ''
    text.style.maxWidth = ''
  }

  private readonly tick = (now: number): void => {
    this.raf = 0
    if (this.ended) return
    try {
      this.frame(now)
    } catch (error) {
      // A frame that throws must not strand the hidden row: land it, then let the error surface.
      this.finish()
      throw error
    }
  }

  private frame(now: number): void {
    // Wall-clock dt, capped against a stalled tab; springSteps substeps any gap, so a slow frame
    // never turns into slow motion.
    const dt = this.lastFrame
      ? Math.min(0.1, Math.max(1 / 240, (now - this.lastFrame) / 1000))
      : 1 / 60
    this.lastFrame = now
    if (this.clock.now() - this.startedAt >= LIFT_SCORE.timeoutMs) {
      this.finish()
      return
    }
    const before = this.y.x
    const ramp = this.launch.ramp
    const spring = rampedSpring(
      this.launch.spring ?? LIFT_SCORE.spring,
      this.clock.now() - this.startedAt,
      ramp?.ms ?? 0,
      ramp?.floor ?? 1
    )
    advance(this.x, spring, dt)
    advance(this.y, spring, dt)

    if (!this.cleared && this.y.x + this.launch.size.height <= this.launch.clearY) {
      this.cleared = true
      this.hooks.onClear()
    }
    // First touch: the bubble reached or crossed its landing this frame.
    if (!this.impacted && (this.y.to - before) * (this.y.to - this.y.x) <= 0) {
      this.impacted = true
      this.hooks.onImpact()
    }
    // The one mid-flight read: whatever layout did meanwhile, the path bends to it.
    if (!this.reread && travelProgress(this.fromY, this.y.to, this.y.x) >= LIFT_SCORE.rereadAt) {
      this.reread = true
      const landing = this.hooks.readLanding(false)
      if (!landing) {
        this.finish()
        return
      }
      this.retarget(landing)
    }

    this.draw()
    if (this.x.v === 0 && this.y.v === 0 && this.x.x === this.x.to && this.y.x === this.y.to) {
      if (this.verify()) return
    }
    this.raf = this.clock.request(this.tick)
  }

  private retarget(landing: LiftRect): void {
    this.x.to = landing.left
    this.y.to = landing.top
  }

  /**
   * At rest: read the row once more and swap only if the bubble sits on it. A row that moved again
   * gets flown to instead, a few times at most. Returns whether the lift ended.
   */
  private verify(): boolean {
    const landing = this.hooks.readLanding(false)
    if (!landing) {
      this.finish()
      return true
    }
    const pose = { left: this.x.x, top: this.y.x, ...this.launch.size }
    if (
      rectGap(landing, pose) <= LIFT_SCORE.landTolerancePx ||
      this.verifies >= LIFT_SCORE.maxVerifies
    ) {
      this.finish()
      return true
    }
    this.verifies += 1
    this.retarget(landing)
    return false
  }

  private draw(): void {
    const { ghost, fill } = this.overlay
    const transform = `translate(${fixed(this.x.x - this.launch.originX, 2)}px, ${fixed(this.y.x - this.launch.originY, 2)}px)`
    if (transform !== this.written.transform) {
      ghost.style.transform = transform
      this.written.transform = transform
    }
    const opacity = fixed(fillAt(travelProgress(this.fromY, this.y.to, this.y.x)), 3)
    if (opacity !== this.written.fill) {
      fill.style.opacity = opacity
      this.written.fill = opacity
    }
  }
}
