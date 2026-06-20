import { describe, expect, it } from 'vitest'
import { shouldActivateDemo } from './demo-lazy'

describe('demo lazy activation', () => {
  it('keeps demos inactive when they only enter the viewport', () => {
    expect(shouldActivateDemo({ demo: 'TabsBasicDemo', isActive: false, reason: 'visibility' })).toBe(false)
  })

  it('activates demos only from explicit user intent', () => {
    expect(shouldActivateDemo({ demo: 'TabsBasicDemo', isActive: false, reason: 'manual' })).toBe(true)
  })

  it('does not reactivate active or missing demos', () => {
    expect(shouldActivateDemo({ demo: 'TabsBasicDemo', isActive: true, reason: 'manual' })).toBe(false)
    expect(shouldActivateDemo({ demo: '', isActive: false, reason: 'manual' })).toBe(false)
  })
})
