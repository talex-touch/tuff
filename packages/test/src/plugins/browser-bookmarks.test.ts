import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

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
})
