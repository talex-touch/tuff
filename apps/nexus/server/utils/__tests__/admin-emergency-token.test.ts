import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  adminControl: {
    emergencyJwtSecret: 'unit-test-emergency-secret-123456',
  },
}

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

function createEvent(headers: Record<string, string> = {}, env?: Record<string, unknown>) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    context: env === undefined ? {} : { cloudflare: { env } },
    node: {
      req: {
        headers: normalized,
      },
    },
  } as any
}

describe('adminEmergencyToken', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    runtimeConfig.adminControl.emergencyJwtSecret = 'unit-test-emergency-secret-123456'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
  })
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

    // Flip a bit in the decoded signature rather than editing the base64url text.
    // The previous `${token.slice(0, -2)}xx` failed roughly 1 in 1024 runs: a 32-byte
    // signature is 43 base64url chars, and the last one carries only 4 meaningful
    // bits, so for a signature ending in `xw` the `xx` text decodes to the very same
    // bytes and the token verifies — correctly, because it was never really tampered.
    const [headerPart, payloadPart, signaturePart] = token.split('.')
    const signature = Buffer.from(signaturePart, 'base64url')
    signature[0] ^= 0x01
    const tampered = `${headerPart}.${payloadPart}.${signature.toString('base64url')}`

    const claims = verifyAdminEmergencyToken(event, tampered)
    expect(claims).toBeNull()
  })

  it.each(['', 'short', 'change-me-admin-emergency-jwt-secret', 'replace-with-local-secret'])(
    'rejects unsafe emergency JWT credential in production: %s',
    async credential => {
      process.env.NODE_ENV = 'production'
      runtimeConfig.adminControl.emergencyJwtSecret = credential
      const { signAdminEmergencyToken } = await import('../adminEmergencyToken')

      expect(() =>
        signAdminEmergencyToken(createEvent(), {
          admin_id: 'admin-1',
          scope: ['risk.case.review'],
          dfp_hash: 'dfp-hash',
          nonce: 'nonce-1',
          iv: 'v1',
          jti: 'jti-1',
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
          variableName: 'ADMIN_EMERGENCY_JWT_SECRET',
        }),
      )
    },
  )

  it('does not replace a missing Cloudflare emergency Secret with runtime config', async () => {
    process.env.NODE_ENV = 'production'
    const { signAdminEmergencyToken } = await import('../adminEmergencyToken')

    expect(() =>
      signAdminEmergencyToken(createEvent({}, {}), {
        admin_id: 'admin-1',
        scope: ['risk.case.review'],
        dfp_hash: 'dfp-hash',
        nonce: 'nonce-1',
        iv: 'v1',
        jti: 'jti-1',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'ADMIN_EMERGENCY_JWT_SECRET',
      }),
    )
  })

  it('可以解析 Authorization Bearer token', async () => {
    const { parseBearerToken } = await import('../adminEmergencyToken')
    const event = createEvent({
      authorization: 'Bearer token-abc',
    })
    expect(parseBearerToken(event)).toBe('token-abc')
  })
})
