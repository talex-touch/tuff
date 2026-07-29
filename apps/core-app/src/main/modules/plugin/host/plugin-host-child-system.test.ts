import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, declared: boolean) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: 'touch-quick-actions' }
    },
    capabilityManifest: declared
      ? [{ id: 'system.invoke', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: {
      maxCallbacks: 64,
      maxConcurrentCallbacks: 16,
      maxResources: 32
    }
  }
}

describe('plugin host child system facade', () => {
  it('projects only frozen fixed runAction methods when system.invoke is declared', async () => {
    const invokeCapability = vi.fn(async () => ({ actionId: 'lock-screen', status: 'started' }))
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const result = await system.runAction('lock-screen')
              let unknownCode = ''
              let escape = false
              try { await system.runAction('custom-command') } catch (error) { unknownCode = error.code }
              try { system.runAction.constructor('return process')() } catch { escape = true }
              return {
                result,
                globalKeys: Object.keys(system),
                pluginKeys: Object.keys(plugin.system),
                sameFacade: system === plugin.system,
                frozen: Object.isFrozen(system) && Object.isFrozen(system.runAction),
                nullPrototype: Object.getPrototypeOf(system) === null,
                commandType: typeof system.runCommand,
                constructorType: typeof system.constructor,
                unknownCode,
                processType: typeof process,
                escape
              }
            }
          }
        `,
        true
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      result: { actionId: 'lock-screen', status: 'started' },
      globalKeys: ['runAction'],
      pluginKeys: ['runAction'],
      sameFacade: true,
      frozen: true,
      nullPrototype: true,
      commandType: 'undefined',
      constructorType: 'undefined',
      unknownCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      processType: 'undefined',
      escape: true
    })
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(
      'system.invoke',
      { operation: 'run-action', actionId: 'lock-screen' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('accepts only the complete fixed action inventory and canonical mute-toggle ID', async () => {
    const actionIds = [
      'restart',
      'shutdown',
      'lock-screen',
      'mute-toggle',
      'volume-up',
      'volume-down',
      'brightness-up',
      'brightness-down',
      'open-main-window',
      'focus-settings',
      'notification-settings',
      'sound-settings',
      'display-settings'
    ]
    const invokeCapability = vi.fn(async (_capability: string, payload: unknown) => {
      const request = payload as { actionId: string }
      return {
        actionId: request.actionId,
        status: 'started'
      }
    })
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const ids = ${JSON.stringify(actionIds)}
              const results = []
              for (const id of ids) results.push(await plugin.system.runAction(id))
              let muteCode = ''
              try { await plugin.system.runAction('mute') } catch (error) { muteCode = error.code }
              return { results, muteCode }
            }
          }
        `,
        true
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      results: actionIds.map((actionId) => ({ actionId, status: 'started' })),
      muteCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED'
    })
    expect(invokeCapability).toHaveBeenCalledTimes(actionIds.length)
    expect(invokeCapability).not.toHaveBeenCalledWith(
      'system.invoke',
      expect.objectContaining({ actionId: 'mute' }),
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not expose system or plugin.system when the capability is undeclared', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            onInit() {
              return { systemType: typeof system, pluginSystemType: typeof plugin.system }
            }
          }
        `,
        false
      )
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      systemType: 'undefined',
      pluginSystemType: 'undefined'
    })
    runtime.shutdown()
  })
})
