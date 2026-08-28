import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isFeatureFlagEnabled } from '../../shared/utils/feature-flags'

/**
 * Deployments express NUXT_PUBLIC_RISK_CONTROL_ENABLED as "1", which Nitro's env
 * override turns into the number 1 before the client reads it. The gate used to
 * compare with `=== true`, so the API served the risk control plane while the UI
 * bounced operators off the very pages that control it. These cover both the
 * normalizer and the middleware that consumes it.
 */

interface RuntimeConfigShape {
  public?: { riskControl?: { enabled?: unknown } }
}

const runtimeConfig: RuntimeConfigShape = {}
const globalNames = ['defineNuxtRouteMiddleware', 'useRuntimeConfig', 'navigateTo'] as const
const originalGlobals = new Map<string, { hadOwnProperty: boolean, value: unknown }>()

let middleware: (to: { path: string }) => unknown

function installGlobal(name: string, value: unknown) {
  originalGlobals.set(name, {
    hadOwnProperty: Object.hasOwn(globalThis, name),
    value: Reflect.get(globalThis, name),
  })
  Reflect.set(globalThis, name, value)
}

beforeAll(async () => {
  installGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
  installGlobal('useRuntimeConfig', () => runtimeConfig)
  installGlobal('navigateTo', (target: string) => ({ redirectedTo: target }))

  const imported = await import('../../app/middleware/feature-gates.global')
  middleware = imported.default as typeof middleware
})

afterEach(() => {
  delete runtimeConfig.public
})

describe('isFeatureFlagEnabled', () => {
  it('accepts the boolean the config schema declares', () => {
    expect(isFeatureFlagEnabled(true)).toBe(true)
    expect(isFeatureFlagEnabled(false)).toBe(false)
  })

  it('accepts the number Nitro coerces NUXT_PUBLIC_*=1 into', () => {
    expect(isFeatureFlagEnabled(1)).toBe(true)
    expect(isFeatureFlagEnabled(0)).toBe(false)
  })

  it('accepts the string forms an operator is likely to set', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on'])
      expect(isFeatureFlagEnabled(value)).toBe(true)

    for (const value of ['0', 'false', 'FALSE', ' no ', 'off'])
      expect(isFeatureFlagEnabled(value)).toBe(false)
  })

  it('falls back rather than guessing for unset or unrecognised values', () => {
    expect(isFeatureFlagEnabled(undefined)).toBe(false)
    expect(isFeatureFlagEnabled(null)).toBe(false)
    expect(isFeatureFlagEnabled('maybe')).toBe(false)
    expect(isFeatureFlagEnabled('maybe', true)).toBe(true)
    expect(isFeatureFlagEnabled(2)).toBe(false)
  })
})

describe('feature-gates.global middleware', () => {
  describe('when risk control is disabled', () => {
    beforeEach(() => {
      runtimeConfig.public = { riskControl: { enabled: false } }
    })

    it('sends the dashboard risk console to the dashboard overview', () => {
      expect(middleware({ path: '/dashboard/admin/risk' })).toEqual({ redirectedTo: '/dashboard/overview' })
    })

    it('sends the standalone emergency console to the site root', () => {
      expect(middleware({ path: '/admin/emergency' })).toEqual({ redirectedTo: '/' })
    })

    it('leaves unrelated routes alone', () => {
      expect(middleware({ path: '/dashboard/overview' })).toBeUndefined()
      expect(middleware({ path: '/dashboard/admin/users' })).toBeUndefined()
    })
  })

  it('treats a missing riskControl block as disabled', () => {
    expect(middleware({ path: '/dashboard/admin/risk' })).toEqual({ redirectedTo: '/dashboard/overview' })
    expect(middleware({ path: '/admin/emergency' })).toEqual({ redirectedTo: '/' })
  })

  it.each([
    ['boolean true', true],
    ['number 1 from NUXT_PUBLIC_RISK_CONTROL_ENABLED=1', 1],
    ['string "1"', '1'],
    ['string "true"', 'true'],
  ])('allows both consoles through when enabled is %s', (_label, enabled) => {
    runtimeConfig.public = { riskControl: { enabled } }
    expect(middleware({ path: '/dashboard/admin/risk' })).toBeUndefined()
    expect(middleware({ path: '/admin/emergency' })).toBeUndefined()
  })

  it('still redirects when enabled holds a falsy string form', () => {
    runtimeConfig.public = { riskControl: { enabled: '0' } }
    expect(middleware({ path: '/dashboard/admin/risk' })).toEqual({ redirectedTo: '/dashboard/overview' })

    runtimeConfig.public = { riskControl: { enabled: 'false' } }
    expect(middleware({ path: '/admin/emergency' })).toEqual({ redirectedTo: '/' })
  })

  it('gates nested paths under both consoles', () => {
    runtimeConfig.public = { riskControl: { enabled: false } }
    expect(middleware({ path: '/dashboard/admin/risk/cases' })).toEqual({ redirectedTo: '/dashboard/overview' })
    expect(middleware({ path: '/admin/emergency/step-2' })).toEqual({ redirectedTo: '/' })
  })
})
