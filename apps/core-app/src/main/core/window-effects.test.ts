import { describe, expect, it } from 'vitest'
import { shouldApplyMicaFallback } from './window-effects'

describe('window effects platform guards', () => {
  it('only applies mica fallback on Windows non-mica windows', () => {
    expect(shouldApplyMicaFallback('win32', false)).toBe(true)
    expect(shouldApplyMicaFallback('win32', true)).toBe(false)
    expect(shouldApplyMicaFallback('linux', false)).toBe(false)
    expect(shouldApplyMicaFallback('darwin', false)).toBe(false)
  })
})
