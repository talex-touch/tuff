import type { ProviderRegistryRecord } from './providerRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceVisionOcr } from './intelligenceVisionOcrProvider'

const credentialMocks = vi.hoisted(() => ({
  getProviderCredential: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('./providerCredentialStore', () => credentialMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'prv_ai_vision',
    name: 'ip_ai_vision',
    displayName: 'OpenAI Vision',
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: 'secure://providers/intelligence-ip_ai_vision',
    ownerScope: 'user',
    ownerId: 'user_1',
    description: null,
    endpoint: 'https://api.openai.com/v1',
    region: null,
    metadata: {
      source: 'intelligence',
      intelligenceProviderId: 'ip_ai_vision',
      intelligenceType: 'openai',
      defaultModel: 'gpt-4.1-mini',
      models: ['gpt-4.1-mini'],
      timeout: 9000,
    },
    capabilities: [
      {
        id: 'cap_vision_ocr',
        providerId: 'prv_ai_vision',
        capability: 'vision.ocr',
        schemaRef: 'nexus://schemas/provider/vision-ocr.v1',
        metering: { unit: 'image' },
        constraints: null,
        metadata: null,
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    ],
    createdBy: 'user_1',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('intelligenceVisionOcrProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: 'sk-test' })
    networkMocks.request.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      ok: true,
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'x-request-id': 'req_header_ocr' },
      data: {
        id: 'chatcmpl_ocr_1',
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: 'hello',
                language: 'en',
                confidence: 0.91,
                keywords: ['hello'],
                blocks: [
                  {
                    text: 'hello',
                    language: 'en',
                    confidence: 0.9,
                    boundingBox: [1, 2, 3, 4],
                    type: 'line',
                  },
                ],
              }),
            },
          },
        ],
      },
    })
  })

  it('调用 OpenAI-compatible 多模态 chat completion 并标准化 OCR JSON 输出', async () => {
    const result = await invokeIntelligenceVisionOcr({} as any, provider(), {
      source: {
        type: 'data-url',
        dataUrl: 'data:image/png;base64,abc123',
      },
      language: 'en',
      includeLayout: true,
      includeKeywords: true,
    })

    expect(credentialMocks.getProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      'secure://providers/intelligence-ip_ai_vision',
    )
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      timeoutMs: 9000,
      headers: expect.objectContaining({
        Authorization: 'Bearer sk-test',
      }),
      body: expect.objectContaining({
        model: 'gpt-4.1-mini',
        temperature: 0,
        messages: [
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ]),
          }),
        ],
      }),
    }))
    expect(JSON.stringify(networkMocks.request.mock.calls[0]?.[0]?.body)).not.toContain('sk-test')
    expect(result).toMatchObject({
      providerRequestId: 'chatcmpl_ocr_1',
      output: {
        text: 'hello',
        language: 'en',
        confidence: 0.91,
        engine: 'cloud',
        keywords: ['hello'],
        blocks: [
          expect.objectContaining({
            text: 'hello',
            boundingBox: [1, 2, 3, 4],
            type: 'line',
          }),
        ],
      },
      usage: {
        unit: 'image',
        quantity: 1,
        billable: true,
        estimated: true,
      },
    })
  })

  it('provider 返回非 JSON 文本时退化为 text 输出', async () => {
    networkMocks.request.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      ok: true,
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {},
      data: {
        id: 'chatcmpl_plain_1',
        choices: [
          {
            message: {
              content: 'Plain OCR text',
            },
          },
        ],
      },
    })

    const result = await invokeIntelligenceVisionOcr({} as any, provider({
      vendor: 'deepseek',
      endpoint: 'https://api.deepseek.com',
      metadata: {
        source: 'intelligence',
        intelligenceProviderId: 'ip_deepseek_vision',
        intelligenceType: 'deepseek',
        defaultModel: 'deepseek-chat',
      },
    }), {
      imageBase64: 'abc123',
    })

    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.deepseek.com/v1/chat/completions',
    }))
    expect(result.output).toMatchObject({
      text: 'Plain OCR text',
      engine: 'cloud',
    })
    expect(result.output.keywords).toContain('Plain')
  })

  it('缺少 secure store credential 时返回鉴权错误', async () => {
    credentialMocks.getProviderCredential.mockResolvedValueOnce(null)

    await expect(invokeIntelligenceVisionOcr({} as any, provider(), {
      source: { type: 'data-url', dataUrl: 'data:image/png;base64,abc123' },
    })).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Provider API key credential is missing.',
    })

    expect(networkMocks.request).not.toHaveBeenCalled()
  })

  it('拒绝非 OpenAI-compatible intelligence provider', async () => {
    await expect(invokeIntelligenceVisionOcr({} as any, provider({
      vendor: 'custom',
      metadata: {
        source: 'intelligence',
        intelligenceProviderId: 'ip_local_vision',
        intelligenceType: 'local',
        defaultModel: 'llava',
      },
    }), {
      source: { type: 'data-url', dataUrl: 'data:image/png;base64,abc123' },
    })).rejects.toMatchObject({
      statusCode: 501,
      statusMessage: 'Intelligence vision OCR adapter only supports OpenAI-compatible providers.',
    })

    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})
