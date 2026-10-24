/** The most one frame steps (s): after a stall or a hidden tab, motion moves on by this, not by the whole gap. */
const MAX_FRAME_S = 0.064

export interface FrameLoop {
  /** Steps from the next frame on; a loop already running carries on as it was. */
  start: () => void
  /** Cancels the frame to come. */
  stop: () => void
}

/**
 * A requestAnimationFrame loop. Each frame, `step` gets the seconds since the one before, at most
 * 64 ms, and returns whether to go on.
 */
export function createFrameLoop(step: (dt: number) => boolean): FrameLoop {
  let frame = 0
  let last = 0

  function tick(now: number): void {
    frame = 0
    const dt = Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000))
    last = now
    // A `start` from inside `step` has asked for the next frame already.
    if (step(dt) && !frame)
      frame = requestAnimationFrame(tick)
  }

  return {
    start() {
      if (frame)
        return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    },
    stop() {
      if (frame && typeof cancelAnimationFrame !== 'undefined')
        cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
