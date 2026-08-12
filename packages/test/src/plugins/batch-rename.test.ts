import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, loadPluginModuleWithSourceTransform, withoutGlobal } from './plugin-loader'

const batchRenameUrl = new URL('../../../../plugins/touch-batch-rename/index.js', import.meta.url)

// e37c92c8c removed the __test export. Both helpers still exist in the plugin and are
// simply not exported, so they are re-exported at load time into this suite's copy of
// the module rather than adding a test-only export back to the shipped file.
const TEST_EXPORT_NAMES = ['parseRules', 'buildRenamePlan'] as const

const renameTest = loadPluginModuleWithSourceTransform<{
  __test: Record<(typeof TEST_EXPORT_NAMES)[number], (...args: any[]) => any>
}>(
  batchRenameUrl,
  source => `${source}\nmodule.exports.__test={${TEST_EXPORT_NAMES.join(',')}}`,
  createPluginGlobals(),
).__test

class FakeBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id, meta: {}, actions: [] }
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
    this.item.meta = { ...(this.item.meta as Record<string, unknown>), ...meta }
    return this
  }

  // buildItem attaches the action id here (index.js:217-218), not to meta. Without
  // this the items came back with no actions at all, so every lookup below missed.
  createAndAddAction(id: string, type: string, title: string, payload?: unknown) {
    ;(this.item.actions as unknown[]).push({ id, type, title, payload })
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

    // The plan item field is targetName; nextName was renamed in e37c92c8c.

    expect(plan.items[0].targetName).toBe('IMG_foo_done_20250102_001.txt')
    expect(plan.items[1].targetName).toBe('IMG_bar_done_20250102_002.txt')
  })

  it('blocks apply action when fs.write permission is denied', async () => {
    const check = vi.fn(async (permissionId: string) => permissionId === 'fs.read')
    const storageSetFile = vi.fn()
    const pushedItems: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: { check },
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

    const applyItem = pushedItems.find(item => item.actions?.[0]?.id === 'apply')
    const result = await pluginModule.onItemAction(applyItem)

    expect(check).toHaveBeenCalledWith('fs.write')
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

    const applyItem = pushedItems.find(item => item.actions?.[0]?.id === 'apply')

    expect(applyItem).toBeUndefined()
    expect(storageSetFile).not.toHaveBeenCalled()
    // The SDK is absent, so there is nothing for the user to grant. Showing "请授予文件读取权限"
    // here sent them after a permission they may already hold (#821); it is reserved for a
    // real denial, which the test above covers.
    expect(pushedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '权限系统不可用',
        subtitle: '无法确认文件读取权限 · permission-sdk-unavailable',
      }),
    ]))
  })

  it('does tell the user to grant it when fs.read is genuinely denied', async () => {
    // The other half of the branch above. Without this, moving the grant advice behind a
    // condition could silently retire it for everyone.
    const pushedItems: Array<Record<string, any>> = []
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: { check: vi.fn(async () => false) },
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
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('batch-rename', {
      text: 'prefix:NEW_',
      inputs: [
        { type: 'files', content: JSON.stringify(['/tmp/example.txt']) },
      ],
    })

    expect(pushedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '缺少读取权限',
        subtitle: '请授予文件读取权限',
      }),
    ]))
  })

  // ensurePermission (index.js) calls permission.check only. There is no permission.request
  // path left, so the assertions that one was called with a reason string were describing a
  // gate that e37c92c8c removed.
  //
  // It used to collapse three distinct situations -- denied, SDK absent, check threw -- into a
  // single false, so all three surfaced as 'permission-denied' and a user whose permission host
  // was missing was told to grant a permission they may already hold. Fixed in #821; the three
  // tests below now hold the reasons apart, which is what makes the fix checkable.
  function undoModule(permissionOverride: unknown, storageGetFile = vi.fn()) {
    return {
      storageGetFile,
      module: loadPluginModule(batchRenameUrl, createPluginGlobals({
        permission: permissionOverride,
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
      })),
    }
  }

  const undoItem = {
    meta: { defaultAction: 'batch-rename', featureId: 'batch-rename' },
    actions: [{ id: 'undo' }],
  }

  it('blocks undo action when fs.write permission is denied', async () => {
    const check = vi.fn(async () => false)
    const harness = undoModule({ check })

    const result = await harness.module.onItemAction(undoItem)

    expect(check).toHaveBeenCalledWith('fs.write')
    expect(harness.storageGetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 fs.write 权限',
    })
  })

  it('blocks undo action when the permission sdk is unavailable', async () => {
    const harness = undoModule(withoutGlobal())

    const result = await harness.module.onItemAction(undoItem)

    expect(harness.storageGetFile).not.toHaveBeenCalled()
    // Still fail-closed, but named as what it is. Telling this user to grant fs.write would
    // send them after a permission they may already hold (#821).
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
      message: '权限系统不可用',
    })
  })

  it('blocks undo action when the permission check throws', async () => {
    const check = vi.fn(async () => {
      throw new Error('permission transport failed')
    })
    const harness = undoModule({ check })

    const result = await harness.module.onItemAction(undoItem)

    expect(check).toHaveBeenCalledWith('fs.write')
    expect(harness.storageGetFile).not.toHaveBeenCalled()
    // A transport fault is its own reason now, so it is diagnosable rather than looking like
    // something the user did wrong.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-check-failed',
      message: '权限检查失败',
    })
  })

  it('refuses apply before a preview exists, without touching permissions', async () => {
    const check = vi.fn(async () => true)
    const pluginModule = loadPluginModule(batchRenameUrl, createPluginGlobals({
      permission: { check },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'batch-rename', featureId: 'missing-preview' },
      actions: [{ id: 'apply' }],
    })

    // The preview check runs before the permission gate (index.js:379-383), so a user
    // with nothing staged is not asked for fs.write first. The old test asserted
    // undefined, which it got only because the action id was passed where nothing read
    // it -- the handler bailed before reaching any of this.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'preview-missing',
      message: '请先生成重命名预览',
    })
    expect(check).not.toHaveBeenCalled()
  })
})
