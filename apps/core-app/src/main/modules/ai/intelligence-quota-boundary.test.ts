import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    setSentryServiceInstance: vi.fn(),
  }
})

const quotaManagerMocks = vi.hoisted(() => ({
  setQuota: vi.fn(async () => undefined),
}))
const intelligenceEventMocks = vi.hoisted(() => {
  const event = (name: string) => ({ toEventName: () => name })
  return {
    intelligenceApiEvents: {
      invoke: event('intelligence:api:invoke'),
      stream: event('intelligence:api:stream'),
      ttsSpeak: event('intelligence:api:tts-speak'),
      chatLangChain: event('intelligence:api:chat-langchain'),
      getQuota: event('intelligence:api:get-quota'),
      setQuota: event('intelligence:api:set-quota'),
      deleteQuota: event('intelligence:api:delete-quota'),
      getAllQuotas: event('intelligence:api:get-all-quotas'),
      checkQuota: event('intelligence:api:check-quota'),
      getCurrentUsage: event('intelligence:api:get-current-usage'),
    },
    intelligenceContextEvents: {
      execute: event('intelligence:context:execute'),
      stream: event('intelligence:context:stream'),
    },
  }
})

vi.mock('@talex-touch/utils/transport/sdk/domains/intelligence', () => ({
  ...intelligenceEventMocks,
  intelligenceKnowledgeEvents: {},
}))
vi.mock('@talex-touch/utils/transport/events/types', () => ({
  isIntelligenceErrorCode: vi.fn(() => false),
}))

vi.mock('./intelligence-quota-manager', () => ({
  intelligenceQuotaManager: {
    setQuota: quotaManagerMocks.setQuota,
  },
}))

type QuotaHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface QuotaChannelRegistrar {
  registerQuotaChannels: (register: unknown) => void
}

async function registerQuotaHandlers() {
  const { IntelligenceModule } = await import('./intelligence-module')
  const { intelligenceApiEvents }
    = await import('@talex-touch/utils/transport/sdk/domains/intelligence')
  const handlers = new Map<string, QuotaHandler>()
  const register = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      handler: QuotaHandler,
    ) => {
      handlers.set(event.toEventName(), handler)
    },
  )

  const module = new IntelligenceModule() as unknown as QuotaChannelRegistrar
  module.registerQuotaChannels(register)
  return { handlers, intelligenceApiEvents }
}

describe('intelligenceModule quota ownership boundary', () => {
  beforeEach(() => {
    quotaManagerMocks.setQuota.mockClear()
  })

  it.each([
    {
      name: 'get quota',
      eventKey: 'getQuota',
      payload: { callerId: 'plugin.example.requester', callerType: 'plugin' },
    },
    {
      name: 'set quota',
      eventKey: 'setQuota',
      payload: {
        callerId: 'plugin.example.requester',
        callerType: 'plugin',
        requestsPerMinute: 12,
        enabled: true,
      },
    },
    {
      name: 'delete quota',
      eventKey: 'deleteQuota',
      payload: { callerId: 'plugin.example.requester', callerType: 'plugin' },
    },
    { name: 'get all quotas', eventKey: 'getAllQuotas', payload: undefined },
    {
      name: 'check quota',
      eventKey: 'checkQuota',
      payload: {
        callerId: 'plugin.example.requester',
        callerType: 'plugin',
        estimatedTokens: 128,
      },
    },
    {
      name: 'get current usage',
      eventKey: 'getCurrentUsage',
      payload: { callerId: 'plugin.example.requester', callerType: 'plugin' },
    },
  ] as const)(
    'rejects verified plugin calls to $name',
    async ({ eventKey, payload }) => {
      const { handlers, intelligenceApiEvents } = await registerQuotaHandlers()
      const handler = handlers.get(intelligenceApiEvents[eventKey].toEventName())
      const pluginContext = {
        plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true },
      } as HandlerContext

      expect(handler).toBeDefined()
      if (!handler) {
        throw new Error(`Quota handler for ${eventKey} was not registered`)
      }

      await expect(handler(payload, pluginContext)).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY',
      )
    },
    15_000,
  )

  it('runs host setQuota payload validation before quota storage access', async () => {
    const { handlers, intelligenceApiEvents } = await registerQuotaHandlers()
    const handler = handlers.get(intelligenceApiEvents.setQuota.toEventName())

    expect(handler).toBeDefined()
    if (!handler) {
      throw new Error('Set quota handler was not registered')
    }

    await expect(handler(null, {} as HandlerContext)).rejects.toThrow('Invalid quota config')
    expect(quotaManagerMocks.setQuota).not.toHaveBeenCalled()
  })
})
