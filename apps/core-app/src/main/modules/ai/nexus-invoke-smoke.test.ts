import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk,
  IntelligenceTranslatePayload,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'

const authMocks = vi.hoisted(() => ({
  getAuthToken: vi.fn()
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../auth', () => authMocks)

vi.mock('../network', () => ({
  getNetworkService: () => networkMocks
}))

vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.com'
}))

vi.mock('../../utils/perf-context', () => ({
  enterPerfContext: () => () => undefined
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      warn: vi.fn()
    }))
  })
}))

vi.mock('./intelligence-audit-logger', () => ({
  intelligenceAuditLogger: {
    log: vi.fn(),
    generateTraceId: () => 'trace-audit',
    generatePromptHash: () => 'prompt-hash'
  }
}))

vi.mock('./agents', () => ({
  agentManager: {
    isInitialized: vi.fn(() => false),
    executeTaskImmediate: vi.fn()
  }
}))

vi.mock('./intelligence-deepagent-orchestration', () => ({
  intelligenceDeepAgentOrchestrationService: {
    executeAgentCapability: vi.fn(),
    executeWorkflowCapability: vi.fn()
  }
}))

vi.mock('./intelligence-quota-manager', () => ({
  intelligenceQuotaManager: {
    checkQuota: vi.fn(async () => ({ allowed: true }))
  }
}))

import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { TuffIntelligenceSDK, setIntelligenceProviderManager } from './intelligence-sdk'
import { normalizeProviderForRuntime } from './provider-runtime'
import { createCustomProvider } from './provider-factory'
import { IntelligenceProviderManager } from './runtime/provider-manager'

class SmokeLocalProvider implements IntelligenceProviderAdapter {
  readonly type = IntelligenceProviderType.LOCAL

  constructor(private readonly config: IntelligenceProviderConfig) {}

  getConfig(): IntelligenceProviderConfig {
    return this.config
  }

  updateConfig(config: Partial<IntelligenceProviderConfig>): void {
    Object.assign(this.config, config)
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  async chat(
    _payload: IntelligenceChatPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    return {
      result: 'local fallback',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: 'local-model',
      latency: 5,
      traceId: 'trace-local-smoke',
      provider: 'local-smoke'
    }
  }

  async *chatStream(
    _payload: IntelligenceChatPayload,
    _options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    yield { delta: 'local fallback', done: true }
  }

  async embedding(
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    throw new Error('SmokeLocalProvider embedding unsupported')
  }

  async translate(
    _payload: IntelligenceTranslatePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    throw new Error('SmokeLocalProvider translate unsupported')
  }

  async visionOcr(
    _payload: IntelligenceVisionOcrPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    throw new Error('SmokeLocalProvider vision OCR unsupported')
  }
}

function createManager(): IntelligenceProviderManager {
  const manager = new IntelligenceProviderManager()
  manager.registerFactory(IntelligenceProviderType.CUSTOM, createCustomProvider)
  manager.registerFactory(
    IntelligenceProviderType.LOCAL,
    (config) => new SmokeLocalProvider(config)
  )
  return manager
}

describe('Nexus default provider invoke smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'chat smoke',
      supportedProviders: [IntelligenceProviderType.CUSTOM, IntelligenceProviderType.LOCAL]
    })
    networkMocks.request.mockResolvedValue({
      data: {
        invocation: {
          capabilityId: 'text.chat',
          result: 'nexus answer',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          model: 'nexus-model',
          latency: 25,
          traceId: 'trace-nexus-smoke',
          provider: 'tuff-nexus-default'
        }
      }
    })
  })

  it('injects login token and calls Nexus /api/v1/intelligence/invoke from tuff-nexus-default', async () => {
    authMocks.getAuthToken.mockReturnValue('app-token')
    const manager = createManager()
    manager.registerFromConfig(
      normalizeProviderForRuntime({
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        defaultModel: 'nexus-model',
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus' }
      })
    )
    setIntelligenceProviderManager(manager)

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.invoke<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(result.result).toBe('nexus answer')
    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://nexus.example.com/api/v1/intelligence/invoke',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-token'
        }),
        body: expect.objectContaining({
          capabilityId: 'text.chat',
          payload: {
            messages: [{ role: 'user', content: 'hello' }]
          }
        })
      })
    )
  })

  it('falls back when the default Nexus provider is not signed in', async () => {
    authMocks.getAuthToken.mockReturnValue(null)
    const manager = createManager()
    manager.registerFromConfig(
      normalizeProviderForRuntime({
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        name: 'Tuff Nexus',
        enabled: true,
        priority: 1,
        capabilities: ['text.chat'],
        metadata: { origin: 'tuff-nexus' }
      })
    )
    manager.registerFromConfig({
      id: 'local-smoke',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Smoke',
      enabled: true,
      priority: 2,
      models: ['local-model'],
      capabilities: ['text.chat']
    })
    setIntelligenceProviderManager(manager)

    const sdk = new TuffIntelligenceSDK({
      enableAudit: false,
      enableQuota: false,
      enableCache: false
    })

    const result = await sdk.invoke<string>('text.chat', {
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(result.result).toBe('local fallback')
    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})
