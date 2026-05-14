import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const intelligenceMocks = vi.hoisted(() => ({
  invokeIntelligenceCapability: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/tuffIntelligenceLabService', () => intelligenceMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})

let invokeHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  invokeHandler = (await import('./invoke.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/v1/intelligence/invoke',
    node: { req: { url: '/api/v1/intelligence/invoke' } },
  }
}

describe('/api/v1/intelligence/invoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_1',
      authSource: 'app',
    })
    h3Mocks.readBody.mockResolvedValue({
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      options: { modelPreference: ['gpt-4o-mini'] },
    })
    intelligenceMocks.invokeIntelligenceCapability.mockResolvedValue({
      capabilityId: 'text.chat',
      result: 'hello',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      model: 'gpt-4o-mini',
      latency: 30,
      traceId: 'trace_1',
      provider: 'ip_ai',
      metadata: {
        nexus: true,
        fallbackCount: 0,
        retryCount: 0,
        attemptedProviders: ['ip_ai'],
      },
    })
  })

  it('登录态 app/session 均可调用 Nexus intelligence capability', async () => {
    const result = await invokeHandler(makeEvent())

    expect(authMocks.requireAuth).toHaveBeenCalledWith(expect.anything())
    expect(intelligenceMocks.invokeIntelligenceCapability).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      {
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hi' }] },
        options: { modelPreference: ['gpt-4o-mini'] },
      },
    )
    expect(result).toEqual({
      invocation: expect.objectContaining({
        capabilityId: 'text.chat',
        result: 'hello',
      }),
    })
  })

  it('缺少 capabilityId 时拒绝执行', async () => {
    h3Mocks.readBody.mockResolvedValue({})

    await expect(invokeHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'capabilityId is required.',
    })
    expect(intelligenceMocks.invokeIntelligenceCapability).not.toHaveBeenCalled()
  })

  it('credits 不足时透传明确错误', async () => {
    intelligenceMocks.invokeIntelligenceCapability.mockRejectedValueOnce(
      Object.assign(new Error('CREDITS_EXCEEDED'), {
        statusCode: 402,
        statusMessage: 'CREDITS_EXCEEDED',
        data: {
          code: 'CREDITS_EXCEEDED',
          reason: 'User credits exceeded.',
        },
      }),
    )

    await expect(invokeHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: 'CREDITS_EXCEEDED',
      data: {
        code: 'CREDITS_EXCEEDED',
        reason: 'User credits exceeded.',
      },
    })
  })
})
