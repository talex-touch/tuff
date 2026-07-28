import { describe, expect, it } from 'vitest'
import { PluginHostContextRegistry } from './plugin-host-identity'

describe('PluginHostContextRegistry', () => {
  it('resolves only the host-issued handle in the current generation', () => {
    const registry = new PluginHostContextRegistry()
    const context = { secret: 'plugin-a-sdk' }
    const issued = registry.register('plugin-a', 4, context)

    expect(registry.resolve(issued.pluginHandle, 4)).toEqual({
      pluginName: 'plugin-a',
      hostGeneration: 4,
      context
    })
    expect(registry.resolve('forged-handle', 4)).toBeUndefined()
    expect(registry.resolve(issued.pluginHandle, 3)).toBeUndefined()
  })

  it('invalidates the old handle when the same plugin is reloaded or unloaded', () => {
    const registry = new PluginHostContextRegistry()
    const stale = registry.register('plugin-a', 5, { version: 1 })
    const current = registry.register('plugin-a', 5, { version: 2 })

    expect(registry.resolve(stale.pluginHandle, 5)).toBeUndefined()
    expect(registry.resolve(current.pluginHandle, 5)?.context).toEqual({ version: 2 })
    expect(registry.unregisterPlugin('plugin-a', current.pluginHandle)).toBe(true)
    expect(registry.resolve(current.pluginHandle, 5)).toBeUndefined()
  })

  it('does not let one plugin name redirect another plugin handle', () => {
    const registry = new PluginHostContextRegistry()
    const pluginA = registry.register('plugin-a', 6, { owner: 'a' })
    const pluginB = registry.register('plugin-b', 6, { owner: 'b' })

    expect(registry.resolve(pluginA.pluginHandle, 6)?.pluginName).toBe('plugin-a')
    expect(registry.resolve(pluginB.pluginHandle, 6)?.pluginName).toBe('plugin-b')
    registry.clear()
    expect(registry.resolve(pluginA.pluginHandle, 6)).toBeUndefined()
    expect(registry.resolve(pluginB.pluginHandle, 6)).toBeUndefined()
  })
})
