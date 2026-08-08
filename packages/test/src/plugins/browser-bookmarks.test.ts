import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, loadPluginModuleWithSourceTransform, withoutGlobal } from './plugin-loader'

const browserBookmarksUrl = new URL('../../../../plugins/touch-browser-bookmarks/index.js', import.meta.url)
// The plugin exports its lifecycle and nothing else. That is not an oversight to
// route around: e37c92c8c removed the __test export in the isolated-runtime
// migration, and the plugin's own suite asserts its absence ("exports lifecycle
// only", plugins/touch-browser-bookmarks/index.test.cjs). Re-adding it to the
// shipped file would break that contract to serve a test.
//
// So the internals are re-exported at load time instead, into this test's copy of
// the module only -- the same approach intelligence.test.ts already takes.
const TEST_EXPORT_NAMES = [
  'normalizeUrlInput',
  'upsertBookmark',
  'cleanupRecent',
  'mergeRecentForDisplay',
] as const

const browserBookmarksTest = loadPluginModuleWithSourceTransform<{
  __test: Record<(typeof TEST_EXPORT_NAMES)[number], (...args: any[]) => any>
}>(
  browserBookmarksUrl,
  source => `${source}\nmodule.exports.__test={${TEST_EXPORT_NAMES.join(',')}}`,
  createPluginGlobals(),
).__test

// Mirrors the builder in plugins/touch-browser-bookmarks/index.test.cjs. This copy
// had drifted from it in two ways that made every item come out wrong:
// createAndAddAction was missing entirely (only the older addAction existed), so
// every build threw; and setMeta overwrote rather than merged, while the plugin
// calls it twice per item.
class FakeBuilder {
  item: Record<string, unknown>
  basic: Record<string, unknown>

  constructor(id: string) {
    this.item = { id, meta: {}, actions: [] }
    this.basic = {}
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon: unknown) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...(this.item.meta as Record<string, unknown>), ...meta }
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    ;(this.item.actions as unknown[]).push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

// buildActionItem (plugins/touch-browser-bookmarks/index.js:448-465) puts the
// payload, sourceType and capability diagnostics in the item's *action*; item.meta
// carries only pluginName / featureId / defaultAction. The assertions below read
// the action, which is where the plugin actually writes them.
function actionPayload(item: unknown): Record<string, any> | undefined {
  return (item as { actions?: Array<{ payload?: Record<string, any> }> })?.actions?.[0]?.payload
}

describe('browser bookmarks plugin', () => {
  it('declares network permission for external URL opening', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../../plugins/touch-browser-bookmarks/manifest.json', import.meta.url), 'utf8'))

    expect(manifest.permissions.optional).toContain('network.internet')
    expect(manifest.permissionReasons['network.internet']).toContain('默认浏览器打开')
  })

  it('normalizes only http and https URL inputs', () => {
    expect(browserBookmarksTest.normalizeUrlInput('example.com')).toBe('https://example.com/')
    expect(browserBookmarksTest.normalizeUrlInput('https://example.com/docs')).toBe('https://example.com/docs')
    expect(browserBookmarksTest.normalizeUrlInput('file:///tmp/demo.txt')).toBeNull()
  })

  it('upserts bookmark by url', () => {
    const now = 1_700_000_000_000
    const first = browserBookmarksTest.upsertBookmark([], {
      url: 'example.com',
      title: 'Example',
      tags: ['news'],
    }, now)

    const second = browserBookmarksTest.upsertBookmark(first, {
      url: 'https://example.com',
      title: 'Example Updated',
      tags: ['daily'],
      pinned: true,
    }, now + 1000)

    expect(second.length).toBe(1)
    expect(second[0].title).toBe('Example Updated')
    expect(second[0].pinned).toBe(true)
    expect(second[0].tags).toContain('news')
    expect(second[0].tags).toContain('daily')
  })

  it('cleans recent items and removes expired/duplicate entries', () => {
    const now = Date.now()
    const tooOld = now - (31 * 24 * 60 * 60 * 1000)
    const cleaned = browserBookmarksTest.cleanupRecent([
      { url: 'https://a.com', title: 'A old', lastUsedAt: tooOld },
      { url: 'https://a.com', title: 'A new', lastUsedAt: now - 1000 },
      { url: 'https://b.com', title: 'B', lastUsedAt: now - 500 },
    ], now)

    expect(cleaned.length).toBe(2)
    expect(cleaned[0].url).toBe('https://b.com/')
    expect(cleaned[1].url).toBe('https://a.com/')
    expect(cleaned[1].title).toBe('A new')
  })

  it('merges recent display by excluding bookmarks', () => {
    const recent = [
      { url: 'https://a.com/', title: 'A', lastUsedAt: 3 },
      { url: 'https://b.com/', title: 'B', lastUsedAt: 2 },
      { url: 'https://c.com/', title: 'C', lastUsedAt: 1 },
    ]
    const bookmarks = [
      { url: 'https://b.com/' },
    ]

    const merged = browserBookmarksTest.mergeRecentForDisplay(recent, bookmarks)
    expect(merged.length).toBe(2)
    expect(merged[0].url).toBe('https://a.com/')
    expect(merged[1].url).toBe('https://c.com/')
  })

  it('shows network permission diagnostics without prompting', async () => {
    const items: Array<{ title?: string, meta?: Record<string, any>, subtitle?: string }> = []
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async (permissionId: string) => permissionId !== 'network.internet',
        request,
      },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, meta?: Record<string, any>, subtitle?: string }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('browser-bookmarks', 'example.com')

    const openItem = items.find(item => item.title === '默认浏览器打开')
    expect(openItem?.subtitle).toContain('缺少 network.internet 权限')
    expect(actionPayload(openItem)?.capability).toMatchObject({
      id: 'network.internet',
      type: 'network',
      permission: 'network.internet',
      status: 'permission-missing',
      reason: 'network-internet-permission-required',
      audit: {
        pluginName: 'touch-browser-bookmarks',
        featureId: 'browser-bookmarks',
        actionId: 'open-url',
        operation: 'open-external-url',
        source: 'quick',
        urlHost: 'example.com',
      },
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('shows permission sdk unavailable diagnostics without prompting', async () => {
    const items: Array<{ title?: string, meta?: Record<string, any>, subtitle?: string }> = []
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, meta?: Record<string, any>, subtitle?: string }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('browser-bookmarks', 'example.com')

    const openItem = items.find(item => item.title === '默认浏览器打开')
    expect(openItem?.subtitle).toContain('缺少 network.internet 权限')
    expect(actionPayload(openItem)?.capability).toMatchObject({
      status: 'permission-missing',
      reason: 'permission-sdk-unavailable',
      permission: 'network.internet',
    })
  })

  // e37c92c8c deleted ensurePermission and both permission.request calls: the
  // plugin no longer prompts, the HOST enforces. It calls openUrl / clipboard.writeText
  // and reads the thrown error -- PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED means denied,
  // anything else means the call failed. The tests below asserted the deleted
  // prompting contract (that `request` was called with a reason string, and that the
  // capability was never invoked); they now drive the capability the way the host does.
  // The intent of each is unchanged: denied / unavailable / failed / granted.
  const HOST_DENIED = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'

  function hostDenied(message: string) {
    return Object.assign(new Error(message), { code: HOST_DENIED })
  }

  it('blocks external URL opening when the host denies network permission', async () => {
    const openUrl = vi.fn(async () => {
      throw hostDenied('/private/open denied')
    })
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'https://example.com', title: 'Example' } }],
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 network.internet 权限',
    })
  })

  it('blocks external URL opening when the host exposes no openUrl capability', async () => {
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl: withoutGlobal(),
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'https://example.com', title: 'Example' } }],
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'open-url-unavailable',
    })
  })

  it('separates a failed host open from a denied one', async () => {
    const openUrl = vi.fn(async () => {
      throw new Error('open transport failed')
    })
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'https://example.com', title: 'Example' } }],
    })

    // A transport failure must not be reported as a permission problem: it would
    // send the user to a permission screen that has nothing to fix.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'open-url-failed',
      message: '打开外部链接失败',
    })
  })

  it('blocks URL copy when the host denies clipboard.write', async () => {
    const writeText = vi.fn(async () => {
      throw hostDenied('/private/clipboard denied')
    })
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'copy-url', payload: { url: 'example.com' } }],
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '复制失败：缺少 clipboard.write 权限',
    })
  })

  it('blocks URL copy when the host exposes no clipboard', async () => {
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: withoutGlobal(),
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'copy-url', payload: { url: 'example.com' } }],
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    })
  })

  it('separates a failed clipboard write from a denied one', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard transport failed')
    })
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'copy-url', payload: { url: 'example.com' } }],
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-write-failed',
      message: '复制失败',
    })
  })

  it('copies the normalized URL when the host allows clipboard.write', async () => {
    const writeText = vi.fn(async () => undefined)
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'copy-url', payload: { url: 'example.com' } }],
    })

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(writeText).toHaveBeenCalledWith('https://example.com/')
  })

  it('opens the external URL and records it as recent when the host allows it', async () => {
    const openUrl = vi.fn(async () => undefined)
    const writes: Array<{ file: string, data: any }> = []
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile(file: string, data: any) { writes.push({ file, data }) },
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'example.com', title: 'Example' } }],
    })

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
    expect(writes.at(-1)).toMatchObject({
      file: 'recent-urls.json',
      data: {
        items: [
          {
            url: 'https://example.com/',
            title: 'Example',
          },
        ],
      },
    })
  })

  it('renders manual, pinned, recent, and direct quicklinks with compatible source payloads', async () => {
    const items: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }> = []
    const files: Record<string, unknown> = {
      'bookmarks.json': {
        items: [
          {
            id: 'bookmark-regular',
            url: 'https://regular.example/',
            title: 'Regular manual bookmark',
            tags: ['docs'],
            pinned: false,
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: 'bookmark-pinned',
            url: 'https://pinned.example/',
            title: 'Pinned manual bookmark',
            tags: ['docs'],
            pinned: true,
            createdAt: 1,
            updatedAt: 3,
          },
        ],
      },
      'recent-urls.json': {
        items: [{
          url: 'https://recent.example/',
          title: 'Recent manual quicklink',
          lastUsedAt: 4_102_444_800_000,
        }],
      },
    }
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, subtitle?: string, meta?: Record<string, any> }>) { items.push(...next) },
        },
        storage: {
          async getFile(file: string) { return files[file] ?? null },
          async setFile() {
            throw new Error('rendering manual quicklinks must not rewrite stored records')
          },
        },
      },
    }))

    await pluginModule.onFeatureTriggered('browser-bookmarks', '')

    const regular = items.find(item => item.title === '手动收藏 · Regular manual bookmark')
    const pinned = items.find(item => item.title === '手动收藏 · Pinned manual bookmark')
    const recent = items.find(item => item.title === '手动最近 · Recent manual quicklink')

    expect(actionPayload(regular)).toMatchObject({
      sourceType: 'manual-quicklink',
      url: 'https://regular.example/',
      title: 'Regular manual bookmark',
      source: 'bookmark',
    })
    expect(actionPayload(pinned)).toMatchObject({
      sourceType: 'manual-pinned-quicklink',
      url: 'https://pinned.example/',
      title: 'Pinned manual bookmark',
      source: 'bookmark',
    })
    expect(pinned?.subtitle).toContain('PINNED')
    expect(actionPayload(recent)).toMatchObject({
      sourceType: 'manual-recent-quicklink',
      url: 'https://recent.example/',
      title: 'Recent manual quicklink',
      source: 'recent',
    })

    await pluginModule.onFeatureTriggered('browser-bookmarks', 'https://direct.example')

    // sourceType and the payload live in the action, not item.meta; sourceKind no
    // longer exists in the plugin at all, so it is dropped rather than relocated.
    const directOpen = items.find(item => item.title === '默认浏览器打开')
    const directAdd = items.find(item => item.title === '添加到收藏')
    const directCopy = items.find(item => item.title === '复制 URL')

    expect(actionPayload(directOpen)).toMatchObject({
      sourceType: 'manual-quicklink',
      url: 'https://direct.example/',
      source: 'quick',
    })
    expect(actionPayload(directAdd)).toMatchObject({
      url: 'https://direct.example/',
      sourceType: 'manual-quicklink',
    })
    expect(actionPayload(directAdd)?.source).toBeUndefined()
    expect(actionPayload(directCopy)).toEqual({
      url: 'https://direct.example/',
      sourceType: 'manual-quicklink',
    })
  })
})
