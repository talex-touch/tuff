import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const pluginUrl = new URL('../../../../plugins/touch-browser-open/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, any>
  basic: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
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

  setIcon(icon: Record<string, unknown>) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    this.item.actions ||= []
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: this.basic }
    return this.item
  }
}

function createHarness() {
  const state = {
    items: [] as Array<Record<string, any>>,
    files: new Map<string, unknown>(),
    opens: [] as Array<{ url: string, token?: string }>,
    http: [] as string[],
    features: new Map<string, Record<string, unknown>>(),
  }
  const token = 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const globals = createPluginGlobals({
    process: withoutGlobal(),
    require: withoutGlobal(),
    fetch: withoutGlobal(),
    TuffItemBuilder: FakeBuilder,
    platform: { platform: 'darwin', arch: 'arm64' },
    clipboard: { writeText: vi.fn(async () => undefined) },
    http: {
      get: vi.fn(async (url: string) => {
        state.http.push(url)
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: ['tuff', ['tuff app', 'tuff plugin']],
          url,
          ok: true,
        }
      }),
    },
    features: {
      getFeature: async (id: string) => state.features.get(id),
      addFeature: async (feature: Record<string, any>) => {
        state.features.set(feature.id, feature)
        return true
      },
    },
    plugin: {
      getLocale: () => 'zh-CN',
      feature: {
        clearItems: async () => {
          state.items.length = 0
        },
        pushItems: async (items: Array<Record<string, unknown>>) => {
          state.items.push(...items)
        },
      },
      storage: {
        getFile: async (name: string) => state.files.get(name) ?? null,
        setFile: async (name: string, value: unknown) => {
          state.files.set(name, value)
        },
      },
      browser: {
        list: async () => ({
          operation: 'list',
          status: 'available',
          defaultAvailable: true,
          browsers: [{ id: 'chrome', name: 'Chrome', token }],
        }),
        open: async (url: string, browserToken?: string) => {
          state.opens.push({ url, ...(browserToken ? { token: browserToken } : {}) })
          return { operation: 'open', status: 'completed' }
        },
      },
    },
  })
  const module = loadPluginModule<Record<string, (...args: any[]) => Promise<any>>>(pluginUrl, globals)
  const action = (id: string) =>
    state.items.find(item => item.actions?.some((entry: { id?: string }) => entry.id === id))
  return { action, module, state, token }
}

describe('isolated browser-open Prelude', () => {
  it('contains no privileged child imports or production test export', () => {
    const source = readFileSync(pluginUrl, 'utf8')
    for (const pattern of [
      /\b__test\b/,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
      /(?:^|[^.\w])process\s*(?:\.|\[)/m,
      /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
      /\belectron\b/,
    ]) {
      expect(source).not.toMatch(pattern)
    }
  })

  it('publishes token-only browser actions and persists display metadata only', async () => {
    const harness = createHarness()
    await harness.module.onFeatureTriggered('browser-open', 'example.com')
    const item = harness.action('open-browser')
    expect(item.actions[0].payload).toEqual({
      url: 'https://example.com/',
      browserToken: harness.token,
    })
    expect(JSON.stringify(harness.state.items)).not.toMatch(/target|executable|Applications/i)

    await harness.module.onItemAction(item, { actionId: 'open-browser' })
    expect(harness.state.opens).toEqual([{ url: 'https://example.com/', token: harness.token }])
    const recent = harness.state.files.get('recent-browsers.json') as {
      items: Array<Record<string, unknown>>
    }
    expect(recent.items[0]).toMatchObject({ id: 'chrome', name: 'Chrome' })
    expect(recent.items[0]).not.toHaveProperty('token')
    expect(recent.items[0]).not.toHaveProperty('target')
  })

  it('uses typed HTTP for bounded suggestions and default browser for search', async () => {
    const harness = createHarness()
    await harness.module.onFeatureTriggered('search-engine-google', 'google tuff', null, new AbortController().signal)
    expect(harness.state.http).toHaveLength(1)
    expect(harness.state.items.map(item => item.title)).toEqual(['Google 搜索：tuff', 'tuff app', 'tuff plugin'])
    const direct = harness.action('search-web')
    await harness.module.onItemAction(direct, { actionId: 'search-web' })
    expect(harness.state.opens).toEqual([{ url: 'https://www.google.com/search?q=tuff' }])
  })

  it('rejects target-bearing and credential-bearing actions before opening', async () => {
    const harness = createHarness()
    await harness.module.onFeatureTriggered('browser-open', 'example.com')
    const item = harness.action('default-open')
    item.actions[0].payload = {
      url: 'https://user:secret@example.com',
      path: '/Applications/Calculator.app',
    }

    await expect(harness.module.onItemAction(item, { actionId: 'default-open' })).resolves.toMatchObject({
      status: 'blocked',
      reason: 'invalid-action',
    })
    expect(harness.state.opens).toEqual([])
  })
})
