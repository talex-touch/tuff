import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'

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

type ContextHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface ContextChannelRegistrar {
  registerContextChannels: (register: unknown) => void
}

async function registerContextHandlers() {
  const { IntelligenceModule } = await import('./intelligence-module')
  const { intelligenceContextEvents } =
    await import('@talex-touch/utils/transport/sdk/domains/intelligence')
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
  return { handlers, intelligenceContextEvents }
}

describe('intelligenceModule context ownership boundary', () => {
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
      const { handlers, intelligenceContextEvents } = await registerContextHandlers()
      const handler = handlers.get(intelligenceContextEvents[eventKey].toEventName())
      const pluginContext = {
        plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
      } as HandlerContext

      expect(handler).toBeDefined()
      await expect(handler?.(payload, pluginContext)).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      )
    },
    15_000
  )
})
