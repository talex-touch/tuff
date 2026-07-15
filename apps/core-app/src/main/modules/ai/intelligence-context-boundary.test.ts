import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceContextEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { IntelligenceModule } from './intelligence-module'

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

const contextHygieneMocks = vi.hoisted(() => ({
  listCheckpoints: vi.fn(),
  listPackageLogs: vi.fn(),
  evaluateMemory: vi.fn()
}))
const contextExecutionMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  stream: vi.fn()
}))
const intelligenceConfigMocks = vi.hoisted(() => ({
  ensureIntelligenceConfigLoaded: vi.fn()
}))

vi.mock('./intelligence-context-hygiene', () => ({
  contextHygieneService: contextHygieneMocks
}))
vi.mock('./intelligence-context-execution', () => ({
  intelligenceContextExecutionService: contextExecutionMocks
}))
vi.mock('./intelligence-config', () => ({
  debugPrintConfig: vi.fn(),
  ensureIntelligenceConfigLoaded: intelligenceConfigMocks.ensureIntelligenceConfigLoaded,
  getCapabilityOptions: vi.fn(),
  setupConfigUpdateListener: vi.fn()
}))

type ContextHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type ContextStreamHandler = (
  payload: unknown,
  context: StreamContext<unknown>
) => Promise<void> | void

interface ContextChannelRegistrar {
  registerContextChannels: (register: unknown) => void
  registerInvokeChannels: (register: unknown, registerStream: unknown) => void
}

function registerContextHandlers() {
  const handlers = new Map<string, ContextHandler>()
  const register = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: ContextHandler
    ) => {
      handlers.set(event.toEventName(), handler)
    }
  )

  const module = new IntelligenceModule() as unknown as ContextChannelRegistrar
  module.registerContextChannels(register)
  return handlers
}

function registerContextInvokeHandlers() {
  const handlers = new Map<string, ContextHandler>()
  const streamHandlers = new Map<string, ContextStreamHandler>()
  const register = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: ContextHandler
    ) => {
      handlers.set(event.toEventName(), handler)
    }
  )
  const registerStream = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: ContextStreamHandler
    ) => {
      streamHandlers.set(event.toEventName(), handler)
    }
  )

  const module = new IntelligenceModule() as unknown as ContextChannelRegistrar
  module.registerInvokeChannels(register, registerStream)
  return { handlers, streamHandlers }
}

function getContextHandler(
  handlers: Map<string, ContextHandler>,
  eventKey: keyof typeof intelligenceContextEvents
): ContextHandler {
  const handler = handlers.get(intelligenceContextEvents[eventKey].toEventName())
  if (!handler) {
    throw new Error(`Context handler for ${eventKey} was not registered`)
  }
  return handler
}

function pluginContext(): HandlerContext {
  return {
    plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
  } as HandlerContext
}

describe('intelligenceModule context ownership boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    {
      name: 'prepare-turn',
      eventKey: 'prepareTurn',
      payload: { owner: 'corebox', input: 'hidden context request' }
    },
    {
      name: 'compression-create',
      eventKey: 'createCompressionSnapshot',
      payload: {
        sessionId: 'session-1',
        expectedSessionUpdatedAt: 1,
        snapshot: {
          currentState: 'hidden summary',
          sourceTurnFrom: 'turn-1',
          sourceTurnTo: 'turn-2'
        }
      }
    },
    {
      name: 'compression-list',
      eventKey: 'listCompressionSnapshots',
      payload: { sessionId: 'session-1' }
    },
    {
      name: 'compression-latest',
      eventKey: 'getLatestCompressionSnapshot',
      payload: { sessionId: 'session-1' }
    },
    { name: 'list', eventKey: 'listMemories', payload: {} },
    {
      name: 'save',
      eventKey: 'saveMemory',
      payload: { type: 'preference', scope: 'global', content: 'Use concise answers' }
    },
    {
      name: 'replace',
      eventKey: 'replaceMemory',
      payload: {
        memoryId: 'memory-1',
        expectedUpdatedAt: 1,
        evaluationFingerprint: 'a'.repeat(64),
        replacement: { type: 'preference', scope: 'global', content: 'Use concise answers' }
      }
    },
    {
      name: 'set-enabled',
      eventKey: 'setMemoryEnabled',
      payload: { memoryId: 'memory-1', enabled: false }
    },
    {
      name: 'delete',
      eventKey: 'deleteMemory',
      payload: { memoryId: 'memory-1' }
    }
  ] as const)(
    'rejects plugin calls to $name',
    async ({ eventKey, payload }) => {
      const handler = getContextHandler(registerContextHandlers(), eventKey)

      await expect(handler(payload, pluginContext())).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      )
    },
    15_000
  )

  it.each([
    {
      name: 'checkpoint queries',
      eventKey: 'listCheckpoints',
      payload: { sessionId: 'unscoped-session', type: 'session_start', limit: 3 },
      operation: contextHygieneMocks.listCheckpoints
    },
    {
      name: 'package-log queries',
      eventKey: 'listPackageLogs',
      payload: { traceId: 'unscoped-trace', limit: 3 },
      operation: contextHygieneMocks.listPackageLogs
    }
  ] as const)(
    'rejects raw plugin $name before ContextHygieneService access',
    async ({ eventKey, payload, operation }) => {
      const handler = getContextHandler(registerContextHandlers(), eventKey)

      await expect(handler(payload, pluginContext())).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      )
      expect(operation).not.toHaveBeenCalled()
    }
  )

  it.each([
    {
      name: 'checkpoint queries',
      eventKey: 'listCheckpoints',
      payload: { sessionId: 'host-session', type: 'turn_end', limit: 4 },
      operation: contextHygieneMocks.listCheckpoints,
      result: { checkpoints: [{ id: 'host-checkpoint' }] }
    },
    {
      name: 'package-log queries',
      eventKey: 'listPackageLogs',
      payload: { sessionId: 'host-session', traceId: 'host-trace', limit: 4 },
      operation: contextHygieneMocks.listPackageLogs,
      result: { logs: [{ id: 'host-package-log' }] }
    }
  ] as const)(
    'preserves host $name payload and service result identity',
    async ({ eventKey, payload, operation, result }) => {
      operation.mockResolvedValueOnce(result)
      const handler = getContextHandler(registerContextHandlers(), eventKey)

      await expect(handler(payload, {} as HandlerContext)).resolves.toBe(result)
      expect(operation).toHaveBeenCalledOnce()
      expect(operation.mock.calls[0]?.[0]).toBe(payload)
    }
  )

  it('keeps context execution available to plugins under their authenticated actor', async () => {
    const payload = { input: 'plugin-safe context execution' }
    const result = { output: 'context result' }
    contextExecutionMocks.invoke.mockResolvedValueOnce(result)
    const { handlers } = registerContextInvokeHandlers()
    const handler = getContextHandler(handlers, 'execute')

    await expect(handler(payload, pluginContext())).resolves.toBe(result)
    expect(contextExecutionMocks.invoke).toHaveBeenCalledWith(payload, {
      id: 'plugin:third-party-plugin',
      type: 'plugin'
    })
  })

  it('keeps context streams available to plugins under their authenticated actor', async () => {
    const payload = { input: 'plugin-safe context stream' }
    const streamEvent = { type: 'context-ready', content: 'streamed context' }
    contextExecutionMocks.stream.mockImplementationOnce(async function* () {
      yield streamEvent
    })
    const { streamHandlers } = registerContextInvokeHandlers()
    const handler = streamHandlers.get(intelligenceContextEvents.stream.toEventName())
    if (!handler) {
      throw new Error('Context stream handler was not registered')
    }
    const streamContext = {
      ...pluginContext(),
      emit: vi.fn(),
      end: vi.fn(),
      isCancelled: vi.fn(() => false)
    } as unknown as StreamContext<unknown>

    await handler(payload, streamContext)

    expect(contextExecutionMocks.stream).toHaveBeenCalledWith(payload, {
      id: 'plugin:third-party-plugin',
      type: 'plugin'
    })
    expect(streamContext.emit).toHaveBeenCalledWith(streamEvent)
    expect(streamContext.end).toHaveBeenCalledOnce()
  })

  it('keeps pure memory policy evaluation available to plugins', async () => {
    const payload = { content: 'plugin-safe preference', type: 'preference', scope: 'global' }
    const result = { eligible: true, reason: 'policy-safe' }
    contextHygieneMocks.evaluateMemory.mockResolvedValueOnce(result)
    const handler = getContextHandler(registerContextHandlers(), 'evaluateMemory')

    await expect(handler(payload, pluginContext())).resolves.toBe(result)
    expect(contextHygieneMocks.evaluateMemory).toHaveBeenCalledWith(payload)
  })
})
