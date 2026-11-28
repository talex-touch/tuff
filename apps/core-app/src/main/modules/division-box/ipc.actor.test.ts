import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { resolveDivisionBoxPermissionActor } from './permission-actor'

function createContext(pluginName?: string, sdkapi?: number): HandlerContext {
  if (!pluginName) {
    return {} as HandlerContext
  }
  return {
    plugin: {
      ...createTrustedTestPluginContext({ name: pluginName, uniqueKey: `${pluginName}-key` }),
      ...(sdkapi !== undefined ? { sdkapi } : {})
    }
  } as HandlerContext
}

describe('resolveDivisionBoxPermissionActor', () => {
  it('uses authoritative context plugin and manifest sdkapi when matching payload _sdkapi is sent', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    const actor = resolveDivisionBoxPermissionActor(
      createContext('context-plugin', 251212),
      { actorPluginId: 'payload-plugin', _sdkapi: 251212 },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({ pluginId: 'context-plugin', sdkapi: 251212 })
    expect(resolvePluginSdkapi).not.toHaveBeenCalled()
  })

  it('rejects payload _sdkapi override when it differs from authoritative manifest sdkapi', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    expect(() =>
      resolveDivisionBoxPermissionActor(
        createContext('context-plugin'),
        { actorPluginId: 'payload-plugin', _sdkapi: 260101 },
        resolvePluginSdkapi
      )
    ).toThrowError(expect.objectContaining({ code: 'SDKAPI_MISMATCH' }))
    expect(resolvePluginSdkapi).toHaveBeenCalledWith('context-plugin')
  })

  it('rejects unverified plugin contexts', () => {
    expect(() =>
      resolveDivisionBoxPermissionActor(
        { plugin: { name: 'spoofed-plugin', verified: false } } as HandlerContext,
        {},
        vi.fn()
      )
    ).toThrow(/authoritative plugin caller/i)
  })

  it('falls back to actorPluginId sdkapi when payload sdkapi is missing for internal caller', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    const actor = resolveDivisionBoxPermissionActor(
      createContext(),
      { actorPluginId: 'actor-plugin' },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({ pluginId: 'actor-plugin', sdkapi: 251212 })
    expect(resolvePluginSdkapi).toHaveBeenCalledWith('actor-plugin')
  })

  it('resolves nested sourcePluginId when actorPluginId is absent', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    const actor = resolveDivisionBoxPermissionActor(
      createContext(),
      { payload: { context: { sourcePluginId: 'nested-plugin' } } },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({ pluginId: 'nested-plugin', sdkapi: 251212 })
  })

  it('ignores corebox actor and avoids accidental plugin inference', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    const actor = resolveDivisionBoxPermissionActor(
      createContext(),
      { actorPluginId: 'corebox', pluginId: 'ignored-plugin-field' },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({})
    expect(resolvePluginSdkapi).not.toHaveBeenCalled()
  })
})
