import type { NapiCarrier as NapiCarrierInstance } from '@talex-touch/tuff-native/protocol'
import type { ScreenshotCarrierLoadResult } from '@talex-touch/tuff-native/screenshot-protocol'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { NativeTransport } from './native-transport'

interface ContentSnapshot {
  generation: string
  displays: Array<{ id: string }>
}

interface CaptureOutput {
  mimeType: 'image/png'
  byteLength: number
  imageParts: Array<{ attachmentId: string; offset: number; byteLength: number }>
}

interface FrameOutput {
  width: number
  height: number
  stride: number
  droppedSourceFrames: number
}

const require = createRequire(import.meta.url)
const screenshotProtocol = require('@talex-touch/tuff-native/screenshot-protocol') as {
  loadScreenshotCarrier: (options?: { clientVersion?: string }) => ScreenshotCarrierLoadResult
}

function loadCarrier(): NapiCarrierInstance {
  const loaded = screenshotProtocol.loadScreenshotCarrier({ clientVersion: '2.4.13' })
  if (!loaded.carrier) throw new Error(`Screenshot test carrier unavailable: ${loaded.reason}`)
  return loaded.carrier
}

describe('nativeTransport screenshot N-API integration', () => {
  it('runs refresh, PNG capture, frames, cancel, and dispose through the real addon', async () => {
    const carrier = loadCarrier()
    const transport = new NativeTransport({ carriers: [carrier] })
    const snapshot = await transport.initialize()
    expect(snapshot.capabilities).toContainEqual(
      expect.objectContaining({
        id: 'screenshot.capture',
        version: '1.1.0',
        state: 'available'
      })
    )

    const refreshed = await transport.invoke<
      {
        includeWindowTitles: boolean
        self: { processIds: number[]; bundleIds: string[]; nativeWindowIds: string[] }
      },
      ContentSnapshot
    >('screenshot.capture', 'refresh', {
      includeWindowTitles: false,
      self: { processIds: [], bundleIds: [], nativeWindowIds: [] }
    })
    expect(refreshed.value.generation).toBe('generation:test:1')
    expect(refreshed.value.displays).toEqual([expect.objectContaining({ id: 'display:test:1' })])

    const target = {
      kind: 'display' as const,
      generation: refreshed.value.generation,
      displayId: refreshed.value.displays[0].id
    }
    const captured = await transport.invoke<
      {
        target: typeof target
        cursor: 'hidden'
        output: { format: 'png'; scale: 'native-max' }
      },
      CaptureOutput
    >('screenshot.capture', 'capture', {
      target,
      cursor: 'hidden',
      output: { format: 'png', scale: 'native-max' }
    })
    expect(captured.value.mimeType).toBe('image/png')
    expect(captured.attachments).toHaveLength(1)
    expect([...captured.attachments[0].subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(captured.value.byteLength).toBe(captured.attachments[0].byteLength)
    expect(captured.value.imageParts).toEqual([
      {
        attachmentId: 'image:0',
        offset: 0,
        byteLength: captured.attachments[0].byteLength
      }
    ])
    const capturedBytes = Uint8Array.from(captured.attachments[0])

    const frames = transport.openStream<
      {
        target: typeof target
        cursor: 'hidden'
        framesPerSecond: number
        pixelFormat: 'bgra8-premultiplied'
        maxFrameBytes: number
      },
      FrameOutput
    >(
      'screenshot.capture',
      'frames',
      {
        target,
        cursor: 'hidden',
        framesPerSecond: 30,
        pixelFormat: 'bgra8-premultiplied',
        maxFrameBytes: 1024
      },
      { initialWindow: 1 }
    )
    const frameValues: number[] = []
    for await (const frame of frames) {
      expect(frame.value).toMatchObject({ width: 2, height: 1, stride: 8 })
      expect(frame.attachments).toHaveLength(1)
      frameValues.push(frame.attachments[0][0])
    }
    expect(frameValues).toEqual([1, 2, 3])
    expect(captured.attachments[0].equals(capturedBytes)).toBe(true)
    await expect(frames.closed).resolves.toEqual({
      kind: 'end',
      value: { emittedFrames: 3, droppedSourceFrames: 0 }
    })

    const failed = transport.openStream(
      'screenshot.capture',
      'frames',
      {
        target,
        cursor: 'hidden',
        framesPerSecond: 13,
        pixelFormat: 'bgra8-premultiplied',
        maxFrameBytes: 1024
      },
      { initialWindow: 1 }
    )
    const failedIterator = failed[Symbol.asyncIterator]()
    await expect(failedIterator.next()).resolves.toMatchObject({ done: false })
    await expect(failedIterator.next()).rejects.toMatchObject({
      code: 'SCREENSHOT_BACKEND_FAILED'
    })
    await expect(failed.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'SCREENSHOT_BACKEND_FAILED' }
    })

    const cancelled = transport.openStream(
      'screenshot.capture',
      'frames',
      {
        target,
        cursor: 'hidden',
        framesPerSecond: 30,
        pixelFormat: 'bgra8-premultiplied',
        maxFrameBytes: 1024
      },
      { initialWindow: 1 }
    )
    const iterator = cancelled[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    cancelled.cancel()
    await expect(cancelled.closed).resolves.toEqual({ kind: 'cancelled' })

    await transport.dispose()
    expect(transport.getState()).toBe('disposed')
  })
})
