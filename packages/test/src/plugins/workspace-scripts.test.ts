import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

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

  it('marks safe-shell fallback as degraded when unavailable', () => {
    const capability = scriptsTest.buildShellCapability({
      featureId: 'workspace-scripts',
      actionId: 'run-command',
    })

    expect(['available', 'degraded']).toContain(capability.status)
    expect(capability.permission).toBe('system.shell')
    expect(capability.audit.commandKind).toBe('user-shell')
  })
})
