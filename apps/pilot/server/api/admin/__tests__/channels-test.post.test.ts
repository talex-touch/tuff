import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readBodyMock = vi.hoisted(() => vi.fn())

const adminAuthMocks = vi.hoisted(() => ({
  requirePilotAdmin: vi.fn(),
}))

const channelConfigMocks = vi.hoisted(() => ({
  getPilotAdminChannelCatalog: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../utils/pilot-admin-auth', () => adminAuthMocks)
vi.mock('../../../utils/pilot-admin-channel-config', () => channelConfigMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: networkMocks,
}))

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  handler = (await import('../channels/test.post')).default as (event: any) => Promise<any>
})

describe('/api/admin/channels/test POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminAuthMocks.requirePilotAdmin.mockResolvedValue({
      isAdmin: true,
      reason: 'bootstrap-email',
      auth: { userId: 'u_admin' },
    })
    channelConfigMocks.getPilotAdminChannelCatalog.mockResolvedValue({
      defaultChannelId: 'demo',
      channels: [
        {
          id: 'demo',
          name: 'Demo',
          baseUrl: 'https://api.openai.com',
          apiKey: 'sk-stored',
          priority: 100,
          model: 'gpt-5.4',
          defaultModelId: 'gpt-5.4',
          models: [{ id: 'gpt-5.4', enabled: true }],
          adapter: 'openai',
          transport: 'responses',
          timeoutMs: 90_000,
          builtinTools: ['write_todos'],
          enabled: true,
        },
      ],
    })
  })

  it('显式参数测试成功（responses）', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-live',
      model: 'gpt-5.4',
      transport: 'responses',
      timeoutMs: 12_000,
    })
    networkMocks.request.mockResolvedValue({
      status: 200,
      data: { output_text: 'pong' },
    })

    const result = await handler({})

    expect(adminAuthMocks.requirePilotAdmin).toHaveBeenCalledTimes(1)
    expect(channelConfigMocks.getPilotAdminChannelCatalog).not.toHaveBeenCalled()
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.openai.com/v1/responses',
      timeoutMs: 12_000,
      headers: expect.objectContaining({
        authorization: 'Bearer sk-live',
      }),
      body: expect.objectContaining({
        model: 'gpt-5.4',
      }),
    }))
    expect(result).toMatchObject({
      ok: true,
      model: 'gpt-5.4',
      transport: 'responses',
      preview: 'pong',
    })
  })

  it('编辑态可复用已保存渠道配置进行测试', async () => {
    readBodyMock.mockResolvedValue({
      channelId: 'demo',
      baseUrl: '',
      apiKey: '',
      model: '',
      transport: '',
    })
    networkMocks.request.mockResolvedValue({
      status: 200,
      data: {
        choices: [
          { message: { content: 'ok' } },
        ],
      },
    })
    channelConfigMocks.getPilotAdminChannelCatalog.mockResolvedValue({
      defaultChannelId: 'demo',
      channels: [
        {
          id: 'demo',
          name: 'Demo',
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-stored',
          priority: 100,
          model: 'gpt-5.4-mini',
          defaultModelId: 'gpt-5.4-mini',
          models: [{ id: 'gpt-5.4-mini', enabled: true }],
          adapter: 'openai',
          transport: 'chat.completions',
          timeoutMs: 30_000,
          builtinTools: ['write_todos'],
          enabled: true,
        },
      ],
    })

    const result = await handler({})

    expect(channelConfigMocks.getPilotAdminChannelCatalog).toHaveBeenCalledTimes(1)
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/v1/chat/completions',
      timeoutMs: 30_000,
      headers: expect.objectContaining({
        authorization: 'Bearer sk-stored',
      }),
      body: expect.objectContaining({
        model: 'gpt-5.4-mini',
      }),
    }))
    expect(result).toMatchObject({
      ok: true,
      channelId: 'demo',
      model: 'gpt-5.4-mini',
      transport: 'chat.completions',
      preview: 'ok',
    })
  })

  it('缺少 Base URL 时返回 400', async () => {
    readBodyMock.mockResolvedValue({
      apiKey: 'sk-test',
      model: 'gpt-5.4',
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(networkMocks.request).not.toHaveBeenCalled()
  })

  it('上游返回非 2xx 时映射为 502', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
    })
    networkMocks.request.mockResolvedValue({
      status: 401,
      data: { error: { message: 'Invalid API key' } },
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
