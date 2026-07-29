import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, pluginName = 'touch-browser-data', declared = true) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: declared
      ? [{ id: 'browser-data.scan', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin host child browser-data facade', () => {
  it('projects only one frozen fixed scan method for the owning plugin', async () => {
    const invokeCapability = vi.fn(async () => ({
      operation: 'scan',
      status: 'completed',
      records: [
        {
          source: 'bookmarks',
          browser: 'chrome',
          browserName: 'Chrome',
          profile: 'Default',
          title: 'Tuff',
          url: 'https://example.com/',
          folder: 'Docs'
        }
      ],
      diagnostics: []
    }))
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const all = await plugin.browserData.scan(['bookmarks', 'history'])
            const chrome = await plugin.browserData.scan(['bookmarks'], 'chrome')
            Array.prototype.includes = () => true
            let pathCode = ''
            let sqlCode = ''
            let browserCode = ''
            let escape = false
            try { await plugin.browserData.scan(['/Users/private']) } catch (error) { pathCode = error.code }
            try { await plugin.browserData.scan(['history'], 'SELECT * FROM urls') } catch (error) { sqlCode = error.code }
            try { await plugin.browserData.scan(['bookmarks'], 'firefox') } catch (error) { browserCode = error.code }
            try { plugin.browserData.scan.constructor('return process')() } catch { escape = true }
            return {
              all,
              chrome,
              keys: Object.keys(plugin.browserData),
              frozen: Object.isFrozen(plugin.browserData) && Object.isFrozen(plugin.browserData.scan),
              nullPrototype: Object.getPrototypeOf(plugin.browserData) === null,
              constructorType: typeof plugin.browserData.constructor,
              processType: typeof process,
              requireType: typeof require,
              sqliteType: typeof DatabaseSync,
              pathCode,
              sqlCode,
              browserCode,
              escape
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      all: { status: 'completed', records: [{ title: 'Tuff' }] },
      chrome: { status: 'completed' },
      keys: ['scan'],
      frozen: true,
      nullPrototype: true,
      constructorType: 'undefined',
      processType: 'undefined',
      requireType: 'undefined',
      sqliteType: 'undefined',
      pathCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      sqlCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      browserCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      escape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'browser-data.scan',
      { operation: 'scan', sources: ['bookmarks', 'history'] },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'browser-data.scan',
      { operation: 'scan', sources: ['bookmarks'], browser: 'chrome' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not project the facade for another plugin or without declaration', async () => {
    for (const input of [
      payload('module.exports={onInit(){return typeof plugin.browserData}}', 'touch-browser-open'),
      payload(
        'module.exports={onInit(){return typeof plugin.browserData}}',
        'touch-browser-data',
        false
      )
    ]) {
      const runtime = loadPluginPrelude(input)
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('undefined')
      runtime.shutdown()
    }
  })
})
