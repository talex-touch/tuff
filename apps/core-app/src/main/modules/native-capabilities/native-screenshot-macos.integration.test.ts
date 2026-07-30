import type { NapiCarrier as NapiCarrierInstance } from '@talex-touch/tuff-native/protocol'
import type { ScreenshotCarrierLoadResult } from '@talex-touch/tuff-native/screenshot-protocol'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { NativeTransport } from './native-transport'

const enabled =
  process.platform === 'darwin' && process.env.TUFF_SCREENSHOT_MACOS_INTEGRATION === '1'
const requireAx = process.env.TUFF_SCREENSHOT_MACOS_REQUIRE_AX === '1'
const require = createRequire(import.meta.url)
const screenshotProtocol = require('@talex-touch/tuff-native/screenshot-protocol') as {
  loadScreenshotCarrier: (options?: { clientVersion?: string }) => ScreenshotCarrierLoadResult
}

function loadCarrier(): NapiCarrierInstance {
  const loaded = screenshotProtocol.loadScreenshotCarrier({ clientVersion: '2.4.13' })
  if (!loaded.carrier) throw new Error(`Screenshot carrier unavailable: ${loaded.reason}`)
  return loaded.carrier
}

describe('nativeTransport real macOS screenshot integration', () => {
  it.runIf(enabled)(
    'runs the complete protocol flow without exposing image JSON',
    async () => {
      const transport = new NativeTransport({ carriers: [loadCarrier()] })
      try {
        const initialized = await transport.initialize()
        expect(initialized.capabilities).toContainEqual(
          expect.objectContaining({
            id: 'screenshot.capture',
            state: 'available',
            engine: 'screen-capture-kit'
          })
        )

        const probe = await transport.invoke<
          Record<string, never>,
          {
            platform: string
            engine: string
            screenRecording: string
            features: string[]
          }
        >('screenshot.capture', 'probe', {})
        expect(probe.value).toMatchObject({
          platform: 'macos',
          engine: 'screen-capture-kit',
          screenRecording: 'granted'
        })

        const refreshed = await transport.invoke<
          {
            includeWindowTitles: boolean
            self: { processIds: number[]; bundleIds: string[]; nativeWindowIds: string[] }
          },
          {
            generation: string
            coordinateSpace: string
            windows: Array<{
              id: string
              nativeId: string
              globalFrame: { x: number; y: number; width: number; height: number }
              owner: { processId: number }
              capturable: boolean
              self: boolean
            }>
            displays: Array<{
              id: string
              globalFrame: { x: number; y: number; width: number; height: number }
            }>
          }
        >('screenshot.capture', 'refresh', {
          includeWindowTitles: false,
          self: { processIds: [process.pid], bundleIds: [], nativeWindowIds: [] }
        })
        expect(refreshed.value.coordinateSpace).toBe('global-dip-v1')
        expect(refreshed.value.displays.length).toBeGreaterThan(0)
        const display = refreshed.value.displays[0]
        const target = {
          kind: 'display' as const,
          generation: refreshed.value.generation,
          displayId: display.id
        }

        const frontWindow = refreshed.value.windows[0]
        if (probe.value.features.includes('ui-element-hit-test') && frontWindow) {
          const hit = await transport.invoke<
            {
              generation: string
              point: { x: number; y: number }
              granularity: 'ui-element'
              includePanels: boolean
              maxCandidates: number
            },
            {
              candidates: Array<{
                window: { id: string }
                element?: { id: string; windowId: string; role: string }
              }>
              accessibilityFallback?: string
            }
          >('screenshot.capture', 'hit_test', {
            generation: refreshed.value.generation,
            point: {
              x: frontWindow.globalFrame.x + frontWindow.globalFrame.width / 2,
              y: frontWindow.globalFrame.y + frontWindow.globalFrame.height / 2
            },
            granularity: 'ui-element',
            includePanels: true,
            maxCandidates: 8
          })
          const firstCandidate = hit.value.candidates[0]
          if (requireAx) {
            expect(
              firstCandidate?.element,
              `AX fallback: ${hit.value.accessibilityFallback}`
            ).toBeDefined()
          }
          if (firstCandidate?.element) {
            expect(firstCandidate.element.windowId).toBe(firstCandidate.window.id)
            expect(firstCandidate.element.role.length).toBeGreaterThan(0)
            const elementCapture = await transport.invoke('screenshot.capture', 'capture', {
              target: {
                kind: 'ui-element',
                generation: refreshed.value.generation,
                elementId: firstCandidate.element.id
              },
              cursor: 'hidden',
              output: { format: 'png', scale: 'native-max' }
            })
            expect(elementCapture.attachments.length).toBeGreaterThan(0)
          } else if (firstCandidate) {
            expect(['permission-denied', 'timeout', 'unsupported', 'unverified-window']).toContain(
              hit.value.accessibilityFallback
            )
          }
        }

        const capture = await transport.invoke<
          {
            target: typeof target
            cursor: 'hidden'
            output: { format: 'png'; scale: 'native-max' }
          },
          {
            mimeType: string
            width: number
            height: number
            byteLength: number
            imageParts: Array<{ attachmentId: string; offset: number; byteLength: number }>
          }
        >('screenshot.capture', 'capture', {
          target,
          cursor: 'hidden',
          output: { format: 'png', scale: 'native-max' }
        })
        expect(capture.value.mimeType).toBe('image/png')
        expect(capture.value.width).toBeGreaterThan(0)
        expect(capture.value.height).toBeGreaterThan(0)
        expect(capture.attachments.reduce((total, part) => total + part.length, 0)).toBe(
          capture.value.byteLength
        )
        expect(capture.attachments[0]?.subarray(0, 4)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47])
        )

        const capturableWindow = refreshed.value.windows.find(
          (window) => window.capturable && !window.self
        )
        if (capturableWindow) {
          const windowCapture = await transport.invoke('screenshot.capture', 'capture', {
            target: {
              kind: 'window',
              generation: refreshed.value.generation,
              windowId: capturableWindow.id
            },
            cursor: 'hidden',
            output: { format: 'png', scale: 'native-max' }
          })
          expect(windowCapture.attachments[0]?.subarray(0, 4)).toEqual(
            Buffer.from([0x89, 0x50, 0x4e, 0x47])
          )
        }

        const cursorCapture = await transport.invoke('screenshot.capture', 'capture', {
          target,
          cursor: 'system',
          output: { format: 'png', scale: 'native-max' }
        })
        expect(cursorCapture.attachments[0]?.subarray(0, 4)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47])
        )

        const frames = transport.openStream<
          {
            target: typeof target
            cursor: 'hidden'
            framesPerSecond: number
            pixelFormat: 'bgra8-premultiplied'
            maxFrameBytes: number
          },
          {
            width: number
            height: number
            stride: number
            pixelFormat: string
          }
        >(
          'screenshot.capture',
          'frames',
          {
            target,
            cursor: 'hidden',
            framesPerSecond: 5,
            pixelFormat: 'bgra8-premultiplied',
            maxFrameBytes: 64 * 1024 * 1024
          },
          { initialWindow: 1, timeoutMs: 15_000 }
        )
        const iterator = frames[Symbol.asyncIterator]()
        const first = await iterator.next()
        expect(first.done).toBe(false)
        expect(first.value.value.pixelFormat).toBe('bgra8-premultiplied')
        expect(first.value.value.stride).toBe(first.value.value.width * 4)
        expect(first.value.attachments.reduce((total, part) => total + part.length, 0)).toBe(
          first.value.value.stride * first.value.value.height
        )
        expect(first.value.attachments.every((part) => part.length <= 32 * 1024 * 1024)).toBe(true)
        await iterator.return?.()
        expect((await frames.closed).kind).toBe('cancelled')

        if (capturableWindow) {
          const selfRefresh = await transport.invoke<
            {
              includeWindowTitles: boolean
              self: { processIds: number[]; bundleIds: string[]; nativeWindowIds: string[] }
            },
            typeof refreshed.value
          >('screenshot.capture', 'refresh', {
            includeWindowTitles: false,
            self: {
              processIds: [capturableWindow.owner.processId],
              bundleIds: [],
              nativeWindowIds: []
            }
          })
          const selfTarget = {
            kind: 'display' as const,
            generation: selfRefresh.value.generation,
            displayId: selfRefresh.value.displays[0].id
          }
          const excluded = await transport.invoke('screenshot.capture', 'capture', {
            target: selfTarget,
            cursor: 'hidden',
            output: { format: 'png', scale: 'native-max' }
          })
          expect(excluded.attachments.length).toBeGreaterThan(0)
          const excepted = await transport.invoke('screenshot.capture', 'capture', {
            target: selfTarget,
            cursor: 'hidden',
            includeSelfWindowId: capturableWindow.id,
            output: { format: 'png', scale: 'native-max' }
          })
          expect(excepted.attachments.length).toBeGreaterThan(0)
        }
      } finally {
        await transport.dispose()
      }
    },
    30_000
  )
})
