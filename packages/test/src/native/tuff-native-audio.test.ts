import { Buffer } from 'node:buffer'
import process from 'node:process'
import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_AUDIO'

function withDisabledAudio<T>(run: () => T): T {
  const previous = process.env[DISABLE_FLAG]
  process.env[DISABLE_FLAG] = '1'
  try {
    return run()
  }
  finally {
    if (previous === undefined)
      delete process.env[DISABLE_FLAG]
    else process.env[DISABLE_FLAG] = previous
  }
}

describe('tuff-native audio contract', () => {
  it('exports the complete audio facade', () => {
    expect(typeof nativeAudio.getNativeAudioSupport).toBe('function')
    expect(typeof nativeAudio.startCapture).toBe('function')
    expect(typeof nativeAudio.pollCapture).toBe('function')
    expect(typeof nativeAudio.snapshotCapture).toBe('function')
    expect(typeof nativeAudio.drainCapture).toBe('function')
    expect(typeof nativeAudio.stopCapture).toBe('function')
    expect(typeof nativeAudio.cancelCapture).toBe('function')
    expect(typeof nativeAudio.playAudio).toBe('function')
    expect(typeof nativeAudio.stopPlayback).toBe('function')
    expect(typeof nativeAudio.isAccessibilityTrusted).toBe('function')
    expect(typeof nativeAudio.typeText).toBe('function')
  })

  it('returns a support payload with a stable binding-present-or-absent shape', () => {
    const support = nativeAudio.getNativeAudioSupport()

    expect(typeof support).toBe('object')
    expect(typeof support.supported).toBe('boolean')
    expect(typeof support.platform).toBe('string')
    if (support.reason !== undefined)
      expect(typeof support.reason).toBe('string')
  })

  it('uses strict capture errors and best-effort utility fallbacks when unavailable', () => {
    const support = nativeAudio.getNativeAudioSupport()
    if (support.supported)
      return

    expect(() => nativeAudio.startCapture()).toThrow(
      expect.objectContaining({ code: 'ERR_NATIVE_AUDIO_UNAVAILABLE' }),
    )
    expect(nativeAudio.playAudio(Buffer.alloc(0))).toEqual({ playbackId: '' })
    expect(() => nativeAudio.stopPlayback()).not.toThrow()
    expect(nativeAudio.isAccessibilityTrusted()).toBe(false)
    expect(nativeAudio.typeText('not-sent')).toMatchObject({ ok: false })
  })

  it('honors TUFF_DISABLE_NATIVE_AUDIO across strict and best-effort methods', () => {
    withDisabledAudio(() => {
      expect(nativeAudio.getNativeAudioSupport()).toMatchObject({
        supported: false,
        reason: 'disabled-by-env',
      })
      expect(() => nativeAudio.startCapture()).toThrow(
        expect.objectContaining({ code: 'ERR_NATIVE_AUDIO_DISABLED' }),
      )
      expect(nativeAudio.playAudio(Buffer.alloc(0))).toEqual({ playbackId: '' })
      expect(() => nativeAudio.stopPlayback()).not.toThrow()
      expect(nativeAudio.isAccessibilityTrusted()).toBe(false)
      expect(nativeAudio.typeText('not-sent')).toEqual({
        ok: false,
        reason: 'disabled-by-env',
      })
    })
  })
})
