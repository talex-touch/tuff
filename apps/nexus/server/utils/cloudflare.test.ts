import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCloudflareBindings } from './cloudflare'

function createEvent(env: Record<string, unknown>): H3Event {
  return {
    context: {
      cloudflare: { env },
    },
  } as unknown as H3Event
}

describe('readCloudflareBindings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('overlays allowlisted process credentials onto local Cloudflare dev bindings', () => {
    const db = { kind: 'd1' }
    const bucket = { kind: 'r2' }
    const localCredentials = {
      ADMIN_CONTROL_PLANE_PEPPER: 'local-admin-pepper',
      ADMIN_EMERGENCY_JWT_SECRET: 'local-emergency-secret',
      APP_AUTH_JWT_SECRET: 'local-app-auth-secret',
      AUTH_SECRET: 'local-auth-secret',
      NOTIFICATION_SECURE_STORE_KEY: 'local-notification-store-key',
      NUXT_INTELLIGENCE_ENCRYPT_KEY: 'local-intelligence-key',
      PLUGIN_ATTESTATION_PRIVATE_KEY_PEM: 'local-attestation-private-key',
      PROVIDER_REGISTRY_SECURE_STORE_KEY: 'local-provider-store-key',
      STORAGE_SECURE_STORE_KEY: 'local-storage-store-key',
    }
    const bindings = { DB: db, R2: bucket, AUTH_SECRET: null }

    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NUXT_USE_CLOUDFLARE_DEV', 'true')
    for (const [name, value] of Object.entries(localCredentials))
      vi.stubEnv(name, value)

    const result = readCloudflareBindings(createEvent(bindings))

    expect(result).not.toBe(bindings)
    expect(result).toMatchObject({
      DB: db,
      R2: bucket,
      NEXUS_LOCAL_PAGES_PREVIEW: 'true',
      ...localCredentials,
    })
    expect(bindings).toEqual({ DB: db, R2: bucket, AUTH_SECRET: null })
  })

  it('keeps explicit platform credentials ahead of process values', () => {
    const bindings = {
      AUTH_SECRET: '',
      APP_AUTH_JWT_SECRET: 'platform-app-auth-secret',
    }
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NUXT_USE_CLOUDFLARE_DEV', 'true')
    vi.stubEnv('AUTH_SECRET', 'process-auth-secret')
    vi.stubEnv('APP_AUTH_JWT_SECRET', 'process-app-auth-secret')

    expect(readCloudflareBindings(createEvent(bindings))).toMatchObject({
      AUTH_SECRET: '',
      APP_AUTH_JWT_SECRET: 'platform-app-auth-secret',
      NEXUS_LOCAL_PAGES_PREVIEW: 'true',
    })
  })

  it('does not copy arbitrary process environment variables', () => {
    const bindings = { DB: { kind: 'd1' } }
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NUXT_USE_CLOUDFLARE_DEV', 'true')
    vi.stubEnv('UNRELATED_RUNTIME_SECRET', 'must-not-become-a-binding')

    const result = readCloudflareBindings(createEvent(bindings)) as Record<string, unknown>

    expect(result).not.toHaveProperty('UNRELATED_RUNTIME_SECRET')
  })

  it('returns production Cloudflare bindings unchanged', () => {
    const bindings = { DB: { kind: 'd1' } }
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NUXT_USE_CLOUDFLARE_DEV', 'true')
    vi.stubEnv('AUTH_SECRET', 'process-auth-secret')

    expect(readCloudflareBindings(createEvent(bindings))).toBe(bindings)
    expect(bindings).not.toHaveProperty('NEXUS_LOCAL_PAGES_PREVIEW')
    expect(bindings).not.toHaveProperty('AUTH_SECRET')
  })

  it('returns unmarked development Cloudflare bindings unchanged', () => {
    const bindings = { R2: { kind: 'r2' } }
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NUXT_USE_CLOUDFLARE_DEV', 'false')
    vi.stubEnv('AUTH_SECRET', 'process-auth-secret')

    expect(readCloudflareBindings(createEvent(bindings))).toBe(bindings)
    expect(bindings).not.toHaveProperty('NEXUS_LOCAL_PAGES_PREVIEW')
    expect(bindings).not.toHaveProperty('AUTH_SECRET')
  })
})
