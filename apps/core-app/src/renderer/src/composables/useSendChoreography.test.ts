// @vitest-environment jsdom
/**
 * The landing invariant, pinned.
 *
 * Five prior passes at this motion all precomputed the flight's landing point
 * at press time, while the composer collapse, the scroll glide and the
 * virtualizer's estimated row height were still moving. The clone flew to a
 * stale number, the real row settled somewhere else, and the swap jumped —
 * worse the longer the draft. Nothing in the suite could see it, because the
 * defect only exists when layout MOVES during the flight.
 *
 * So that is what these tests do: move the row mid-flight and assert the clone
 * ends on it. A precomputed implementation fails them by construction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLIGHT_IMPACT_MS, sampleFlight, useSendChoreography } from './useSendChoreography'

const FLIGHT_MS = 460

let now = 0
let frames: FrameRequestCallback[] = []

/** Drives the rAF loop to `target` ms, one 16ms frame at a time. */
function advanceTo(target: number): void {
  while (now < target && frames.length) {
    now = Math.min(target, now + 16)
    const due = frames
    frames = []
    for (const frame of due) frame(now)
  }
}

function translateYOf(el: HTMLElement): number {
  const match = /translateY\(([-\d.]+)px\)/.exec(el.style.transform)
  return match ? Number(match[1]) : Number.NaN
}

/**
 * A page with one composer, one stream and one hidden user row. `rowTop` is
 * mutable so a test can move the row mid-flight, which is the whole point.
 */
function buildStage(options: { composerTop: number; rowTop: number }) {
  const state = { rowTop: options.rowTop }

  const host = document.createElement('div')
  const stream = document.createElement('div')
  stream.className = 'HomePage-Stream'
  const scroller = document.createElement('div')
  scroller.className = 'tx-conversation-stream__scroller'
  const row = document.createElement('div')
  row.setAttribute('data-message-id', 'msg-1')
  scroller.append(row)
  stream.append(scroller)
  host.append(stream)
  document.body.append(host)

  const composer = document.createElement('div')
  document.body.append(composer)

  row.getBoundingClientRect = () =>
    ({ top: state.rowTop, left: 40, width: 300, height: 50 }) as DOMRect
  composer.getBoundingClientRect = () =>
    ({ top: options.composerTop, left: 40, width: 300, height: 50 }) as DOMRect

  const choreography = useSendChoreography({
    host: () => host,
    scroller: () => scroller,
    composerGroup: () => null,
    composer: () => composer
  })

  return {
    state,
    host,
    composer,
    choreography,
    clone: () => host.querySelector<HTMLElement>('.HomePage-FlightClone')
  }
}

beforeEach(() => {
  now = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  // jsdom has no WAAPI; the flight only needs `animate` to not throw.
  Element.prototype.animate = vi.fn(
    () => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList)
  // jsdom ships no CSS.escape; the ids here need no escaping.
  vi.stubGlobal('CSS', { escape: (value: string) => value })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('send flight landing', () => {
  it('lands on the row position that layout settled at, not the one measured at press time', () => {
    const stage = buildStage({ composerTop: 800, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])
    stage.choreography.playSend('msg-1', stage.composer)

    const clone = stage.clone()
    expect(clone).not.toBeNull()

    // Mid-flight the layout corrects — exactly what the composer collapse, the
    // scroll glide and the virtualizer's height estimate do in the real app.
    advanceTo(200)
    stage.state.rowTop = 360

    advanceTo(FLIGHT_MS + 32)

    // The clone is removed at the finish, so read the pose it landed in.
    expect(translateYOf(clone!)).toBeCloseTo(360, 1)
  })

  it('tracks the row continuously rather than interpolating toward a fixed target', () => {
    const stage = buildStage({ composerTop: 800, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])
    stage.choreography.playSend('msg-1', stage.composer)
    const clone = stage.clone()!

    advanceTo(304) // ~66% — the curve has covered ~92% of the distance
    const beforeShift = translateYOf(clone)

    stage.state.rowTop = 300
    advanceTo(320)
    const afterShift = translateYOf(clone)

    // A precomputed flight would keep gliding to the old landing; a tracking
    // one follows the row up immediately.
    expect(afterShift).toBeLessThan(beforeShift - 50)
  })

  it('reveals the real row exactly when the clone is removed', async () => {
    const stage = buildStage({ composerTop: 800, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])
    const flight = stage.choreography.playSend('msg-1', stage.composer)
    expect(flight).not.toBeNull()

    advanceTo(FLIGHT_IMPACT_MS)
    // Still hidden while the clone is mid-air: two visible bubbles would double.
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(true)

    advanceTo(FLIGHT_MS + 32)
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
    expect(stage.clone()).toBeNull()
  })

  it('skips the flight — and un-hides the row — when the travel is negligible', () => {
    // Composer sitting on top of the row: nothing to fly.
    const stage = buildStage({ composerTop: 500, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])

    expect(stage.choreography.playSend('msg-1', stage.composer)).toBeNull()
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
    expect(stage.clone()).toBeNull()
  })

  it('retires an in-flight clone when a newer send takes the stage', () => {
    const stage = buildStage({ composerTop: 800, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])
    stage.choreography.playSend('msg-1', stage.composer)

    advanceTo(100)
    stage.choreography.invalidate()
    advanceTo(140)

    expect(stage.clone()).toBeNull()
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
  })
})

describe('cancel', () => {
  it('drops pending beats so an unmounted view animates nothing', () => {
    vi.useFakeTimers()
    try {
      const stage = buildStage({ composerTop: 800, rowTop: 500 })
      const ran = vi.fn()
      stage.choreography.scheduleForCurrentSend(ran, 100)

      stage.choreography.cancel()
      vi.advanceTimersByTime(500)

      expect(ran).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sampleFlight', () => {
  it('is clamped, monotonic in position, and ends at rest', () => {
    expect(sampleFlight(-1)).toEqual({ x: 0, v: 0 })
    expect(sampleFlight(2)).toEqual({ x: 1, v: 0 })
    expect(sampleFlight(1)).toEqual({ x: 1, v: 0 })

    let previous = -1
    for (let o = 0; o <= 0.7; o += 0.05) {
      const { x } = sampleFlight(o)
      expect(x).toBeGreaterThan(previous)
      previous = x
    }
    // The soft capture overshoots ~3% before settling.
    expect(sampleFlight(0.79).x).toBeGreaterThan(1)
  })
})
