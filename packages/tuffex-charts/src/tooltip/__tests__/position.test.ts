import { describe, expect, it } from 'vitest'
import { placeTooltip } from '../src/position'

const base = {
  tooltipWidth: 100,
  tooltipHeight: 50,
  containerWidth: 400,
  containerHeight: 300,
  offset: 12,
  follow: 'both' as const,
}

describe('placeTooltip', () => {
  it('sits right of and below the pointer by default', () => {
    expect(placeTooltip({ ...base, pointerX: 50, pointerY: 60 }))
      .toEqual({ left: 62, top: 72 })
  })

  it('flips left when the right edge would overflow', () => {
    const { left } = placeTooltip({ ...base, pointerX: 380, pointerY: 60 })
    expect(left).toBe(380 - 12 - 100)
  })

  it('flips above when the bottom edge would overflow', () => {
    const { top } = placeTooltip({ ...base, pointerX: 50, pointerY: 290 })
    expect(top).toBe(290 - 12 - 50)
  })

  it('clamps into the container when both sides overflow', () => {
    const placement = placeTooltip({
      ...base,
      pointerX: 4,
      pointerY: 4,
      tooltipWidth: 500,
      tooltipHeight: 400,
    })
    expect(placement).toEqual({ left: 0, top: 0 })
  })

  it('pins the vertical position in follow-x mode', () => {
    const placement = placeTooltip({ ...base, pointerX: 50, pointerY: 250, follow: 'x', fixedY: 8 })
    expect(placement.top).toBe(8)
    expect(placement.left).toBe(62)
  })
})
