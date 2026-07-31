import type { ScreenshotSessionResult } from '../../transport/events/screenshot-session'
import { ScreenshotSessionEvents } from '../../transport/events/screenshot-session'
import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport,
} from '../../transport/events/types'
import type { ITuffTransport } from '../../transport/types'
import { createNativeScreenshotSdk } from '../../transport/sdk/domains/native'

export type PluginScreenshotCaptureResult = NativeScreenshotCaptureResult

export interface PluginScreenshotSDK {
  getSupport: () => Promise<NativeScreenshotSupport>
  listDisplays: () => Promise<NativeScreenshotDisplay[]>
  captureInteractive: () => Promise<ScreenshotSessionResult>
  capture: (request?: NativeScreenshotCaptureRequest) => Promise<PluginScreenshotCaptureResult>
}

export function createPluginScreenshotSDK(transport: Pick<ITuffTransport, 'send'>): PluginScreenshotSDK {
  const screenshot = createNativeScreenshotSdk(transport)

  return {
    getSupport: screenshot.getSupport,
    listDisplays: screenshot.listDisplays,
    captureInteractive: async () => {
      const started = await transport.send(ScreenshotSessionEvents.lifecycle.start, {
        completionMode: 'return-resource',
        delayMs: 0,
        initialTarget: 'free-region',
      })
      if (!started.accepted || !started.sessionId) {
        throw new Error(started.reason ?? 'SCREENSHOT_SESSION_START_FAILED')
      }
      return await transport.send(ScreenshotSessionEvents.lifecycle.waitResult, {
        sessionId: started.sessionId,
      })
    },
    capture: screenshot.capture,
  }
}
