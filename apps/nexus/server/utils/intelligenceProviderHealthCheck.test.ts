import type { ProviderRegistryRecord } from './providerRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkIntelligenceProviderRegistryMirror,
  isIntelligenceProviderRegistryMirror,
} from './intelligenceProviderHealthCheck'

const labMocks = vi.hoisted(() => ({
  probeIntelligenceLabProvider: vi.fn(),
}))

const visionOcrMocks = vi.hoisted(() => ({
  invokeIntelligenceVisionOcr: vi.fn(),
}))

vi.mock('./tuffIntelligenceLabService', () => labMocks)
vi.mock('./intelligenceVisionOcrProvider', () => visionOcrMocks)

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'prv_ai_registry',
    name: 'ip_ai_provider_1',
    displayName: 'OpenAI Main',
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: 'secure://providers/intelligence-ip_ai_provider_1',
    ownerScope: 'user',
    ownerId: 'admin-user-1',
    description: null,
    endpoint: 'https://api.openai.com/v1',
    region: null,
    metadata: {
      source: 'intelligence',
      intelligenceProviderId: 'ip_ai_provider_1',
      intelligenceType: 'openai',
    },
    capabilities: [
      {
        id: 'cap_chat',
        providerId: 'prv_ai_registry',
        capability: 'chat.completion',
        schemaRef: 'nexus://schemas/provider/chat-completion.v1',
        metering: { unit: 'token' },
        constraints: null,
        metadata: null,
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    ],
    createdBy: 'admin-user-1',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('intelligenceProviderHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    labMocks.probeIntelligenceLabProvider.mockResolvedValue({
      success: true,
      providerId: 'ip_ai_provider_1',
      providerName: 'OpenAI Main',
      providerType: 'openai',
      model: 'gpt-4.1-mini',
      output: 'pong',
      latency: 42,
      endpoint: 'langchain:openai:chat',
      traceId: 'trace_ai_probe_1',
      fallbackCount: 0,
      retryCount: 0,
      attemptedProviders: ['ip_ai_provider_1'],
      message: 'Probe completed.',
    })
    visionOcrMocks.invokeIntelligenceVisionOcr.mockResolvedValue({
      output: {
        text: 'hello',
        language: 'en',
        engine: 'cloud',
      },
      providerRequestId: 'req_ocr_probe_1',
      latencyMs: 58,
      usage: { unit: 'image', quantity: 1, billable: true, estimated: true },
    })
  })

  it('识别 intelligence registry mirror', () => {
    expect(isIntelligenceProviderRegistryMirror(provider())).toBe(true)
    expect(isIntelligenceProviderRegistryMirror(provider({ metadata: { source: 'translation' } }))).toBe(false)
  })

  it('将 registry provider check 映射到 intelligence provider probe', async () => {
    const result = await checkIntelligenceProviderRegistryMirror({} as any, 'request-user', provider(), {
      capability: 'text.chat',
      model: 'gpt-4.1-mini',
      prompt: 'ping',
      timeoutMs: 8000,
    })

    expect(labMocks.probeIntelligenceLabProvider).toHaveBeenCalledWith(expect.anything(), 'admin-user-1', {
      providerId: 'ip_ai_provider_1',
      model: 'gpt-4.1-mini',
      prompt: 'ping',
      timeoutMs: 8000,
    })
    expect(result).toMatchObject({
      success: true,
      providerId: 'prv_ai_registry',
      capability: 'chat.completion',
      latency: 42,
      endpoint: 'langchain:openai:chat',
      requestId: 'trace_ai_probe_1',
    })
    expect(JSON.stringify(result)).not.toContain('secure://providers')
  })

  it('拒绝未声明能力且不调用 provider probe', async () => {
    const result = await checkIntelligenceProviderRegistryMirror({} as any, 'admin-user-1', provider(), {
      capability: 'vision.ocr',
    })

    expect(result).toMatchObject({
      success: false,
      capability: 'vision.ocr',
      error: { code: 'CAPABILITY_UNSUPPORTED' },
    })
    expect(labMocks.probeIntelligenceLabProvider).not.toHaveBeenCalled()
    expect(visionOcrMocks.invokeIntelligenceVisionOcr).not.toHaveBeenCalled()
  })

  it('vision.ocr check 调用默认 OCR adapter 而不是 chat probe', async () => {
    const result = await checkIntelligenceProviderRegistryMirror({} as any, 'request-user', provider({
      capabilities: [
        {
          id: 'cap_vision_ocr',
          providerId: 'prv_ai_registry',
          capability: 'vision.ocr',
          schemaRef: 'nexus://schemas/provider/vision-ocr.v1',
          metering: { unit: 'image' },
          constraints: null,
          metadata: null,
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T00:00:00.000Z',
        },
      ],
    }), {
      capability: 'vision.ocr',
      imageDataUrl: 'data:image/png;base64,abc123',
      language: 'en',
      prompt: 'ocr probe',
    })

    expect(visionOcrMocks.invokeIntelligenceVisionOcr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prv_ai_registry' }),
      expect.objectContaining({
        source: { type: 'data-url', dataUrl: 'data:image/png;base64,abc123' },
        language: 'en',
        prompt: 'ocr probe',
        includeLayout: true,
        includeKeywords: true,
      }),
    )
    expect(labMocks.probeIntelligenceLabProvider).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      providerId: 'prv_ai_registry',
      capability: 'vision.ocr',
      latency: 58,
      endpoint: 'https://api.openai.com/v1',
      requestId: 'req_ocr_probe_1',
      message: 'Intelligence vision OCR check succeeded.',
    })
    expect(JSON.stringify(result)).not.toContain('secure://providers')
  })

  it('将 probe 失败映射为 provider health check 失败结果', async () => {
    labMocks.probeIntelligenceLabProvider.mockRejectedValueOnce(new Error('Provider API key is missing.'))

    const result = await checkIntelligenceProviderRegistryMirror({} as any, 'admin-user-1', provider())

    expect(result).toMatchObject({
      success: false,
      providerId: 'prv_ai_registry',
      capability: 'chat.completion',
      endpoint: 'https://api.openai.com/v1',
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Provider API key is missing.',
      },
    })
  })
})
