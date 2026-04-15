import { beforeEach, describe, expect, it, vi } from 'vitest'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

const jwtMocks = vi.hoisted(() => ({
  sign: vi.fn(),
}))

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: jwtMocks.sign,
  },
  sign: jwtMocks.sign,
}))

async function loadTarget() {
  return await import('../pilot-coze-auth')
}

describe('pilot-coze-auth', () => {
  beforeEach(() => {
    networkMocks.request.mockReset()
    jwtMocks.sign.mockReset()
    vi.clearAllMocks()
    vi.resetModules()
    jwtMocks.sign.mockReturnValue('jwt_assertion_token')
  })

  it('会按 channelId 缓存 access token', async () => {
    networkMocks.request.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'coze_token_cached',
        expires_in: 3600,
      },
    } as any)

    const { getPilotCozeAccessToken } = await loadTarget()
    const channel = {
      id: 'channel_coze_main',
      oauthClientId: 'client_id',
      oauthClientSecret: 'client_secret',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      timeoutMs: 30_000,
    }

    await expect(getPilotCozeAccessToken(channel as any)).resolves.toBe('coze_token_cached')
    await expect(getPilotCozeAccessToken(channel as any)).resolves.toBe('coze_token_cached')

    expect(networkMocks.request).toHaveBeenCalledTimes(1)
  })

  it('invalidate 后会重新拉取 token', async () => {
    networkMocks.request
      .mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'coze_token_v1',
          expires_in: 3600,
        },
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'coze_token_v2',
          expires_in: 3600,
        },
      } as any)

    const { getPilotCozeAccessToken, invalidatePilotCozeAccessToken } = await loadTarget()
    const channel = {
      id: 'channel_coze_main',
      oauthClientId: 'client_id',
      oauthClientSecret: 'client_secret',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      timeoutMs: 30_000,
    }

    await expect(getPilotCozeAccessToken(channel as any)).resolves.toBe('coze_token_v1')
    invalidatePilotCozeAccessToken('channel_coze_main')
    await expect(getPilotCozeAccessToken(channel as any)).resolves.toBe('coze_token_v2')

    expect(networkMocks.request).toHaveBeenCalledTimes(2)
  })

  it('缺少 OAuth 配置时返回稳定错误', async () => {
    const { getPilotCozeAccessToken, PILOT_COZE_OAUTH_FAILED_CODE } = await loadTarget()

    await expect(getPilotCozeAccessToken({
      id: 'channel_coze_main',
      oauthClientId: '',
      oauthClientSecret: '',
      oauthTokenUrl: '',
      timeoutMs: 30_000,
    } as any)).rejects.toMatchObject({
      code: PILOT_COZE_OAUTH_FAILED_CODE,
      statusCode: 502,
      data: {
        reason: 'missing_config',
        missing: ['oauthTokenUrl', 'oauthClientId', 'oauthClientSecret'],
      },
    })
  })

  it('服务身份凭证会走 JWT bearer token exchange', async () => {
    networkMocks.request.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'coze_jwt_token',
        expires_in: 1800,
      },
    } as any)

    const { getPilotCozeAccessToken } = await loadTarget()
    await expect(getPilotCozeAccessToken({
      id: 'channel_coze_jwt',
      cozeAuthMode: 'jwt_service',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      jwtAppId: 'app_id',
      jwtKeyId: 'key_id',
      jwtAudience: 'https://api.coze.cn',
      jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----',
      timeoutMs: 30_000,
    } as any)).resolves.toBe('coze_jwt_token')

    expect(jwtMocks.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        iss: 'app_id',
        aud: 'https://api.coze.cn',
      }),
      '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----',
      expect.objectContaining({
        algorithm: 'RS256',
        keyid: 'key_id',
      }),
    )
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.coze.cn/api/permission/oauth2/token',
      headers: expect.objectContaining({
        authorization: 'Bearer jwt_assertion_token',
      }),
      body: expect.objectContaining({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        duration_seconds: 900,
      }),
    }))
  })

  it('会探测 baseUrl 可达性', async () => {
    networkMocks.request.mockResolvedValue({
      status: 404,
      data: 'not-found',
    } as any)

    const { probePilotCozeBaseUrl } = await loadTarget()
    await expect(probePilotCozeBaseUrl({
      baseUrl: 'https://api.coze.cn/',
      timeoutMs: 15_000,
    } as any)).resolves.toEqual({
      url: 'https://api.coze.cn',
      status: 404,
    })
  })
})
