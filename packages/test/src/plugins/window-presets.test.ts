import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const pluginUrl = new URL('../../../../plugins/touch-window-presets/index.js', import.meta.url)

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

  createAndAddAction(
    id: string,
    _type: string,
    _label: string,
    payload: Record<string, unknown>,
  ) {
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
  const status = vi.fn(async () => ({
    operation: 'status',
    status: 'available',
    windowCount: 3,
  }))
  const runAction = vi.fn(async (actionId: string) => ({
    operation: 'run-action',
    actionId,
    status: 'completed',
    affectedWindows: actionId === 'preset-clear-topmost' ? 3 : 2,
  }))
  const pluginModule = loadPluginModule(
    pluginUrl,
    createPluginGlobals({
      platform: { platform, arch: 'x64' },
      TuffItemBuilder: TestTuffItemBuilder,
      logger: { error: vi.fn() },
      plugin: {
        feature: { clearItems, pushItems },
        windowPresets: { status, runAction },
      },
    }),
  )
  return { clearItems, pluginModule, pushItems, runAction, state, status }
}

describe('window presets isolated Prelude', () => {
  it('awaits status and feature publication for all fixed workflows', async () => {
    const harness = createHarness()
    await expect(
      harness.pluginModule.onFeatureTriggered('window-presets', { text: '' }),
    ).resolves.toBe(true)

    expect(harness.status).toHaveBeenCalledOnce()
    expect(harness.clearItems).toHaveBeenCalledBefore(harness.pushItems)
    expect(harness.state.items.find(item => item.id === 'window-presets-window-count')?.subtitle).toBe(
      '3 个',
    )
    expect(
      harness.state.items.flatMap(item => item.actions).map(action => action.payload?.actionId),
    ).toEqual(['preset-two-column', 'preset-dev-split', 'preset-clear-topmost'])
    expect(harness.state.items.every(item => item.icon?.type === 'class')).toBe(true)
  })

  it('dispatches only a fixed action from the standard action payload', async () => {
    const harness = createHarness()
    await harness.pluginModule.onFeatureTriggered('window-presets', 'dev')
    const item = harness.state.items.find(
      entry => entry.actions[0]?.payload?.actionId === 'preset-dev-split',
    )
    await expect(
      harness.pluginModule.onItemAction(item, { actionId: 'run-action' }),
    ).resolves.toMatchObject({ success: true, status: 'completed' })
    expect(harness.runAction).toHaveBeenCalledExactlyOnceWith('preset-dev-split')

    await expect(
      harness.pluginModule.onItemAction({
        meta: { defaultAction: 'window-presets-action' },
        actions: [{ id: 'run-action', payload: { actionId: 'restart', script: 'calc.exe' } }],
      }),
    ).resolves.toMatchObject({ status: 'blocked', reason: 'invalid-action' })
    expect(harness.runAction).toHaveBeenCalledTimes(1)
  })

  it('uses the frozen platform snapshot and never calls status off Windows', async () => {
    const harness = createHarness('darwin')
    await expect(harness.pluginModule.onFeatureTriggered('window-presets', '')).resolves.toBe(true)
    expect(harness.status).not.toHaveBeenCalled()
    expect(harness.runAction).not.toHaveBeenCalled()
    expect(harness.state.items).toHaveLength(1)
    expect(harness.state.items[0]?.title).toBe('当前平台暂不支持窗口预设')
  })
})
