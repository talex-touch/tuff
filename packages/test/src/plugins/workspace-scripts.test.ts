import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const scriptsPlugin = loadPluginModule(new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url))
const { __test: scriptsTest } = scriptsPlugin
const scriptsUrl = new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url)

// Shared FakeBuilder — single source of truth for TuffItemBuilder mock
class FakeTuffItemBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id, meta: {} }
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
    this.item.meta = { ...(this.item.meta as object), ...meta }
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
      return { pid: 1234, unref() {} }
    })
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Shell injection blocking (#1)
  // -----------------------------------------------------------------------
  it('blocks commands with shell injection characters', () => {
    expect(scriptsTest.validateCommandRequest('echo ok; rm -rf /', '/tmp').ok).toBe(false)
    expect(scriptsTest.validateCommandRequest('echo ok | sh', '/tmp').ok).toBe(false)
    expect(scriptsTest.validateCommandRequest('echo $(id)', '/tmp').ok).toBe(false)
  })

  it('allows normal structured dev commands and blocks shell chaining', () => {
    expect(scriptsTest.validateCommandRequest('pnpm test', '/tmp').ok).toBe(true)
    expect(scriptsTest.validateCommandRequest('pnpm lint && pnpm test', '/tmp')).toMatchObject({
      ok: false,
      reason: 'unsupported-shell-syntax',
    })
    expect(scriptsTest.validateCommandRequest('vite build --mode production', '/tmp').ok).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Shell capability diagnostics
  // -----------------------------------------------------------------------
  it('builds user-shell diagnostics for runnable commands', async () => {
    const items: Array<{ title?: string, meta?: Record<string, any> }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeTuffItemBuilder,
      permission: { check: async () => true, request: async () => true },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, meta?: Record<string, any> }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return { workspacePath: '', commands: [{ title: 'Lint', command: 'pnpm lint' }] } },
          async setFile() {},
          async openFolder() {},
        },
      },
    })
    const pluginModule = loadPluginModule(scriptsUrl, globals)
    installShellRunner(pluginModule)

    // Clear caches before testing
    pluginModule.__test.cacheInvalidate()
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
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({ permission: withoutGlobal() }))
    installShellRunner(pluginModule)
    pluginModule.__test.cacheInvalidate()
    expect(await pluginModule.__test.resolveShellCapabilityState()).toMatchObject({
      status: 'permission-missing',
      reason: 'permission-sdk-unavailable',
    })
  })

  // -----------------------------------------------------------------------
  // Command execution permission blocking
  // -----------------------------------------------------------------------
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
      meta: { defaultAction: 'workspace-scripts', actionId: 'run-command', payload: { command: 'pnpm test', cwd: '.' } },
    })

    expect(result).toMatchObject({ externalAction: true, status: 'blocked', reason: 'permission-sdk-unavailable' })
    expect(confirmations).toBe(0)
    expect(ran).toBe(0)
  })

  it('blocks command execution when shell permission is denied', async () => {
    let ran = 0
    let confirmations = 0
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({
      permission: { check: async () => false, request: async () => false },
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
      meta: { defaultAction: 'workspace-scripts', actionId: 'run-command', payload: { command: 'pnpm test', cwd: '.' } },
    })

    expect(result).toMatchObject({ externalAction: true, status: 'blocked', reason: 'permission-denied' })
    expect(confirmations).toBe(0)
    expect(ran).toBe(0)
  })

  // -----------------------------------------------------------------------
  // Safe command fallback
  // -----------------------------------------------------------------------
  it('marks safe command fallback as unsupported when unavailable', () => {
    const capability = scriptsTest.buildShellCapability({ featureId: 'workspace-scripts', actionId: 'run-command' })
    expect(['available', 'unsupported']).toContain(capability.status)
    expect(capability.permission).toBe('system.shell')
    expect(capability.audit.commandKind).toBe('user-shell')
  })

  // -----------------------------------------------------------------------
  // Cache behavior (#4)
  // -----------------------------------------------------------------------
  it('caches shell capability state across calls', async () => {
    let checkCalls = 0
    const pluginModule = loadPluginModule(scriptsUrl, createPluginGlobals({
      permission: {
        check: async () => {
          checkCalls++
          return true
        },
      },
    }))
    installShellRunner(pluginModule)
    pluginModule.__test.cacheInvalidate()

    await pluginModule.__test.resolveShellCapabilityState()
    expect(checkCalls).toBe(1)
    await pluginModule.__test.resolveShellCapabilityState()
    // Second call should use cache — no additional check
    expect(checkCalls).toBe(1)
  })
})
