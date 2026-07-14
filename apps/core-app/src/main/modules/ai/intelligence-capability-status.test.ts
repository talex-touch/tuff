import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import {
  createChatProvider,
  FakeProviderManager,
  getStorageMocks
} from './intelligence-test-harness'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { resolveCapabilityStatus } from './intelligence-capability-status'
import { setIntelligenceProviderManager } from './intelligence-sdk'

const storageMocks = getStorageMocks()

class CapabilityStatusProviderManager extends FakeProviderManager {
  registerFromConfig() {
    return undefined as never
  }
}

const chatBackedCapabilities = [
  {
    capabilityId: 'workflow.execute',
    type: IntelligenceCapabilityType.WORKFLOW,
    name: 'Workflow Execution'
  },
  {
    capabilityId: 'agent.run',
    type: IntelligenceCapabilityType.AGENT,
    name: 'Agent Execution'
  }
] as const

describe('CoreApp intelligence capability status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intelligenceCapabilityRegistry.clear()
    storageMocks.storedConfig = undefined
  })

  it.each(chatBackedCapabilities)(
    'reports only the allowed credentialed text.chat provider for $capabilityId',
    ({ capabilityId, type, name }) => {
      intelligenceCapabilityRegistry.register({
        id: capabilityId,
        type,
        name,
        description: `test ${capabilityId} chat runtime fallback`,
        supportedProviders: [IntelligenceProviderType.CUSTOM]
      })
      storageMocks.storedConfig = {
        providers: [
          {
            id: 'allowed-chat-runtime',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Allowed Chat Runtime',
            enabled: true,
            apiKey: 'allowed-runtime-key',
            capabilities: ['text.chat']
          },
          {
            id: 'undeclared-chat-runtime',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Undeclared Chat Runtime',
            enabled: true,
            apiKey: 'undeclared-runtime-key',
            capabilities: ['embedding.generate']
          },
          {
            id: 'guest-chat-runtime',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Guest Chat Runtime',
            enabled: true,
            apiKey: 'guest',
            capabilities: ['text.chat'],
            metadata: { tokenMode: 'guest' }
          },
          {
            id: 'unbound-chat-runtime',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Unbound Chat Runtime',
            enabled: true,
            apiKey: 'unbound-runtime-key',
            capabilities: ['text.chat']
          }
        ],
        globalConfig: {
          defaultStrategy: 'adaptive-default',
          enableAudit: true,
          enableCache: false
        },
        capabilities: {
          [capabilityId]: {
            id: capabilityId,
            providers: [
              { providerId: 'allowed-chat-runtime', priority: 1, enabled: true },
              { providerId: 'undeclared-chat-runtime', priority: 2, enabled: true },
              { providerId: 'guest-chat-runtime', priority: 3, enabled: true }
            ]
          }
        },
        promptRegistry: [],
        promptBindings: [],
        version: 2
      }
      setIntelligenceProviderManager(
        new CapabilityStatusProviderManager([
          createChatProvider(
            {
              id: 'allowed-chat-runtime',
              type: IntelligenceProviderType.CUSTOM,
              name: 'Allowed Chat Runtime',
              enabled: true,
              apiKey: 'allowed-runtime-key',
              capabilities: ['text.chat']
            },
            vi.fn()
          ),
          createChatProvider(
            {
              id: 'undeclared-chat-runtime',
              type: IntelligenceProviderType.CUSTOM,
              name: 'Undeclared Chat Runtime',
              enabled: true,
              apiKey: 'undeclared-runtime-key',
              capabilities: ['embedding.generate']
            },
            vi.fn()
          ),
          createChatProvider(
            {
              id: 'guest-chat-runtime',
              type: IntelligenceProviderType.CUSTOM,
              name: 'Guest Chat Runtime',
              enabled: true,
              apiKey: 'guest',
              capabilities: ['text.chat'],
              metadata: { tokenMode: 'guest' }
            },
            vi.fn()
          ),
          createChatProvider(
            {
              id: 'unbound-chat-runtime',
              type: IntelligenceProviderType.CUSTOM,
              name: 'Unbound Chat Runtime',
              enabled: true,
              apiKey: 'unbound-runtime-key',
              capabilities: ['text.chat']
            },
            vi.fn()
          )
        ])
      )

      expect(resolveCapabilityStatus(capabilityId)).toEqual({
        capabilityId,
        available: true,
        providerIds: ['allowed-chat-runtime']
      })
    }
  )
})
