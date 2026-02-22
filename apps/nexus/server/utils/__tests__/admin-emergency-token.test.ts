import { describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  adminControl: {
    emergencyJwtSecret: 'unit-test-emergency-secret-123456',
  },
}

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

function createEvent(headers: Record<string, string> = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )
  return {
    node: {
      req: {
        headers: normalized,
      },
    },
  } as any
}

describe('adminEmergencyToken', () => {
  it('可以签发并校验 emergency token', async () => {
    const { signAdminEmergencyToken, verifyAdminEmergencyToken } = await import('../adminEmergencyToken')
    const event = createEvent()
    const token = signAdminEmergencyToken(event, {
      admin_id: 'admin-1',
      scope: ['risk.actor.unblock'],
      dfp_hash: 'dfp-hash',
      nonce: 'nonce-1',
      iv: 'v1',
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const claims = verifyAdminEmergencyToken(event, token)
    expect(claims).toBeTruthy()
    expect(claims?.admin_id).toBe('admin-1')
    expect(claims?.scope).toEqual(['risk.actor.unblock'])
  })

  it('篡改 token 后校验失败', async () => {
    const { signAdminEmergencyToken, verifyAdminEmergencyToken } = await import('../adminEmergencyToken')
    const event = createEvent()
    const token = signAdminEmergencyToken(event, {
      admin_id: 'admin-1',
      scope: ['risk.case.review'],
      dfp_hash: 'dfp-hash',
      nonce: 'nonce-1',
      iv: 'v1',
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const tampered = `${token.slice(0, -2)}xx`
    const claims = verifyAdminEmergencyToken(event, tampered)
    expect(claims).toBeNull()
  })

  it('可以解析 Authorization Bearer token', async () => {
    const { parseBearerToken } = await import('../adminEmergencyToken')
    const event = createEvent({
      authorization: 'Bearer token-abc',
    })
    expect(parseBearerToken(event)).toBe('token-abc')
  })
})
