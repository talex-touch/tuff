import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, declared: boolean) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: 'touch-snipaste' }
    },
    capabilityManifest: declared
      ? [{ id: 'process.spawn', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: {
      maxCallbacks: 64,
      maxConcurrentCallbacks: 16,
      maxResources: 32
    }
  }
}

describe('plugin host child Snipaste facade', () => {
  it('projects only a frozen fixed plugin.snipaste action facade', async () => {
    const invokeCapability = vi.fn(async () => ({ actionId: 'snip', status: 'started' }))
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const result = await plugin.snipaste.runAction('snip')
              let unknownCode = ''
              let escape = false
              try { await plugin.snipaste.runAction('custom') } catch (error) { unknownCode = error.code }
              try { plugin.snipaste.runAction.constructor('return process')() } catch { escape = true }
              return {
                result,
                keys: Object.keys(plugin.snipaste),
                frozen: Object.isFrozen(plugin.snipaste) && Object.isFrozen(plugin.snipaste.runAction),
                nullPrototype: Object.getPrototypeOf(plugin.snipaste) === null,
                spawnType: typeof plugin.snipaste.spawn,
                processType: typeof process,
                globalSnipasteType: typeof snipaste,
                unknownCode,
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
      result: { actionId: 'snip', status: 'started' },
      keys: ['runAction'],
      frozen: true,
      nullPrototype: true,
      spawnType: 'undefined',
      processType: 'undefined',
      globalSnipasteType: 'undefined',
      unknownCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      escape: true
    })
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(
      'process.spawn',
      { operation: 'snipaste-action', actionId: 'snip' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not expose plugin.snipaste when process.spawn is undeclared', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `module.exports = { onInit() { return { facade: typeof plugin.snipaste, process: typeof process } } }`,
        false
      )
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      facade: 'undefined',
      process: 'undefined'
    })
    runtime.shutdown()
  })
})
