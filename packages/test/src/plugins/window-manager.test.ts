import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const pluginUrl = new URL('../../../../plugins/touch-window-manager/index.js', import.meta.url)
const WINDOW_TOKEN = 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APP_TOKEN = 'wm_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

interface Item {
  id: string
  title?: string
  subtitle?: string
  icon?: { type: string, value: string }
  meta: Record<string, unknown>
  actions: Array<{ id: string, payload?: Record<string, unknown> }>
}

class TestTuffItemBuilder {
  item: Item

  constructor(id: string) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type: string, id: string, name: string) {
    Object.assign(this.item, { source: { type, id, name } })
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

  setIcon(icon: { type: string, value: string }) {
    this.item.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id: string, _type: string, _label: string, payload: Record<string, unknown>) {
    this.item.actions.push({ id, payload })
    return this
  }

  build() {
    return this.item
  }
}

function createHarness(platform = 'win32') {
  const state = { items: [] as Item[] }
  const clearItems = vi.fn(async () => {
    state.items = []
  })
  const pushItems = vi.fn(async (items: Item[]) => {
    state.items = items
  })
  const list = vi.fn(async () => ({
    operation: 'list',
    status: 'available',
    platform,
    items: [
      {
        kind: 'window',
        token: WINDOW_TOKEN,
        name: 'Terminal',
        title: 'Workspace',
        isFront: true,
        topmost: false,
        actions: ['activate', 'snap-left', 'snap-right', 'topmost-toggle', 'close', 'hide', 'quit'],
      },
      {
        kind: 'app',
        token: APP_TOKEN,
        name: 'Terminal',
        running: true,
        actions: ['launch'],
      },
    ],
  }))
  const act = vi.fn(async (action: string) => ({
    operation: 'act',
    action,
    status: 'completed',
  }))
  const pluginModule = loadPluginModule(
    pluginUrl,
    createPluginGlobals({
      platform: { platform, arch: 'x64' },
      TuffItemBuilder: TestTuffItemBuilder,
      logger: { error: vi.fn() },
      plugin: {
        feature: { clearItems, pushItems },
        windowManager: { list, act },
      },
    }),
  )
  return { act, clearItems, list, pluginModule, pushItems, state }
}

describe('window manager isolated Prelude', () => {
  it('awaits host inventory and publishes only redacted token actions', async () => {
    const harness = createHarness()
    await expect(harness.pluginModule.onFeatureTriggered('window-app', { text: '' })).resolves.toBe(true)

    expect(harness.list).toHaveBeenCalledOnce()
    expect(harness.clearItems).toHaveBeenCalledBefore(harness.pushItems)
    const window = harness.state.items.find(item => item.title === 'Terminal')
    const app = harness.state.items.find(item => item.title === '应用 · Terminal')
    expect(window?.actions.map(action => action.id)).toEqual([
      'activate',
      'snap-left',
      'snap-right',
      'topmost-toggle',
      'close',
      'hide',
      'quit',
    ])
    expect(app?.actions).toEqual([
      expect.objectContaining({ id: 'launch', payload: { action: 'launch', token: APP_TOKEN } }),
    ])
    expect(JSON.stringify(harness.state.items)).not.toMatch(/nativeId|handle|pid|appPath|Program Files/i)
    expect(harness.state.items.every(item => item.icon?.type === 'class')).toBe(true)
  })

  it('dispatches only fixed action plus opaque token and rejects hostile payloads locally', async () => {
    const harness = createHarness()
    await harness.pluginModule.onFeatureTriggered('window-app', 'Terminal')
    const window = harness.state.items.find(item => item.title === 'Terminal')
    await expect(harness.pluginModule.onItemAction(window, { actionId: 'topmost-toggle' })).resolves.toMatchObject({
      success: true,
      status: 'completed',
    })
    expect(harness.act).toHaveBeenCalledExactlyOnceWith('topmost-toggle', WINDOW_TOKEN)

    await expect(
      harness.pluginModule.onItemAction({
        meta: { defaultAction: 'activate' },
        actions: [
          {
            id: 'activate',
            payload: {
              action: 'activate',
              token: WINDOW_TOKEN,
              handle: '100',
              script: 'calc.exe',
            },
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'blocked', reason: 'invalid-action' })
    expect(harness.act).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the window capability on unsupported platforms', async () => {
    const harness = createHarness('linux')
    await expect(harness.pluginModule.onFeatureTriggered('window-app', '')).resolves.toBe(true)
    expect(harness.list).not.toHaveBeenCalled()
    expect(harness.act).not.toHaveBeenCalled()
    expect(harness.state.items).toHaveLength(1)
    expect(harness.state.items[0]?.title).toBe('当前平台暂不支持窗口管理')
  })
})
