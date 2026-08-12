/**
 * The session subscribe stream used to park on a 250ms poll of isCancelled(), and that flag is
 * only set by an explicit cancel message from the renderer (#764). A reloaded, closed or crashed
 * window never sends one, so the keepalive interval, the poll itself and the trace subscription
 * stayed live for the rest of the process -- one more set per reload.
 *
 * These assert on timer count rather than on a "did it resolve" boolean: a stream that resolves
 * but leaves its interval armed is exactly the bug.
 */
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

const runtimeMocks = vi.hoisted(() => ({
  getSessionHistory: vi.fn(),
  queryTrace: vi.fn(),
  pauseSession: vi.fn(),
  getSessionState: vi.fn(),
  subscribeSessionTrace: vi.fn()
}))

vi.mock('./tuff-intelligence-runtime', () => ({
  tuffIntelligenceRuntime: runtimeMocks
}))

vi.mock('../permission/channel-guard', () => ({
  withPermission: vi.fn(
    (
      _options: unknown,
      handler: (payload: unknown, context: HandlerContext) => Promise<void> | void
    ) => handler
  )
}))

vi.mock('../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }

  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

import { IntelligenceModule } from './intelligence-module'

type SessionStreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void>

interface TransportCapture {
  on: (event: { toEventName: () => string }, handler: unknown) => void
  onStream: (event: { toEventName: () => string }, handler: SessionStreamHandler) => void
}

interface OrchestrationChannelRegistrar {
  registerOrchestrationStreamChannels: () => void
  transport: TransportCapture | null
}

function captureSubscribeHandler(): SessionStreamHandler {
  const streamHandlers = new Map<string, SessionStreamHandler>()
  const module = new IntelligenceModule() as unknown as OrchestrationChannelRegistrar
  module.transport = {
    on: vi.fn(),
    onStream: (event, handler) => streamHandlers.set(event.toEventName(), handler)
  }
  module.registerOrchestrationStreamChannels()

  const handler = streamHandlers.get('intelligence:agent:session:subscribe')
  if (!handler) {
    throw new Error('Intelligence session subscribe handler was not registered')
  }
  return handler
}

/** Stands in for the renderer's WebContents: only lifecycle events matter here. */
class FakeSender extends EventEmitter {
  private destroyed = false

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

function createStreamContext(sender: FakeSender): {
  context: StreamContext<unknown>
  cancel: () => void
} {
  const controller = new AbortController()
  let cancelled = false
  const context = {
    emit: vi.fn(),
    error: vi.fn(),
    end: vi.fn(),
    isCancelled: () => cancelled,
    signal: controller.signal,
    streamId: 'stream-1',
    sender: sender as unknown as StreamContext<unknown>['sender']
  } as unknown as StreamContext<unknown>

  return {
    context,
    cancel: () => {
      cancelled = true
      controller.abort()
    }
  }
}

describe('intelligence session stream releases with its renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    runtimeMocks.subscribeSessionTrace.mockReturnValue(vi.fn())
    // Not running, so pauseOnDisconnect does not try to pause.
    runtimeMocks.getSessionState.mockResolvedValue({ status: 'completed' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('渲染进程销毁后,流上的定时器必须全部清掉', async () => {
    const handler = captureSubscribeHandler()
    const sender = new FakeSender()
    const { context } = createStreamContext(sender)

    const pending = handler({ sessionId: 'session-1' }, context)
    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBeGreaterThan(0)

    sender.destroy()
    // 300ms so a 250ms poll would have had its chance to tick: this must fail because the poll
    // never observes a destroyed sender, not because timers were not advanced.
    await vi.advanceTimersByTimeAsync(300)
    await pending

    expect(vi.getTimerCount()).toBe(0)
    expect(runtimeMocks.subscribeSessionTrace.mock.results[0]?.value).toHaveBeenCalled()
  })

  it('显式取消仍然结束流(没有被 sender 钩子取代)', async () => {
    const handler = captureSubscribeHandler()
    const sender = new FakeSender()
    const { context, cancel } = createStreamContext(sender)

    const pending = handler({ sessionId: 'session-1' }, context)
    await vi.advanceTimersByTimeAsync(0)

    cancel()
    // Same 300ms budget. This case worked before the change too, so it is the control: it must
    // keep passing when the fix is reverted.
    await vi.advanceTimersByTimeAsync(300)
    await pending

    expect(vi.getTimerCount()).toBe(0)
  })
})
