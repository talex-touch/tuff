import { describe, expect, it, vi } from 'vitest'
import { verifyTurnstileToken } from '../turnstile'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    turnstile: {
      secretKey: 'test-secret',
    },
  }),
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: 'login' }),
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock

    try {
      await expect(verifyTurnstileToken(createEvent({ 'cf-connecting-ip': '1.1.1.1' }), { token: 'abc', action: 'login' })).resolves.toBeUndefined()

      const payload = fetchMock.mock.calls[0]?.[1]?.body as string
      expect(payload).toContain('secret=test-secret')
      expect(payload).toContain('response=abc')
      expect(payload).toContain('remoteip=1.1.1.1')
    }
    finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  it('action 不匹配会抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: 'signup' }),
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock

    try {
      await expect(verifyTurnstileToken(createEvent(), { token: 'abc', action: 'login' })).rejects.toMatchObject({
        statusCode: 400,
      })
    }
    finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  it('siteverify 返回失败会抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock

    try {
      await expect(verifyTurnstileToken(createEvent(), { token: 'abc', action: 'login' })).rejects.toMatchObject({
        statusCode: 400,
      })
    }
    finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })
})
