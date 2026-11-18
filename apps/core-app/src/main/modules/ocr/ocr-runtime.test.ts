import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  getRustOcrHelperStatus: vi.fn(),
  recognizeImageTextViaRustHelper: vi.fn(),
  closeRustOcrHelper: vi.fn(),
  recognizeImageTextIsolated: vi.fn(),
  appOnce: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    once: runtimeMocks.appOnce
  }
}))

vi.mock('@talex-touch/tuff-native/ocr-helper', () => ({
  getRustOcrHelperStatus: runtimeMocks.getRustOcrHelperStatus,
  recognizeImageTextViaRustHelper: runtimeMocks.recognizeImageTextViaRustHelper,
  closeRustOcrHelper: runtimeMocks.closeRustOcrHelper
}))

vi.mock('./ocr-process-client', () => ({
  recognizeImageTextIsolated: runtimeMocks.recognizeImageTextIsolated
}))

import { recognizeOcrSourceIsolated } from './ocr-runtime'

describe('recognizeOcrSourceIsolated', () => {
  beforeEach(() => {
    runtimeMocks.getRustOcrHelperStatus.mockReset()
    runtimeMocks.recognizeImageTextViaRustHelper.mockReset()
    runtimeMocks.closeRustOcrHelper.mockReset()
    runtimeMocks.recognizeImageTextIsolated.mockReset()
    runtimeMocks.appOnce.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes file sources directly to the Rust helper without decoding on main', async () => {
    runtimeMocks.getRustOcrHelperStatus.mockReturnValue({
      available: true,
      helperPath: '/tmp/tuff-native-ocr'
    })
    runtimeMocks.recognizeImageTextViaRustHelper.mockResolvedValue({
      text: 'rust file ocr',
      engine: 'apple-vision',
      durationMs: 18
    })
    const decodeBuffer = vi.fn()

    const result = await recognizeOcrSourceIsolated(
      {
        source: { type: 'file', filePath: '/tmp/shot.png' },
        languageHint: 'zh-Hans',
        includeLayout: true,
        decodeBuffer
      },
      { timeoutMs: 45_000 }
    )

    expect(result.text).toBe('rust file ocr')
    expect(decodeBuffer).not.toHaveBeenCalled()
    expect(runtimeMocks.recognizeImageTextViaRustHelper).toHaveBeenCalledWith(
      {
        filePath: '/tmp/shot.png',
        languageHint: 'zh-Hans',
        includeLayout: true,
        maxBlocks: 120
      },
      { timeoutMs: 45_000 }
    )
    expect(runtimeMocks.recognizeImageTextIsolated).not.toHaveBeenCalled()
  })

  it('rejects empty decoded buffers before invoking any isolated runtime', async () => {
    runtimeMocks.getRustOcrHelperStatus.mockReturnValue({
      available: true,
      helperPath: '/tmp/tuff-native-ocr'
    })

    await expect(
      recognizeOcrSourceIsolated({
        source: { type: 'data-url', dataUrl: 'data:image/png;base64,' },
        decodeBuffer: async () => Buffer.alloc(0)
      })
    ).rejects.toMatchObject({ code: 'ERR_OCR_DECODE_FAILED' })

    expect(runtimeMocks.recognizeImageTextViaRustHelper).not.toHaveBeenCalled()
    expect(runtimeMocks.recognizeImageTextIsolated).not.toHaveBeenCalled()
  })

  it('falls back once to utility process only when the Rust helper cannot spawn', async () => {
    runtimeMocks.getRustOcrHelperStatus.mockReturnValue({
      available: true,
      helperPath: '/tmp/tuff-native-ocr'
    })
    runtimeMocks.recognizeImageTextViaRustHelper.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'OCR_HELPER_SPAWN_FAILED' })
    )
    runtimeMocks.recognizeImageTextIsolated.mockResolvedValue({
      text: 'utility fallback',
      engine: 'apple-vision',
      durationMs: 35
    })
    const decodeBuffer = vi.fn(async () => Buffer.from('png-bytes'))

    const result = await recognizeOcrSourceIsolated({
      source: { type: 'file', filePath: '/tmp/shot.png' },
      decodeBuffer
    })

    expect(result.text).toBe('utility fallback')
    expect(decodeBuffer).toHaveBeenCalledOnce()
    expect(runtimeMocks.recognizeImageTextIsolated).toHaveBeenCalledOnce()
  })

  it('never double-runs native recognition when the Rust helper timed out or failed recognition', async () => {
    runtimeMocks.getRustOcrHelperStatus.mockReturnValue({
      available: true,
      helperPath: '/tmp/tuff-native-ocr'
    })
    const timeoutError = Object.assign(new Error('OCR process timed out after 30000ms'), {
      code: 'OCR_PROCESS_TIMEOUT'
    })
    runtimeMocks.recognizeImageTextViaRustHelper.mockRejectedValue(timeoutError)

    await expect(
      recognizeOcrSourceIsolated({
        source: { type: 'file', filePath: '/tmp/shot.png' },
        decodeBuffer: async () => Buffer.from('png-bytes')
      })
    ).rejects.toBe(timeoutError)

    expect(runtimeMocks.recognizeImageTextIsolated).not.toHaveBeenCalled()
  })

  it('routes directly to the utility process when the Rust helper binary is absent', async () => {
    runtimeMocks.getRustOcrHelperStatus.mockReturnValue({
      available: false,
      helperPath: '/tmp/tuff-native-ocr',
      reason: 'ENOENT'
    })
    runtimeMocks.recognizeImageTextIsolated.mockResolvedValue({
      text: 'utility direct',
      engine: 'apple-vision',
      durationMs: 22
    })

    const result = await recognizeOcrSourceIsolated({
      source: { type: 'base64', base64: Buffer.from('abc').toString('base64') },
      decodeBuffer: async () => Buffer.from('abc')
    })

    expect(result.text).toBe('utility direct')
    expect(runtimeMocks.recognizeImageTextViaRustHelper).not.toHaveBeenCalled()
    expect(runtimeMocks.recognizeImageTextIsolated).toHaveBeenCalledOnce()
  })
})
