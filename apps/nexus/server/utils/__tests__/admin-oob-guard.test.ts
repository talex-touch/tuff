import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasOobHeaders, requireAdminOobAuth } from '../adminOobGuard'

const runtimeConfig = {
  adminControl: {
    oobAccessClientId: 'service-id',
    oobAccessClientSecret: 'service-secret',
    oobMtlsEnabled: false,
    oobMtlsFingerprints: '',
  },
}

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

function createEvent(headers: Record<string, string> = {}, fingerprint?: string) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )

  return {
    node: {
      req: {
        headers: normalized,
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
              return normalized[name.toLowerCase()] ?? null
            },
          },
          cf: {
            tlsClientAuth: {
              certFingerprintSHA256: fingerprint || null,
            },
          },
        },
      },
    },
  } as any
}

describe('adminOobGuard', () => {
  beforeEach(() => {
    runtimeConfig.adminControl.oobMtlsEnabled = false
    runtimeConfig.adminControl.oobMtlsFingerprints = ''
  })

  it('检测 OOB headers', () => {
    expect(hasOobHeaders(createEvent({
      'cf-access-client-id': 'service-id',
      'cf-access-client-secret': 'service-secret',
    }))).toBe(true)
  })

  it('service token 正确时通过', () => {
    const result = requireAdminOobAuth(createEvent({
      'cf-access-client-id': 'service-id',
      'cf-access-client-secret': 'service-secret',
      'cf-connecting-ip': '1.2.3.4',
    }))
    expect(result.actorId.startsWith('oob:')).toBe(true)
  })

  it('service token 错误时拒绝', () => {
    expect(() => requireAdminOobAuth(createEvent({
      'cf-access-client-id': 'service-id',
      'cf-access-client-secret': 'wrong-secret',
    }))).toThrowError()
  })

  it('启用 mTLS 后需要匹配指纹', () => {
    runtimeConfig.adminControl.oobMtlsEnabled = true
    runtimeConfig.adminControl.oobMtlsFingerprints = 'ab:cd:ef'
    expect(() => requireAdminOobAuth(createEvent({
      'cf-access-client-id': 'service-id',
      'cf-access-client-secret': 'service-secret',
    }, 'xx:yy'))).toThrowError()

    const pass = requireAdminOobAuth(createEvent({
      'cf-access-client-id': 'service-id',
      'cf-access-client-secret': 'service-secret',
    }, 'ab:cd:ef'))
    expect(pass.actorId.startsWith('oob:')).toBe(true)
  })
})

