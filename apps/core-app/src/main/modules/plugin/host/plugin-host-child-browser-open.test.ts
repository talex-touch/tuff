import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, pluginName = 'touch-browser-open', declared = true) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: declared
      ? [{ id: 'system.browser-open', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin host child browser-open facade', () => {
  it('projects only frozen list and token-bound open methods for the owning plugin', async () => {
    const token = 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string; url?: string; browserToken?: string }
      if (value.operation === 'list') {
        return {
          operation: 'list',
          status: 'available',
          defaultAvailable: true,
          browsers: [{ id: 'chrome', name: 'Chrome', token }]
        }
      }
      return { operation: 'open', status: 'completed' }
    })
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const listed = await plugin.browser.list()
            const specific = await plugin.browser.open('https://example.com', listed.browsers[0].token)
            const defaultOpen = await plugin.browser.open('https://example.com')
            RegExp.prototype.test = () => true
            let tokenCode = ''
            let escape = false
            try { await plugin.browser.open('https://example.com', '/Applications/Calculator.app') } catch (error) { tokenCode = error.code }
            try { plugin.browser.open.constructor('return process')() } catch { escape = true }
            return {
              listed,
              specific,
              defaultOpen,
              keys: Object.keys(plugin.browser),
              frozen: Object.isFrozen(plugin.browser) && Object.isFrozen(plugin.browser.open),
              nullPrototype: Object.getPrototypeOf(plugin.browser) === null,
              processType: typeof process,
              requireType: typeof require,
              targetType: typeof browserTarget,
              constructorType: typeof plugin.browser.constructor,
              tokenCode,
              escape
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      listed: {
        status: 'available',
        browsers: [{ id: 'chrome', name: 'Chrome', token }]
      },
      specific: { status: 'completed' },
      defaultOpen: { status: 'completed' },
      keys: ['list', 'open'],
      frozen: true,
      nullPrototype: true,
      processType: 'undefined',
      requireType: 'undefined',
      targetType: 'undefined',
      constructorType: 'undefined',
      tokenCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      escape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'system.browser-open',
      { operation: 'list' },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'system.browser-open',
      { operation: 'open', url: 'https://example.com', browserToken: token },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      3,
      'system.browser-open',
      { operation: 'open', url: 'https://example.com' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not project the facade for another plugin or without the declaration', async () => {
    for (const input of [
      payload('module.exports={onInit(){return typeof plugin.browser}}', 'touch-browser-data'),
      payload(
        'module.exports={onInit(){return typeof plugin.browser}}',
        'touch-browser-open',
        false
      )
    ]) {
      const runtime = loadPluginPrelude(input)
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('undefined')
      runtime.shutdown()
    }
  })
})
