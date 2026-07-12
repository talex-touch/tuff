import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const browserBookmarksUrl = new URL('../../../../plugins/touch-browser-bookmarks/index.js', import.meta.url)
const browserBookmarksPlugin = loadPluginModule(browserBookmarksUrl)
const { __test: browserBookmarksTest } = browserBookmarksPlugin

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
    expect(openItem?.meta?.capability).toMatchObject({
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
    expect(openItem?.meta?.capability).toMatchObject({
      status: 'permission-missing',
      reason: 'permission-sdk-unavailable',
      permission: 'network.internet',
    })
  })

  it('blocks external URL opening when network permission is denied', async () => {
    const openUrl = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => false,
        request,
      },
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'open-url',
        payload: { url: 'https://example.com', title: 'Example' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
    expect(request).toHaveBeenCalledWith('network.internet', '需要 network.internet 权限以默认浏览器打开网址')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks external URL opening when permission sdk is unavailable', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      permission: withoutGlobal(),
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'open-url',
        payload: { url: 'https://example.com', title: 'Example' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks external URL opening when network permission request fails', async () => {
    const openUrl = vi.fn()
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'open-url',
        payload: { url: 'https://example.com', title: 'Example' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('blocks URL copy when clipboard.write permission is denied', async () => {
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request,
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'copy-url',
        payload: { url: 'example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制链接')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('blocks URL copy when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: withoutGlobal(),
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'copy-url',
        payload: { url: 'example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('blocks URL copy when clipboard permission request fails', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'copy-url',
        payload: { url: 'example.com' },
      },
    })

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies URL after clipboard.write permission is granted', async () => {
    const writeText = vi.fn()
    const request = vi.fn(async () => true)
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request,
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'copy-url',
        payload: { url: 'example.com' },
      },
    })

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制链接')
    expect(writeText).toHaveBeenCalledWith('https://example.com/')
  })

  it('opens external URL after network permission is granted and records recent URL', async () => {
    const openUrl = vi.fn(async () => undefined)
    const writes: Array<{ file: string, data: any }> = []
    const pluginModule = loadPluginModule(browserBookmarksUrl, createPluginGlobals({
      openUrl,
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        storage: {
          async getFile() { return null },
          async setFile(file: string, data: any) { writes.push({ file, data }) },
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'browser-bookmarks',
        actionId: 'open-url',
        payload: { url: 'example.com', title: 'Example' },
      },
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

    expect(regular?.meta).toMatchObject({
      sourceType: 'manual-quicklink',
      sourceKind: 'manual-quicklink',
      payload: {
        url: 'https://regular.example/',
        title: 'Regular manual bookmark',
        source: 'bookmark',
        sourceType: 'manual-quicklink',
      },
    })
    expect(pinned?.meta).toMatchObject({
      sourceType: 'manual-pinned-quicklink',
      sourceKind: 'manual-pinned-quicklink',
      payload: {
        url: 'https://pinned.example/',
        title: 'Pinned manual bookmark',
        source: 'bookmark',
        sourceType: 'manual-pinned-quicklink',
      },
    })
    expect(pinned?.subtitle).toContain('PINNED')
    expect(recent?.meta).toMatchObject({
      sourceType: 'manual-recent-quicklink',
      sourceKind: 'manual-recent-quicklink',
      payload: {
        url: 'https://recent.example/',
        title: 'Recent manual quicklink',
        source: 'recent',
        sourceType: 'manual-recent-quicklink',
      },
    })

    await pluginModule.onFeatureTriggered('browser-bookmarks', 'https://direct.example')

    const directOpen = items.find(item => item.title === '默认浏览器打开')
    const directAdd = items.find(item => item.title === '添加到收藏')
    const directCopy = items.find(item => item.title === '复制 URL')

    expect(directOpen?.meta).toMatchObject({
      sourceType: 'manual-quicklink',
      sourceKind: 'manual-quicklink',
      payload: {
        url: 'https://direct.example/',
        source: 'quick',
        sourceType: 'manual-quicklink',
      },
    })
    expect(directAdd?.meta?.payload).toMatchObject({
      url: 'https://direct.example/',
      sourceType: 'manual-quicklink',
    })
    expect(directAdd?.meta?.payload?.source).toBeUndefined()
    expect(directCopy?.meta?.payload).toEqual({
      url: 'https://direct.example/',
      sourceType: 'manual-quicklink',
    })
  })
})
