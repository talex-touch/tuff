import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

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

  setMeta() {
    return this
  }

  build() {
    return this.item
  }
}

function createTestGlobals(
  items: Array<{ title?: string, subtitle?: string }>,
  permissionAllowed: boolean,
) {
  return createPluginGlobals({
    TuffItemBuilder: FakeBuilder,
    permission: {
      check: async () => permissionAllowed,
      request: async () => permissionAllowed,
    },
    plugin: {
      feature: {
        clearItems() { items.length = 0 },
        pushItems(next: Array<{ title?: string, subtitle?: string }>) { items.push(...next) },
      },
    },
  })
}

const systemPlugin = loadPluginModule(new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url))
const { __test: systemTest } = systemPlugin

describe('system actions plugin', () => {
  it('contains full action set on darwin', () => {
    const actions = systemTest.resolveActions('darwin')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('lock-screen')
    expect(ids).toContain('volume-up')
    expect(ids).toContain('volume-down')
    expect(ids).toContain('mute')
    expect(ids).toContain('brightness-up')
    expect(ids).toContain('brightness-down')
    expect(ids).toContain('open-main-window')
  })

  it('keeps windows action list without brightness items', () => {
    const actions = systemTest.resolveActions('win32')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('shutdown')
    expect(ids).toContain('restart')
    expect(ids).toContain('open-main-window')
    expect(ids).not.toContain('brightness-up')
    expect(ids).not.toContain('brightness-down')
  })

  it('matches keyword search', () => {
    const actions = systemTest.resolveActions('darwin')
    const matched = systemTest.matchActions(actions, 'shutdown')

    expect(matched.some(action => action.id === 'shutdown')).toBe(true)
  })

  it('returns grouped order by priority', () => {
    const actions = [
      { id: 'a', group: 'window' },
      { id: 'b', group: 'power' },
      { id: 'c', group: 'audio' },
    ]

    const order = systemTest.resolveGroupOrder(actions)
    expect(order).toEqual(['power', 'audio', 'window'])
  })

  it('builds normalized search tokens', () => {
    const tokens = systemTest.buildSearchTokens({
      name: 'Main Window',
      description: 'Show Tuff',
      keywords: ['Open Window'],
    })

    expect(tokens).toContain('main window')
    expect(tokens).toContain('mainwindow')
    expect(tokens).toContain('show tuff')
    expect(tokens).toContain('showtuff')
    expect(tokens).toContain('open window')
    expect(tokens).toContain('openwindow')
  })

  it('shows permission hint when denied', async () => {
    const items: Array<{ title?: string, subtitle?: string }> = []
    const globals = createTestGlobals(items, false)

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '')
    expect(items.length).toBe(1)
    expect(items[0]?.title).toBe('缺少系统权限')
  })

  it('returns empty hint when no matches', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createTestGlobals(items, true)

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '不存在的指令')
    expect(items[0]?.title).toBe('没有匹配的系统操作')
  })

  it('builds grouped items for matches', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createTestGlobals(items, true)

    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      globals,
    )

    await pluginModule.onFeatureTriggered('system-actions', '关机')
    expect(items.length).toBeGreaterThan(1)
    expect(items[0]?.title).toBe('电源操作')
  })
})
