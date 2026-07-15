import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

const runtimeMocks = vi.hoisted(() => ({
  getSessionHistory: vi.fn(),
  queryTrace: vi.fn(),
  pauseSession: vi.fn(),
  getSessionState: vi.fn(),
  subscribeSessionTrace: vi.fn()
}))

const permissionMocks = vi.hoisted(() => ({
  withPermission: vi.fn(
    (
      _options: unknown,
      handler: (payload: unknown, context: HandlerContext) => Promise<void> | void
    ) => {
      return handler
    }
  )
}))

vi.mock('./tuff-intelligence-runtime', () => ({
  tuffIntelligenceRuntime: runtimeMocks
}))

vi.mock('../permission/channel-guard', () => ({
  withPermission: permissionMocks.withPermission
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

type EventDefinition = { toEventName: () => string }
type ApiResponse = { ok: boolean; result?: unknown; error?: string }
type ApiHandler = (payload: unknown, context: HandlerContext) => Promise<ApiResponse>
type SessionStreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void>

interface TransportCapture {
  on: (event: EventDefinition, handler: ApiHandler) => void
  onStream: (event: EventDefinition, handler: SessionStreamHandler) => void
}

interface OrchestrationChannelRegistrar {
  createChannelRegistrars: (transport: TransportCapture) => { registerHostOnlySafe: unknown }
  registerOrchestrationChannels: (registerHostOnlySafe: unknown) => void
  registerOrchestrationStreamChannels: () => void
  transport: TransportCapture | null
}

function pluginContext(): HandlerContext {
  return {
    plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
  } as HandlerContext
}

function captureOrchestrationHandlers() {
  const handlers = new Map<string, ApiHandler>()
  const transport: TransportCapture = {
    on: (event, handler) => handlers.set(event.toEventName(), handler),
    onStream: vi.fn()
  }
  const module = new IntelligenceModule() as unknown as OrchestrationChannelRegistrar
  const { registerHostOnlySafe } = module.createChannelRegistrars(transport)
  module.registerOrchestrationChannels(registerHostOnlySafe)

  return handlers
}

function captureTraceSubscriptionHandler(): SessionStreamHandler {
  const streamHandlers = new Map<string, SessionStreamHandler>()
  const transport: TransportCapture = {
    on: vi.fn(),
    onStream: (event, handler) => streamHandlers.set(event.toEventName(), handler)
  }
  const module = new IntelligenceModule() as unknown as OrchestrationChannelRegistrar
  module.transport = transport
  module.registerOrchestrationStreamChannels()

  const handler = streamHandlers.get('intelligence:agent:session:subscribe')
  if (!handler) {
    throw new Error('Intelligence session trace subscription handler was not registered')
  }
  return handler
}

function getHandler(handlers: Map<string, ApiHandler>, eventName: string): ApiHandler {
  const handler = handlers.get(eventName)
  if (!handler) {
    throw new Error(`Intelligence orchestration handler ${eventName} was not registered`)
  }
  return handler
}

describe('intelligenceModule agent session host boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeMocks.getSessionHistory.mockResolvedValue([{ id: 'host-session' }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: 'session history',
      eventName: 'intelligence:agent:session:history',
      payload: { limit: 10 },
      operation: runtimeMocks.getSessionHistory
    },
    {
      name: 'session trace',
      eventName: 'intelligence:agent:session:trace',
      payload: { sessionId: 'host-session', limit: 10 },
      operation: runtimeMocks.queryTrace
    },
    {
      name: 'session state',
      eventName: 'intelligence:agent:session:get-state',
      payload: { sessionId: 'host-session' },
      operation: runtimeMocks.getSessionState
    },
    {
      name: 'session pause mutation',
      eventName: 'intelligence:agent:session:pause',
      payload: { sessionId: 'host-session', reason: 'manual_pause' },
      operation: runtimeMocks.pauseSession
    }
  ] as const)(
    'rejects plugin $name before its runtime operation',
    async ({ eventName, payload, operation }) => {
      const handler = getHandler(captureOrchestrationHandlers(), eventName)

      await expect(handler(payload, pluginContext())).resolves.toEqual({
        ok: false,
        error: 'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      })
      expect(operation).not.toHaveBeenCalled()
    }
  )

  it('keeps session history available to host renderer callers', async () => {
    const handler = getHandler(captureOrchestrationHandlers(), 'intelligence:agent:session:history')

    await expect(handler({ limit: 1 }, {} as HandlerContext)).resolves.toEqual({
      ok: true,
      result: [{ id: 'host-session' }]
    })
    expect(runtimeMocks.getSessionHistory).toHaveBeenCalledWith({ limit: 1 })
  })

  it('fails plugin trace subscriptions before runtime, timers, and stream side effects', async () => {
    const handler = captureTraceSubscriptionHandler()
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    const streamContext = {
      ...pluginContext(),
      emit: vi.fn(),
      end: vi.fn(),
      error: vi.fn(),
      isCancelled: vi.fn(() => false)
    } as unknown as StreamContext<unknown>

    await handler({ sessionId: 'host-session', fromSeq: 3, limit: 10 }, streamContext)

    expect(streamContext.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'INTELLIGENCE_HOST_ONLY_CAPABILITY' })
    )
    expect(streamContext.emit).not.toHaveBeenCalled()
    expect(streamContext.end).not.toHaveBeenCalled()
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(runtimeMocks.queryTrace).not.toHaveBeenCalled()
    expect(runtimeMocks.subscribeSessionTrace).not.toHaveBeenCalled()
    expect(runtimeMocks.getSessionState).not.toHaveBeenCalled()
    expect(runtimeMocks.pauseSession).not.toHaveBeenCalled()
  })

  it('keeps a cancelled host trace subscription on its normal pause and end lifecycle', async () => {
    const handler = captureTraceSubscriptionHandler()
    runtimeMocks.getSessionState.mockResolvedValue({ status: 'running' })
    const streamContext = {
      emit: vi.fn(),
      end: vi.fn(),
      error: vi.fn(),
      isCancelled: vi.fn(() => true)
    } as unknown as StreamContext<unknown>

    await handler({ sessionId: 'host-session' }, streamContext)

    expect(streamContext.error).not.toHaveBeenCalled()
    expect(runtimeMocks.getSessionState).toHaveBeenCalledWith('host-session')
    expect(runtimeMocks.pauseSession).toHaveBeenCalledWith({
      sessionId: 'host-session',
      reason: 'client_disconnect'
    })
    expect(streamContext.end).toHaveBeenCalledOnce()
    expect(runtimeMocks.subscribeSessionTrace).not.toHaveBeenCalled()
  })
})
