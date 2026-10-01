import type { Ref } from 'vue'
import type { StreamState } from './types'
import { onScopeDispose, readonly, shallowRef, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { STREAM_PACING_DEFAULTS } from './presets'

export interface StreamPacerOptions {
  /** Units available now; grows as content arrives. */
  total: () => number
  /** The source is still producing. */
  streaming: () => boolean
  wordMs?: () => number | undefined
  maxLagMs?: () => number | undefined
  drainMs?: () => number | undefined
  pauseMs?: () => number | undefined
  /** How long a released unit stays fresh (its entrance time); 0 settles at once. */
  settleMs?: () => number
  /**
   * Content already there at setup enters too, instead of showing as it is.
   * For a stream that mounts mid-answer with words already due, as the parts
   * of a TxStreamElement do. Read once.
   */
  appear?: boolean
  /**
   * `false` releases every unit the moment it arrives; units still stay fresh
   * for `settleMs`. Used when a parent paces (TxStreamElement) and under
   * reduced motion.
   */
  paced?: () => boolean
  onState?: (state: StreamState, previous: StreamState) => void
  now?: () => number
  /** `null` runs without a clock, as on a server: everything shows and settles at once. */
  requestFrame?: ((callback: (time: number) => void) => number) | null
  cancelFrame?: (id: number) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export interface StreamPacer {
  /** Units shown. */
  revealed: Readonly<Ref<number>>
  /** Units whose entrance has finished; always ≤ `revealed`. */
  settled: Readonly<Ref<number>>
  state: Readonly<Ref<StreamState>>
  /** Plays everything again from the first unit at the normal cadence. */
  replay: () => void
  /** Shows everything now, without entrances. */
  skip: () => void
  /** Content was rewritten from `index`: units from there on are released again. */
  rewind: (index: number) => void
  stop: () => void
}

/** The longest a single frame may advance the clock, so a stalled tab resumes gently. */
const MAX_FRAME_MS = 250

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * The stream clock. It releases units one `wordMs` apart and speeds up whenever
 * the backlog would take longer than `maxLagMs` to show, so bursty tokens come
 * out as a steady flow that never falls far behind the source. When the source
 * finishes it releases the rest at a fixed rate that clears it within
 * `drainMs`. It also tracks when each unit was released, so the renderer can
 * turn a unit into plain text once its entrance has played (`settled`).
 *
 * One `requestAnimationFrame` loop, running only while something is left to
 * release or settle. Without a window (SSR) everything is released and settled
 * at once.
 */
export function useStreamPacer(options: StreamPacerOptions): StreamPacer {
  const now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()))
  const requestFrame = options.requestFrame !== undefined
    ? options.requestFrame
    : hasWindow() && typeof requestAnimationFrame === 'function'
      ? (callback: (time: number) => void) => requestAnimationFrame(callback)
      : null
  const cancelFrame = options.cancelFrame ?? ((id: number) => cancelAnimationFrame(id))
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))

  const wordMs = () => positive(options.wordMs?.(), STREAM_PACING_DEFAULTS.wordMs)
  const maxLagMs = () => positive(options.maxLagMs?.(), STREAM_PACING_DEFAULTS.maxLagMs)
  const drainMs = () => positive(options.drainMs?.(), STREAM_PACING_DEFAULTS.drainMs)
  const pauseMs = () => positive(options.pauseMs?.(), STREAM_PACING_DEFAULTS.pauseMs)
  const settleMs = () => Math.max(0, options.settleMs?.() ?? 0)
  const total = () => Math.max(0, Math.floor(options.total()))
  const paced = () => (options.paced?.() ?? true) && requestFrame !== null

  // Content already there when the stream mounts is shown as it is: only what
  // arrives afterwards makes an entrance, so a remounted answer never replays.
  // `appear` opts out: everything enters, from the first unit.
  const initial = options.appear ? 0 : total()
  const revealed = shallowRef(initial)
  const settled = shallowRef(initial)
  const state = shallowRef<StreamState>(options.streaming() ? 'streaming' : initial > 0 ? 'done' : 'idle')

  /** Release time of every unit past `settled`, indexed by unit. */
  let releasedAt: number[] = []
  /** Arrival time of every unit, indexed by unit: each must show by arrival + maxLagMs. */
  const arrivedAt: number[] = Array.from({ length: initial }, () => now())
  let carry = 0
  let lastFrame: number | null = null
  let frame: number | null = null
  let pauseTimer: unknown = null
  let replaying = false
  /** Units per ms while draining, fixed when the source stops. */
  let drainRate = 0
  /** Last time a unit was shown; `paused` is measured from it. */
  let lastRelease = now()
  /** Same, but unset until the first release, so the first unit never waits. */
  let lastEmit = Number.NEGATIVE_INFINITY
  /** `streaming` as of the last sync, to catch the source starting and stopping. */
  let wasStreaming = options.streaming()
  let stopped = false

  const sourceActive = () => options.streaming() || replaying

  function setState(next: StreamState): void {
    const previous = state.value
    if (next === previous)
      return
    state.value = next
    options.onState?.(next, previous)
  }

  function refreshState(at = now()): void {
    const available = total()
    if (revealed.value < available) {
      setState(sourceActive() ? 'streaming' : 'draining')
      return
    }
    // A replay ends once it has shown everything; a live source ends when the
    // host says so.
    replaying = false
    if (options.streaming()) {
      setState(at - lastRelease >= pauseMs() ? 'paused' : 'streaming')
      return
    }
    drainRate = 0
    setState(available > 0 ? 'done' : 'idle')
  }

  function schedulePauseCheck(at = now()): void {
    if (pauseTimer !== null) {
      clearTimer(pauseTimer)
      pauseTimer = null
    }
    // No clock, no timers: a server render must not leave one behind.
    if (stopped || !requestFrame || !sourceActive() || revealed.value < total() || state.value === 'paused')
      return
    const wait = Math.max(0, pauseMs() - (at - lastRelease))
    pauseTimer = setTimer(() => {
      pauseTimer = null
      refreshState()
    }, wait)
  }

  function release(count: number, at: number): void {
    const from = revealed.value
    const to = Math.min(total(), from + count)
    if (to <= from)
      return
    for (let index = from; index < to; index++)
      releasedAt[index] = at
    revealed.value = to
    lastRelease = at
    lastEmit = at
    if (settleMs() === 0 || !requestFrame)
      settle(at)
  }

  function settle(at: number): void {
    const hold = settleMs()
    let next = settled.value
    if (hold === 0 || !requestFrame) {
      next = revealed.value
    }
    else {
      while (next < revealed.value && (releasedAt[next] ?? 0) + hold <= at)
        next++
    }
    if (next !== settled.value)
      settled.value = next
  }

  function busy(): boolean {
    return revealed.value < total() || settled.value < revealed.value
  }

  function step(time: number): void {
    frame = null
    if (stopped)
      return
    const at = now()
    const elapsed = lastFrame === null ? 16 : Math.min(MAX_FRAME_MS, Math.max(0, time - lastFrame))
    lastFrame = time

    const backlog = total() - revealed.value
    if (backlog > 0) {
      let rate: number
      if (!paced()) {
        rate = Number.POSITIVE_INFINITY
      }
      else if (replaying) {
        // A replay plays known content; nothing is arriving, so no lag to bound.
        rate = 1 / wordMs()
      }
      else if (options.streaming()) {
        // Fast enough to show the oldest waiting unit by its deadline. The whole
        // backlog clears evenly by then, so a burst reads as a quicker flow, not
        // a jump; a source outrunning `wordMs` settles just under `maxLagMs`.
        const oldest = arrivedAt[revealed.value] ?? at
        const remaining = Math.max(16, oldest + maxLagMs() - at)
        rate = Math.max(1 / wordMs(), backlog / remaining)
      }
      else {
        if (drainRate === 0)
          drainRate = Math.max(1 / wordMs(), backlog / drainMs())
        rate = drainRate
      }
      carry += rate * elapsed
      const count = Math.min(backlog, Math.floor(carry))
      if (count > 0) {
        carry = rate === Number.POSITIVE_INFINITY ? 0 : carry - count
        release(count, at)
      }
    }
    settle(at)
    refreshState(at)
    schedulePauseCheck(at)
    if (busy())
      loop()
    else
      lastFrame = null
  }

  function loop(): void {
    if (stopped || frame !== null || !requestFrame)
      return
    frame = requestFrame(step)
  }

  function noteArrivals(available: number, at: number): void {
    for (let index = arrivedAt.length; index < available; index++)
      arrivedAt[index] = at
    if (arrivedAt.length > available)
      arrivedAt.length = available
  }

  function sync(): void {
    if (stopped)
      return
    const available = total()
    const at = now()
    const streaming = options.streaming()
    if (streaming !== wasStreaming) {
      wasStreaming = streaming
      // A source that starts now has not been quiet, however long the stream sat
      // idle before it; one that stops fixes its drain rate afresh.
      if (streaming)
        lastRelease = at
      else
        drainRate = 0
    }
    noteArrivals(available, at)
    if (available < revealed.value) {
      revealed.value = available
      releasedAt.length = available
    }
    if (settled.value > revealed.value)
      settled.value = revealed.value

    if (!requestFrame) {
      // No clock (SSR, or a test without one): show everything as it is.
      release(available - revealed.value, at)
      settled.value = revealed.value
    }
    else if (available > revealed.value) {
      // The first unit after a quiet spell goes out on the next frame, not a
      // full `wordMs` later.
      if (lastEmit + wordMs() <= at)
        carry = Math.max(carry, 1)
      if (!paced())
        release(available - revealed.value, at)
      loop()
    }
    else if (settled.value < revealed.value) {
      loop()
    }
    refreshState(at)
    schedulePauseCheck(at)
  }

  function replay(): void {
    if (stopped)
      return
    releasedAt = []
    revealed.value = 0
    settled.value = 0
    carry = 1
    drainRate = 0
    replaying = true
    lastRelease = now()
    lastFrame = null
    if (!requestFrame) {
      sync()
      return
    }
    setState('streaming')
    loop()
  }

  function skip(): void {
    if (stopped)
      return
    const available = total()
    releasedAt = []
    revealed.value = available
    settled.value = available
    replaying = false
    carry = 0
    drainRate = 0
    lastRelease = now()
    refreshState()
    schedulePauseCheck()
  }

  function rewind(index: number): void {
    const to = Math.max(0, Math.floor(index))
    if (to >= revealed.value)
      return
    revealed.value = to
    releasedAt.length = to
    // What follows was rewritten: it arrives now.
    arrivedAt.length = to
    if (settled.value > to)
      settled.value = to
    sync()
  }

  function stop(): void {
    stopped = true
    if (frame !== null)
      cancelFrame(frame)
    frame = null
    if (pauseTimer !== null)
      clearTimer(pauseTimer)
    pauseTimer = null
  }

  // `sync` itself notices the source starting or stopping: a rewrite can call it
  // (through `rewind`) before this watcher runs.
  watch(() => [total(), options.streaming(), paced(), settleMs()] as const, sync)

  if (state.value !== 'done' && state.value !== 'idle')
    schedulePauseCheck()
  if (options.appear && total() > 0)
    sync()
  onScopeDispose(stop)

  return {
    revealed: readonly(revealed),
    settled: readonly(settled),
    state: readonly(state),
    replay,
    skip,
    rewind,
    stop,
  }
}
