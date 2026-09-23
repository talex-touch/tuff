import { describe, expect, it } from 'vitest'
import {
  getStaggerDelay,
  STAGGER_ITEM_ANIMATION_S,
  STAGGER_MAX_TOTAL_DELAY_S
} from './stagger-delay'

describe('CoreBox stagger delay', () => {
  it('starts the first row immediately', () => {
    expect(getStaggerDelay(0, 80)).toBe(0)
    expect(getStaggerDelay(0, 1)).toBe(0)
  })

  it('never delays a row past the cap, so the tail finishes inside the 320ms cleanup window', () => {
    for (let index = 0; index < 80; index += 1) {
      expect(getStaggerDelay(index, 80)).toBeLessThanOrEqual(STAGGER_MAX_TOTAL_DELAY_S)
    }
    expect(getStaggerDelay(79, 80)).toBe(STAGGER_MAX_TOTAL_DELAY_S)
    expect(STAGGER_MAX_TOTAL_DELAY_S + STAGGER_ITEM_ANIMATION_S).toBeLessThanOrEqual(0.32)
  })

  it('keeps the ramp monotonic below the cap', () => {
    let previous = -1
    for (let index = 0; index < 20; index += 1) {
      const delay = getStaggerDelay(index, 20)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })
})
