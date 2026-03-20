import { networkClient } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPilotWebsearchDatasourceConfig,
  resolveWebsearchProviderApiKey,
} from '../pilot-admin-datasource-config'
import {
  createPilotToolApprovalTicket,
  findLatestPilotToolApprovalByRequestHash,
  updatePilotToolApprovalTicketResult,
} from '../pilot-tool-approvals'
import {
  createPilotVideoGenerateNotImplementedError,
  executePilotAudioSttTool,
  executePilotAudioTranscribeTool,
  executePilotAudioTtsTool,
  executePilotImageEditTool,
  executePilotImageGenerateTool,
  executePilotWebsearchTool,
  PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE,
  PilotToolApprovalRequiredError,
} from '../pilot-tool-gateway'
import {
  createGatewayWebsearchConnector,
  createWebsearchProviderConnector,
} from '../pilot-websearch-connector'
import { savePilotRuntimeMediaCache } from '../pilot-runtime-media-cache'

vi.mock('../pilot-admin-datasource-config', () => ({
  getPilotWebsearchDatasourceConfig: vi.fn(),
  resolveWebsearchProviderApiKey: vi.fn(),
}))

vi.mock('../pilot-tool-approvals', () => ({
  createPilotToolApprovalTicket: vi.fn(),
  findLatestPilotToolApprovalByRequestHash: vi.fn(),
  updatePilotToolApprovalTicketResult: vi.fn(),
}))

vi.mock('../pilot-websearch-connector', () => ({
  createGatewayWebsearchConnector: vi.fn(),
  createWebsearchProviderConnector: vi.fn(),
  dedupeNormalizedDocuments: (docs: any[]) => docs,
  isAllowlistedDomain: (domain: string, allowlistDomains: string[]) => {
    return allowlistDomains.includes(domain)
  },
}))

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: vi.fn(),
  },
}))

vi.mock('../pilot-runtime-media-cache', () => ({
  savePilotRuntimeMediaCache: vi.fn().mockImplementation(() => ({
    id: 'mock',
    url: '/api/runtime/media-cache/mock',
    expiresAt: Date.now() + 60_000,
    size: 16,
    mimeType: 'application/octet-stream',
  })),
}))

function createWebsearchDatasource(overrides: Record<string, unknown> = {}) {
  return {
    providers: [
      {
        id: 'searxng-main',
        type: 'searxng',
        enabled: true,
        priority: 10,
        baseUrl: 'https://searxng.example.com',
        apiKeyEncrypted: '',
        timeoutMs: 8_000,
        maxResults: 3,
      },
      {
        id: 'serper-backup',
        type: 'serper',
        enabled: true,
        priority: 20,
        baseUrl: 'https://google.serper.dev',
        apiKeyEncrypted: '',
        timeoutMs: 8_000,
        maxResults: 3,
      },
    ],
    aggregation: {
      mode: 'hybrid',
      targetResults: 3,
      minPerProvider: 1,
      dedupeKey: 'url',
      stopWhenEnough: true,
    },
    crawl: {
      enabled: true,
      timeoutMs: 8_000,
      maxContentChars: 8_000,
    },
    allowlistDomains: ['docs.openai.com'],
    ttlMinutes: 30,
    builtinSources: [],
    gatewayBaseUrl: '',
    apiKeyRef: '',
    timeoutMs: 8_000,
    maxResults: 3,
    crawlEnabled: true,
    ...overrides,
  } as any
}

describe('pilot-tool-gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.mocked(resolveWebsearchProviderApiKey).mockReturnValue('provider-key')
    vi.mocked(findLatestPilotToolApprovalByRequestHash).mockResolvedValue(null)
    vi.mocked(updatePilotToolApprovalTicketResult).mockResolvedValue()
    vi.mocked(createPilotToolApprovalTicket).mockResolvedValue(null as any)
  })

  it('provider 池命中时输出 completed，且不触发 fallback', async () => {
    vi.mocked(getPilotWebsearchDatasourceConfig).mockResolvedValue(createWebsearchDatasource())
    vi.mocked(createWebsearchProviderConnector).mockReturnValue({
      search: vi.fn().mockResolvedValue([
        {
          url: 'https://docs.openai.com/a',
          title: 'A',
          snippet: 'A snippet',
          domain: 'docs.openai.com',
        },
      ]),
      fetch: vi.fn().mockResolvedValue({
        url: 'https://docs.openai.com/a',
        title: 'A',
        snippet: 'A snippet',
        content: 'content A',
        contentType: 'text/plain',
      }),
      extract: vi.fn().mockResolvedValue({
        url: 'https://docs.openai.com/a',
        title: 'A',
        snippet: 'A snippet',
        content: 'content A',
        domain: 'docs.openai.com',
        urlHash: 'u-a',
        contentHash: 'c-a',
      }),
    } as any)

    const audits: string[] = []
    const result = await executePilotWebsearchTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      query: 'openai docs',
      emitAudit: async (payload) => {
        audits.push(payload.auditType)
      },
    })

    expect(result).toBeTruthy()
    expect(result?.sources.length).toBe(1)
    expect(result?.connectorSource).toBe('gateway')
    expect(result?.providerUsed).toEqual(['searxng-main'])
    expect(result?.fallbackUsed).toBe(false)
    expect(audits).toEqual(['tool.call.started', 'tool.call.completed'])
  })

  it('高风险域名命中时触发审批 required', async () => {
    vi.mocked(getPilotWebsearchDatasourceConfig).mockResolvedValue(createWebsearchDatasource())
    vi.mocked(createPilotToolApprovalTicket).mockResolvedValue({
      ticketId: 'ticket_1',
      sessionId: 's1',
      userId: 'u1',
      requestId: 'r1',
      requestHash: 'hash',
      callId: 'call_1',
      toolId: 'tool.websearch',
      toolName: 'websearch',
      riskLevel: 'high',
      status: 'pending',
      sources: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)
    vi.mocked(createWebsearchProviderConnector).mockReturnValue({
      search: vi.fn().mockResolvedValue([
        {
          url: 'https://untrusted.example.com/a',
          title: 'A',
          snippet: 'A snippet',
          domain: 'untrusted.example.com',
        },
      ]),
      fetch: vi.fn().mockResolvedValue({
        url: 'https://untrusted.example.com/a',
        title: 'A',
        snippet: 'A snippet',
        content: 'content A',
        contentType: 'text/plain',
      }),
      extract: vi.fn().mockResolvedValue({
        url: 'https://untrusted.example.com/a',
        title: 'A',
        snippet: 'A snippet',
        content: 'content A',
        domain: 'untrusted.example.com',
        urlHash: 'u-a',
        contentHash: 'c-a',
      }),
    } as any)

    const audits: string[] = []
    await expect(() => executePilotWebsearchTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      query: 'untrusted source',
      emitAudit: async (payload) => {
        audits.push(payload.auditType)
      },
    })).rejects.toBeInstanceOf(PilotToolApprovalRequiredError)

    expect(audits).toEqual(['tool.call.started', 'tool.call.approval_required'])
  })

  it('provider 结果不足时回退 responses_builtin', async () => {
    vi.mocked(getPilotWebsearchDatasourceConfig).mockResolvedValue(createWebsearchDatasource({
      allowlistDomains: ['platform.openai.com'],
      providers: [
        {
          id: 'searxng-main',
          type: 'searxng',
          enabled: true,
          priority: 10,
          baseUrl: 'https://searxng.example.com',
          apiKeyEncrypted: '',
          timeoutMs: 8_000,
          maxResults: 2,
        },
      ],
      aggregation: {
        mode: 'hybrid',
        targetResults: 2,
        minPerProvider: 1,
        dedupeKey: 'url',
        stopWhenEnough: true,
      },
    }))
    vi.mocked(createWebsearchProviderConnector).mockReturnValue({
      search: vi.fn().mockResolvedValue([]),
      fetch: vi.fn(),
      extract: vi.fn(),
    } as any)

    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        output_text: '请参考 https://platform.openai.com/docs/models',
        output: [
          {
            content: [
              {
                text: 'OpenAI models docs',
                annotations: [
                  {
                    url: 'https://platform.openai.com/docs/models',
                    title: 'OpenAI Docs',
                  },
                ],
              },
            ],
          },
        ],
      },
    } as any)

    const result = await executePilotWebsearchTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      query: 'openai models',
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-5.2',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 12_000,
      },
    })

    expect(result).toBeTruthy()
    expect(result?.connectorSource).toBe('responses_builtin')
    expect(result?.fallbackUsed).toBe(true)
    expect(result?.sources.length).toBeGreaterThan(0)
  })

  it('provider 与 fallback 都不可用时返回 null 并记录失败审计', async () => {
    vi.mocked(getPilotWebsearchDatasourceConfig).mockResolvedValue(createWebsearchDatasource({
      providers: [
        {
          id: 'searxng-main',
          type: 'searxng',
          enabled: true,
          priority: 10,
          baseUrl: 'https://searxng.example.com',
          apiKeyEncrypted: '',
          timeoutMs: 8_000,
          maxResults: 2,
        },
      ],
    }))
    vi.mocked(createWebsearchProviderConnector).mockReturnValue({
      search: vi.fn().mockResolvedValue([]),
      fetch: vi.fn(),
      extract: vi.fn(),
    } as any)

    const audits: string[] = []
    const result = await executePilotWebsearchTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      query: 'no result',
      emitAudit: async (payload) => {
        audits.push(payload.auditType)
      },
    })

    expect(result).toBeNull()
    expect(audits).toEqual(['tool.call.started', 'tool.call.failed'])
  })

  it('emits started/completed for image generation', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            url: 'https://cdn.example.com/generated.png',
            revised_prompt: 'A clean icon',
          },
        ],
      },
    } as any)

    const audits: string[] = []
    const result = await executePilotImageGenerateTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      prompt: 'Generate a clean icon',
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-image-1',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 30_000,
      },
      emitAudit: async (payload) => {
        audits.push(payload.auditType)
      },
    })

    expect(result).toBeTruthy()
    expect(result?.images.length).toBe(1)
    expect(result?.sources.length).toBe(1)
    expect(audits).toEqual(['tool.call.started', 'tool.call.completed'])

    const firstCall = vi.mocked(networkClient.request).mock.calls[0]?.[0] as { body?: string } | undefined
    const payload = firstCall?.body ? JSON.parse(firstCall.body) : {}
    expect(payload.size).toBe('1024x1024')
    expect(payload.n).toBe(1)
  })

  it('passes explicit image size/count to upstream request', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            url: 'https://cdn.example.com/generated-large.png',
          },
        ],
      },
    } as any)

    await executePilotImageGenerateTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r2',
      prompt: 'Generate a poster',
      size: '1536x1024',
      count: 2,
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-image-1',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 30_000,
      },
    })

    const firstCall = vi.mocked(networkClient.request).mock.calls[0]?.[0] as { body?: string } | undefined
    const payload = firstCall?.body ? JSON.parse(firstCall.body) : {}
    expect(payload.size).toBe('1536x1024')
    expect(payload.n).toBe(2)
  })

  it('fails when image generation returns empty output', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        data: [],
      },
    } as any)

    await expect(() => executePilotImageGenerateTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r3',
      prompt: 'Generate a clean icon',
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-image-1',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 30_000,
      },
    })).rejects.toBeInstanceOf(Error)
  })

  it('emits failed when image generation adapter is unsupported', async () => {
    const audits: string[] = []
    await expect(() => executePilotImageGenerateTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      prompt: 'Generate a clean icon',
      channel: {
        baseUrl: 'https://api.example.com',
        apiKey: 'key',
        model: 'model-x',
        adapter: 'legacy',
        transport: 'responses',
        timeoutMs: 30_000,
      },
      emitAudit: async (payload) => {
        audits.push(payload.auditType)
      },
    })).rejects.toBeInstanceOf(Error)

    expect(audits).toEqual(['tool.call.started', 'tool.call.failed'])
  })

  it('legacy provider 会走 gateway connector', async () => {
    vi.mocked(getPilotWebsearchDatasourceConfig).mockResolvedValue(createWebsearchDatasource({
      providers: [
        {
          id: 'legacy-gateway',
          type: 'searxng',
          enabled: true,
          priority: 5,
          baseUrl: 'https://legacy-gateway.example.com',
          apiKeyEncrypted: '',
          timeoutMs: 8_000,
          maxResults: 2,
        },
      ],
      aggregation: {
        mode: 'sequential',
        targetResults: 2,
        minPerProvider: 1,
        dedupeKey: 'url',
        stopWhenEnough: true,
      },
      allowlistDomains: ['docs.openai.com'],
    }))

    vi.mocked(createGatewayWebsearchConnector).mockReturnValue({
      search: vi.fn().mockResolvedValue([
        {
          url: 'https://docs.openai.com/legacy',
          title: 'Legacy',
          snippet: 'Legacy snippet',
          domain: 'docs.openai.com',
        },
      ]),
      fetch: vi.fn().mockResolvedValue({
        url: 'https://docs.openai.com/legacy',
        title: 'Legacy',
        snippet: 'Legacy snippet',
        content: 'Legacy content',
        contentType: 'text/plain',
      }),
      extract: vi.fn().mockResolvedValue({
        url: 'https://docs.openai.com/legacy',
        title: 'Legacy',
        snippet: 'Legacy snippet',
        content: 'Legacy content',
        domain: 'docs.openai.com',
        urlHash: 'u-legacy',
        contentHash: 'c-legacy',
      }),
    } as any)

    const result = await executePilotWebsearchTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r1',
      query: 'legacy gateway',
    })

    expect(result).toBeTruthy()
    expect(result?.providerUsed).toEqual(['legacy-gateway'])
    expect(createGatewayWebsearchConnector).toHaveBeenCalledTimes(1)
  })

  it('image.edit 支持 b64 输出并返回 URL-first 结果', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            b64_json: Buffer.from('image-bytes').toString('base64'),
            revised_prompt: 'edited prompt',
          },
        ],
      },
    } as any)

    const result = await executePilotImageEditTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r-image-edit',
      prompt: 'edit this image',
      image: {
        base64: Buffer.from('input-image').toString('base64'),
        mimeType: 'image/png',
        filename: 'image.png',
      },
      output: {
        includeBase64: true,
      },
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-image-1',
        adapter: 'openai',
        transport: 'responses',
      },
    })

    expect(result?.images.length).toBe(1)
    expect(result?.images[0]?.url).toBe('/api/runtime/media-cache/mock')
    expect(result?.images[0]?.base64).toBeTruthy()
    expect(savePilotRuntimeMediaCache).toHaveBeenCalled()
  })

  it('audio.tts 返回 URL-first 结果', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    } as any)

    const result = await executePilotAudioTtsTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r-audio-tts',
      text: 'hello world',
      output: {
        includeBase64: false,
      },
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-4o-mini-tts',
        adapter: 'openai',
        transport: 'responses',
      },
    })

    expect(result?.audio.url).toBe('/api/runtime/media-cache/mock')
    expect(result?.audio.base64).toBeUndefined()
  })

  it('audio.stt 与 audio.transcribe 解析文本输出', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        text: 'hello transcript',
        language: 'en',
      },
    } as any)

    const base64Audio = Buffer.from('fake wav').toString('base64')
    const sttResult = await executePilotAudioSttTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r-audio-stt',
      audio: {
        base64: base64Audio,
        mimeType: 'audio/wav',
      },
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-4o-mini-transcribe',
        adapter: 'openai',
        transport: 'responses',
      },
    })
    const transcribeResult = await executePilotAudioTranscribeTool({
      event: {} as any,
      userId: 'u1',
      sessionId: 's1',
      requestId: 'r-audio-transcribe',
      audio: {
        base64: base64Audio,
        mimeType: 'audio/wav',
      },
      channel: {
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'gpt-4o-transcribe',
        adapter: 'openai',
        transport: 'responses',
      },
    })

    expect(sttResult?.text).toBe('hello transcript')
    expect(transcribeResult?.text).toBe('hello transcript')
  })

  it('video.generate 返回未实现错误', () => {
    const error = createPilotVideoGenerateNotImplementedError() as Error & { code?: string }
    expect(error.code).toBe(PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE)
  })
})
