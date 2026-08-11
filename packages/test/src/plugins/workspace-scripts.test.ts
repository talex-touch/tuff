import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const scriptsUrl = new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url)
const WORKSPACE_TOKEN = 'ws_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SCRIPT_TOKEN = 'wss_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

class FakeTuffItemBuilder {
  item: Record<string, any>

  constructor(id: string) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
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

  setIcon(icon: unknown) {
    this.item.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

function createHarness() {
  const items: Array<Record<string, any>> = []
  const calls: Array<Record<string, unknown>> = []
  const run = vi.fn(async (scriptToken: string) => {
    calls.push({ operation: 'run', scriptToken })
    return { operation: 'run-script', status: 'started', scriptName: 'lint' }
  })
  const pluginModule = loadPluginModule(
    scriptsUrl,
    createPluginGlobals({
      TuffItemBuilder: FakeTuffItemBuilder,
      plugin: {
        getLocale: () => 'en-US',
        feature: {
          async clearItems() {
            calls.push({ operation: 'clear' })
            items.length = 0
          },
          async pushItems(next: Array<Record<string, any>>) {
            calls.push({ operation: 'push' })
            items.push(...next)
          },
        },
        workspaceScripts: {
          async select() {
            calls.push({ operation: 'select' })
            return {
              operation: 'select-workspace',
              status: 'selected',
              workspace: { token: WORKSPACE_TOKEN, name: 'fixture' },
            }
          },
          async list(workspaceToken: string) {
            calls.push({ operation: 'list', workspaceToken })
            return {
              operation: 'list-scripts',
              status: 'available',
              workspace: { token: WORKSPACE_TOKEN, name: 'fixture' },
              scripts: [{ token: SCRIPT_TOKEN, name: 'lint' }],
            }
          },
          run,
        },
      },
    }),
  )
  return { calls, items, pluginModule, run }
}

describe('workspace scripts isolated Prelude', () => {
  it('publishes select first, then host-listed script token actions', async () => {
    const harness = createHarness()
    await expect(harness.pluginModule.onFeatureTriggered('workspace-scripts', '')).resolves.toBe(
      true,
    )
    const selectItem = harness.items.find(item => item.meta.defaultAction === 'select-workspace')
    await expect(
      harness.pluginModule.onItemAction(selectItem, { actionId: 'select-workspace' }),
    ).resolves.toMatchObject({ success: true, status: 'completed' })

    expect(harness.calls.map(call => call.operation)).toEqual([
      'clear',
      'push',
      'select',
      'list',
      'clear',
      'push',
    ])
    const scriptItem = harness.items.find(item => item.title === 'lint')
    expect(scriptItem?.actions).toEqual([
      {
        id: 'run-script',
        type: 'plugin',
        label: 'Run',
        payload: { scriptToken: SCRIPT_TOKEN },
      },
    ])
    expect(JSON.stringify(harness.items)).not.toMatch(/command|cwd|path|executable|args|env/i)
  })

  it('dispatches only the opaque token selected from a standard action', async () => {
    const harness = createHarness()
    await harness.pluginModule.onFeatureTriggered('workspace-scripts', '')
    const selectItem = harness.items.find(item => item.meta.defaultAction === 'select-workspace')
    await harness.pluginModule.onItemAction(selectItem, { actionId: 'select-workspace' })
    const scriptItem = harness.items.find(item => item.title === 'lint')

    await expect(
      harness.pluginModule.onItemAction(scriptItem, { actionId: 'run-script' }),
    ).resolves.toMatchObject({ success: true, status: 'started' })
    expect(harness.run).toHaveBeenCalledExactlyOnceWith(SCRIPT_TOKEN)
  })

  it('does not dispatch forged path, command or token payloads', async () => {
    const harness = createHarness()
    await expect(
      harness.pluginModule.onItemAction(
        {
          meta: { defaultAction: 'run-script' },
          actions: [
            {
              id: 'run-script',
              payload: { scriptToken: 'pnpm test', cwd: '/tmp', command: 'calc' },
            },
          ],
        },
        { actionId: 'run-script' },
      ),
    ).resolves.toMatchObject({ status: 'blocked', reason: 'invalid-action' })
    expect(harness.run).not.toHaveBeenCalled()
  })

  it('degrades to an item when the capability is absent, instead of throwing at the host', async () => {
    // onFeatureTriggered used to throw here, outside its own try, so the error escaped into the
    // host. It fires on every input change, and the host marks a plugin CRASHED and disables it
    // after ten errors in 60s — so typing the keyword with no capability was enough to take the
    // plugin down until someone re-enabled it by hand (#819).
    const items: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(
      scriptsUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeTuffItemBuilder,
        plugin: {
          getLocale: () => 'en-US',
          feature: {
            async clearItems() {
              items.length = 0
            },
            async pushItems(next: Array<Record<string, any>>) {
              items.push(...next)
            },
          },
        },
      }),
    )

    // Ten in a row, which is what the host's sliding window counts.
    for (let attempt = 0; attempt < 10; attempt += 1)
      await expect(pluginModule.onFeatureTriggered('workspace-scripts', { text: 'lint' })).resolves.toBe(true)

    expect(items).toEqual([
      expect.objectContaining({
        title: 'Workspace Scripts Unavailable',
        subtitle: 'capability-unavailable',
      }),
    ])
  })

  it('still blocks the action itself when the capability is absent', async () => {
    // The other half: degrading the display must not make the action look runnable.
    const pluginModule = loadPluginModule(
      scriptsUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeTuffItemBuilder,
        plugin: {
          getLocale: () => 'en-US',
          feature: {
            async clearItems() {},
            async pushItems() {},
          },
        },
      }),
    )

    await expect(
      pluginModule.onItemAction(
        {
          meta: { defaultAction: 'run-script' },
          actions: [{ id: 'run-script', payload: { scriptToken: SCRIPT_TOKEN } }],
        },
        { actionId: 'run-script' },
      ),
    ).resolves.toMatchObject({ status: 'blocked', reason: 'capability-unavailable' })
  })
})
