import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const browserPlugin = loadPluginModule(new URL('../../../../plugins/touch-browser-open/index.js', import.meta.url))
const { __test: browserTest } = browserPlugin
const browserPluginUrl = new URL('../../../../plugins/touch-browser-open/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, unknown>
  basic: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
    this.basic = {}
  }

  setSource() {
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

  setIcon(icon: Record<string, unknown>) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    this.item.render = {
      mode: 'default',
      basic: this.basic,
    }
    return this.item
  }
}

describe('browser open plugin', () => {
  it('normalizes url input', () => {
    expect(browserTest.normalizeUrlInput('example.com')).toBe('https://example.com/')
    expect(browserTest.normalizeUrlInput('https://example.com/path')).toBe('https://example.com/path')
    expect(browserTest.normalizeUrlInput('not a url')).toBeNull()
  })

  it('builds windows open scripts', () => {
    const defaultScript = browserTest.buildWindowsOpenScript('default-open', {
      url: 'https://example.com',
    })
    const browserScript = browserTest.buildWindowsOpenScript('open-browser', {
      url: 'https://example.com',
      target: 'chrome.exe',
    })

    expect(defaultScript).toContain('Start-Process')
    expect(defaultScript).toContain('https://example.com')
    expect(browserScript).toContain('chrome.exe')
    expect(browserScript).toContain('-ArgumentList')
  })

  it('merges recent browsers with availability', () => {
    const now = Date.now()
    const available = [
      { id: 'chrome', name: 'Chrome', target: 'chrome.exe' },
      { id: 'edge', name: 'Edge', target: 'msedge.exe' },
    ]
    const recent = [
      { id: 'firefox', name: 'Firefox', target: 'firefox.exe', lastUsedAt: now - 1000 },
      { id: 'edge', name: 'Edge', target: 'msedge.exe', lastUsedAt: now - 500 },
      { id: 'chrome', name: 'Chrome', target: 'chrome.exe', lastUsedAt: now - 200 },
    ]

    const merged = browserTest.mergeRecentBrowsers(available, recent)
    expect(merged.length).toBe(2)
    expect(merged[0].id).toBe('chrome')
    expect(merged[1].id).toBe('edge')
  })

  it('keeps grouped layout order', () => {
    const order = browserTest.resolveGroupOrder({
      quickActions: [1],
      recommendedItems: [1],
      recentItems: [1],
      tips: [1],
    })

    expect(order).toEqual(['quick', 'recommended', 'recent', 'tips'])
  })

  it('builds web search urls with encoded query', () => {
    expect(browserTest.buildSearchUrl('google', 'hello world')).toBe('https://www.google.com/search?q=hello%20world')
    expect(browserTest.buildSearchUrl('bing', '中文 搜索')).toBe('https://www.bing.com/search?q=%E4%B8%AD%E6%96%87%20%E6%90%9C%E7%B4%A2')
    expect(browserTest.buildSearchUrl('duckduckgo', 'a&b')).toBe('https://duckduckgo.com/?q=a%26b')
  })

  it('parses explicit search engine commands', () => {
    expect(browserTest.parseSearchQuery('g tuff app').engine.id).toBe('google')
    expect(browserTest.parseSearchQuery('bing tuff app')).toMatchObject({
      query: 'tuff app',
      explicit: true,
    })
    expect(browserTest.parseSearchQuery('ddg tuff app').engine.id).toBe('duckduckgo')
  })

  it('uses normalized settings for default search engine', () => {
    const settings = browserTest.normalizeSearchSettings({
      defaultEngine: 'bing',
      enabledEngines: ['bing', 'google', 'unknown'],
    })

    expect(settings).toEqual({
      defaultEngine: 'bing',
      enabledEngines: ['bing', 'google'],
    })
    expect(browserTest.parseSearchQuery('plain query', settings).engine.id).toBe('bing')
  })

  it('builds dynamic search engine features from enabled engines', () => {
    const features = browserTest.buildSearchEngineFeatures({
      defaultEngine: 'google',
      enabledEngines: ['google', 'duckduckgo'],
    })

    expect(features.map(feature => feature.id)).toEqual([
      'search-engine-google',
      'search-engine-duckduckgo',
    ])
    expect(features.map(feature => feature.icon.value)).toEqual([
      'assets/search-engines/google.svg',
      'assets/search-engines/duckduckgo.svg',
    ])
    expect(features.every(feature => feature.push)).toBe(true)
    expect(features.every(feature => feature.acceptedInputTypes.includes('text'))).toBe(true)
  })

  it('loads in plugin sandbox without process global', () => {
    const pluginModule = loadPluginModule(browserPluginUrl, createPluginGlobals({
      process: withoutGlobal(),
    }))
    const features = pluginModule.__test.buildSearchEngineFeatures({
      defaultEngine: 'google',
      enabledEngines: ['google'],
    })

    expect(features.map(feature => feature.id)).toEqual(['search-engine-google'])
  })

  it('keeps short engine aliases out of dynamic feature command tokens', () => {
    const [googleFeature] = browserTest.buildSearchEngineFeatures({
      defaultEngine: 'google',
      enabledEngines: ['google'],
    })

    expect(googleFeature.keywords).not.toContain('g')
    expect(googleFeature.commands[0].value).toContain('Google 搜索引擎')
    expect(googleFeature.commands[0].value).toContain('google 搜索')
    expect(googleFeature.commands[0].value).not.toContain('google')
  })

  it('parses search suggestions by engine', () => {
    expect(browserTest.parseEngineSuggestions('google', ['tuff', ['tuff app', 'tuff plugin']])).toEqual([
      'tuff app',
      'tuff plugin',
    ])
    expect(browserTest.parseEngineSuggestions('bing', ['tuff', ['tuff app']])).toEqual(['tuff app'])
    expect(browserTest.parseEngineSuggestions('duckduckgo', [{ phrase: 'tuff app' }, { phrase: 'tuff ai' }])).toEqual([
      'tuff app',
      'tuff ai',
    ])
  })

  it('deduplicates and keeps direct search item before suggestions', () => {
    const pluginModule = loadPluginModule(browserPluginUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
    }))
    const testApi = pluginModule.__test
    const parsed = testApi.parseSearchQuery('g tuff app')
    const items = testApi.buildSearchItems('web-search', parsed.engine, parsed.query, [
      'tuff app',
      'Tuff App',
      'tuff plugins',
    ])

    expect(items.map(item => item.title)).toEqual([
      'Google 搜索：tuff app',
      'tuff plugins',
    ])
    expect((items[0].meta as any).payload.url).toBe('https://www.google.com/search?q=tuff%20app')
    expect((items[0] as any).render.completion).toBe('tuff app')
    expect((items[1] as any).render.completion).toBe('tuff plugins')
    expect((items[0] as any).render.basic.icon.value).toBe('assets/search-engines/google.svg')
    expect((items[1] as any).render.basic.icon.value).toBe('assets/search-engines/google.svg')
  })

  it('extracts remaining query after choosing an engine feature', () => {
    const google = browserTest.parseSearchQuery('g test').engine

    expect(browserTest.extractEngineModeQuery(google, 'Google 搜索引擎 tuff app')).toBe('tuff app')
    expect(browserTest.extractEngineModeQuery(google, 'google tuff app')).toBe('tuff app')
    expect(browserTest.extractEngineModeQuery(google, 'Google 搜索引擎')).toBe('')
  })

  it('registers dynamic search engine features during init', async () => {
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
    const pluginModule = loadPluginModule(browserPluginUrl, globals)

    await pluginModule.onInit()

    expect(added.map(feature => feature.id)).toEqual([
      'search-engine-google',
      'search-engine-bing',
      'search-engine-duckduckgo',
    ])
  })

  it('pushes direct search and remote suggestions in engine mode', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ['tuff', ['tuff app', 'tuff plugin']],
      })),
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        box: {
          showInput: vi.fn(),
          allowInput: vi.fn(),
          setInput: vi.fn(),
          hide: vi.fn(),
        },
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    })
    const pluginModule = loadPluginModule(browserPluginUrl, globals)

    await pluginModule.onFeatureTriggered('search-engine-google', 'google tuff app', null, new AbortController().signal)

    expect(items.map(item => item.title)).toEqual([
      'Google 搜索：tuff app',
      'tuff plugin',
    ])
  })

  it('keeps direct search item when suggestions fail', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      fetch: vi.fn(async () => {
        throw new Error('network down')
      }),
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        box: {
          showInput: vi.fn(),
          allowInput: vi.fn(),
          setInput: vi.fn(),
        },
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    })
    const pluginModule = loadPluginModule(browserPluginUrl, globals)

    await pluginModule.onFeatureTriggered('search-engine-bing', 'bing tuff app', null, new AbortController().signal)

    expect(items.map(item => item.title)).toEqual([
      'Bing 搜索：tuff app',
      '搜索建议不可用',
    ])
  })

  it('does not replace current direct item when suggestion request is aborted', async () => {
    const items: Array<{ title?: string }> = []
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ['tuff', ['old suggestion']],
      })),
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        box: {
          showInput: vi.fn(),
          allowInput: vi.fn(),
          setInput: vi.fn(),
        },
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string }>) { items.push(...next) },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    })
    const pluginModule = loadPluginModule(browserPluginUrl, globals)
    const controller = new AbortController()
    controller.abort()

    await pluginModule.onFeatureTriggered('search-engine-google', 'google tuff app', null, controller.signal)

    expect(items.map(item => item.title)).toEqual(['Google 搜索：tuff app'])
  })

  it('keeps engine mode as search suggestions while input looks like a domain', async () => {
    const items: Array<{ title?: string, meta?: any, render?: any }> = []
    let inputHandler: ((input: string) => void) | null = null
    const setInput = vi.fn()
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ['example.com', ['example.com pricing', 'example.com login']],
      })),
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        box: {
          showInput: vi.fn(),
          allowInput: vi.fn(),
          setInput,
          hide: vi.fn(),
        },
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string, meta?: any, render?: any }>) { items.push(...next) },
          onInputChange(handler: (input: string) => void) {
            inputHandler = handler
            return vi.fn()
          },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    })
    const pluginModule = loadPluginModule(browserPluginUrl, globals)

    await pluginModule.onFeatureTriggered('search-engine-google', 'Google 搜索引擎', null, new AbortController().signal)
    setInput.mockClear()
    inputHandler?.('example.com')
    await vi.waitFor(() => {
      expect(items.map(item => item.title)).toEqual([
        'Google 搜索：example.com',
        'example.com pricing',
        'example.com login',
      ])
    })

    expect(setInput).not.toHaveBeenCalled()
    expect(items.every(item => item.meta?.actionId === 'search-web')).toBe(true)
    expect(items.map(item => item.render?.completion)).toEqual([
      'example.com',
      'example.com pricing',
      'example.com login',
    ])
  })

  it('aborts stale suggestion requests when engine input changes quickly', async () => {
    const items: Array<{ title?: string }> = []
    let inputHandler: ((input: string) => void) | null = null
    const firstFetch = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('stale request should be aborted')), 20)
    })
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ['start', []],
      }))
      .mockImplementationOnce(async (_url, init) => {
        init.signal.addEventListener('abort', () => {})
        return firstFetch
      })
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ['new', ['new suggestion']],
      }))
    const globals = createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      fetch,
      permission: {
        check: async () => true,
        request: async () => true,
      },
      plugin: {
        box: {
          showInput: vi.fn(),
          allowInput: vi.fn(),
          setInput: vi.fn(),
          hide: vi.fn(),
        },
        feature: {
          clearItems() { items.length = 0 },
          pushItems(next: Array<{ title?: string }>) { items.push(...next) },
          onInputChange(handler: (input: string) => void) {
            inputHandler = handler
            return vi.fn()
          },
        },
        storage: {
          async getFile() { return null },
          async setFile() {},
        },
      },
    })
    const pluginModule = loadPluginModule(browserPluginUrl, globals)

    await pluginModule.onFeatureTriggered('search-engine-google', 'Google 搜索引擎 start', null, new AbortController().signal)
    inputHandler?.('old')
    inputHandler?.('new')

    await vi.waitFor(() => {
      expect(items.map(item => item.title)).toEqual([
        'Google 搜索：new',
        'new suggestion',
      ])
    })
    expect(items.map(item => item.title)).not.toContain('搜索建议不可用')
  })
})
