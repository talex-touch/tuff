// @vitest-environment jsdom
/**
 * The lift driver, frame by frame on a fake clock: it holds the bubble on the draft until it is
 * launched, rides one spring to the row, reads layout only at launch, once mid-flight and at rest,
 * bends to a moved row without a jump, and settles every hook exactly once however it ends.
 */
import type { LiftClock, LiftLaunch, LiftOverlay } from './lift-driver'
import type { LiftRect } from './score'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendLiftDriver } from './lift-driver'
import { LIFT_SCORE } from './score'

const FRAME = 1000 / 120

let now = 0
let queue = new Map<number, FrameRequestCallback>()
let handles = 0

const clock: LiftClock = {
  now: () => now,
  request: (callback) => {
    handles += 1
    queue.set(handles, callback)
    return handles
  },
  cancel: (handle) => {
    queue.delete(handle)
  }
}

function frame(ms = FRAME): boolean {
  now += ms
  const due = [...queue.values()]
  queue.clear()
  for (const callback of due) callback(now)
  return due.length > 0
}

function runUntil(done: () => boolean, limit = 600): void {
  for (let i = 0; i < limit && !done(); i++) {
    if (!frame()) return
  }
}

const LAUNCH: LiftLaunch = {
  originX: 0,
  originY: 0,
  from: { left: 43, top: 706.3 },
  size: { width: 140, height: 42.4 },
  clearY: 700
}
const LANDING: LiftRect = { left: 620, top: 300, width: 140, height: 42.4 }

function overlay(): LiftOverlay {
  const ghost = document.createElement('div')
  const fill = document.createElement('div')
  const text = document.createElement('div')
  ghost.classList.add('is-active')
  text.textContent = 'Ship it tonight'
  ghost.append(fill, text)
  return { ghost, fill, text }
}

function pose(o: LiftOverlay): { x: number; y: number } {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(o.ghost.style.transform)
  return { x: Number(m?.[1]), y: Number(m?.[2]) }
}

function start() {
  const o = overlay()
  const landing: { current: LiftRect | null } = { current: { ...LANDING } }
  const log: string[] = []
  let landedAt: { x: number; y: number } | null = null
  const hooks = {
    onClear: vi.fn(() => log.push('clear')),
    onImpact: vi.fn(() => log.push('impact')),
    onLand: vi.fn(() => {
      log.push('land')
      landedAt = pose(o)
    }),
    readLanding: vi.fn((predicted: boolean) => {
      log.push(`read:${predicted}`)
      return landing.current ? { ...landing.current } : null
    })
  }
  const driver = new SendLiftDriver(o, LAUNCH, hooks, clock)
  return { o, driver, hooks, landing, log, landed: () => landedAt }
}

beforeEach(() => {
  now = 1000
  queue = new Map()
  handles = 0
})

describe('send lift driver', () => {
  it('starts from the draft, clears the composer, touches down, lands exactly — each once', () => {
    const stage = start()
    expect(pose(stage.o)).toEqual({ x: 43, y: 706.3 })
    runUntil(() => stage.driver.done)
    expect(stage.log.filter((e) => !e.startsWith('read'))).toEqual(['clear', 'impact', 'land'])
    const landed = stage.landed()!
    expect(Math.abs(landed.x - LANDING.left)).toBeLessThanOrEqual(LIFT_SCORE.landTolerancePx)
    expect(Math.abs(landed.y - LANDING.top)).toBeLessThanOrEqual(LIFT_SCORE.landTolerancePx)
    // Cleared for the swap.
    expect(stage.o.ghost.classList.contains('is-active')).toBe(false)
    expect(stage.o.text.textContent).toBe('')
    expect(queue.size).toBe(0)
  })

  it('reads the row only at launch (predicted), once mid-flight and at rest', () => {
    const stage = start()
    runUntil(() => stage.driver.done)
    expect(stage.hooks.readLanding.mock.calls.map(([p]) => p)).toEqual([true, false, false])
  })

  it('fills in on the way: none on the composer, all of it long before the landing', () => {
    const stage = start()
    expect(stage.o.fill.style.opacity).toBe('0')
    let fullAt = -1
    let frames = 0
    runUntil(() => {
      frames += 1
      if (fullAt < 0 && stage.o.fill.style.opacity === '1') fullAt = frames
      return stage.driver.done
    })
    expect(fullAt).toBeGreaterThan(0)
    expect(fullAt).toBeLessThan(frames / 2)
  })

  it('arrives quickly with one small overshoot and no slow crawl', () => {
    const stage = start()
    let impactAt = 0
    let minY = Infinity
    runUntil(() => {
      if (!impactAt && stage.hooks.onImpact.mock.calls.length) impactAt = now - 1000
      const { y } = pose(stage.o)
      if (!Number.isNaN(y)) minY = Math.min(minY, y)
      return stage.driver.done
    })
    // First touch well under half a second; the overshoot a few px past the row at most.
    expect(impactAt).toBeLessThan(400)
    expect(LANDING.top - minY).toBeGreaterThan(0)
    expect(LANDING.top - minY).toBeLessThan(0.05 * (LAUNCH.from.top - LANDING.top))
  })

  it('bends to a row that moved, without a jump, and lands on the new place', () => {
    const stage = start()
    let last = pose(stage.o).y
    let biggest = 0
    for (let i = 0; i < 10; i++) {
      frame()
      const { y } = pose(stage.o)
      biggest = Math.max(biggest, Math.abs(y - last))
      last = y
    }
    stage.landing.current = { ...LANDING, top: 260 }
    let afterMove = 0
    runUntil(() => {
      const { y } = pose(stage.o)
      if (!Number.isNaN(y)) {
        afterMove = Math.max(afterMove, Math.abs(y - last))
        last = y
      }
      return stage.driver.done
    })
    // No step larger than the flight's own fastest frame.
    expect(afterMove).toBeLessThanOrEqual(biggest + 0.5)
    expect(Math.abs(stage.landed()!.y - 260)).toBeLessThanOrEqual(LIFT_SCORE.landTolerancePx)
  })

  it('ends at launch when the row is gone, and lands where it stands on finish()', () => {
    const o = overlay()
    const hooks = {
      onClear: vi.fn(),
      onImpact: vi.fn(),
      onLand: vi.fn(),
      readLanding: vi.fn(() => null)
    }
    const gone = new SendLiftDriver(o, LAUNCH, hooks, clock)
    expect(gone.done).toBe(true)
    for (const hook of ['onClear', 'onImpact', 'onLand'] as const) {
      expect(hooks[hook]).toHaveBeenCalledTimes(1)
    }

    const stage = start()
    frame()
    stage.driver.finish()
    stage.driver.finish()
    expect(stage.log.filter((e) => !e.startsWith('read'))).toEqual(['clear', 'impact', 'land'])
    expect(queue.size).toBe(0)
  })

  it('peels off slowly on the opening ramp, then still lands exactly', () => {
    const o = overlay()
    const hooks = {
      onClear: vi.fn(),
      onImpact: vi.fn(),
      onLand: vi.fn(),
      readLanding: vi.fn(() => ({ ...LANDING }))
    }
    const quick = start()
    const slow = new SendLiftDriver(
      o,
      {
        ...LAUNCH,
        spring: LIFT_SCORE.openingSpring,
        ramp: { ms: LIFT_SCORE.openingRampMs, floor: LIFT_SCORE.openingRampFloor }
      },
      hooks,
      clock
    )
    // 100ms in: the plain lift is well on its way, the opening one has barely left the draft.
    for (let i = 0; i < 12; i++) frame()
    const travel = LAUNCH.from.top - LANDING.top
    const quickDone = (LAUNCH.from.top - pose(quick.o).y) / travel
    const slowDone = (LAUNCH.from.top - pose(o).y) / travel
    expect(quickDone).toBeGreaterThan(0.3)
    expect(slowDone).toBeLessThan(0.1)
    runUntil(() => slow.done && quick.driver.done)
    expect(hooks.onLand).toHaveBeenCalledTimes(1)
  })

  it('lands where it stands once it has run for timeoutMs', () => {
    const stage = start()
    frame()
    frame(LIFT_SCORE.timeoutMs)
    expect(stage.driver.done).toBe(true)
    expect(stage.hooks.onLand).toHaveBeenCalledTimes(1)
  })
})
