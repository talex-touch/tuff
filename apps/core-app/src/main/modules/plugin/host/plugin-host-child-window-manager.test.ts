import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, pluginName = 'touch-window-manager', declared = true) {
  return {
    scriptContent,
    snapshot: {
      platform: 'win32',
      arch: 'x64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: declared
      ? [{ id: 'system.window-manager', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin host child window manager facade', () => {
  it('projects only frozen list and fixed token action methods for the owning plugin', async () => {
    const token = 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string; action?: string; token?: string }
      return value.operation === 'list'
        ? {
            operation: 'list',
            status: 'available',
            platform: 'win32',
            items: [
              {
                kind: 'window',
                token,
                name: 'Terminal',
                title: 'Workspace',
                isFront: true,
                topmost: false,
                actions: ['activate']
              }
            ]
          }
        : { operation: 'act', action: value.action, status: 'completed' }
    })
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const listed = await plugin.windowManager.list()
            const acted = await plugin.windowManager.act('activate', listed.items[0].token)
            RegExp.prototype.test = () => true
            let unknownCode = ''
            let tokenCode = ''
            let escape = false
            try { await plugin.windowManager.act('restart', listed.items[0].token) } catch (error) { unknownCode = error.code }
            try { await plugin.windowManager.act('activate', '100') } catch (error) { tokenCode = error.code }
            try { plugin.windowManager.act.constructor('return process')() } catch { escape = true }
            return {
              listed,
              acted,
              keys: Object.keys(plugin.windowManager),
              frozen: Object.isFrozen(plugin.windowManager) && Object.isFrozen(plugin.windowManager.act),
              nullPrototype: Object.getPrototypeOf(plugin.windowManager) === null,
              systemType: typeof system,
              presetType: typeof plugin.windowPresets,
              constructorType: typeof plugin.windowManager.constructor,
              unknownCode,
              tokenCode,
              processType: typeof process,
              escape
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      listed: {
        operation: 'list',
        status: 'available',
        platform: 'win32',
        items: [
          {
            kind: 'window',
            token,
            name: 'Terminal',
            title: 'Workspace',
            isFront: true,
            topmost: false,
            actions: ['activate']
          }
        ]
      },
      acted: { operation: 'act', action: 'activate', status: 'completed' },
      keys: ['list', 'act'],
      frozen: true,
      nullPrototype: true,
      systemType: 'undefined',
      presetType: 'undefined',
      constructorType: 'undefined',
      unknownCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      tokenCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      processType: 'undefined',
      escape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'system.window-manager',
      { operation: 'list' },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'system.window-manager',
      { operation: 'act', action: 'activate', token },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not project the facade for another plugin or without the declaration', async () => {
    for (const input of [
      payload(
        'module.exports={onInit(){return typeof plugin.windowManager}}',
        'touch-window-presets'
      ),
      payload(
        'module.exports={onInit(){return typeof plugin.windowManager}}',
        'touch-window-manager',
        false
      )
    ]) {
      const runtime = loadPluginPrelude(input)
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('undefined')
      runtime.shutdown()
    }
  })
})
