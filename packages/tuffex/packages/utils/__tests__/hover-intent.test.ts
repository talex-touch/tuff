// @vitest-environment jsdom
import type { HoverIntentRect, HoverTransitHandlers, HoverTransitOutcome } from '../hover-intent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginHoverTransit,
  cancelHoverTransit,
  HOVER_TRANSIT_STALL_MS,
  hoverBridgeAt,
  hoverBridgeBox,
  hoverBridgePolygon,
  isHoverClaimed,
  isPointInPolygon,
  leftAwayFromPanel,
  resetHoverIntent,
  safeTrianglePolygon,
  settleHoverTransit,
  stopWaitingForHoverTransit,
  waitForHoverTransit,
} from '../hover-intent'

function rect(left: number, top: number, width: number, height: number): HoverIntentRect {
  return { left, top, right: left + width, bottom: top + height }
}

/**
 * The header case the bridge was built for: a 32px icon trigger at the right
 * of a toolbar, its menu below with the right edges aligned and a 10px gap.
 */
const TRIGGER = rect(400, 20, 32, 32)
const PANEL = rect(212, 62, 220, 140)

describe('hover-intent geometry', () => {
  it('tests points against a polygon', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(isPointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
    expect(isPointInPolygon({ x: 5, y: -1 }, square)).toBe(false)
  })

  it('spans the gap from the trigger edge to the panel edge, a pixel into each', () => {
    const bridge = hoverBridgePolygon(TRIGGER, PANEL, 'bottom')!

    expect(bridge).toEqual([
      { x: 400, y: 51 },
      { x: 432, y: 51 },
      { x: 432, y: 63 },
      { x: 212, y: 63 },
    ])
    // Straight down from the trigger, and the diagonal towards the panel's far
    // corner, both cross inside it.
    expect(isPointInPolygon({ x: 416, y: 57 }, bridge)).toBe(true)
    expect(isPointInPolygon({ x: 330, y: 61 }, bridge)).toBe(true)
    // A trapezoid, not a strip under the whole panel: the corner beside the
    // trigger, where a neighbouring toolbar button would sit, stays free.
    expect(isPointInPolygon({ x: 220, y: 53 }, bridge)).toBe(false)
  })

  it('has no bridge when the boxes touch or overlap', () => {
    expect(hoverBridgePolygon(TRIGGER, rect(212, 52, 220, 140), 'bottom')).toBeNull()
    expect(hoverBridgePolygon(TRIGGER, rect(212, 40, 220, 140), 'bottom')).toBeNull()
  })

  it('builds the bridge on every side', () => {
    const reference = rect(100, 100, 40, 20)
    const top = hoverBridgePolygon(reference, rect(80, 40, 80, 50), 'top')!
    const right = hoverBridgePolygon(reference, rect(150, 80, 100, 60), 'right')!
    const left = hoverBridgePolygon(reference, rect(0, 80, 90, 60), 'left')!

    expect(isPointInPolygon({ x: 120, y: 95 }, top)).toBe(true)
    expect(isPointInPolygon({ x: 145, y: 110 }, right)).toBe(true)
    expect(isPointInPolygon({ x: 95, y: 110 }, left)).toBe(true)
    // Each one only fills its own gap.
    expect(isPointInPolygon({ x: 120, y: 125 }, top)).toBe(false)
    expect(isPointInPolygon({ x: 95, y: 110 }, right)).toBe(false)
  })

  it('lays the bridge out as a box clipped back to the trapezoid', () => {
    const box = hoverBridgeBox(hoverBridgePolygon(TRIGGER, PANEL, 'bottom')!, { x: 212, y: 62 })

    expect(box).toMatchObject({ left: 0, top: -11, width: 220, height: 12 })
    expect(box.clipPath).toBe('polygon(188px 0px, 220px 0px, 220px 12px, 0px 12px)')
  })

  it('positions the box inside the floating element or beside it', () => {
    const position = {
      x: 212,
      y: 62,
      placement: 'bottom-end',
      rects: {
        reference: { x: 400, y: 20, width: 32, height: 32 },
        floating: { width: 220, height: 140 },
      },
    }

    expect(hoverBridgeAt(position, true)).toMatchObject({ left: 0, top: -11 })
    expect(hoverBridgeAt(position, false)).toMatchObject({ left: 212, top: 51 })
    expect(hoverBridgeAt({ ...position, y: 52 }, true)).toBeNull()
  })

  it('treats an exit through the far edge as leaving, not travelling', () => {
    expect(leftAwayFromPanel({ x: 416, y: 19 }, TRIGGER, 'bottom')).toBe(true)
    expect(leftAwayFromPanel({ x: 416, y: 53 }, TRIGGER, 'bottom')).toBe(false)
    // Out through the side, still towards a panel below: a trip.
    expect(leftAwayFromPanel({ x: 399, y: 40 }, TRIGGER, 'bottom')).toBe(false)
  })

  it('covers every straight path from the exit point to the panel edge', () => {
    // Out of the trigger's left side, aiming down-left at the panel.
    const exit = { x: 399, y: 40 }
    const triangle = safeTrianglePolygon(exit, PANEL, 'bottom')
    const towards = (target: { x: number, y: number }, t: number) => ({
      x: exit.x + (target.x - exit.x) * t,
      y: exit.y + (target.y - exit.y) * t,
    })

    for (const target of [{ x: 213, y: 62 }, { x: 320, y: 62 }, { x: 431, y: 62 }]) {
      for (const t of [0.1, 0.5, 0.95])
        expect(isPointInPolygon(towards(target, t), triangle)).toBe(true)
    }
    // Sideways along the toolbar is not towards the panel.
    expect(isPointInPolygon({ x: 340, y: 41 }, triangle)).toBe(false)
    // A little jitter back past the exit point is forgiven.
    expect(isPointInPolygon({ x: 400, y: 38 }, triangle)).toBe(true)
  })
})

describe('hover transit', () => {
  let reference: HTMLElement
  let panel: HTMLElement
  let outcomes: HoverTransitOutcome[]
  let starts: number
  const owner = {}
  const sibling = {}

  function handlers(overrides: Partial<HoverTransitHandlers> = {}): HoverTransitHandlers {
    return {
      reference: () => reference,
      contains: target => panel.contains(target),
      panelRect: () => PANEL,
      side: () => 'bottom',
      onStart: () => { starts += 1 },
      onEnd: (outcome) => { outcomes.push(outcome) },
      ...overrides,
    }
  }

  function move(x: number, y: number, target: EventTarget = document) {
    target.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    reference = document.createElement('button')
    panel = document.createElement('div')
    document.body.append(reference, panel)
    reference.getBoundingClientRect = () => DOMRect.fromRect({ x: 400, y: 20, width: 32, height: 32 })
    outcomes = []
    starts = 0
  })

  afterEach(() => {
    resetHoverIntent()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('does not start without a measurable panel or through the far edge', () => {
    expect(beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers({ panelRect: () => rect(0, 0, 0, 0) }))).toBe(false)
    expect(beginHoverTransit(owner, { clientX: 416, clientY: 19 }, handlers())).toBe(false)
    expect(starts).toBe(0)
  })

  it('keeps going while the pointer moves inside the triangle, past the stall window', () => {
    expect(beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())).toBe(true)
    expect(starts).toBe(1)

    // A slow diagonal: 5 steps of 60ms is 300ms in transit, three stall windows.
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(60)
      move(399 - i * 15, 40 + i * 4)
    }
    expect(outcomes).toEqual([])
  })

  it('arrives when the pointer reaches the panel or comes back to the trigger', () => {
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    move(380, 66, panel)
    expect(outcomes).toEqual(['arrived'])

    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    settleHoverTransit(owner)
    expect(outcomes).toEqual(['arrived', 'arrived'])
  })

  it('is abandoned when the pointer leaves the triangle', () => {
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    move(340, 41)
    expect(outcomes).toEqual(['abandoned'])
  })

  it('is abandoned when the pointer stops short', () => {
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    move(390, 44)
    vi.advanceTimersByTime(HOVER_TRANSIT_STALL_MS - 1)
    expect(outcomes).toEqual([])

    vi.advanceTimersByTime(1)
    expect(outcomes).toEqual(['abandoned'])
  })

  it('claims the pointer from other anchors, never from its owner', () => {
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())

    expect(isHoverClaimed(sibling, { clientX: 385, clientY: 45 })).toBe(true)
    expect(isHoverClaimed(owner, { clientX: 385, clientY: 45 })).toBe(false)
    expect(isHoverClaimed(sibling, { clientX: 340, clientY: 41 })).toBe(false)
  })

  it('opens a waiting anchor once the trip is given up', () => {
    const retry = vi.fn()
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    waitForHoverTransit(sibling, retry)

    vi.advanceTimersByTime(HOVER_TRANSIT_STALL_MS)
    expect(outcomes).toEqual(['abandoned'])
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('drops a waiting anchor the pointer only crossed', () => {
    const retry = vi.fn()
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    waitForHoverTransit(sibling, retry)
    move(380, 66, panel)

    expect(retry).not.toHaveBeenCalled()
  })

  it('forgets a waiting anchor the pointer left', () => {
    const retry = vi.fn()
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    waitForHoverTransit(sibling, retry)
    stopWaitingForHoverTransit(sibling)
    vi.advanceTimersByTime(HOVER_TRANSIT_STALL_MS)

    expect(retry).not.toHaveBeenCalled()
  })

  it('runs a wait at once when nothing is in transit', () => {
    const retry = vi.fn()
    waitForHoverTransit(sibling, retry)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('cancels without a verdict and frees the pointer', () => {
    const retry = vi.fn()
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    waitForHoverTransit(sibling, retry)
    cancelHoverTransit(owner)

    expect(outcomes).toEqual(['cancelled'])
    expect(retry).toHaveBeenCalledTimes(1)
    // Nothing is left listening.
    move(340, 41)
    vi.advanceTimersByTime(HOVER_TRANSIT_STALL_MS)
    expect(outcomes).toEqual(['cancelled'])
  })

  it('abandons the previous trip when another one starts', () => {
    const second: HoverTransitOutcome[] = []
    beginHoverTransit(owner, { clientX: 399, clientY: 40 }, handlers())
    beginHoverTransit(sibling, { clientX: 399, clientY: 40 }, handlers({ onEnd: o => second.push(o) }))

    expect(outcomes).toEqual(['abandoned'])
    expect(second).toEqual([])
  })
})
