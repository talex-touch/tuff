import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, pluginName = 'touch-window-presets', declared = true) {
  return {
    scriptContent,
    snapshot: {
      platform: 'win32',
      arch: 'x64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: declared
      ? [{ id: 'system.window-presets', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin host child window presets facade', () => {
  it('projects only frozen status and fixed runAction for the owning plugin', async () => {
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string; actionId?: string }
      return value.operation === 'status'
        ? { operation: 'status', status: 'available', windowCount: 3 }
        : {
            operation: 'run-action',
            actionId: value.actionId,
            status: 'completed',
            affectedWindows: 2
          }
    })
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const status = await plugin.windowPresets.status()
            const action = await plugin.windowPresets.runAction('preset-dev-split')
            let unknownCode = ''
            let escape = false
            try { await plugin.windowPresets.runAction('restart') } catch (error) { unknownCode = error.code }
            try { plugin.windowPresets.runAction.constructor('return process')() } catch { escape = true }
            return {
              status,
              action,
              keys: Object.keys(plugin.windowPresets),
              frozen: Object.isFrozen(plugin.windowPresets) && Object.isFrozen(plugin.windowPresets.runAction),
              nullPrototype: Object.getPrototypeOf(plugin.windowPresets) === null,
              systemType: typeof system,
              constructorType: typeof plugin.windowPresets.constructor,
              unknownCode,
              processType: typeof process,
              escape
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      status: { operation: 'status', status: 'available', windowCount: 3 },
      action: {
        operation: 'run-action',
        actionId: 'preset-dev-split',
        status: 'completed',
        affectedWindows: 2
      },
      keys: ['status', 'runAction'],
      frozen: true,
      nullPrototype: true,
      systemType: 'undefined',
      constructorType: 'undefined',
      unknownCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      processType: 'undefined',
      escape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'system.window-presets',
      { operation: 'status' },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'system.window-presets',
      { operation: 'run-action', actionId: 'preset-dev-split' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not project the facade for another plugin or without the declaration', async () => {
    for (const input of [
      payload(
        'module.exports={onInit(){return typeof plugin.windowPresets}}',
        'touch-system-actions'
      ),
      payload(
        'module.exports={onInit(){return typeof plugin.windowPresets}}',
        'touch-window-presets',
        false
      )
    ]) {
      const runtime = loadPluginPrelude(input)
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('undefined')
      runtime.shutdown()
    }
  })
})
