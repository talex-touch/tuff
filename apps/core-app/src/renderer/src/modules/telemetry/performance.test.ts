import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  send: vi.fn(),
  polling: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(),
    unregister: vi.fn(),
    start: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => state.polling
  }
}))

vi.mock('@talex-touch/utils/renderer/hooks/arg-mapper', () => ({
  isCoreBox: () => true
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: state.send })
}))

import { SentryEvents } from '@talex-touch/utils/transport/events'
import { setRendererActivity } from './renderer-activity'
import { startRendererPerformanceTelemetry } from './performance'

describe('renderer performance telemetry activity lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.send.mockResolvedValue(undefined)
  })

  it('owns one RAF, suspends and flushes while inactive, and rebases on reactivation', async () => {
    const pendingFrames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    let now = 0
    const document = Object.assign(new EventTarget(), { hidden: false }) as Document
    const window = new EventTarget() as Window
    vi.stubGlobal('document', document)
    vi.stubGlobal('window', window)
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++
      pendingFrames.set(frameId, callback)
      return frameId
    })
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      pendingFrames.delete(frameId)
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    state.send.mockResolvedValueOnce({ enabled: true })

    await startRendererPerformanceTelemetry()
    document.dispatchEvent(new Event('visibilitychange'))

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(pendingFrames.size).toBe(1)

    const firstFrame = pendingFrames.get(1)
    pendingFrames.delete(1)
    firstFrame?.(100)
    expect(pendingFrames.size).toBe(1)

    setRendererActivity(false)
    await Promise.resolve()
    await Promise.resolve()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(2)
    expect(pendingFrames).toEqual(new Map())
    expect(state.send).toHaveBeenCalledWith(
      SentryEvents.api.recordPerformance,
      expect.objectContaining({
        rafJankCount: 1,
        rafJankTotalMs: 100,
        rafJankMaxMs: 100,
        windowType: 'corebox'
      })
    )

    now = 1_000
    setRendererActivity(true)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3)

    const reactivatedFrame = pendingFrames.get(3)
    pendingFrames.delete(3)
    reactivatedFrame?.(1_016)
    setRendererActivity(false)
    await Promise.resolve()
    await Promise.resolve()

    expect(
      state.send.mock.calls.filter(([event]) => event === SentryEvents.api.recordPerformance)
    ).toHaveLength(1)
  })
})
