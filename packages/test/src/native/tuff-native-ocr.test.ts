import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as nativeOcr from '@talex-touch/tuff-native'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_OCR'

describe('tuff-native ocr smoke & contract', () => {
  it('exports required ocr functions', () => {
    expect(typeof nativeOcr.getNativeOcrSupport).toBe('function')
    expect(typeof nativeOcr.recognizeImageText).toBe('function')
  })

  it('returns support payload with stable shape', () => {
    const support = nativeOcr.getNativeOcrSupport()

    expect(typeof support).toBe('object')
    expect(typeof support.supported).toBe('boolean')
    expect(typeof support.platform).toBe('string')

    if ('reason' in support && support.reason !== undefined) {
      expect(typeof support.reason).toBe('string')
    }
  })

  it('honors TUFF_DISABLE_NATIVE_OCR contract', async () => {
    const previous = process.env[DISABLE_FLAG]
    process.env[DISABLE_FLAG] = '1'

    try {
      const support = nativeOcr.getNativeOcrSupport()
      expect(support.supported).toBe(false)
      expect(support.reason).toBe('disabled-by-env')

      await expect(
        nativeOcr.recognizeImageText({
          image: Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({
        code: 'ERR_OCR_DISABLED',
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env[DISABLE_FLAG]
      }
      else {
        process.env[DISABLE_FLAG] = previous
      }
    }
  })

  it('does not regress to native-module-not-loaded on supported platforms', () => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return
    }

    const support = nativeOcr.getNativeOcrSupport()
    expect(support.reason).not.toBe('native-module-not-loaded')
  })

  it('recognizes visible text from project fixture image', async () => {
    const support = nativeOcr.getNativeOcrSupport()
    if (!support.supported) {
      return
    }

    const fixturePath = fileURLToPath(new URL('../../../../shots/LogoBanner.png', import.meta.url))
    expect(existsSync(fixturePath)).toBe(true)

    const image = readFileSync(fixturePath)
    const result = await nativeOcr.recognizeImageText({
      image,
      includeLayout: true,
      maxBlocks: 20,
    })

    const normalizedText = result.text.toLowerCase()
    expect(result.engine === 'apple-vision' || result.engine === 'windows-ocr').toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(normalizedText.length).toBeGreaterThan(0)
    expect(normalizedText).toContain('tuff')
    expect(Array.isArray(result.blocks)).toBe(true)
    expect((result.blocks || []).length).toBeGreaterThan(0)
  })
})
