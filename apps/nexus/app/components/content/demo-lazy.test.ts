import { describe, expect, it } from 'vitest'
import { shouldActivateDemo } from './demo-lazy'

describe('demo lazy activation', () => {
  it('keeps demos inactive until the wrapper enters the viewport', () => {
    expect(shouldActivateDemo(false, { isIntersecting: false, intersectionRatio: 0 })).toBe(false)
  })

  it('keeps an activated demo active after it leaves the viewport', () => {
    expect(shouldActivateDemo(true, { isIntersecting: false, intersectionRatio: 0 })).toBe(true)
  })

  it('activates demos when intersection observer reports visibility', () => {
    expect(shouldActivateDemo(false, { isIntersecting: true, intersectionRatio: 0 })).toBe(true)
    expect(shouldActivateDemo(false, { isIntersecting: false, intersectionRatio: 0.1 })).toBe(true)
  })
})
