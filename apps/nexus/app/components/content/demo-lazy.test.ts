import { describe, expect, it } from 'vitest'
import { DEMO_LAZY_ROOT_MARGIN, shouldActivateDemo } from './demo-lazy'

describe('demo lazy activation', () => {
  it('activates demos as soon as they approach the viewport', () => {
    expect(shouldActivateDemo({ demo: 'TabsBasicDemo', isActive: false })).toBe(true)
  })

  it('does not reactivate active or missing demos', () => {
    expect(shouldActivateDemo({ demo: 'TabsBasicDemo', isActive: true })).toBe(false)
    expect(shouldActivateDemo({ demo: '', isActive: false })).toBe(false)
  })

  it('preloads demos before they scroll into view', () => {
    expect(DEMO_LAZY_ROOT_MARGIN).toMatch(/^\d+px /)
  })
})
