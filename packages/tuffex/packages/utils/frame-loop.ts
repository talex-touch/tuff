/** The most one frame steps (s) by default: after a stall or a hidden tab, motion moves on by this, not by the whole gap. */
const MAX_FRAME_S = 0.064

export interface FrameLoop {
  /** Steps from the next frame on; a loop already running carries on as it was. */
  start: () => void
  /** Cancels the frame to come. */
  stop: () => void
  /** Whether a frame is to come. */
  running: () => boolean
}

export interface FrameLoopOptions {
  /** What the first frame after `start` steps (s), rather than the time since `start`. */
  firstStep?: number
  /** The most one frame steps (s). @default 0.064 */
  maxStep?: number
}

/** The clock frames are stamped on, a timer's as well as requestAnimationFrame's. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * The next frame, or a timer a frame away where there are no frames: outside a browser, or in a
 * test. Returns how to cancel it.
 */
function requestFrame(callback: (now: number) => void): () => void {
  if (typeof requestAnimationFrame !== 'undefined') {
    const id = requestAnimationFrame(callback)
    return () => {
      if (typeof cancelAnimationFrame !== 'undefined')
        cancelAnimationFrame(id)
    }
  }
  const id = setTimeout(() => callback(now()), 16)
  return () => clearTimeout(id)
}

/**
 * A requestAnimationFrame loop. Each frame, `step` gets the seconds since the one before, at most
 * `maxStep`, and the frame's timestamp, and returns whether to go on.
 */
export function createFrameLoop(step: (dt: number, now: number) => boolean, options: FrameLoopOptions = {}): FrameLoop {
  const maxStep = options.maxStep ?? MAX_FRAME_S
  let cancel: (() => void) | undefined
  let last = 0
  let first = false

  function tick(time: number): void {
    cancel = undefined
    const dt = first && options.firstStep !== undefined
      ? options.firstStep
      : Math.min(maxStep, Math.max(0, (time - last) / 1000))
    first = false
    last = time
    // A `start` from inside `step` has asked for the next frame already.
    if (step(dt, time) && !cancel)
      cancel = requestFrame(tick)
  }

  return {
    start() {
      if (cancel)
        return
      last = now()
      first = true
      cancel = requestFrame(tick)
    },
    stop() {
      cancel?.()
      cancel = undefined
    },
    running: () => cancel !== undefined,
  }
}
