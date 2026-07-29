import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

function payload(scriptContent: string, pluginName = 'touch-workspace-scripts', declared = true) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: declared
      ? [{ id: 'process.workspace-scripts', callbackLifetime: 'transient', callbackFields: [] }]
      : [],
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin host child workspace scripts facade', () => {
  it('projects only frozen select, list and run token methods for the owning plugin', async () => {
    const workspaceToken = 'ws_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const scriptToken = 'wss_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string }
      if (value.operation === 'select-workspace') {
        return {
          operation: 'select-workspace',
          status: 'selected',
          workspace: { token: workspaceToken, name: 'fixture' }
        }
      }
      if (value.operation === 'list-scripts') {
        return {
          operation: 'list-scripts',
          status: 'available',
          workspace: { token: workspaceToken, name: 'fixture' },
          scripts: [{ token: scriptToken, name: 'lint' }]
        }
      }
      return { operation: 'run-script', status: 'started', scriptName: 'lint' }
    })
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const selected = await plugin.workspaceScripts.select()
            const listed = await plugin.workspaceScripts.list(selected.workspace.token)
            const run = await plugin.workspaceScripts.run(listed.scripts[0].token)
            RegExp.prototype.test = () => true
            let workspaceCode = ''
            let scriptCode = ''
            let escape = false
            try { await plugin.workspaceScripts.list('/private') } catch (error) { workspaceCode = error.code }
            try { await plugin.workspaceScripts.run('pnpm test') } catch (error) { scriptCode = error.code }
            try { plugin.workspaceScripts.run.constructor('return process')() } catch { escape = true }
            return {
              selected,
              listed,
              run,
              keys: Object.keys(plugin.workspaceScripts),
              frozen: Object.isFrozen(plugin.workspaceScripts) && Object.isFrozen(plugin.workspaceScripts.run),
              nullPrototype: Object.getPrototypeOf(plugin.workspaceScripts) === null,
              processType: typeof process,
              fsType: typeof fs,
              dialogType: typeof dialog,
              globalType: typeof workspaceScripts,
              constructorType: typeof plugin.workspaceScripts.constructor,
              workspaceCode,
              scriptCode,
              escape
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      selected: { status: 'selected', workspace: { token: workspaceToken, name: 'fixture' } },
      listed: { status: 'available', scripts: [{ token: scriptToken, name: 'lint' }] },
      run: { status: 'started', scriptName: 'lint' },
      keys: ['select', 'list', 'run'],
      frozen: true,
      nullPrototype: true,
      processType: 'undefined',
      fsType: 'undefined',
      dialogType: 'undefined',
      globalType: 'undefined',
      constructorType: 'undefined',
      workspaceCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      scriptCode: 'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
      escape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'process.workspace-scripts',
      { operation: 'select-workspace' },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'process.workspace-scripts',
      { operation: 'list-scripts', workspaceToken },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      3,
      'process.workspace-scripts',
      { operation: 'run-script', scriptToken },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('does not project the facade for another plugin or without the declaration', async () => {
    for (const input of [
      payload('module.exports={onInit(){return typeof plugin.workspaceScripts}}', 'touch-snipaste'),
      payload(
        'module.exports={onInit(){return typeof plugin.workspaceScripts}}',
        'touch-workspace-scripts',
        false
      )
    ]) {
      const runtime = loadPluginPrelude(input)
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('undefined')
      runtime.shutdown()
    }
  })
})
