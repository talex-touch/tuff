import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const batchRenameUrl = new URL('../../../../plugins/touch-batch-rename/index.js', import.meta.url)
const renamePlugin = loadPluginModule(batchRenameUrl)
const { __test: renameTest } = renamePlugin

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

describe('batch rename rules', () => {
  it('parses rule tokens', () => {
    const rules = renameTest.parseRules(
      'prefix:IMG_ suffix:_done replace:foo->bar seq:1:3 date:YYYYMMDD',
    )
    expect(rules.prefix).toBe('IMG_')
    expect(rules.suffix).toBe('_done')
    expect(rules.replaces.length).toBe(1)
    expect(rules.seq?.start).toBe(1)
    expect(rules.seq?.pad).toBe(3)
    expect(rules.dateFormat).toBe('YYYYMMDD')
  })

  it('builds rename plan with sequence and date', () => {
    const rules = renameTest.parseRules(
      'prefix:IMG_ suffix:_done seq:1:3 date:YYYYMMDD',
    )
    const now = new Date(2025, 0, 2)
    const plan = renameTest.buildRenamePlan(['/tmp/foo.txt', '/tmp/bar.txt'], rules, now)

    expect(plan.items[0].nextName).toBe('IMG_foo_done_20250102_001.txt')
    expect(plan.items[1].nextName).toBe('IMG_bar_done_20250102_002.txt')
  })

  it('blocks apply action when fs.write permission is denied', async () => {
    const request = vi.fn(async () => false)
    const storageSetFile = vi.fn()
    const pushedItems: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async (permissionId: string) => permissionId === 'fs.read',
        request,
      },
      plugin: {
        feature: {
          clearItems() {
            pushedItems.length = 0
          },
          pushItems(items: Array<Record<string, any>>) {
            pushedItems.push(...items)
          },
        },
        storage: {
          async getFile() {
            return null
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('batch-rename', {
      text: 'prefix:NEW_',
      inputs: [
        { type: 'files', content: JSON.stringify(['/tmp/example.txt']) },
      ],
    })

    const applyItem = pushedItems.find(item => item.meta?.actionId === 'apply')
    const result = await pluginModule.onItemAction(applyItem)

    expect(request).toHaveBeenCalledWith('fs.write', '需要文件写入权限以执行重命名')
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('does not expose apply action when permission sdk is unavailable', async () => {
    const storageSetFile = vi.fn()
    const pushedItems: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() {
            pushedItems.length = 0
          },
          pushItems(items: Array<Record<string, any>>) {
            pushedItems.push(...items)
          },
        },
        storage: {
          async getFile() {
            return null
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('batch-rename', {
      text: 'prefix:NEW_',
      inputs: [
        { type: 'files', content: JSON.stringify(['/tmp/example.txt']) },
      ],
    })

    const applyItem = pushedItems.find(item => item.meta?.actionId === 'apply')

    expect(applyItem).toBeUndefined()
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(pushedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '缺少读取权限',
        subtitle: '请授予文件读取权限',
      }),
    ]))
  })

  it('blocks undo action when fs.write permission is denied', async () => {
    const request = vi.fn(async () => false)
    const storageGetFile = vi.fn()
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      permission: {
        check: async () => false,
        request,
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          getFile: storageGetFile,
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'batch-rename',
        actionId: 'undo',
        featureId: 'batch-rename',
      },
    })

    expect(request).toHaveBeenCalledWith('fs.write', '需要文件写入权限以撤销重命名')
    expect(storageGetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks undo action when permission sdk is unavailable', async () => {
    const storageGetFile = vi.fn()
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          getFile: storageGetFile,
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'batch-rename',
        actionId: 'undo',
        featureId: 'batch-rename',
      },
    })

    expect(storageGetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
  })

  it('blocks apply action when fs.write permission request fails', async () => {
    const storageSetFile = vi.fn()
    const pushedItems: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async (permissionId: string) => permissionId === 'fs.read',
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
      plugin: {
        feature: {
          clearItems() {
            pushedItems.length = 0
          },
          pushItems(items: Array<Record<string, any>>) {
            pushedItems.push(...items)
          },
        },
        storage: {
          async getFile() {
            return null
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('batch-rename-request-failed', {
      text: 'prefix:NEW_',
      inputs: [
        { type: 'files', content: JSON.stringify(['/tmp/example.txt']) },
      ],
    })

    const applyItem = pushedItems.find(item => item.meta?.actionId === 'apply')
    const result = await pluginModule.onItemAction(applyItem)

    expect(storageSetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
  })

  it('blocks undo action when fs.write permission request fails', async () => {
    const storageGetFile = vi.fn()
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          getFile: storageGetFile,
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'batch-rename',
        actionId: 'undo',
        featureId: 'batch-rename',
      },
    })

    expect(storageGetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
  })

  it('keeps apply inert when no preview plan exists', async () => {
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      permission: {
        check: async () => false,
        request,
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'batch-rename',
        actionId: 'apply',
        featureId: 'missing-preview',
      },
    })

    expect(request).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })
})
