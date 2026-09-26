// @vitest-environment jsdom
import type { JellyIndicatorFrame, JellyRect, UseJellyIndicatorOptions, UseJellyIndicatorReturn } from '../use-jelly-indicator'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
// Test-only: utils cannot import components (its build's rootDir is utils), so
// the glide hosts pass `springSteps` in, and so does this suite.
import { springSteps } from '../../components/src/liquid/src/spring'
import { JELLY } from '../animation/jelly'
import { useJellyIndicator } from '../use-jelly-indicator'

const HOME: JellyRect = { x: 0, y: 0, width: 60, height: 28 }
const AWAY: JellyRect = { x: 120, y: 0, width: 60, height: 28 }

function mountEngine(options: UseJellyIndicatorOptions = {}) {
  let api!: UseJellyIndicatorReturn
  const frames: JellyIndicatorFrame[] = []
  const Host = defineComponent({
    setup() {
      api = useJellyIndicator({ ...options, onFrame: frame => frames.push(frame) })
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { api, frames, wrapper }
}

/** Run frames until the trip has landed and sunk, or give up. */
function runUntilIdle(api: UseJellyIndicatorReturn, limitMs = 5000) {
  let elapsed = 0
  while (api.moving.value && elapsed < limitMs) {
    vi.advanceTimersByTime(16)
    elapsed += 16
  }
  return elapsed
}

/** `prefers-reduced-motion` that the test can flip at runtime. */
function stubReducedMotion(initial: boolean) {
  const original = window.matchMedia
  const handlers = new Set<(event: MediaQueryListEvent) => void>()
  let reduce = initial
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('reduce') && reduce
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => handlers.add(handler),
    removeEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => handlers.delete(handler),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return {
    set(next: boolean) {
      reduce = next
      for (const handler of handlers)
        handler({ matches: next } as MediaQueryListEvent)
    },
    listeners: () => handlers.size,
    restore() {
      window.matchMedia = original
    },
  }
}

describe('useJellyIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lands the first measurement in place instead of travelling there', () => {
    const { api, frames, wrapper } = mountEngine()

    api.moveTo(AWAY)

    expect(api.visible.value).toBe(true)
    expect(api.rect.value).toEqual(AWAY)
    expect(api.moving.value).toBe(false)
    expect(api.scale.value).toEqual({ scaleX: 1, scaleY: 1 })
    expect(frames.at(-1)).toMatchObject({ visible: true, rect: AWAY, moving: false })

    wrapper.unmount()
  })

  it('travels on the spring, overshoots, lands exactly and settles once', () => {
    const onSettle = vi.fn()
    let api!: UseJellyIndicatorReturn
    const Host = defineComponent({
      setup() {
        api = useJellyIndicator({ onSettle })
        return () => h('div')
      },
    })
    const wrapper = mount(Host)

    api.moveTo(HOME)
    // Landing in place is an arrival too.
    expect(onSettle).toHaveBeenCalledTimes(1)
    onSettle.mockClear()

    api.moveTo(AWAY)
    expect(api.moving.value).toBe(true)
    expect(api.phase.value).toBe('emerge')

    let maxX = 0
    let stretched = false
    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      maxX = Math.max(maxX, api.rect.value.x)
      const { scaleX, scaleY } = api.scale.value
      if (scaleX < 1 && scaleY > 1)
        stretched = true
    }

    // Radio's spring is underdamped: it passes the target before it lands.
    expect(maxX).toBeGreaterThan(AWAY.x)
    // Travelling on x, the shape thins along x and swells across it.
    expect(stretched).toBe(true)
    expect(api.moving.value).toBe(false)
    expect(api.rect.value).toEqual(AWAY)
    expect(api.phase.value).toBe('idle')
    expect(onSettle).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('follows rigidly without overshoot when elastic is off', () => {
    const { api, wrapper } = mountEngine({ elastic: false })

    api.moveTo(HOME)
    api.moveTo(AWAY)

    let maxX = 0
    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      maxX = Math.max(maxX, api.rect.value.x)
      expect(api.impact.value).toBe(0)
    }

    expect(maxX).toBeLessThanOrEqual(AWAY.x)
    expect(api.rect.value).toEqual(AWAY)

    wrapper.unmount()
  })

  it('deforms a vertical trip as the exact transpose of the same horizontal trip', () => {
    const across = mountEngine({ axis: 'x' })
    const down = mountEngine({ axis: 'y' })

    across.api.moveTo({ x: 0, y: 0, width: 60, height: 28 })
    across.api.moveTo({ x: 160, y: 0, width: 60, height: 28 })
    down.api.moveTo({ x: 0, y: 0, width: 28, height: 60 })
    down.api.moveTo({ x: 0, y: 160, width: 28, height: 60 })

    let stretched = false
    for (let i = 0; i < 300 && across.api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      const h = across.api.scale.value
      const v = down.api.scale.value
      expect(v).toEqual({ scaleX: h.scaleY, scaleY: h.scaleX })
      // Thin along the travel (y), swollen across it.
      if (v.scaleY < 1 && v.scaleX > 1)
        stretched = true
    }
    expect(stretched).toBe(true)
    expect(down.api.moving.value).toBe(false)

    across.wrapper.unmount()
    down.wrapper.unmount()
  })

  it('scales the deformation per axis and caps growth in px', () => {
    const { api, wrapper } = mountEngine({ deform: { along: 1, across: 0 }, maxGrowth: 4 })

    api.moveTo({ x: 0, y: 0, width: 200, height: 32 })
    api.moveTo({ x: 300, y: 0, width: 200, height: 32 })

    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      const { scaleX, scaleY } = api.scale.value
      // Across the travel (y) the shape stays rigid.
      expect(scaleY).toBe(1)
      // Along it, it never grows by more than 4px.
      expect(scaleX * api.rect.value.width).toBeLessThanOrEqual(api.rect.value.width + 4 + 1e-9)
    }

    wrapper.unmount()
  })

  it('lands in place for a layout move, and only retargets a trip already under way', () => {
    const { api, wrapper } = mountEngine()

    api.moveTo(HOME)
    api.moveTo(AWAY, { animate: false })
    expect(api.rect.value).toEqual(AWAY)
    expect(api.moving.value).toBe(false)

    api.moveTo(HOME)
    vi.advanceTimersByTime(48)
    const mid = api.rect.value.x
    api.moveTo({ ...HOME, x: 10 }, { animate: false })
    // Still travelling from where it was, now towards the new target.
    expect(api.moving.value).toBe(true)
    expect(api.rect.value.x).toBe(mid)
    runUntilIdle(api)
    expect(api.rect.value.x).toBe(10)

    wrapper.unmount()
  })

  it('does not pop when asked to travel to where it already is', () => {
    const { api, wrapper } = mountEngine()

    api.moveTo(AWAY)
    api.moveTo({ ...AWAY, x: AWAY.x + 0.1 })

    expect(api.moving.value).toBe(false)
    expect(api.rect.value.x).toBe(AWAY.x + 0.1)

    wrapper.unmount()
  })

  it('settles every landing that skips the trip, so work deferred to arrival is not stranded', () => {
    const onSettle = vi.fn()
    const { api, wrapper } = mountEngine({ onSettle })

    api.moveTo(HOME)
    api.moveTo(AWAY, { animate: false })
    expect(onSettle).toHaveBeenCalledTimes(2)

    // Hiding is not an arrival; coming back into view is.
    api.moveTo(null)
    expect(onSettle).toHaveBeenCalledTimes(2)
    api.moveTo(HOME)
    expect(onSettle).toHaveBeenCalledTimes(3)

    wrapper.unmount()
  })

  it('jumps without deforming under prefers-reduced-motion', () => {
    const media = stubReducedMotion(true)

    try {
      const onSettle = vi.fn()
      const { api, wrapper } = mountEngine({ onSettle })
      expect(api.reducedMotion.value).toBe(true)

      api.moveTo(HOME)
      api.moveTo(AWAY)
      expect(api.rect.value).toEqual(AWAY)
      expect(api.moving.value).toBe(false)
      // Radio commits `updateOnSettled` here: a jump must still count as arriving.
      expect(onSettle).toHaveBeenCalledTimes(2)

      api.grab()
      expect(api.scale.value).toEqual({ scaleX: 1, scaleY: 1 })
      api.drag({ ...AWAY, x: 90 }, { x: 900, y: 0 })
      api.release({ x: 900, y: 0 })
      // Let go, it does not coast: it waits where it was dropped.
      expect(api.moving.value).toBe(false)
      expect(api.rect.value.x).toBe(90)

      wrapper.unmount()
    }
    finally {
      media.restore()
    }
  })

  it('lands a trip in flight when reduced motion switches on, and stops listening on unmount', () => {
    const media = stubReducedMotion(false)

    try {
      const onSettle = vi.fn()
      const { api, frames, wrapper } = mountEngine({ onSettle })
      api.moveTo(HOME)
      onSettle.mockClear()

      api.moveTo(AWAY)
      vi.advanceTimersByTime(48)
      expect(api.moving.value).toBe(true)

      media.set(true)
      expect(api.rect.value).toEqual(AWAY)
      expect(api.moving.value).toBe(false)
      expect(api.scale.value).toEqual({ scaleX: 1, scaleY: 1 })
      expect(onSettle).toHaveBeenCalledTimes(1)

      const count = frames.length
      vi.advanceTimersByTime(500)
      expect(frames.length).toBe(count)

      wrapper.unmount()
      expect(media.listeners()).toBe(0)
    }
    finally {
      media.restore()
    }
  })

  it('stops a trip where it is and repaints it at rest', () => {
    const { api, frames, wrapper } = mountEngine()

    api.moveTo(HOME)
    api.moveTo(AWAY)
    vi.advanceTimersByTime(48)
    const x = api.rect.value.x

    api.stop()
    expect(api.moving.value).toBe(false)
    expect(frames.at(-1)).toMatchObject({ moving: false, phase: 'idle', scaleX: 1, scaleY: 1 })
    vi.advanceTimersByTime(500)
    expect(api.rect.value.x).toBe(x)

    wrapper.unmount()
  })

  it('stops an overshoot at the walls and lands it as a squash instead', () => {
    // Travelling left onto a target 4px inside a wall at 0: the free spring
    // would overshoot well past 0.
    const free = mountEngine()
    free.api.moveTo({ x: 200, y: 0, width: 60, height: 28 })
    free.api.moveTo({ x: 4, y: 0, width: 60, height: 28 })
    let freeMin = Infinity
    for (let i = 0; i < 300 && free.api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      freeMin = Math.min(freeMin, free.api.rect.value.x)
    }
    expect(freeMin).toBeLessThan(0)
    free.wrapper.unmount()

    const walled = mountEngine({ bounds: { start: 0, end: 400 } })
    walled.api.moveTo({ x: 200, y: 0, width: 60, height: 28 })
    walled.api.moveTo({ x: 4, y: 0, width: 60, height: 28 })
    let min = Infinity
    let squashed = false
    for (let i = 0; i < 300 && walled.api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      min = Math.min(min, walled.api.rect.value.x)
      if (walled.api.rect.value.x === 0 && walled.api.impact.value > 0.1)
        squashed = true
    }
    expect(min).toBe(0)
    expect(squashed).toBe(true)
    expect(walled.api.rect.value.x).toBe(4)
    walled.wrapper.unmount()
  })

  it('moves a wall out to a target beyond it rather than blocking the way', () => {
    const { api, wrapper } = mountEngine({ bounds: { start: 10, end: 400 } })
    api.moveTo({ x: 200, y: 0, width: 60, height: 28 })
    api.moveTo({ x: 0, y: 0, width: 60, height: 28 })
    let min = Infinity
    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      min = Math.min(min, api.rect.value.x)
    }
    // Reaches the target at 0, and stops there: it never overshoots past it.
    expect(min).toBe(0)
    expect(api.rect.value.x).toBe(0)
    wrapper.unmount()
  })

  it('pops on grab, follows the pointer, slams into an end and springs home on release', () => {
    const { api, wrapper } = mountEngine()

    api.moveTo(HOME)
    api.grab()
    expect(api.dragging.value).toBe(true)
    expect(api.phase.value).toBe('emerge')
    expect(api.scale.value.scaleX).toBeGreaterThan(1)

    api.drag({ ...HOME, x: 40 }, { x: 900, y: 0 }, { atEdge: true })
    expect(api.rect.value.x).toBe(40)
    expect(api.impact.value).toBeGreaterThanOrEqual(JELLY.edgeImpact)
    expect(api.impactAxis.value).toBe('x')

    api.release({ x: 900, y: 0 })
    expect(api.dragging.value).toBe(false)
    api.moveTo(AWAY)
    runUntilIdle(api)
    expect(api.rect.value).toEqual(AWAY)

    wrapper.unmount()
  })

  it('hides on a null target and stops its loop when unmounted', () => {
    const { api, frames, wrapper } = mountEngine()

    api.moveTo(HOME)
    api.moveTo(null)
    expect(api.visible.value).toBe(false)

    api.moveTo(HOME)
    api.moveTo(AWAY)
    vi.advanceTimersByTime(32)
    wrapper.unmount()

    const count = frames.length
    vi.advanceTimersByTime(500)
    expect(frames.length).toBe(count)
  })
})

/**
 * The glide material, the tabs family's (Tabs, TabBar, FlatRadio, SidebarNav):
 * the two ends along the travel ride separate springs, the trailing one played
 * slower, so the shape lengthens a little and gathers again. It never scales.
 */
describe('useJellyIndicator glide material', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountGlide(options: UseJellyIndicatorOptions = {}) {
    return mountEngine({ material: 'glide', integrate: springSteps, ...options })
  }

  /** Travel `from` → `to` and report the outermost extent the two ends reached. */
  function sweep(api: UseJellyIndicatorReturn, from: JellyRect, to: JellyRect) {
    api.moveTo(from)
    api.moveTo(to)
    let start = Number.POSITIVE_INFINITY
    let end = Number.NEGATIVE_INFINITY
    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      start = Math.min(start, api.rect.value.x)
      end = Math.max(end, api.rect.value.x + api.rect.value.width)
    }
    return { start, end }
  }

  it('lengthens on the way and gathers on the target, and never scales', () => {
    const onSettle = vi.fn()
    const { api, frames, wrapper } = mountGlide({ onSettle })

    api.moveTo(HOME)
    api.moveTo(AWAY)
    expect(api.moving.value).toBe(true)

    let longest = 0
    for (let i = 0; i < 300 && api.moving.value; i++) {
      vi.advanceTimersByTime(16)
      const { x, width } = api.rect.value
      longest = Math.max(longest, width)
      // Only ever between the two boxes: the default spring shows no overshoot.
      expect(x).toBeGreaterThanOrEqual(HOME.x)
      expect(x + width).toBeLessThanOrEqual(AWAY.x + AWAY.width)
    }

    // 60px when it leaves and when it lands, longer in between (about 77px).
    expect(longest).toBeGreaterThan(HOME.width + 10)
    expect(api.moving.value).toBe(false)
    expect(api.rect.value).toEqual(AWAY)
    expect(onSettle).toHaveBeenCalledTimes(2)
    // No squash, no stretch, no pop: every frame is painted at scale 1, and a
    // trip has no emerge phase.
    expect(frames.length).toBeGreaterThan(10)
    expect(frames.every(frame => frame.scaleX === 1 && frame.scaleY === 1)).toBe(true)
    expect(frames.some(frame => frame.phase === 'emerge')).toBe(false)
    expect(api.scale.value).toEqual({ scaleX: 1, scaleY: 1 })
    expect(api.scaleFor(true)).toEqual({ scaleX: 1, scaleY: 1 })

    wrapper.unmount()
  })

  it('leads with the end facing the target, whichever way it travels', () => {
    const { api, wrapper } = mountGlide()

    api.moveTo(HOME)
    api.moveTo(AWAY)
    vi.advanceTimersByTime(48)
    // Travelling right, the right end has covered more of its way than the left.
    const right = api.rect.value
    expect(right.x + right.width - (HOME.x + HOME.width)).toBeGreaterThan(right.x - HOME.x + 3)

    runUntilIdle(api)
    expect(api.rect.value).toEqual(AWAY)

    api.moveTo(HOME)
    vi.advanceTimersByTime(48)
    // Travelling back, the left end leads.
    const left = api.rect.value
    expect(AWAY.x - left.x).toBeGreaterThan(AWAY.x + AWAY.width - (left.x + left.width) + 3)

    runUntilIdle(api)
    expect(api.rect.value).toEqual(HOME)

    wrapper.unmount()
  })

  it('stops an end at a wall, still lands on the target, and gives way to a target beyond it', () => {
    // A bouncy glide: its leading end overshoots well past a target 4px inside a wall.
    const glide = { stiffness: 420, damping: 20 }
    const nearStart: [JellyRect, JellyRect] = [{ x: 200, y: 0, width: 60, height: 28 }, { x: 4, y: 0, width: 60, height: 28 }]
    const nearEnd: [JellyRect, JellyRect] = [{ x: 4, y: 0, width: 60, height: 28 }, { x: 336, y: 0, width: 60, height: 28 }]

    const freeStart = mountGlide({ glide })
    expect(sweep(freeStart.api, ...nearStart).start).toBeLessThan(-10)
    freeStart.wrapper.unmount()
    const freeEnd = mountGlide({ glide })
    expect(sweep(freeEnd.api, ...nearEnd).end).toBeGreaterThan(410)
    freeEnd.wrapper.unmount()

    const walled = mountGlide({ glide, bounds: { start: 0, end: 400 } })
    // Exactly at the walls: the leading end stops there instead of leaving.
    expect(sweep(walled.api, ...nearStart).start).toBe(0)
    expect(walled.api.rect.value).toEqual(nearStart[1])
    expect(sweep(walled.api, ...nearEnd).end).toBe(400)
    expect(walled.api.rect.value).toEqual(nearEnd[1])
    walled.wrapper.unmount()

    // A target beyond a wall moves the wall out to it: reached, never passed.
    const beyond = mountGlide({ glide, bounds: { start: 10, end: 400 } })
    expect(sweep(beyond.api, { x: 200, y: 0, width: 60, height: 28 }, { x: 0, y: 0, width: 60, height: 28 }).start).toBe(0)
    expect(beyond.api.rect.value.x).toBe(0)
    beyond.wrapper.unmount()
  })

  it('lands without travelling under prefers-reduced-motion', () => {
    const media = stubReducedMotion(true)

    try {
      const onSettle = vi.fn()
      const { api, frames, wrapper } = mountGlide({ onSettle })

      api.moveTo(HOME)
      api.moveTo(AWAY)
      expect(api.rect.value).toEqual(AWAY)
      expect(api.moving.value).toBe(false)
      expect(onSettle).toHaveBeenCalledTimes(2)
      // Nothing in between was ever painted.
      expect(frames.map(frame => frame.rect.x)).toEqual([HOME.x, AWAY.x])

      wrapper.unmount()
    }
    finally {
      media.restore()
    }
  })

  it('lands in place when no integrator is passed', () => {
    // utils cannot reach `springSteps` itself; a host that forgets to pass it
    // gets a working indicator that lands, not one that hangs mid-trip.
    const onSettle = vi.fn()
    const { api, frames, wrapper } = mountEngine({ material: 'glide', onSettle })

    api.moveTo(HOME)
    api.moveTo(AWAY)
    vi.advanceTimersByTime(16)

    expect(api.rect.value).toEqual(AWAY)
    expect(api.moving.value).toBe(false)
    expect(onSettle).toHaveBeenCalledTimes(2)
    expect(frames.every(frame => frame.rect.x === HOME.x || frame.rect.x === AWAY.x)).toBe(true)

    wrapper.unmount()
  })
})
