import { describe, expect, it, vi } from 'vitest'

import { createPluginScreenshotSDK } from '../plugin/sdk/screenshot'
import { ScreenshotSessionEvents } from '../transport/events/screenshot-session'
import type { ITuffTransport } from '../transport/types'

describe('plugin screenshot interactive SDK', () => {
  it('starts a visible return-resource session and returns only the managed result', async () => {
    const send = vi.fn(async (event: { toEventName(): string }) => {
      if (event.toEventName() === ScreenshotSessionEvents.lifecycle.start.toEventName()) {
        return {
          accepted: true,
          sessionId: 'screenshot-session:plugin',
          state: 'started',
        }
      }
      if (event.toEventName() === ScreenshotSessionEvents.lifecycle.waitResult.toEventName()) {
        return {
          status: 'completed',
          sessionId: 'screenshot-session:plugin',
          resource: {
            tfileUrl: 'tfile:///managed/plugin.png',
            mimeType: 'image/png',
            width: 320,
            height: 200,
            sizeBytes: 100,
          },
        }
      }
      throw new Error('unexpected event')
    })
    const sdk = createPluginScreenshotSDK({ send } as unknown as Pick<ITuffTransport, 'send'>)

    const result = await sdk.captureInteractive()

    expect(send.mock.calls[0]).toEqual([
      ScreenshotSessionEvents.lifecycle.start,
      {
        completionMode: 'return-resource',
        delayMs: 0,
        initialTarget: 'free-region',
      },
    ])
    expect(send.mock.calls[1]).toEqual([
      ScreenshotSessionEvents.lifecycle.waitResult,
      { sessionId: 'screenshot-session:plugin' },
    ])
    expect(result).toEqual({
      status: 'completed',
      sessionId: 'screenshot-session:plugin',
      resource: {
        tfileUrl: 'tfile:///managed/plugin.png',
        mimeType: 'image/png',
        width: 320,
        height: 200,
        sizeBytes: 100,
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/path|base64|attachment|nativeWindow/i)
  })

  it('fails without waiting when main rejects session start', async () => {
    const send = vi.fn(async () => ({ accepted: false, reason: 'permission-denied' }))
    const sdk = createPluginScreenshotSDK({ send } as unknown as Pick<ITuffTransport, 'send'>)

    await expect(sdk.captureInteractive()).rejects.toThrow('permission-denied')
    expect(send).toHaveBeenCalledOnce()
  })
})
