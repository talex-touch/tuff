import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useStickToBottom } from '../src/use-stick-to-bottom'

interface FakeElement {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  scrollTo: (options: { top: number, behavior?: string }) => void
}

function makeElement(overrides: Partial<FakeElement> = {}) {
  const el: FakeElement = {
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 400,
    scrollTo(options) {
      el.scrollTop = options.top
    },
    ...overrides,
  }
  return el
}

function setup(overrides: Partial<FakeElement> = {}) {
  const el = makeElement(overrides)
  const elementRef = ref<HTMLElement | null>(el as unknown as HTMLElement)
  const stick = useStickToBottom(elementRef, { threshold: 80 })
  return { el, stick }
}

function wheelUp(): WheelEvent {
  return { deltaY: -40 } as WheelEvent
}

describe('useStickToBottom', () => {
  it('starts following and keeps following near the bottom', () => {
    const { el, stick } = setup()
    el.scrollTop = 560 // 1000 - 560 - 400 = 40 < 80
    stick.handleScroll()
    expect(stick.atBottom.value).toBe(true)
    expect(stick.following.value).toBe(true)
  })

  it('stops following when the user scrolls away', () => {
    const { el, stick } = setup()
    el.scrollTop = 200
    stick.handleScroll()
    expect(stick.atBottom.value).toBe(false)
    expect(stick.following.value).toBe(false)

    // Content growth must not yank them back.
    el.scrollHeight = 2000
    stick.followIfSticking()
    expect(el.scrollTop).toBe(200)
  })

  it('breaks follow on upward wheel input even while at the bottom', () => {
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()
    expect(stick.following.value).toBe(true)

    stick.handleWheel(wheelUp())
    expect(stick.following.value).toBe(false)

    el.scrollHeight = 3000
    stick.followIfSticking()
    expect(el.scrollTop).toBe(600)
  })

  it('follows growth while sticking', () => {
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()

    el.scrollHeight = 1500
    stick.followIfSticking()
    expect(el.scrollTop).toBe(1500)
    expect(stick.atBottom.value).toBe(true)
  })

  it('does not treat smooth-scroll intermediate events as the user walking away', () => {
    const { el, stick } = setup({
      // A smooth scroll that only gets 10% of the way per call.
      scrollTo(options: { top: number }) {
        el.scrollTop += (options.top - el.scrollTop) * 0.1
      },
    })
    el.scrollTop = 0
    stick.scrollToBottom('smooth')

    // Intermediate scroll events far from the bottom keep `following` intact.
    stick.handleScroll()
    expect(stick.following.value).toBe(true)

    // Arrival releases the guard; a later user scroll away breaks follow again.
    el.scrollTop = 950
    stick.handleScroll()
    el.scrollTop = 100
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
  })

  it('scrollToBottom restores following from a detached position', () => {
    const { el, stick } = setup()
    el.scrollTop = 100
    stick.handleScroll()
    expect(stick.following.value).toBe(false)

    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1000)
    expect(stick.following.value).toBe(true)
    expect(stick.atBottom.value).toBe(true)
  })

  it('keeps following when content grows between the scroll and its async event', () => {
    const { el, stick } = setup()
    stick.scrollToBottom() // scrollTop -> 1000 (stub), arrival event still pending

    // A stream delta lands before the browser delivers the scroll event, so
    // the event arrives at the requested position but "not at the bottom".
    el.scrollHeight = 2000
    stick.handleScroll()

    // Arrival at the programmed position must not read as the user leaving.
    expect(stick.following.value).toBe(true)
    stick.followIfSticking()
    expect(el.scrollTop).toBe(2000)
  })

  it('tolerates a missing element', () => {
    const elementRef = ref<HTMLElement | null>(null)
    const stick = useStickToBottom(elementRef)
    expect(() => {
      stick.handleScroll()
      stick.scrollToBottom()
      stick.followIfSticking()
    }).not.toThrow()
    expect(stick.atBottom.value).toBe(true)
  })
})

describe('useStickToBottom tweenToBottom', () => {
  /**
   * A hand-cranked animation clock: rAF callbacks queue up and `tick(ms)`
   * advances time then runs exactly one frame, so every assertion sees a
   * deterministic mid-glide state.
   */
  function makeClock() {
    let now = 0
    const queue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push(cb)
      return queue.length
    })
    vi.stubGlobal('performance', { now: () => now } as unknown as Performance)
    return {
      async tick(ms: number): Promise<void> {
        now += ms
        const frame = queue.shift()
        frame?.(now)
        // Lets the promise chain inside the tween settle between frames.
        await Promise.resolve()
      },
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('glides to the bottom over the duration and resolves true', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    const landed = vi.fn()
    void stick.tweenToBottom(200).then(landed)

    await clock.tick(0)
    expect(el.scrollTop).toBe(0)

    await clock.tick(100) // t=0.5, ease-out cubic = 0.875
    expect(el.scrollTop).toBeGreaterThan(400)
    expect(el.scrollTop).toBeLessThan(600)
    expect(landed).not.toHaveBeenCalled()

    await clock.tick(100) // t=1
    expect(el.scrollTop).toBe(600)
    expect(landed).toHaveBeenCalledWith(true)
    expect(stick.following.value).toBe(true)
    expect(stick.atBottom.value).toBe(true)
  })

  it('retargets a bottom that grows mid-glide', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    void stick.tweenToBottom(200)

    await clock.tick(0)
    await clock.tick(100)
    // A reply starts streaming while the glide is in flight.
    el.scrollHeight = 2000
    await clock.tick(100)
    expect(el.scrollTop).toBe(1600)
  })

  it('suppresses instant growth-follows while gliding', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    void stick.tweenToBottom(200)

    await clock.tick(0)
    await clock.tick(100)
    const midway = el.scrollTop
    // The live zone resizing mid-glide must not teleport past the tween.
    stick.followIfSticking()
    expect(el.scrollTop).toBe(midway)
  })

  it('cancels on upward wheel and resolves false', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    const landed = vi.fn()
    void stick.tweenToBottom(200).then(landed)

    await clock.tick(0)
    await clock.tick(100)
    const escaped = el.scrollTop
    stick.handleWheel({ deltaY: -40 } as WheelEvent)

    await clock.tick(100)
    expect(el.scrollTop).toBe(escaped)
    expect(landed).toHaveBeenCalledWith(false)
    expect(stick.following.value).toBe(false)

    // With the tween dead, growth-follows work again for a re-attached reader.
    stick.handleScroll()
    el.scrollTop = 600
    stick.handleScroll()
    el.scrollHeight = 1500
    stick.followIfSticking()
    expect(el.scrollTop).toBe(1500)
  })

  it('yields to an explicit scrollToBottom', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    const landed = vi.fn()
    void stick.tweenToBottom(200).then(landed)

    await clock.tick(0)
    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1000)

    await clock.tick(100)
    expect(landed).toHaveBeenCalledWith(false)
  })

  it('falls back to an instant jump without requestAnimationFrame', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { el, stick } = setup()
    await expect(stick.tweenToBottom(200)).resolves.toBe(true)
    expect(el.scrollTop).toBe(1000)
  })

  it('spring-follows growth instead of snapping when asked', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()

    el.scrollHeight = 1400
    stick.followIfSticking(200)
    // No instant jump — the spring owns the approach.
    expect(el.scrollTop).toBe(600)

    await clock.tick(0)
    await clock.tick(16)
    expect(el.scrollTop).toBeGreaterThan(600)
    expect(el.scrollTop).toBeLessThan(1000)

    // Pump frames until the spring settles; it must land exactly and never
    // move backwards (critical damping: no overshoot, no bounce).
    let previous = el.scrollTop
    for (let frame = 0; frame < 300 && el.scrollTop !== 1000; frame++) {
      await clock.tick(16)
      expect(el.scrollTop).toBeGreaterThanOrEqual(previous)
      previous = el.scrollTop
    }
    expect(el.scrollTop).toBe(1000)
    expect(stick.atBottom.value).toBe(true)
  })

  it('carries spring velocity across mid-chase growth — no restart pulse', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()

    el.scrollHeight = 1400
    stick.followIfSticking(200)
    await clock.tick(0)
    await clock.tick(16)
    await clock.tick(16)
    const speedBefore = el.scrollTop

    // A new delta lands mid-chase; the running spring absorbs the new target.
    el.scrollHeight = 1800
    stick.followIfSticking(200)
    await clock.tick(16)
    // Continuity: the very next frame keeps moving forward from live velocity,
    // not from a from-rest restart (which would move ~ω²·dt² ≈ nothing).
    expect(el.scrollTop - speedBefore).toBeGreaterThan(5)
  })

  it('upward wheel kills the spring chase immediately', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()

    el.scrollHeight = 2000
    stick.followIfSticking(200)
    await clock.tick(0)
    await clock.tick(16)

    stick.handleWheel({ deltaY: -40 } as WheelEvent)
    const escaped = el.scrollTop
    await clock.tick(16)
    await clock.tick(16)
    expect(el.scrollTop).toBe(escaped)
    expect(stick.following.value).toBe(false)
  })

  it('releases programmatic guard when the user scrolls upward (thumb drag or PageUp)', () => {
    const { el, stick } = setup()
    el.scrollTop = 0
    stick.scrollToBottom() // scrollTop -> 1000, programmatic armed while scrollHeight might change
    el.scrollHeight = 1600

    // User drags scrollbar up cleanly without wheel deltaY.
    el.scrollTop = 300
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
    expect(stick.atBottom.value).toBe(false)
  })

  it('clears programmatic guard when settled within sub-pixel threshold on spring follow', async () => {
    const clock = makeClock()
    const { el, stick } = setup()
    el.scrollTop = 599.9
    el.scrollHeight = 1000
    stick.handleScroll()

    stick.followIfSticking(200)
    await clock.tick(0)
    await clock.tick(16)
    expect(el.scrollTop).toBe(600)

    // Subsequent upward scroll without explicit wheel must disengage cleanly.
    el.scrollTop = 100
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
  })

  it('stays strictly monotonic with zero oscillation at slow frame rates (20fps–30fps)', async () => {
    for (const frameMs of [33, 40, 50]) {
      const clock = makeClock()
      const { el, stick } = setup({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
      // Real browser clamps scrollTop to [0, scrollHeight - clientHeight].
      let rawTop = 600
      Object.defineProperty(el, 'scrollTop', {
        get: () => rawTop,
        set: (value: number) => {
          rawTop = Math.max(0, Math.min(Math.max(0, el.scrollHeight - el.clientHeight), value))
        },
        configurable: true,
      })

      stick.handleScroll()
      el.scrollHeight = 1400
      stick.followIfSticking(220)
      await clock.tick(0)

      let previous = el.scrollTop
      for (let frame = 0; frame < 40; frame++) {
        if (frame < 15) {
          el.scrollHeight += 30
          stick.followIfSticking(220)
        }
        await clock.tick(frameMs)
        // Must never reverse direction or bounce backward when frames run slow.
        expect(el.scrollTop).toBeGreaterThanOrEqual(previous)
        previous = el.scrollTop
      }
      expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight)
      expect(stick.following.value).toBe(true)
    }
  })

  it('stops the spring and clears programmatic guard when browser clamps fractional DPR max scrollTop', async () => {
    const clock = makeClock()
    let rawTop = 598
    const el: FakeElement = {
      get scrollTop() {
        return rawTop
      },
      set scrollTop(value: number) {
        // Simulate Chromium capping physical max scrollTop 1.2px below scrollHeight - clientHeight.
        rawTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight - 1.2, value))
      },
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTo(options) {
        el.scrollTop = options.top
      },
    }
    const stick = useStickToBottom(ref<HTMLElement | null>(el as unknown as HTMLElement), { threshold: 80 })
    stick.handleScroll()
    stick.followIfSticking(220)

    for (let frame = 0; frame < 40; frame++)
      await clock.tick(16)

    expect(el.scrollTop).toBeCloseTo(598.8, 3)

    // Guard must be clear so a subsequent upward drag disengages without wheel.
    rawTop = 200
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
  })

  it('disengages immediately when the user drags the scrollbar upward mid-spring', async () => {
    const clock = makeClock()
    const { el, stick } = setup({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    stick.handleScroll()
    el.scrollHeight = 2000
    stick.followIfSticking(220)

    await clock.tick(0)
    await clock.tick(16)
    await clock.tick(16)
    expect(el.scrollTop).toBeGreaterThan(600)

    // Scrollbar thumb drag upward while springRaf is still active (no wheel event).
    el.scrollTop = 300
    stick.handleScroll()
    expect(stick.following.value).toBe(false)

    // Subsequent frames must not yank scrollTop back down.
    await clock.tick(16)
    await clock.tick(16)
    expect(el.scrollTop).toBe(300)
  })

  it('keeps following off when an upward wheel scroll event still lands inside the bottom threshold', () => {
    const { el, stick } = setup({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1600 })
    stick.handleScroll()
    expect(stick.following.value).toBe(true)

    // Small upward trackpad swipe (only 12px up — still well inside the 80px threshold).
    stick.handleWheel({ deltaY: -12 } as WheelEvent)
    el.scrollTop = 1588
    stick.handleScroll()

    expect(stick.atBottom.value).toBe(true)
    expect(stick.following.value).toBe(false)

    // Stream growth must not fight the user back down.
    el.scrollHeight = 2400
    stick.followIfSticking(220)
    expect(el.scrollTop).toBe(1588)

    // Explicitly scrolling downward back into the bottom zone re-engages following.
    el.scrollTop = 1960
    stick.handleScroll()
    expect(stick.following.value).toBe(true)
  })

  it('preserves following when content shrinks and clamps scrollTop to the new bottom', () => {
    const { el, stick } = setup({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1600 })
    stick.scrollToBottom()
    el.scrollTop = 1600
    stick.handleScroll()

    // Thinking section collapses: scrollHeight drops and browser clamps scrollTop to new bottom.
    el.scrollHeight = 1400
    el.scrollTop = 1000
    stick.handleScroll()
    expect(stick.following.value).toBe(true)
    expect(stick.atBottom.value).toBe(true)
  })

  it('syncPosition absorbs anchor compensation without re-engaging following', () => {
    const { el, stick } = setup({ scrollHeight: 2000, clientHeight: 400, scrollTop: 1200 })
    stick.handleScroll()
    expect(stick.following.value).toBe(false)

    // Host shifts scrollTop down to compensate for above-viewport growth.
    el.scrollTop = 1550
    stick.syncPosition()
    // Browser fires the async scroll event for that shift.
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
  })
})
