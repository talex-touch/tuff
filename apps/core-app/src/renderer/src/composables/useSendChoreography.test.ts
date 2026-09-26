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
import type { LiftOverlay } from './useSendChoreography'
import { LIFT_SCORE } from './send-lift/score'

const FLIGHT_MS = 460

let now = 0
let frames: Array<{ id: number; callback: FrameRequestCallback }> = []
let frameIds = 0

/** Drives the rAF loop to `target` ms, one 16ms frame at a time. */
function advanceTo(target: number): void {
  while (now < target && frames.length) {
    now = Math.min(target, now + 16)
    const due = frames
    frames = []
    for (const { callback } of due) callback(now)
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
  frameIds = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameIds += 1
    frames.push({ id: frameIds, callback })
    return frameIds
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames = frames.filter((frame) => frame.id !== id)
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
    // Several frames, not one: the clone absorbs a correction rather than
    // teleporting onto it. A precomputed flight never converges on the new
    // position at all, which is what this separates.
    advanceTo(400)
    const afterShift = translateYOf(clone)

    expect(afterShift).toBeLessThan(beforeShift - 50)
  })

  /**
   * Tracking the live rect is what makes the landing exact, but read raw it also
   * hands the clone every layout correction whole, in one frame. Late in the
   * flight the curve has covered ~100% of the distance, so the clone inherits
   * nearly all of it at once: a -60px correction at t=350ms used to move one
   * frame by -61.8px between neighbours moving -3.2px and +3.0px.
   */
  it('absorbs a late layout correction instead of teleporting onto it', () => {
    const stage = buildStage({ composerTop: 800, rowTop: 500 })
    stage.choreography.markEntering(['msg-1'])
    stage.choreography.playSend('msg-1', stage.composer)
    const clone = stage.clone()!

    let previous = translateYOf(clone)
    let largestStep = 0
    for (let t = 16; t <= FLIGHT_MS + 16; t += 16) {
      if (t >= 350) stage.state.rowTop = 440
      advanceTo(t)
      const current = translateYOf(clone)
      largestStep = Math.max(largestStep, Math.abs(current - previous))
      previous = current
    }

    // The flight's own peak is ~42px/frame at 60Hz; the correction must not
    // exceed the motion the bubble was already making.
    expect(largestStep).toBeLessThan(45)
    // …and it still lands exactly on the corrected row, or the swap jumps.
    expect(previous).toBeCloseTo(440, 1)
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

describe('entrance watchdog', () => {
  /**
   * A marked row renders at opacity 0, so an id nothing removes is a message
   * the reader wrote and cannot see. The view marks a whole appended batch
   * while the send score reveals only the ids it knows about, which is how
   * rows have been stranded before.
   */
  it('reveals a row whose entrance never ran', () => {
    vi.useFakeTimers()
    try {
      const stage = buildStage({ composerTop: 800, rowTop: 500 })
      stage.choreography.markEntering(['msg-1', 'orphan'])
      stage.choreography.playSend('msg-1', stage.composer)

      // Long past the flight, and nothing ever revealed the second id.
      vi.advanceTimersByTime(2100)

      expect(stage.choreography.enteringMessages.has('orphan')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the watchdog to cancel() on unmount', () => {
    vi.useFakeTimers()
    try {
      const stage = buildStage({ composerTop: 800, rowTop: 500 })
      stage.choreography.markEntering(['msg-1'])
      stage.choreography.cancel()
      vi.advanceTimersByTime(2100)

      // cancel() clears the timer rather than letting it fire against a view
      // that is gone; the set dies with the composable either way.
      expect(stage.choreography.enteringMessages.has('msg-1')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
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

/**
 * The split's page stage: a composer whose top edge sits at y=700, a hidden user row whose bubble
 * rests up and to the right, and the overlay the view declares in its template.
 */
/**
 * A page for the lift: a composer with its field, a stream whose last user row hides a bubble, and
 * the lift overlay. Rects are fixed numbers — jsdom lays nothing out — and `bubbleTop` is mutable
 * so a test can move the row under the flight.
 */
function buildLiftStage(options: { draft?: string; wrapped?: boolean } = {}) {
  const state = { bubbleTop: 300 }
  const host = document.createElement('div')
  const stream = document.createElement('div')
  stream.className = 'HomePage-Stream'
  const scroller = document.createElement('div')
  const row = document.createElement('div')
  row.setAttribute('data-message-id', 'msg-1')
  const bubble = document.createElement('div')
  bubble.className = 'HomePage-UserBubble'
  row.append(bubble)
  scroller.append(row)
  stream.append(scroller)

  const composer = document.createElement('div')
  const input = document.createElement('textarea')
  Object.assign(input.style, { lineHeight: '21px', paddingLeft: '0px', paddingTop: '0px' })
  Object.defineProperty(input, 'scrollHeight', { value: options.wrapped ? 84 : 21 })
  composer.append(input)
  const draftGhost = document.createElement('div')
  composer.append(draftGhost)

  const ghost = document.createElement('div')
  const fill = document.createElement('div')
  const text = document.createElement('div')
  // The lifted text wears the bubble's class, so it answers for the bubble's typography.
  Object.assign(text.style, {
    lineHeight: '22.4px',
    paddingLeft: '14px',
    paddingTop: '10px',
    paddingBottom: '10px'
  })
  ghost.append(fill, text)
  host.append(stream, composer, ghost)
  document.body.append(host)

  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
  composer.getBoundingClientRect = () => rect(40, 700, 720, 110)
  input.getBoundingClientRect = () => rect(57, 717, 690, options.wrapped ? 84 : 21)
  ghost.getBoundingClientRect = () => rect(0, 0, 140, options.wrapped ? 131.6 : 42.4)
  bubble.getBoundingClientRect = () =>
    rect(620, state.bubbleTop, 140, options.wrapped ? 131.6 : 42.4)

  const overlay: LiftOverlay = { ghost, fill, text }
  const choreography = useSendChoreography({
    host: () => host,
    scroller: () => null,
    composerGroup: () => null,
    composer: () => composer,
    liftOverlay: () => overlay
  })
  const lift = () =>
    choreography.liftDraft({
      text: options.draft ?? 'Ship it tonight',
      input,
      bubbleMaxWidth: 561.6,
      draftGhost
    })
  const translate = (): { x: number; y: number } => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(ghost.style.transform)
    return { x: Number(m?.[1]), y: Number(m?.[2]) }
  }
  return { state, overlay, choreography, lift, translate, row, draftGhost, text }
}

describe('send lift', () => {
  it("lays the bubble over the draft on the press: the draft's first line under the bubble's", () => {
    const stage = buildLiftStage()
    const lift = stage.lift()
    expect(lift).not.toBeNull()
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(true)
    expect(stage.overlay.text.textContent).toBe('Ship it tonight')
    expect(Number.parseFloat(stage.overlay.text.style.maxWidth)).toBeCloseTo(561.6, 2)
    // Field text at (57, 717) with a 21px line; the bubble pads 14/10 and centres a 22.4px line.
    expect(stage.translate()).toEqual({ x: 43, y: 717 - 10 - 0.7 })
    // Still on the composer: no fill yet.
    expect(stage.overlay.fill.style.opacity).toBe('0')
  })

  it('flies to the row after the settle frames, fills in on the way, lands exactly and reveals it', async () => {
    const stage = buildLiftStage()
    stage.choreography.markEntering(['msg-1'])
    const onClear = vi.fn()
    const lift = stage.choreography.liftDraft({
      text: 'Ship it tonight',
      input: stage.overlay.ghost.ownerDocument.querySelector('textarea')!,
      bubbleMaxWidth: 561.6,
      onClear
    })!
    const handle = lift.fly('msg-1')
    expect(handle).not.toBeNull()
    // Holds on the draft while the rows settle.
    advanceTo(16)
    expect(stage.translate().y).toBeCloseTo(706.3, 1)

    let filled = 0
    let lastY = stage.translate().y
    let overshoot = false
    while (now < 1500 && stage.overlay.ghost.classList.contains('is-active')) {
      advanceTo(now + 16)
      filled = Math.max(filled, Number(stage.overlay.fill.style.opacity || 0))
      const { y } = stage.translate()
      if (!Number.isNaN(y) && y < 300) overshoot = true
      if (!Number.isNaN(y)) lastY = y
    }
    expect(filled).toBe(1)
    expect(onClear).toHaveBeenCalledTimes(1)
    await expect(handle!.impact).resolves.toBeUndefined()
    // The swap: the row is revealed in the frame the overlay clears, from its own pose.
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(false)
    expect(Math.abs(lastY - 300)).toBeLessThanOrEqual(LIFT_SCORE.landTolerancePx)
    // One small overshoot, the spring's own.
    expect(overshoot).toBe(true)
  })

  it('bends to a row that moved mid-flight and lands on the new place', () => {
    const stage = buildLiftStage()
    stage.choreography.markEntering(['msg-1'])
    stage.lift()!.fly('msg-1')
    advanceTo(120)
    stage.state.bubbleTop = 260
    let lastY = Number.NaN
    while (now < 1500 && stage.overlay.ghost.classList.contains('is-active')) {
      advanceTo(now + 16)
      const { y } = stage.translate()
      if (!Number.isNaN(y)) lastY = y
    }
    expect(Math.abs(lastY - 260)).toBeLessThanOrEqual(LIFT_SCORE.landTolerancePx)
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
  })

  it('cross-fades a wrapped draft: the draft fades where it sat, the bubble text fades in', () => {
    const stage = buildLiftStage({ wrapped: true, draft: 'one\ntwo\nthree\nfour' })
    stage.lift()
    const animate = vi.mocked(Element.prototype.animate)
    const on = (el: Element) => animate.mock.calls.filter((_, i) => animate.mock.contexts[i] === el)
    expect(on(stage.text)[0]?.[0]).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(on(stage.draftGhost)[0]?.[0]).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(stage.draftGhost.textContent).toBe('one\ntwo\nthree\nfour')
  })

  it('lifts a multi-line draft with the same breaks glyph for glyph, centred, without a fade', () => {
    // Four field lines (84px) and a bubble of four 22.4px lines plus 20px of padding.
    const stage = buildLiftStage({ wrapped: true, draft: 'one\ntwo\nthree\nfour' })
    stage.overlay.ghost.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 140, height: 109.6, right: 140, bottom: 109.6 }) as DOMRect
    stage.lift()
    expect(vi.mocked(Element.prototype.animate)).not.toHaveBeenCalled()
    // Centred on the draft's block: 4 × (22.4 − 21) / 2 above the single-line alignment.
    expect(stage.translate().y).toBeCloseTo(717 - 10 - 2.8, 2)
  })

  it('does not cross-fade a one-line draft: the glyphs are the same ones', () => {
    const stage = buildLiftStage()
    stage.lift()
    expect(vi.mocked(Element.prototype.animate)).not.toHaveBeenCalled()
  })

  it('a newer send lands a lift in the air at once, row revealed and overlay cleared', () => {
    const stage = buildLiftStage()
    stage.choreography.markEntering(['msg-1'])
    stage.lift()!.fly('msg-1')
    advanceTo(80)
    stage.choreography.invalidate()
    expect(stage.choreography.enteringMessages.has('msg-1')).toBe(false)
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(false)
    expect(stage.overlay.text.textContent).toBe('')
  })

  it('cancel puts the draft down and clears the field placeholder hold once', () => {
    const stage = buildLiftStage()
    const onClear = vi.fn()
    const lift = stage.choreography.liftDraft({
      text: 'Ship it tonight',
      input: document.querySelector('textarea')!,
      bubbleMaxWidth: 561.6,
      onClear
    })!
    lift.cancel()
    lift.cancel()
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(false)
  })

  it('never flies to a row the send did not append, and reveals it', () => {
    const stage = buildLiftStage()
    expect(stage.lift()!.fly('msg-1')).toBeNull()
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(false)
  })

  it("flies the conversation's first message on the slower opening spring", () => {
    const framesToLand = (opening: boolean): number => {
      now = 0
      frames = []
      document.body.innerHTML = ''
      const stage = buildLiftStage()
      stage.choreography.markEntering(['msg-1'])
      stage.choreography
        .liftDraft({
          text: 'Ship it tonight',
          input: document.querySelector('textarea')!,
          bubbleMaxWidth: 561.6,
          opening
        })!
        .fly('msg-1')
      let count = 0
      while (count < 400 && stage.overlay.ghost.classList.contains('is-active')) {
        advanceTo(now + 16)
        count += 1
      }
      return count
    }
    expect(framesToLand(true)).toBeGreaterThan(framesToLand(false))
  })

  it("docks the first send on its bubble's own slow curve", () => {
    const group = document.createElement('div')
    const choreography = useSendChoreography({
      host: () => null,
      scroller: () => null,
      composerGroup: () => group,
      composer: () => null
    })
    choreography.playComposerFlip(-300, { opening: true })
    const [frames, timing] = vi.mocked(Element.prototype.animate).mock.lastCall as [
      { offset: number; transform: string }[],
      { duration: number; easing: string }
    ]
    expect(timing.easing).toBe('linear')
    expect(timing.duration).toBeGreaterThan(850)
    // Starts where the box stood (300px up) and barely moves in the first tenth.
    expect(frames[0].transform).toContain('translateY(-300.0px)')
    const early = frames.find((f) => f.offset >= 0.1)!
    expect(Number(/translateY\(([-\d.]+)px\)/.exec(early.transform)?.[1])).toBeLessThan(-270)
    expect(frames.at(-1)!.transform).toContain('translateY(0.0px)')
  })

  it('does not lift under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as MediaQueryList)
    const stage = buildLiftStage()
    expect(stage.lift()).toBeNull()
    expect(stage.overlay.ghost.classList.contains('is-active')).toBe(false)
  })
})
