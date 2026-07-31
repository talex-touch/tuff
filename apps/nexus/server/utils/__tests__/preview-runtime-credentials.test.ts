import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  appAuthJwtSecret: undefined as string | undefined,
  auth: { secret: undefined as string | undefined },
  adminControl: {
    emergencyJwtSecret: undefined as string | undefined,
    pepper: undefined as string | undefined,
  },
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

function createEvent(env: Record<string, unknown> = {}) {
  return {
    context: {
      cloudflare: { env },
    },
  } as any
}

describe('Preview runtime credential boundary', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    runtimeConfig.appAuthJwtSecret = undefined
    runtimeConfig.auth.secret = undefined
    runtimeConfig.adminControl.emergencyJwtSecret = undefined
    runtimeConfig.adminControl.pepper = undefined
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
  })

  it('accepts a complete strong platform credential set', async () => {
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')
    const event = createEvent({
      AUTH_SECRET: 'strong-auth-secret-123456789',
      APP_AUTH_JWT_SECRET: 'strong-app-secret-123456789',
      ADMIN_EMERGENCY_JWT_SECRET: 'strong-emergency-secret-123456789',
      ADMIN_CONTROL_PLANE_PEPPER: 'strong-admin-pepper-123456789',
    })

    expect(() => assertPreviewRuntimeCredentials(event)).not.toThrow()
  })

  it('fails closed on the first missing required platform credential', async () => {
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')

    expect(() => assertPreviewRuntimeCredentials(createEvent())).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'AUTH_SECRET',
      }),
    )
  })

  it('does not infer local development from NODE_ENV when Cloudflare bindings exist', async () => {
    process.env.NODE_ENV = 'development'
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')

    expect(() => assertPreviewRuntimeCredentials(createEvent())).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'AUTH_SECRET',
      }),
    )
  })

  it('does not use runtime config when Cloudflare bindings are present', async () => {
    runtimeConfig.appAuthJwtSecret = 'strong-build-app-secret-123456789'
    runtimeConfig.auth.secret = 'strong-build-auth-secret-123456789'
    runtimeConfig.adminControl.emergencyJwtSecret = 'strong-build-emergency-secret-123456789'
    runtimeConfig.adminControl.pepper = 'strong-build-pepper-123456789'
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')

    expect(() => assertPreviewRuntimeCredentials(createEvent())).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'AUTH_SECRET',
      }),
    )
  })

  it('rejects known local defaults outside local development', async () => {
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')
    const event = createEvent({
      AUTH_SECRET: 'tuff-local-pages-preview-secret',
      APP_AUTH_JWT_SECRET: 'strong-app-secret-123456789',
      ADMIN_EMERGENCY_JWT_SECRET: 'strong-emergency-secret-123456789',
      ADMIN_CONTROL_PLANE_PEPPER: 'strong-admin-pepper-123456789',
    })

    expect(() => assertPreviewRuntimeCredentials(event)).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'AUTH_SECRET',
      }),
    )
  })

  it('allows the explicitly marked local Pages simulator without remote credentials', async () => {
    const { assertPreviewRuntimeCredentials } = await import('../previewRuntimeCredentials')
    const event = createEvent({ NEXUS_LOCAL_PAGES_PREVIEW: 'true' })

    expect(() => assertPreviewRuntimeCredentials(event)).not.toThrow()
  })
})
