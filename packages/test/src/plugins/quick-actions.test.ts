import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const quickActionsPlugin = loadPluginModule(new URL('../../../../plugins/touch-quick-actions/index.js', import.meta.url))
const { __test: quickActionsTest } = quickActionsPlugin
const quickActionsUrl = new URL('../../../../plugins/touch-quick-actions/index.js', import.meta.url)

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

describe('quick actions plugin', () => {
  it('returns windows quick actions set', () => {
    const actions = quickActionsTest.resolveActions('win32')
    const ids = actions.map(action => action.id)

    expect(ids).toContain('restart')
    expect(ids).toContain('shutdown')
    expect(ids).toContain('lock-screen')
    expect(ids).toContain('mute-toggle')
    expect(ids).toContain('notification-settings')
    expect(ids).toContain('display-settings')
  })

  it('matches quick actions by keyword', () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const matched = quickActionsTest.matchActions(actions, '静音')

    expect(matched.some(action => action.id === 'mute-toggle')).toBe(true)
  })

  it('keeps group order instant then settings', () => {
    const order = quickActionsTest.resolveGroupOrder([
      { group: 'settings' },
      { group: 'instant' },
    ])

    expect(order).toEqual(['instant', 'settings'])
  })

  it('returns all actions when keyword is empty', () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const matched = quickActionsTest.matchActions(actions, '')

    expect(matched.length).toBe(actions.length)
  })

  it('keeps restart and shutdown in common actions', () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const common = quickActionsTest.resolveCommonActions(actions)
    const ids = common.map(action => action.id)

    expect(ids).toContain('restart')
    expect(ids).toContain('shutdown')
  })

  it('builds dynamic features with hyphenated ids', () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const dynamicFeatures = quickActionsTest.buildDynamicFeatures(actions, 'darwin')

    expect(dynamicFeatures.every(feature => feature.id.startsWith('quick-action-'))).toBe(true)
    expect(dynamicFeatures.every(feature => !feature.id.includes('.'))).toBe(true)
    expect(dynamicFeatures.every(feature => feature.push === false)).toBe(true)
  })

  it('registers dynamic features during onInit and keeps idempotency', () => {
    const added: Array<{ id: string }> = []
    const featureMap = new Map<string, { id: string }>()
    const globals = createPluginGlobals({
      features: {
        addFeature(feature: { id: string }) {
          added.push(feature)
          featureMap.set(feature.id, feature)
          return true
        },
        getFeature(id: string) {
          return featureMap.get(id) ?? null
        },
      },
    })
    const pluginModule = loadPluginModule(quickActionsUrl, globals)

    pluginModule.onInit()
    pluginModule.onInit()

    const expectedIds = quickActionsTest
      .buildDynamicFeatures(quickActionsTest.resolveActions(process.platform), process.platform)
      .map(feature => feature.id)

    expect(added.map(feature => feature.id)).toEqual(expectedIds)
  })

  it('pushes common actions directly when keyword is empty', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string }>) { items.push(...next) },
        },
      },
    })
    const pluginModule = loadPluginModule(quickActionsUrl, globals)

    await pluginModule.onFeatureTriggered('quick-actions', '')

    const titles = items.map(item => item.title)
    expect(titles).toContain('重启')
    expect(titles).toContain('关机')
    expect(titles).not.toContain('即时动作')
  })

  it('executes dynamic feature directly without entering list mode', async () => {
    let confirmCalls = 0
    const globals = createPluginGlobals({
      permission: {
        check: async () => true,
        request: async () => true,
      },
      dialog: {
        showMessageBox: async () => {
          confirmCalls += 1
          return { response: 0 }
        },
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {
            throw new Error('dynamic feature should not push list items')
          },
        },
      },
    })
    const pluginModule = loadPluginModule(quickActionsUrl, globals)

    const result = await pluginModule.onFeatureTriggered('quick-action-restart', '')

    expect(result).toBe(false)
    expect(confirmCalls).toBe(1)
  })

  it('requires double confirmation for dangerous actions', async () => {
    const actions = quickActionsTest.resolveActions('darwin')
    const restart = actions.find(action => action.id === 'restart')
    expect(restart).toBeTruthy()

    const responses = [1, 0]
    let confirmCalls = 0
    const globals = createPluginGlobals({
      permission: {
        check: async () => true,
        request: async () => true,
      },
      dialog: {
        showMessageBox: async () => {
          confirmCalls += 1
          return { response: responses.shift() ?? 0 }
        },
      },
    })
    const pluginModule = loadPluginModule(quickActionsUrl, globals)

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'quick-actions',
        actionId: 'run-action',
        payload: { action: restart },
      },
    })

    expect(confirmCalls).toBe(2)
    expect(result?.success).toBe(false)
    expect(result?.message).toBe('操作已取消')
  })

  it('returns empty list on unsupported platform', () => {
    const actions = quickActionsTest.resolveActions('linux')
    expect(actions.length).toBe(0)
  })
})
