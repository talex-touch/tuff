import process from 'node:process'
import * as nativeScreenshot from '@talex-touch/tuff-native/screenshot'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_SCREENSHOT'

describe('tuff-native screenshot contract', () => {
  it('exports required screenshot functions', () => {
    expect(typeof nativeScreenshot.getNativeScreenshotSupport).toBe('function')
    expect(typeof nativeScreenshot.listDisplays).toBe('function')
    expect(typeof nativeScreenshot.captureDisplay).toBe('function')
    expect(typeof nativeScreenshot.captureRegion).toBe('function')
    expect(typeof nativeScreenshot.capture).toBe('function')
  })

  it('returns support payload with stable shape', () => {
    const support = nativeScreenshot.getNativeScreenshotSupport()

    expect(typeof support).toBe('object')
    expect(typeof support.supported).toBe('boolean')
    expect(typeof support.platform).toBe('string')
    if (support.engine !== undefined) {
      expect(typeof support.engine).toBe('string')
    }
    if (support.reason !== undefined) {
      expect(typeof support.reason).toBe('string')
    }
  })

  it('honors TUFF_DISABLE_NATIVE_SCREENSHOT contract', () => {
    const previous = process.env[DISABLE_FLAG]
    process.env[DISABLE_FLAG] = '1'

    try {
      const support = nativeScreenshot.getNativeScreenshotSupport()
      expect(support.supported).toBe(false)
      expect(support.reason).toBe('disabled-by-env')
      expect(() => nativeScreenshot.listDisplays()).toThrow(/disabled/i)
    } finally {
      if (previous === undefined) {
        delete process.env[DISABLE_FLAG]
      } else {
        process.env[DISABLE_FLAG] = previous
      }
    }
  })
})
