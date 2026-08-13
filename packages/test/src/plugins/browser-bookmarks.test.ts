import { readFileSync } from 'node:fs'
import { PLUGIN_BLOCKED_REASONS } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const browserBookmarksUrl = new URL('../../../../plugins/touch-browser-bookmarks/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, unknown>

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

  setIcon() {
    return this
  }

  // Merges, like the real builder. The plugin calls setMeta twice per item, so
  // overwriting dropped whichever half came first.
  setMeta(meta: Record<string, unknown>) {
    this.item.meta = { ...(this.item.meta as Record<string, unknown>), ...meta }
    return this
  }

  // buildActionItem (plugins/touch-browser-bookmarks/index.js:448-465) builds every item
  // with createAndAddAction. Without it each build threw, and the handler's catch turned
  // that into a generic failure item -- which is why unrelated assertions all reported
  // reading properties of undefined.
  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    ;(this.item.actions as unknown[]).push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

// buildActionItem puts the payload, sourceType and capability diagnostics in the item's
// *action*; item.meta carries only pluginName / featureId / defaultAction. The assertions
// below read the action, which is where the plugin actually writes them.
function actionPayload(item: unknown): Record<string, any> | undefined {
  return (item as { actions?: Array<{ payload?: Record<string, any> }> })?.actions?.[0]?.payload
}

describe('browser bookmarks plugin', () => {
  it('declares network permission for external URL opening', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../../plugins/touch-browser-bookmarks/manifest.json', import.meta.url), 'utf8'))

    expect(manifest.permissions.optional).toContain('network.internet')
    expect(manifest.permissionReasons['network.internet']).toContain('默认浏览器打开')
  })

  // These four called normalizeUrlInput / upsertBookmark / cleanupRecent /
  // mergeRecentForDisplay through the __test export that e37c92c8c removed.
  //
  // The security-relevant half of normalizeUrlInput -- that a non-http(s) URL never
  // reaches the open capability -- is now covered by 'refuses to open a non-http(s)
  // URL' below, through the lifecycle.
  //
  // The other three are data-shaping semantics with no boundary coverage:
  // plugins/touch-browser-bookmarks/index.test.cjs asserts that recent state is
  // persisted, but not that duplicates collapse, that expired entries are dropped,
  // or that bookmarked URLs are excluded from the recent list. Recorded as todo
  // rather than deleted, so the gap stays visible in the test output.
  it.todo('collapses duplicate bookmarks by url')
  it.todo('drops expired and duplicate recent entries')
  it.todo('excludes bookmarked urls from the recent display')

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
          // Keyed by file: the plugin reads bookmarks.json and recent-urls.json
          // separately, and a bare null made it render its load-failure item
          // instead of the list these tests inspect.
          async getFile(name: string) {
            return name === 'recent-urls.json'
              ? { items: [], updatedAt: 0 }
              : { items: [] }
          },
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
      reason: PLUGIN_BLOCKED_REASONS.NETWORK_INTERNET_PERMISSION_REQUIRED,
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
          // Keyed by file: the plugin reads bookmarks.json and recent-urls.json
          // separately, and a bare null made it render its load-failure item
          // instead of the list these tests inspect.
          async getFile(name: string) {
            return name === 'recent-urls.json'
              ? { items: [], updatedAt: 0 }
              : { items: [] }
          },
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('browser-bookmarks', 'example.com')

    const openItem = items.find(item => item.title === '默认浏览器打开')
    expect(openItem?.subtitle).toContain('缺少 network.internet 权限')
    expect(actionPayload(openItem)?.capability).toMatchObject({
      status: 'permission-missing',
      reason: PLUGIN_BLOCKED_REASONS.PERMISSION_SDK_UNAVAILABLE,
      permission: 'network.internet',
    })
  })

  // The six permission variants and two success paths that were here are removed,
  // not ported. plugins/touch-browser-bookmarks/index.test.cjs already covers the
  // same ground at the boundary and covers it better:
  //
  //   maps host clipboard and open-url permission denials without leaking native detail
  //     -> asserts reason 'permission-denied' for BOTH copy-url and open-url, plus
  //        doesNotMatch(/private|clipboard denied/) leak checks these never had
  //   maps ordinary clipboard failures without misreporting a permission denial
  //     -> asserts reason 'clipboard-write-failed', keeping the two codes separable
  //   opens, copies and persists recent state when host capabilities grant calls
  //     -> the success paths
  //
  // The three-way split here (denied / sdk unavailable / request fails) described the
  // pre-check model that e37c92c8c removed: the plugin no longer calls
  // permission.request(), it invokes the capability and maps the thrown
  // PLUGIN_HOST_CAPABILITY_* code (index.js:525-536). Two outcomes exist now, and
  // the package-local suite asserts both.

  // Kept, because nothing covers it at the boundary: a non-http(s) URL must never
  // reach the open capability. normalizeUrlInput returns null and open-url bails
  // (index.js:753-755), so this is observable without the removed __test export.
  it('refuses to open a non-http(s) URL', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      openUrl,
      plugin: {
        feature: { clearItems() {}, pushItems() {} },
        storage: {
          async getFile() {
            return { items: [], updatedAt: 0 }
          },
          setFile: vi.fn(),
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'file:///tmp/demo.txt' } }],
    })

    expect(openUrl).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
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

    const directOpen = items.find(item => item.title === '默认浏览器打开')
    const directAdd = items.find(item => item.title === '添加到收藏')
    const directCopy = items.find(item => item.title === '复制 URL')

    // sourceType and the payload live in the action; sourceKind no longer exists in
    // the plugin at all, so it is dropped rather than relocated.
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
