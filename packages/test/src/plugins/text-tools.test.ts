import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const textToolsUrl = new URL('../../../../plugins/touch-text-tools/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, any>

  constructor(id: string) {
    this.item = { id, actions: [] }
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

  setMeta(meta: Record<string, any>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, title: string, payload: any) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

describe('touch-text-tools actions', () => {
  it('builds copy actions as plugin actions', async () => {
    const pushed: Array<Array<Record<string, any>>> = []
    const pluginModule = loadPluginModule(textToolsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      plugin: {
        feature: {
          clearItems() {},
          pushItems(items: Array<Record<string, any>>) { pushed.push(items) },
        },
        box: { hide() {} },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('text-tools', 'Hello')

    expect(pushed[0][0].actions[0]).toMatchObject({
      id: 'copy',
      type: 'plugin',
      title: '复制',
      payload: { text: 'HELLO' },
    })
  })

  it('blocks copy action when clipboard.write permission is denied', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(textToolsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request,
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        box: { hide },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'HELLO' }],
    })

    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制文本工具结果')
    expect(writeText).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks copy action when permission sdk is unavailable', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(textToolsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        box: { hide },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'HELLO' }],
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('copies action payload after clipboard.write permission is granted', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(textToolsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => true,
        request: vi.fn(),
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        box: { hide },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: { text: 'HELLO' } }],
    })

    expect(writeText).toHaveBeenCalledWith('HELLO')
    expect(hide).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ externalAction: true, status: 'started' })
  })
})
