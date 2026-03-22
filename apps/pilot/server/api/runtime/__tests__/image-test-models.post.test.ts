import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const readBodyMock = vi.hoisted(() => vi.fn())

const authMocks = vi.hoisted(() => ({
  requirePilotAuth: vi.fn(),
}))

const channelModelSyncMocks = vi.hoisted(() => ({
  discoverPilotChannelModels: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: readBodyMock,
  }
})

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/pilot-channel-model-sync', () => channelModelSyncMocks)

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  handler = (await import('../image-test/models.post')).default as (event: any) => Promise<any>
})

describe('/api/runtime/image-test/models POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requirePilotAuth.mockReturnValue({
      userId: 'user_1',
      isAuthenticated: true,
      source: 'session-cookie',
    })
  })

  it('返回模型列表', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      timeoutMs: 12_000,
    })
    channelModelSyncMocks.discoverPilotChannelModels.mockResolvedValue({
      channelId: '',
      models: ['gpt-image-1', 'gpt-4.1'],
    })

    const result = await handler({})

    expect(authMocks.requirePilotAuth).toHaveBeenCalledTimes(1)
    expect(channelModelSyncMocks.discoverPilotChannelModels).toHaveBeenCalledWith({}, {
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      timeoutMs: 12_000,
    })
    expect(result).toMatchObject({
      code: 200,
      message: 'success',
      data: {
        models: ['gpt-image-1', 'gpt-4.1'],
      },
    })
  })

  it('缺少 Base URL 时返回 400', async () => {
    readBodyMock.mockResolvedValue({
      apiKey: 'sk-test',
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(channelModelSyncMocks.discoverPilotChannelModels).not.toHaveBeenCalled()
  })

  it('上游失败时映射为 502', async () => {
    readBodyMock.mockResolvedValue({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
    })
    channelModelSyncMocks.discoverPilotChannelModels.mockRejectedValue(new Error('HTTP 401'))

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
