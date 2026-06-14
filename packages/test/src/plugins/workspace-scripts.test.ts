import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const scriptsPlugin = loadPluginModule(new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url))
const { __test: scriptsTest } = scriptsPlugin
const scriptsUrl = new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon() {
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    return this.item
  }
}

describe('workspace scripts plugin', () => {
  function installShellRunner(pluginModule: any, onRun?: () => void) {
    pluginModule.__test.setSpawnShellCommandForTest(() => {
      onRun?.()
      return {
        pid: 1234,
        unref() {},
      }
    })
  }

  it('uses defaults when config is empty', () => {
    const config = scriptsTest.parseScriptsConfig(null)
    expect(config.workspacePath).toBe('')
    expect(Array.isArray(config.commands)).toBe(true)
    expect(config.commands.length).toBe(0)
  })

  it('parses package scripts map', () => {
    const scripts = scriptsTest.parsePackageScriptsMap({
      lint: 'pnpm lint',
      test: 'pnpm test',
      empty: '',
      bad: null,
    })

    expect(scripts.length).toBe(2)
    expect(scripts[0].id).toBe('script:lint')
    expect(scripts[0].command).toBe('pnpm lint')
    expect(scripts[1].id).toBe('script:test')
  })

  it('resolves command cwd', () => {
    expect(scriptsTest.resolveCommandCwd('.', '/tmp/project')).toBe('/tmp/project')
    expect(scriptsTest.resolveCommandCwd('apps/core', '/tmp/project')).toBe('/tmp/project/apps/core')
    expect(scriptsTest.resolveCommandCwd('/opt/repo', '/tmp/project')).toBe('/opt/repo')
  })

  it('builds user-shell diagnostics for runnable commands', async () => {
    const items: Array<{ title?: string, meta?: Record<string, any> }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, meta?: Record<string, any> }>) { items.push(...next) },
        },
        storage: {
          async getFile() {
            return {
              workspacePath: '',
              commands: [
                { title: 'Lint', command: 'pnpm lint' },
              ],
            }
          },
          async setFile() {},
          async openFolder() {},
        },
      },
    })
    const pluginModule = loadPluginModule(scriptsUrl, globals)
    installShellRunner(pluginModule)

    await pluginModule.onFeatureTriggered('workspace-scripts', 'lint')

    const commandItem = items.find(item => item.title === 'Lint')
    expect(commandItem?.meta?.capability).toMatchObject({
      id: 'system.shell',
      type: 'shell',
      permission: 'system.shell',
      audit: {
        pluginName: 'touch-workspace-scripts',
        featureId: 'workspace-scripts',
        actionId: 'run-command',
        commandKind: 'user-shell',
        requiresConfirmation: true,
      },
    })
  })

  it('marks permission sdk unavailable in shell capability diagnostics', async () => {
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({
      permission: withoutGlobal(),
    }))
    installShellRunner(pluginModule)

    expect(await pluginModule.__test.resolveShellCapabilityState()).toMatchObject({
      status: 'permission-missing',
      reason: 'permission-sdk-unavailable',
    })
  })

  it('blocks command execution when permission sdk is unavailable', async () => {
    let ran = 0
    let confirmations = 0
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({
      permission: withoutGlobal(),
      dialog: {
        showMessageBox: async () => {
          confirmations += 1
          return { response: 1 }
        },
      },
    }))
    installShellRunner(pluginModule, () => {
      ran += 1
    })

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'workspace-scripts',
        actionId: 'run-command',
        payload: {
          command: 'pnpm test',
          cwd: '.',
        },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
    expect(confirmations).toBe(0)
    expect(ran).toBe(0)
  })

  it('blocks command execution when shell permission is denied', async () => {
    let ran = 0
    let confirmations = 0
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({
      permission: {
        check: async () => false,
        request: async () => false,
      },
      dialog: {
        showMessageBox: async () => {
          confirmations += 1
          return { response: 1 }
        },
      },
    }))
    installShellRunner(pluginModule, () => {
      ran += 1
    })

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'workspace-scripts',
        actionId: 'run-command',
        payload: {
          command: 'pnpm test',
          cwd: '.',
        },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'permission-denied',
    })
    expect(confirmations).toBe(0)
    expect(ran).toBe(0)
  })

  it('marks safe-shell fallback as unsupported when unavailable', () => {
    const capability = scriptsTest.buildShellCapability({
      featureId: 'workspace-scripts',
      actionId: 'run-command',
    })

    expect(['available', 'unsupported']).toContain(capability.status)
    expect(capability.permission).toBe('system.shell')
    expect(capability.audit.commandKind).toBe('user-shell')
  })
})
