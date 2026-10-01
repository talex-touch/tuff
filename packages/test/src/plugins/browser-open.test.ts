import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import type {
  PluginBusinessFeatureHost,
  PluginBusinessItemDto,
  PluginBusinessPlugin,
} from '../../../../apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities'
import { describe, expect, it, vi } from 'vitest'
import {
  createPluginBusinessCapabilities,
} from '../../../../apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities'
import { PluginHostCapabilityRegistry } from '../../../../apps/core-app/src/main/modules/plugin/host/plugin-host-capabilities'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const pluginUrl = new URL('../../../../plugins/touch-browser-open/index.js', import.meta.url)

const OWNER = Object.freeze({ protocolVersion: 2 as const, activationHandle: 'browser-open-handle', hostGeneration: 3 })

/**
 * The registry snapshots a real per-activation feature host before it will resolve an actor, so
 * the stand-in plugin owns the item lifecycle the host would otherwise supply.
 */
function featureHostFixture(): PluginBusinessFeatureHost {
  const items = new Map<string, PluginBusinessItemDto>()
  return {
    pushItems: async (_scope, pushed) => {
      for (const item of pushed) items.set(String(item.id), item)
    },
    updateItem: async (_scope, id, patch) => {
      const existing = items.get(id)
      if (!existing)
        return false
      items.set(id, { ...existing, ...patch })
      return true
    },
    removeItem: async id => items.delete(id),
    clearItems: async () => {
      const count = items.size
      items.clear()
      return count
    },
    listItems: async () => [...items.values()],
  }
}

/** The host's real feature-registry byte and shape rules back the stand-in `features` global. */
function hostFeatureRegistry(name = 'touch-browser-open') {
  const rejected: Array<{ id: string, code: string }> = []
  const activation: PluginActivationIdentity = {
    name,
    pluginInstanceId: `instance-${name}`,
    activationGeneration: 1,
    key: `key-${name}`,
  }
  const plugin = {
    name,
    sdkapi: 260713,
    getActivationIdentity: () => activation,
    createBusinessFeatureHost: () => featureHostFixture(),
    addBusinessFeature: async () => true,
  } as unknown as PluginBusinessPlugin
  const business = createPluginBusinessCapabilities({
    resolvePlugin: pluginName => (pluginName === name ? plugin : undefined),
    resolveHostGeneration: identity =>
      identity.name === name ? identity.activationGeneration + 2 : undefined,
    hasPermission: () => true,
    sqliteOwners: {
      acquire: async () => {
        throw new Error('unused')
      },
      closeActivation: async () => true,
    },
    secureStoreRootPath: '/tmp/touch-browser-open',
    secureStore: { get: async () => null, set: async () => true },
    clipboard: {
      read: async () => ({ op: 'text' as const, text: '' }),
      write: async () => undefined,
      copyAndPaste: async () => ({ success: true }),
    },
    openUrl: async url => ({ allowed: true, url, protocol: 'https:' }),
    network: { resolveAddresses: async () => [] },
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: OWNER,
    activation,
    resolveCurrentActivation: () => activation,
    authorize: () => true,
    watchPermissionRevoked: () => () => undefined,
    onFatalViolation: vi.fn(),
  })
  for (const definition of business.definitions) registry.register(definition)
  return {
    rejected,
    async add(feature: IPluginFeature) {
      try {
        // The worker sends this value through Electron IPC before main validates it. Cloning here
        // both strips the VM realm prototype and preserves the real decoder's plain-data contract.
        const wireFeature = structuredClone(feature)
        const result = (await registry.dispatch('feature.registry.add', {
          feature: wireFeature,
        })) as { added: boolean }
        return result.added
      }
      catch (error) {
        rejected.push({ id: feature.id, code: (error as { code?: string }).code ?? 'unknown' })
        return false
      }
    },
  }
}

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
    return { ...this.item, render: { mode: 'default', basic: this.basic } }
  }
}

function createHarness(
  files: Map<string, unknown> = new Map(),
  overrides: { addFeature?: (feature: Record<string, any>) => Promise<boolean> } = {},
) {
  const state = {
    items: [] as Array<Record<string, any>>,
    files,
    opens: [] as Array<{ url: string, token?: string }>,
    http: [] as string[],
    features: new Map<string, Record<string, any>>(),
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
      getFeatures: async () => [...state.features.values()],
      addFeature: async (feature: Record<string, any>) => {
        // The stand-in stands in for the host facade: a feature the real registry would refuse
        // must surface here as the `false` that makes the plugin report a registration failure.
        if (overrides.addFeature && !(await overrides.addFeature(feature)))
          return false
        state.features.set(feature.id, feature)
        return true
      },
      removeFeature: async (id: string) => state.features.delete(id),
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

  it('opens a copied URL carried only in query.inputs, once, with no surface to confirm on', async () => {
    const harness = createHarness()
    await harness.module.onInit()

    const result = await harness.module.onFeatureTriggered('browser-direct-default', {
      text: '',
      inputs: [{ type: 'text', content: 'example.com/from-inputs' }],
    })

    // A non-push direct entry returns the legacy "opened and exited" signal, which is what the
    // adapter reads as one-Enter navigation.
    expect(result).toBe(false)
    expect(harness.state.opens).toEqual([{ url: 'https://example.com/from-inputs' }])
    expect(harness.state.items).toEqual([])
  })

  it('percent-encodes a unicode and ampersand query into the engine template exactly once', async () => {
    const harness = createHarness()
    await harness.module.onInit()
    const query = '中文 & a/b?c'

    const result = await harness.module.onFeatureTriggered('search-open-google', { text: query })

    expect(result).toBe(false)
    expect(harness.state.opens).toEqual([
      { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
    ])
    // Direct search never fetches suggestions; that stays the explicit push mode's job.
    expect(harness.state.http).toEqual([])
  })

  it('opens a hot entry at its own target without a search or a list', async () => {
    const harness = createHarness()
    await harness.module.onInit()

    const result = await harness.module.onFeatureTriggered('hot-weibo-hot', { text: '' })

    expect(result).toBe(false)
    expect(harness.state.opens).toEqual([{ url: 'https://s.weibo.com/top/summary' }])
  })

  it('drops a disabled engine from the registry on a settings sync', async () => {
    const files = new Map<string, unknown>()
    const harness = createHarness(files)
    await harness.module.onInit()
    expect(harness.state.features.has('search-open-google')).toBe(true)
    expect(harness.state.features.has('search-engine-google')).toBe(true)

    files.set('search-settings.json', {
      engines: [
        {
          id: 'google',
          name: 'Google',
          keyword: 'google',
          urlTemplate: 'https://www.google.com/search?q={query}',
          enabled: false,
        },
      ],
      hotEntries: [
        {
          id: 'weibo-hot',
          name: '微博热搜',
          keyword: 'weibo',
          url: 'https://s.weibo.com/top/summary',
          enabled: true,
        },
      ],
    })
    await harness.module.onMessage('browser-open:sync-settings')

    expect(harness.state.features.has('search-engine-google')).toBe(false)
    expect(harness.state.features.has('search-open-google')).toBe(false)
    // Sibling entries are not collateral damage.
    expect(harness.state.features.has('search-open-bing')).toBe(true)
    expect(harness.state.features.has('hot-weibo-hot')).toBe(true)
  })

  it('routes plain text to a direct engine but never a URL, a path or a file name', async () => {
    const harness = createHarness()
    await harness.module.onInit()
    const searchPattern = new RegExp(
      harness.state.features.get('search-open-google')!.commands[0].value,
    )
    const linkPattern = new RegExp(
      harness.state.features.get('browser-direct-default')!.commands[0].value,
    )

    for (const text of ['hello world', '中文 关键词', 'tuff']) {
      expect(searchPattern.test(text), text).toBe(true)
    }
    for (const text of [
      'https://example.com/a?b=1',
      '~/Workspace',
      '/Users/x/Downloads',
      'C:\\Users\\x\\Downloads',
      'readme.md',
      'notes.txt',
    ]) {
      expect(searchPattern.test(text), text).toBe(false)
    }
    // A typed domain is link-shaped instead, so it opens rather than searching.
    for (const text of ['example.com', 'example.com/docs', 'www.example.com/a?b=1']) {
      expect(linkPattern.test(text), text).toBe(true)
      expect(searchPattern.test(text), text).toBe(false)
    }
  })

  it('registers a multi-engine settings set through the real host registry and keeps it executable', async () => {
    const registry = hostFeatureRegistry()
    const engines = [
      { id: 'kagi', name: 'K'.repeat(32), keyword: 'k'.repeat(32) },
      { id: 'marginalia', name: 'M'.repeat(32), keyword: 'm'.repeat(32) },
      { id: 'searx', name: 'S'.repeat(32), keyword: 's'.repeat(32) },
    ].map(({ id, name, keyword }) => ({
      id,
      name,
      keyword,
      urlTemplate: `https://search.example.com/${id}?q={query}`,
      enabled: true,
    }))
    const files = new Map<string, unknown>([
      ['search-settings.json', { engines, defaultEngine: 'kagi', hotEntries: [] }],
    ])
    const harness = createHarness(files, { addFeature: feature => registry.add(feature as IPluginFeature) })

    await harness.module.onInit()

    // Nothing the plugin generates may be refused by the host's declaration bounds; a refusal is
    // what turns `addFeature` into `false` and aborts the whole plugin startup.
    expect(registry.rejected).toEqual([])
    for (const { id } of engines) {
      expect(harness.state.features.has(`search-engine-${id}`), id).toBe(true)
      expect(harness.state.features.has(`search-open-${id}`), id).toBe(true)
    }
    expect(harness.state.features.has('browser-direct-default')).toBe(true)

    // Boundary-sized configuration remains executable after passing the real registry.
    for (const { id } of engines) {
      const pattern = new RegExp(
        harness.state.features.get(`search-open-${id}`)!.commands[0].value,
      )
      expect(pattern.test('ordinary words'), id).toBe(true)
      expect(pattern.test('https://example.com'), id).toBe(false)
    }

    // The default engine leads the other direct entries, and its entry still searches for real.
    const priority = (id: string): number => harness.state.features.get(id)!.priority
    expect(priority('search-open-kagi')).toBeGreaterThan(priority('search-open-searx'))

    const query = 'a&b 中'
    await harness.module.onFeatureTriggered('search-open-kagi', { text: query })
    expect(harness.state.opens).toEqual([
      { url: `https://search.example.com/kagi?q=${encodeURIComponent(query)}` },
    ])
  })

  it('fails onInit instead of staying half-registered when the host refuses a feature', async () => {
    const harness = createHarness(new Map(), { addFeature: async () => false })

    await expect(harness.module.onInit()).rejects.toThrow(/BROWSER_FEATURE_REGISTRATION_FAILED/)
  })
})
