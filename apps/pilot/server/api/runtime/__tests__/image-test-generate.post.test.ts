import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readBodyMock = vi.hoisted(() => vi.fn())

const authMocks = vi.hoisted(() => ({
  requirePilotAuth: vi.fn(),
}))

const toolGatewayMocks = vi.hoisted(() => ({
  executePilotImageGenerateTool: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/pilot-tool-gateway', () => toolGatewayMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  handler = (await import('../image-test/generate.post')).default as (event: any) => Promise<any>
})

describe('/api/runtime/image-test/generate POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requirePilotAuth.mockReturnValue({
      userId: 'user_1',
      isAuthenticated: true,
      source: 'session-cookie',
    })
  })

  it('生成图像成功并返回 callId 与耗时', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      prompt: 'Generate an icon',
      size: '1536x1024',
      count: 2,
      timeoutMs: 20_000,
    })
    toolGatewayMocks.executePilotImageGenerateTool.mockResolvedValue({
      callId: 'call_1',
      toolId: 'tool.image.generate',
      toolName: 'image.generate',
      riskLevel: 'low',
      sources: [],
      images: [
        {
          url: 'https://cdn.example.com/generated.png',
          revisedPrompt: 'A clean icon',
        },
      ],
    })

    const result = await handler({})

    expect(toolGatewayMocks.executePilotImageGenerateTool).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Generate an icon',
      size: '1536x1024',
      count: 2,
      channel: expect.objectContaining({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        model: 'gpt-image-1',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 20_000,
      }),
    }))
    expect(result).toMatchObject({
      code: 200,
      message: 'success',
      data: {
        callId: 'call_1',
        images: [
          {
            url: 'https://cdn.example.com/generated.png',
            revisedPrompt: 'A clean icon',
          },
        ],
      },
    })
    expect(typeof result.data.durationMs).toBe('number')
  })

  it('size 非法时返回 400', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      prompt: 'Generate an icon',
      size: 'bad-size',
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(toolGatewayMocks.executePilotImageGenerateTool).not.toHaveBeenCalled()
  })

  it('上游失败时映射为 502', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      prompt: 'Generate an icon',
    })
    toolGatewayMocks.executePilotImageGenerateTool.mockRejectedValue(new Error('upstream failed'))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
