import { describe, expect, it, vi } from 'vitest'
import { verifyTurnstileToken } from '../turnstile'

const networkRequest = vi.fn()

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    turnstile: {
      secretKey: 'test-secret',
    },
  }),
}))

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: (...args: unknown[]) => networkRequest(...args),
  },
}))

function createEvent(headers: Record<string, string> = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )

  return {
    node: {
      req: {
        headers: normalizedHeaders,
        socket: {
          remoteAddress: undefined,
        },
        connection: {
          remoteAddress: undefined,
        },
      },
    },
    context: {
      cloudflare: {
        request: {
          headers: {
            get(name: string) {
              return normalizedHeaders[name.toLowerCase()] ?? null
            },
          },
        },
      },
    },
  } as any
}

describe('verifyTurnstileToken', () => {
  it('缺少 token 会抛错', async () => {
    await expect(verifyTurnstileToken(createEvent(), { token: '', action: 'login' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('校验成功时通过', async () => {
    networkRequest.mockResolvedValue({
      status: 200,
      data: { success: true, action: 'login' },
    })

    await expect(verifyTurnstileToken(createEvent({ 'cf-connecting-ip': '1.1.1.1' }), { token: 'abc', action: 'login' })).resolves.toBeUndefined()

    const payload = networkRequest.mock.calls[0]?.[0]?.body as string
    expect(payload).toContain('secret=test-secret')
    expect(payload).toContain('response=abc')
    expect(payload).toContain('remoteip=1.1.1.1')
  })

  it('action 不匹配会抛错', async () => {
    networkRequest.mockResolvedValue({
      status: 200,
      data: { success: true, action: 'signup' },
    })

    await expect(verifyTurnstileToken(createEvent(), { token: 'abc', action: 'login' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('siteverify 返回失败会抛错', async () => {
    networkRequest.mockResolvedValue({
      status: 200,
      data: { success: false, 'error-codes': ['invalid-input-response'] },
    })

    await expect(verifyTurnstileToken(createEvent(), { token: 'abc', action: 'login' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})
