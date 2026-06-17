import { describe, expect, it } from 'vitest'
import { shouldRenderCoreBoxIconColorful } from './icon-color-mode'

describe('corebox icon color mode', () => {
  it('defaults CoreBox result icons to theme color', () => {
    expect(shouldRenderCoreBoxIconColorful(undefined)).toBe(false)
    expect(shouldRenderCoreBoxIconColorful('i-ri-translate-2')).toBe(false)
    expect(shouldRenderCoreBoxIconColorful({ type: 'file', value: 'assets/logo.svg' })).toBe(false)
  })

  it('preserves original colors only when explicitly requested', () => {
    expect(
      shouldRenderCoreBoxIconColorful({ type: 'file', value: 'assets/logo.svg', colorful: true })
    ).toBe(true)
    expect(
      shouldRenderCoreBoxIconColorful({ type: 'url', value: '/icon.svg', colorful: false })
    ).toBe(false)
  })
})
