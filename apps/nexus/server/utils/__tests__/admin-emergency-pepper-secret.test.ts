import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = vi.hoisted(() => ({
  adminControl: {
    pepper: 'unit-test-admin-pepper-123456',
  },
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))

function createEvent(env?: Record<string, unknown>) {
  return {
    context: env === undefined ? {} : { cloudflare: { env } },
  } as any
}

describe('admin emergency pepper credential boundary', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    runtimeConfig.adminControl.pepper = 'unit-test-admin-pepper-123456'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv
  })

  it.each(['', 'short', 'change-me-admin-control-plane-pepper', 'replace-with-local-secret'])(
    'rejects unsafe pepper in production: %s',
    async credential => {
      process.env.NODE_ENV = 'production'
      runtimeConfig.adminControl.pepper = credential
      const { hashAdminHint } = await import('../adminEmergencyStore')

      expect(() => hashAdminHint(createEvent(), 'admin@example.test')).toThrowError(
        expect.objectContaining({
          code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
          variableName: 'ADMIN_CONTROL_PLANE_PEPPER',
        }),
      )
    },
  )

  it('does not replace a missing Cloudflare pepper Secret with runtime config', async () => {
    process.env.NODE_ENV = 'production'
    const { hashAdminHint } = await import('../adminEmergencyStore')

    expect(() => hashAdminHint(createEvent({}), 'admin@example.test')).toThrowError(
      expect.objectContaining({
        code: 'NEXUS_RUNTIME_CREDENTIAL_INVALID',
        variableName: 'ADMIN_CONTROL_PLANE_PEPPER',
      }),
    )
  })

  it('preserves the existing non-empty development credential behavior', async () => {
    runtimeConfig.adminControl.pepper = 'dev'
    const { hashAdminHint } = await import('../adminEmergencyStore')

    expect(hashAdminHint(createEvent(), 'admin@example.test')).toMatch(/^[a-f0-9]{64}$/)
  })
})
