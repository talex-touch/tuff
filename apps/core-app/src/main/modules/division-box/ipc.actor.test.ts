import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { describe, expect, it, vi } from 'vitest'
import { resolveDivisionBoxPermissionActor } from './permission-actor'

function createContext(pluginName?: string): HandlerContext {
  if (!pluginName) {
    return {} as HandlerContext
  }
  return { plugin: { name: pluginName } } as HandlerContext
}

describe('resolveDivisionBoxPermissionActor', () => {
  it('prefers context plugin and supports payload sdkapi override', () => {
    const resolvePluginSdkapi = vi.fn().mockReturnValue(251212)
    const actor = resolveDivisionBoxPermissionActor(
      createContext('context-plugin'),
      { actorPluginId: 'payload-plugin', _sdkapi: 260101 },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({ pluginId: 'context-plugin', sdkapi: 260101 })
    expect(resolvePluginSdkapi).not.toHaveBeenCalled()
  })

  it('falls back to actorPluginId sdkapi when payload sdkapi is missing', () => {
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
      { actorPluginId: 'corebox', pluginId: 'legacy-plugin-field' },
      resolvePluginSdkapi
    )

    expect(actor).toEqual({})
    expect(resolvePluginSdkapi).not.toHaveBeenCalled()
  })
})
