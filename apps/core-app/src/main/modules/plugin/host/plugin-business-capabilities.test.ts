import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { NetworkRequestOptions, NetworkResponse } from '@talex-touch/utils/network'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import {
  createPluginBusinessCapabilities,
  pluginBusinessSecretPrefix,
  type PluginBusinessCapabilityOptions,
  type PluginBusinessFeatureHost,
  type PluginBusinessItemDto,
  type PluginBusinessPlugin
} from './plugin-business-capabilities'
import { PluginHostCapabilityError, PluginHostCapabilityRegistry } from './plugin-host-capabilities'

const OWNER = Object.freeze({
  protocolVersion: 2 as const,
  activationHandle: 'business-handle',
  hostGeneration: 7
})

function activation(generation = 1): PluginActivationIdentity {
  return {
    name: 'business-plugin',
    pluginInstanceId: 'business-instance',
    activationGeneration: generation,
    key: `business-key-${generation}`
  }
}

function feature(id = 'dynamic-feature'): IPluginFeature {
  return {
    id,
    name: `Feature ${id}`,
    desc: 'Dynamic feature',
    icon: { type: 'class', value: 'i-ri-flashlight-line' },
    keywords: ['dynamic'],
    push: false,
    platform: {},
    commands: [{ type: 'match', value: id }],
    priority: 1,
    experimental: false
  }
}

interface Fixture {
  activation: PluginActivationIdentity
  plugin: PluginBusinessPlugin
  featureHost: PluginBusinessFeatureHost
  options: PluginBusinessCapabilityOptions
  sqliteClient: {
    execute: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  clipboard: {
    read: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    copyAndPaste: ReturnType<typeof vi.fn>
  }
  networkRequest: ReturnType<typeof vi.fn>
  hasPermission: ReturnType<typeof vi.fn>
  secureGet: ReturnType<typeof vi.fn>
  secureSet: ReturnType<typeof vi.fn>
  emittedFiles: string[]
  itemStore: Map<string, PluginBusinessItemDto>
  featureStore: Map<string, IPluginFeature>
}

function createFixture(): Fixture {
  const current = activation()
  const itemStore = new Map<string, PluginBusinessItemDto>()
  const featureStore = new Map<string, IPluginFeature>([
    ['manifest-feature', feature('manifest-feature')]
  ])
  const emittedFiles: string[] = []
  const fileStore = new Map<string, unknown>()
  const featureHost: PluginBusinessFeatureHost = {
    pushItems: vi.fn(async (_scope, items) => {
      for (const item of items) itemStore.set(String(item.id), item)
    }),
    updateItem: vi.fn(async (_scope, id, patch) => {
      const existing = itemStore.get(id)
      if (!existing) return false
      itemStore.set(id, { ...existing, ...patch })
      return true
    }),
    removeItem: vi.fn(async (id) => itemStore.delete(id)),
    clearItems: vi.fn(async () => {
      const count = itemStore.size
      itemStore.clear()
      return count
    }),
    listItems: vi.fn(async () => [...itemStore.values()])
  }
  const plugin: PluginBusinessPlugin = {
    name: current.name,
    sdkapi: 260215,
    getActivationIdentity: vi.fn(() => current),
    getBusinessRuntimeInfo: vi.fn(() => ({
      name: current.name,
      displayName: 'Business Plugin',
      version: '1.0.0',
      description: 'Business capability fixture',
      status: 'enabled',
      sdkapi: 260215,
      category: 'utilities'
    })),
    getDataPath: vi.fn(() => '/fixture/plugins/business-plugin/data'),
    createBusinessFeatureHost: vi.fn(() => featureHost),
    addBusinessFeature: vi.fn(async (input) => {
      if (featureStore.has(input.id)) return false
      featureStore.set(input.id, input)
      return true
    }),
    removeBusinessFeature: vi.fn((id) => featureStore.delete(id)),
    listBusinessFeatures: vi.fn(() => [...featureStore.values()]),
    readBusinessFile: vi.fn(async (name) =>
      fileStore.has(name)
        ? { found: true as const, value: fileStore.get(name) as never }
        : { found: false as const }
    ),
    writeBusinessFile: vi.fn(async (name, value) => {
      fileStore.set(name, value)
      emittedFiles.push(name)
    }),
    removeBusinessFile: vi.fn(async (name) => {
      const removed = fileStore.delete(name)
      if (removed) emittedFiles.push(name)
      return removed
    }),
    listBusinessFiles: vi.fn(async () => [...fileStore.keys()].sort()),
    cleanupBusinessItems: vi.fn(async (_activation, ids) => {
      for (const id of ids) itemStore.delete(id)
    })
  }
  const sqliteClient = {
    execute: vi.fn(async () => ({ rowsAffected: 1, lastInsertRowId: 4 })),
    query: vi.fn(async () => ({ rows: [{ id: 1, title: 'row' }], columns: ['id', 'title'] })),
    transaction: vi.fn(async (statements: unknown[]) => ({
      results: statements.map(() => ({ rowsAffected: 1, lastInsertRowId: null }))
    })),
    close: vi.fn(async () => undefined)
  }
  const clipboard = {
    read: vi.fn(async (request) =>
      request.op === 'text'
        ? { op: 'text' as const, text: 'clipboard text' }
        : {
            op: 'snapshot' as const,
            text: 'clipboard text',
            html: '<b>clipboard</b>',
            hasImage: false,
            hasFiles: false,
            formats: ['text/plain']
          }
    ),
    write: vi.fn(async () => undefined),
    copyAndPaste: vi.fn(async () => ({ success: true }))
  }
  const secureGet = vi.fn(async () => null)
  const secureSet = vi.fn(async () => true)
  const networkRequest = vi.fn(async (request: NetworkRequestOptions): Promise<NetworkResponse> => {
    const responseUrl = new URL(request.url)
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== null) responseUrl.searchParams.set(key, String(value))
    }
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: request.responseType === 'arrayBuffer' ? new Uint8Array([1, 2]).buffer : { ok: true },
      url: responseUrl.toString(),
      ok: true
    }
  })
  const hasPermission = vi.fn(() => true)
  const options: PluginBusinessCapabilityOptions = {
    resolvePlugin: (name) => (name === current.name ? plugin : undefined),
    resolveHostGeneration: (identity) =>
      identity.name === current.name ? identity.activationGeneration + 6 : undefined,
    hasPermission,
    sqliteOwners: {
      acquire: vi.fn(async () => sqliteClient),
      closeActivation: vi.fn(async () => true)
    },
    secureStoreRootPath: '/fixture/root',
    secureStore: { get: secureGet, set: secureSet },
    clipboard,
    openUrl: vi.fn(async (url: string) => ({
      allowed: true as const,
      url,
      protocol: 'https:'
    })),
    network: {
      requestPinned: networkRequest,
      resolveAddresses: vi.fn(async () => ['93.184.216.34'])
    }
  }
  return {
    activation: current,
    plugin,
    featureHost,
    options,
    sqliteClient,
    clipboard,
    networkRequest,
    hasPermission,
    secureGet,
    secureSet,
    emittedFiles,
    itemStore,
    featureStore
  }
}

function createRegistry(
  fixture: Fixture,
  authorize: (pluginName: string, permissionId: string) => boolean = () => true
) {
  const business = createPluginBusinessCapabilities(fixture.options)
  const registry = new PluginHostCapabilityRegistry({
    owner: OWNER,
    activation: fixture.activation,
    resolveCurrentActivation: () => fixture.plugin.getActivationIdentity(),
    authorize,
    watchPermissionRevoked: () => () => undefined,
    onFatalViolation: vi.fn()
  })
  for (const definition of business.definitions) registry.register(definition)
  return { business, registry }
}

const EXPECTED_CAPABILITIES = [
  ['plugin.info.get', undefined],
  ['permission.check', undefined],
  ['feature.registry.add', undefined],
  ['feature.registry.remove', undefined],
  ['feature.registry.list', undefined],
  ['feature.items.push', 'search.root-results'],
  ['feature.items.update', 'search.root-results'],
  ['feature.items.remove', undefined],
  ['feature.items.clear', undefined],
  ['feature.items.list', undefined],
  ['storage.file.read', 'storage.plugin'],
  ['storage.file.write', 'storage.plugin'],
  ['storage.file.remove', 'storage.plugin'],
  ['storage.file.list', 'storage.plugin'],
  ['storage.sqlite.execute', 'storage.sqlite'],
  ['storage.sqlite.batch', 'storage.sqlite'],
  ['secret.get', 'storage.plugin'],
  ['secret.set', 'storage.plugin'],
  ['secret.delete', 'storage.plugin'],
  ['clipboard.read', 'clipboard.read'],
  ['clipboard.write', 'clipboard.write'],
  ['clipboard.copy-and-paste', 'clipboard.write'],
  ['open-url', 'network.internet'],
  ['http.request', 'network.internet']
] as const

describe('plugin business capability adapters', () => {
  it('publishes the exact immutable 24-capability production manifest', async () => {
    const fixture = createFixture()
    const business = createPluginBusinessCapabilities(fixture.options)

    expect(business.definitions.map(({ id, permission }) => [id, permission])).toEqual(
      EXPECTED_CAPABILITIES
    )
    expect(Object.isFrozen(business.definitions)).toBe(true)
    expect(business.definitions.every(Object.isFrozen)).toBe(true)

    const capturedWrite = fixture.clipboard.write
    fixture.options.clipboard.write = vi.fn(async () => {
      throw new Error('mutated service')
    })
    const write = business.definitions.find((definition) => definition.id === 'clipboard.write')!
    await expect(
      write.invoke(
        issuePluginSecurityContext(fixture.activation, 'plugin-host', {
          hostGeneration: OWNER.hostGeneration
        }),
        { op: 'write', content: { text: 'captured' } },
        new AbortController().signal,
        { register: vi.fn() } as never
      )
    ).resolves.toEqual({ ok: true })
    expect(capturedWrite).toHaveBeenCalledOnce()
  })

  it('accepts one positive request for every fixed ID', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)
    const requests: Array<[string, unknown, unknown]> = [
      ['plugin.info.get', null, expect.objectContaining({ name: 'business-plugin' })],
      ['permission.check', { permissionId: 'clipboard.write' }, { granted: true }],
      ['feature.registry.add', { feature: feature() }, { added: true }],
      ['feature.registry.remove', { featureId: 'dynamic-feature' }, { removed: true }],
      ['feature.registry.list', null, expect.objectContaining({ features: expect.any(Array) })],
      [
        'feature.items.push',
        {
          scope: 'active-feature',
          items: [
            {
              id: 'owned-item',
              source: { type: 'plugin', id: 'plugin-features' },
              render: { mode: 'default', basic: { title: 'Owned' } }
            }
          ]
        },
        { ok: true }
      ],
      [
        'feature.items.update',
        { scope: 'active-feature', id: 'owned-item', patch: { meta: { priority: 1 } } },
        { updated: true }
      ],
      ['feature.items.list', null, expect.objectContaining({ items: expect.any(Array) })],
      ['feature.items.remove', { id: 'owned-item' }, { removed: true }],
      ['feature.items.clear', null, { removed: 0 }],
      ['storage.file.read', { name: 'state.json' }, { found: false }],
      ['storage.file.write', { name: 'state.json', value: { count: 1 } }, { ok: true }],
      ['storage.file.read', { name: 'state.json' }, { found: true, value: { count: 1 } }],
      ['storage.file.list', null, { names: ['state.json'] }],
      ['storage.file.remove', { name: 'state.json' }, { removed: true }],
      [
        'storage.sqlite.execute',
        { op: 'query', sql: 'SELECT id, title FROM notes', params: [] },
        { op: 'query', rows: [{ id: 1, title: 'row' }], columns: ['id', 'title'] }
      ],
      [
        'storage.sqlite.execute',
        { op: 'execute', sql: 'INSERT INTO notes(title) VALUES (?)', params: ['row'] },
        { op: 'execute', rowsAffected: 1, lastInsertRowId: 4 }
      ],
      [
        'storage.sqlite.batch',
        { statements: [{ sql: 'INSERT INTO notes(title) VALUES (?)', params: ['batch'] }] },
        { results: [{ rowsAffected: 1, lastInsertRowId: null }] }
      ],
      ['secret.get', { key: 'token' }, { found: false }],
      ['secret.set', { key: 'token', value: 'secret-value' }, { ok: true }],
      ['secret.delete', { key: 'token' }, { ok: true }],
      ['clipboard.read', { op: 'text' }, { op: 'text', text: 'clipboard text' }],
      ['clipboard.write', { op: 'write', content: { text: 'write' } }, { ok: true }],
      ['clipboard.copy-and-paste', { text: 'paste' }, { success: true }],
      ['open-url', { url: 'https://example.com/docs' }, { opened: true, protocol: 'https:' }],
      [
        'http.request',
        { method: 'GET', url: 'https://example.com/data', responseType: 'json' },
        expect.objectContaining({ status: 200, data: { ok: true }, ok: true })
      ]
    ]

    for (const [id, request, expected] of requests) {
      const result = await registry.dispatch(id as never, request).catch((error: unknown) => {
        const code = error instanceof Error ? error.message : String(error)
        throw new Error(`${id}: ${code}`)
      })
      expect(result).toEqual(expected)
    }
    expect(fixture.emittedFiles).toEqual(['state.json', 'state.json'])
  })

  it('rejects malformed exact DTOs for every fixed ID before host work', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)
    const malformed = new Map<string, unknown>([
      ['plugin.info.get', {}],
      ['permission.check', { permissionId: 'clipboard.write', pluginName: 'other' }],
      ['feature.registry.add', { feature: { ...feature(), extra: true } }],
      ['feature.registry.remove', { featureId: 'x', pluginName: 'other' }],
      ['feature.registry.list', {}],
      ['feature.items.push', { scope: 'active-feature', items: [{ id: 'x' }], key: 'forged' }],
      ['feature.items.update', { scope: 'active-feature', id: 'x', patch: { title: 'x' } }],
      ['feature.items.remove', { id: 'x', generation: 1 }],
      ['feature.items.clear', {}],
      ['feature.items.list', {}],
      ['storage.file.read', { name: '../secret.json' }],
      ['storage.file.write', { name: 'x.json', value: 1, pluginName: 'other' }],
      ['storage.file.remove', { name: '' }],
      ['storage.file.list', {}],
      ['storage.sqlite.execute', { op: 'query', sql: 'SELECT 1', sdkapi: 260215 }],
      ['storage.sqlite.batch', { statements: 'not-an-array' }],
      ['secret.get', { key: 'invalid key' }],
      ['secret.set', { key: 'token', value: null }],
      ['secret.delete', { key: 'token', value: 'forged' }],
      ['clipboard.read', { op: 'native' }],
      ['clipboard.write', { op: 'write', content: {} }],
      ['clipboard.copy-and-paste', { text: 'x', nativeImage: true }],
      ['open-url', { url: 'https://example.com', key: 'forged' }],
      ['http.request', { method: 'TRACE', url: 'https://example.com', responseType: 'json' }]
    ])

    for (const [id] of EXPECTED_CAPABILITIES) {
      await expect(registry.dispatch(id, malformed.get(id))).rejects.toEqual(
        new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
      )
    }
    expect(fixture.clipboard.write).not.toHaveBeenCalled()
    expect(fixture.networkRequest).not.toHaveBeenCalled()
  })

  it('rejects host-action, file-icon and custom-render item capability bypasses', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)
    const baseItem = {
      id: 'strict-item',
      source: { type: 'plugin', id: 'plugin-features' },
      render: { mode: 'default', basic: { title: 'Strict item' } }
    }
    const hostileItems = [
      { ...baseItem, source: { ...baseItem.source, permission: 'system' } },
      { ...baseItem, icon: { type: 'file', value: '/tmp/host-file' } },
      {
        ...baseItem,
        render: {
          mode: 'default',
          basic: { title: 'Strict item', icon: { type: 'file', value: '/tmp/host-file' } }
        }
      },
      {
        ...baseItem,
        actions: [{ id: 'open', type: 'open', payload: { path: '/tmp/host-file' } }]
      },
      {
        ...baseItem,
        actions: [{ id: 'copy', type: 'plugin', confirm: { title: 'Host UI' } }]
      },
      {
        ...baseItem,
        render: { mode: 'custom', custom: { type: 'html', content: '<script />' } }
      },
      { ...baseItem, meta: { file: { path: '/tmp/host-file' } } }
    ]

    for (const hostileItem of hostileItems) {
      await expect(
        registry.dispatch('feature.items.push', {
          scope: 'active-feature',
          items: [hostileItem]
        })
      ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    }
    expect(fixture.featureHost.pushItems).not.toHaveBeenCalled()
  })

  it('rejects proxied nested host services without evaluating proxy traps', async () => {
    const fixture = createFixture()
    const trap = vi.fn(() => {
      throw new Error('proxy trap must stay contained')
    })
    const clipboard = new Proxy(fixture.options.clipboard, { get: trap })

    expect(() => createPluginBusinessCapabilities({ ...fixture.options, clipboard })).toThrow(
      'PLUGIN_BUSINESS_CAPABILITY_INVALID'
    )
    expect(trap).not.toHaveBeenCalled()
  })

  it('rejects top-level option accessors without evaluating them', () => {
    const fixture = createFixture()
    const getter = vi.fn(() => fixture.options.clipboard)
    const hostile = { ...fixture.options }
    Object.defineProperty(hostile, 'clipboard', {
      configurable: true,
      enumerable: true,
      get: getter
    })

    expect(() => createPluginBusinessCapabilities(hostile)).toThrow(
      'PLUGIN_BUSINESS_CAPABILITY_INVALID'
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects dynamic record proxies before evaluating their traps', () => {
    const fixture = createFixture()
    const business = createPluginBusinessCapabilities(fixture.options)
    const http = business.definitions.find((definition) => definition.id === 'http.request')!
    const ownKeys = vi.fn(() => {
      throw new Error('proxy trap must not run')
    })
    const headers = new Proxy({}, { ownKeys })

    expect(() =>
      http.validateRequest({
        method: 'GET',
        url: 'https://example.com/data',
        headers,
        responseType: 'json'
      })
    ).toThrow('PLUGIN_BUSINESS_CAPABILITY_INVALID')
    expect(ownKeys).not.toHaveBeenCalled()

    expect(() =>
      http.validateRequest({
        method: 'GET',
        url: 'https://example.com/data',
        headers: { 'x-test': 'allowed\r\nforged: value' },
        responseType: 'json'
      })
    ).toThrow('PLUGIN_BUSINESS_CAPABILITY_INVALID')
  })

  it('rejects hostile sparse arrays and dynamic renderer paths', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)

    const sparseItems = new Array(2)
    sparseItems[1] = {
      id: 'sparse',
      source: { type: 'plugin', id: 'plugin-features' },
      render: { mode: 'default', basic: { title: 'Sparse' } }
    }
    await expect(
      registry.dispatch('feature.items.push', { scope: 'active-feature', items: sparseItems })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))

    await expect(
      registry.dispatch('feature.registry.add', {
        feature: {
          ...feature('path-feature'),
          interaction: { type: 'widget', path: 'unbuilt-widget' }
        }
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(fixture.networkRequest).not.toHaveBeenCalled()
    expect(fixture.plugin.addBusinessFeature).not.toHaveBeenCalled()
  })

  it('rechecks branded authority, key, generation, plugin and host generation inside the adapter', async () => {
    const fixture = createFixture()
    const business = createPluginBusinessCapabilities(fixture.options)
    const definition = business.definitions.find((entry) => entry.id === 'plugin.info.get')!
    const resources = {
      register: vi.fn(() => ({ id: 'unused', kind: 'resource' as const }))
    }
    const invoke = (context: PluginSecurityContext) =>
      definition.invoke(context, null, new AbortController().signal, resources as never)

    await expect(
      invoke({
        name: fixture.activation.name,
        uniqueKey: fixture.activation.key,
        identity: {
          pluginName: fixture.activation.name,
          pluginInstanceId: fixture.activation.pluginInstanceId,
          activationGeneration: fixture.activation.activationGeneration,
          authority: 'plugin-host',
          hostGeneration: OWNER.hostGeneration
        }
      })
    ).rejects.toThrow('PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID')

    const wrongKey = issuePluginSecurityContext(fixture.activation, 'plugin-host', {
      hostGeneration: OWNER.hostGeneration
    })
    wrongKey.uniqueKey = 'stolen-key'
    await expect(invoke(wrongKey)).rejects.toThrow('PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID')

    const stale = issuePluginSecurityContext(activation(2), 'plugin-host', {
      hostGeneration: OWNER.hostGeneration
    })
    await expect(invoke(stale)).rejects.toThrow('PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID')

    const crossPlugin = issuePluginSecurityContext(
      {
        name: 'other-plugin',
        pluginInstanceId: 'other-instance',
        activationGeneration: 1,
        key: 'other-key'
      },
      'plugin-host',
      { hostGeneration: OWNER.hostGeneration }
    )
    await expect(invoke(crossPlugin)).rejects.toThrow(
      'PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID'
    )

    const wrongHost = issuePluginSecurityContext(fixture.activation, 'plugin-host', {
      hostGeneration: OWNER.hostGeneration + 1
    })
    await expect(invoke(wrongHost)).rejects.toThrow('PLUGIN_BUSINESS_CAPABILITY_AUTHORITY_INVALID')
    expect(fixture.plugin.getBusinessRuntimeInfo).not.toHaveBeenCalled()
  })

  it('checks canonical capability permissions on every registry call', async () => {
    const fixture = createFixture()
    const decisions: string[] = []
    const { registry } = createRegistry(fixture, (_pluginName, permissionId) => {
      decisions.push(permissionId)
      return permissionId === 'storage.plugin'
    })

    await expect(registry.dispatch('storage.file.list', null)).resolves.toEqual({ names: [] })
    await expect(registry.dispatch('clipboard.read', { op: 'text' })).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    expect(decisions).toEqual(['storage.plugin', 'clipboard.read'])
    expect(fixture.clipboard.read).not.toHaveBeenCalled()
  })

  it('checks an exact permission DTO against the authoritative plugin sdkapi', async () => {
    const fixture = createFixture()
    fixture.hasPermission.mockReturnValue(false)
    const { registry } = createRegistry(fixture)

    await expect(
      registry.dispatch('permission.check', { permissionId: 'clipboard.write' })
    ).resolves.toEqual({ granted: false })
    expect(fixture.hasPermission).toHaveBeenCalledWith('business-plugin', 'clipboard.write', 260215)
    await expect(
      registry.dispatch('permission.check', {
        permissionId: 'clipboard.write',
        sdkapi: 1
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
  })

  it('prevents foreign feature/item mutation and exact old-generation cleanup from deleting newer items', async () => {
    const fixture = createFixture()
    const first = createPluginBusinessCapabilities(fixture.options)
    const firstRegistry = new PluginHostCapabilityRegistry({
      owner: OWNER,
      activation: fixture.activation,
      resolveCurrentActivation: () => fixture.plugin.getActivationIdentity(),
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: vi.fn()
    })
    for (const definition of first.definitions) firstRegistry.register(definition)

    await expect(
      firstRegistry.dispatch('feature.registry.remove', { featureId: 'manifest-feature' })
    ).resolves.toEqual({ removed: false })
    await expect(
      firstRegistry.dispatch('feature.items.remove', { id: 'foreign-item' })
    ).resolves.toEqual({ removed: false })

    await firstRegistry.dispatch('feature.registry.add', { feature: feature('owned-feature') })
    await firstRegistry.dispatch('feature.items.push', {
      scope: 'active-feature',
      items: [
        {
          id: 'shared-item',
          source: { type: 'plugin', id: 'plugin-features' },
          render: { mode: 'default', basic: { title: 'generation one' } }
        }
      ]
    })

    const secondActivation = activation(2)
    vi.mocked(fixture.plugin.getActivationIdentity).mockReturnValue(secondActivation)
    const secondRegistry = new PluginHostCapabilityRegistry({
      owner: { ...OWNER, activationHandle: 'second', hostGeneration: OWNER.hostGeneration + 1 },
      activation: secondActivation,
      resolveCurrentActivation: () => secondActivation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: vi.fn()
    })
    for (const definition of first.definitions) secondRegistry.register(definition)
    vi.mocked(fixture.featureHost.pushItems).mockRejectedValueOnce(
      new Error('replacement failed before commit')
    )
    await expect(
      secondRegistry.dispatch('feature.items.push', {
        scope: 'active-feature',
        items: [
          {
            id: 'shared-item',
            source: { type: 'plugin', id: 'plugin-features' },
            render: { mode: 'default', basic: { title: 'failed replacement' } }
          }
        ]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(fixture.itemStore.get('shared-item')).toMatchObject({
      render: { basic: { title: 'generation one' } }
    })

    await secondRegistry.dispatch('feature.items.push', {
      scope: 'active-feature',
      items: [
        {
          id: 'shared-item',
          source: { type: 'plugin', id: 'plugin-features' },
          render: { mode: 'default', basic: { title: 'generation two' } }
        }
      ]
    })
    expect(fixture.featureHost.pushItems).toHaveBeenLastCalledWith(
      'active-feature',
      expect.any(Array),
      expect.any(AbortSignal),
      [{ id: 'shared-item', activation: fixture.activation }]
    )

    await first.closeActivation(fixture.activation)
    expect(fixture.options.sqliteOwners.closeActivation).toHaveBeenCalledWith({
      pluginName: 'business-plugin',
      pluginInstanceId: 'business-instance',
      activationGeneration: 1
    })
    expect(fixture.itemStore.get('shared-item')).toMatchObject({
      render: { basic: { title: 'generation two' } }
    })
    expect(fixture.featureStore.has('owned-feature')).toBe(false)
  })

  it('tracks committed item side effects for teardown even when cancellation wins the response race', async () => {
    const fixture = createFixture()
    const { business, registry } = createRegistry(fixture)
    const controller = new AbortController()
    vi.mocked(fixture.featureHost.pushItems).mockImplementationOnce(async (_scope, items) => {
      for (const item of items) fixture.itemStore.set(String(item.id), item)
      controller.abort()
    })

    await expect(
      registry.dispatch(
        'feature.items.push',
        {
          scope: 'active-feature',
          items: [
            {
              id: 'cancelled-after-commit',
              source: { type: 'plugin', id: 'plugin-features' },
              render: { mode: 'default', basic: { title: 'Committed' } }
            }
          ]
        },
        controller.signal
      )
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    await vi.waitFor(() => expect(registry.activeCount).toBe(0))
    expect(fixture.itemStore.has('cancelled-after-commit')).toBe(true)

    await business.closeActivation(fixture.activation)
    expect(fixture.itemStore.has('cancelled-after-commit')).toBe(false)
  })

  it('does not close an activation when the key does not match its recorded identity', async () => {
    const fixture = createFixture()
    const { business, registry } = createRegistry(fixture)
    await registry.dispatch('plugin.info.get', null)

    await business.closeActivation({ ...fixture.activation, key: 'forged-key' })

    expect(fixture.options.sqliteOwners.closeActivation).not.toHaveBeenCalled()
    await expect(registry.dispatch('plugin.info.get', null)).resolves.toMatchObject({
      name: fixture.activation.name
    })
  })

  it('continues exact-activation teardown after item cleanup fails and returns a stable error', async () => {
    const fixture = createFixture()
    const { business, registry } = createRegistry(fixture)
    await registry.dispatch('feature.registry.add', { feature: feature('owned-on-close') })
    await registry.dispatch('feature.items.push', {
      scope: 'active-feature',
      items: [
        {
          id: 'owned-on-close',
          source: { type: 'plugin', id: 'plugin-features' },
          render: { mode: 'default', basic: { title: 'Owned on close' } }
        }
      ]
    })
    vi.mocked(fixture.plugin.cleanupBusinessItems).mockRejectedValueOnce(
      new Error('/private/item-cleanup-detail')
    )

    await expect(business.closeActivation(fixture.activation)).rejects.toThrow(
      'PLUGIN_BUSINESS_CLEANUP_FAILED'
    )
    expect(fixture.plugin.removeBusinessFeature).toHaveBeenCalledWith('owned-on-close')
    expect(fixture.options.sqliteOwners.closeActivation).toHaveBeenCalledWith({
      pluginName: fixture.activation.name,
      pluginInstanceId: fixture.activation.pluginInstanceId,
      activationGeneration: fixture.activation.activationGeneration
    })
    expect(fixture.itemStore.has('owned-on-close')).toBe(true)

    await expect(business.closeActivation(fixture.activation)).resolves.toBeUndefined()
    expect(fixture.plugin.cleanupBusinessItems).toHaveBeenCalledTimes(2)
    expect(fixture.itemStore.has('owned-on-close')).toBe(false)
  })

  it('keeps storage bounds, SQLite policy and secret material behind strict host seams', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)
    const secret = 'value-that-must-not-leak'
    fixture.secureGet.mockResolvedValue(secret)

    await expect(
      registry.dispatch('storage.file.write', {
        name: 'too-large.json',
        value: 'x'.repeat(1024 * 1024 + 1)
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    await expect(
      registry.dispatch('storage.sqlite.execute', {
        op: 'execute',
        sql: "ATTACH DATABASE '/tmp/foreign.sqlite' AS other"
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(
      registry.dispatch('storage.sqlite.batch', {
        statements: Array.from({ length: 65 }, () => ({ sql: 'DELETE FROM notes' }))
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    await expect(registry.dispatch('secret.get', { key: 'token' })).resolves.toEqual({
      found: true,
      value: secret
    })
    expect(fixture.secureGet).toHaveBeenCalledWith(
      '/fixture/root',
      `${pluginBusinessSecretPrefix('business-plugin')}token`
    )

    fixture.secureSet.mockRejectedValue(new Error(`${secret}: native failure`))
    const failure = await registry
      .dispatch('secret.set', { key: 'token', value: secret })
      .catch((error) => error)
    expect(failure).toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(JSON.stringify(failure)).not.toContain(secret)
  })

  it('routes clipboard through the injected service and contains HTTP SSRF, cancel and oversize', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)

    await registry.dispatch('clipboard.write', { op: 'write', content: { text: 'host seam' } })
    expect(fixture.clipboard.write).toHaveBeenCalledWith(
      { op: 'write', content: { text: 'host seam' } },
      expect.objectContaining({ identity: expect.objectContaining({ authority: 'plugin-host' }) }),
      expect.any(AbortSignal)
    )

    await expect(
      registry.dispatch('open-url', { url: 'https://user:secret@example.com' })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))

    fixture.options.network.resolveAddresses = vi.fn(async () => ['127.0.0.1'])
    const privateBusiness = createPluginBusinessCapabilities(fixture.options)
    const privateRegistry = new PluginHostCapabilityRegistry({
      owner: OWNER,
      activation: fixture.activation,
      resolveCurrentActivation: () => fixture.activation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: vi.fn()
    })
    for (const definition of privateBusiness.definitions) privateRegistry.register(definition)
    await expect(
      privateRegistry.dispatch('http.request', {
        method: 'GET',
        url: 'http://localhost/admin',
        responseType: 'text'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(
      privateRegistry.dispatch('http.request', {
        method: 'GET',
        url: 'http://[::ffff:7f00:1]/admin',
        responseType: 'text'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(fixture.networkRequest).not.toHaveBeenCalled()

    fixture.networkRequest.mockImplementationOnce(
      async (request: NetworkRequestOptions) =>
        await new Promise<NetworkResponse>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true
          })
        })
    )
    const controller = new AbortController()
    const pending = registry.dispatch(
      'http.request',
      { method: 'GET', url: 'https://example.com/slow', responseType: 'text' },
      controller.signal
    )
    controller.abort()
    await expect(pending).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    )

    fixture.networkRequest.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: 'x'.repeat(1024 * 1024 + 1),
      url: 'https://example.com/large',
      ok: true
    })
    await expect(
      registry.dispatch('http.request', {
        method: 'GET',
        url: 'https://example.com/large',
        responseType: 'text'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT'))
    expect(fixture.networkRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://example.com/large', retryPolicy: { maxRetries: 0 } }),
      {
        resolvedAddresses: ['93.184.216.34'],
        maxResponseBytes: 768 * 1024
      }
    )
  })

  it('fails HTTP closed when the host cannot guarantee connect-time address pinning', async () => {
    const fixture = createFixture()
    const unpinnedOptions = {
      ...fixture.options,
      network: {
        resolveAddresses: fixture.options.network.resolveAddresses
      }
    } as unknown as PluginBusinessCapabilityOptions
    const business = createPluginBusinessCapabilities(unpinnedOptions)
    const registry = new PluginHostCapabilityRegistry({
      owner: OWNER,
      activation: fixture.activation,
      resolveCurrentActivation: () => fixture.activation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: vi.fn()
    })
    for (const definition of business.definitions) registry.register(definition)

    await expect(
      registry.dispatch('http.request', {
        method: 'GET',
        url: 'https://example.com/data',
        responseType: 'json'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(fixture.options.network.resolveAddresses).not.toHaveBeenCalled()
    expect(fixture.networkRequest).not.toHaveBeenCalled()
  })

  it('does not evaluate accessors returned by host services', async () => {
    const fixture = createFixture()
    const decisionGetter = vi.fn(() => true)
    fixture.options.openUrl = vi.fn(async () => {
      const decision = { protocol: 'https:' }
      Object.defineProperty(decision, 'allowed', {
        enumerable: true,
        get: decisionGetter
      })
      return decision as never
    })
    const { registry } = createRegistry(fixture)

    await expect(
      registry.dispatch('open-url', { url: 'https://example.com/docs' })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT'))
    expect(decisionGetter).not.toHaveBeenCalled()
  })

  it('rejects SQL parameter and host result accessors without evaluating them', async () => {
    const fixture = createFixture()
    const business = createPluginBusinessCapabilities(fixture.options)
    const sqlite = business.definitions.find(
      (definition) => definition.id === 'storage.sqlite.execute'
    )!
    const parameterGetter = vi.fn(() => 'secret')
    const parameter = Object.create(null)
    Object.defineProperty(parameter, 'value', {
      enumerable: true,
      get: parameterGetter
    })

    expect(() =>
      sqlite.validateRequest({ op: 'query', sql: 'SELECT ?', params: [parameter] })
    ).toThrow('PLUGIN_BUSINESS_CAPABILITY_INVALID')
    expect(parameterGetter).not.toHaveBeenCalled()

    const resultGetter = vi.fn(() => [])
    const hostileResult = { columns: [] }
    Object.defineProperty(hostileResult, 'rows', {
      enumerable: true,
      get: resultGetter
    })
    fixture.sqliteClient.query.mockResolvedValueOnce(hostileResult as never)
    const { registry } = createRegistry(fixture)
    await expect(
      registry.dispatch('storage.sqlite.execute', {
        op: 'query',
        sql: 'SELECT id FROM notes',
        params: []
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT'))
    expect(resultGetter).not.toHaveBeenCalled()
  })

  it('rejects hostile HTTP host results before reading response fields', async () => {
    const fixture = createFixture()
    const statusGetter = vi.fn(() => 200)
    const response = {
      statusText: 'OK',
      headers: {},
      data: { ok: true },
      url: 'https://example.com/data',
      ok: true
    }
    Object.defineProperty(response, 'status', {
      enumerable: true,
      get: statusGetter
    })
    fixture.networkRequest.mockResolvedValueOnce(response as never)
    const { registry } = createRegistry(fixture)

    await expect(
      registry.dispatch('http.request', {
        method: 'GET',
        url: 'https://example.com/data',
        responseType: 'json'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT'))
    expect(statusGetter).not.toHaveBeenCalled()

    const byteTrap = vi.fn(() => null)
    fixture.networkRequest.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: new Proxy({}, { getPrototypeOf: byteTrap }),
      url: 'https://example.com/bytes',
      ok: true
    })
    await expect(
      registry.dispatch('http.request', {
        method: 'GET',
        url: 'https://example.com/bytes',
        responseType: 'bytes'
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT'))
    expect(byteTrap).not.toHaveBeenCalled()
  })

  it('rejects hostile feature-list and SQLite-client containers without evaluating traps', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)
    await registry.dispatch('feature.items.push', {
      scope: 'active-feature',
      items: [
        {
          id: 'owned-item',
          source: { type: 'plugin', id: 'plugin-features' },
          render: { mode: 'default', basic: { title: 'Owned' } }
        }
      ]
    })
    const listTrap = vi.fn(() => 'owned-item')
    const hostileItem = {
      source: { type: 'plugin', id: 'plugin-features' },
      render: { mode: 'default', basic: { title: 'Owned' } }
    }
    Object.defineProperty(hostileItem, 'id', {
      enumerable: true,
      get: listTrap
    })
    vi.mocked(fixture.featureHost.listItems).mockResolvedValueOnce([hostileItem] as never)

    const listFailure = await registry.dispatch('feature.items.list', null).catch((error) => error)
    expect(listFailure).toBeInstanceOf(PluginHostCapabilityError)
    if (!(listFailure instanceof PluginHostCapabilityError)) throw listFailure
    expect(listFailure.code).toBe('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    expect(listTrap.mock.calls.length).toBe(0)

    const queryGetter = vi.fn(() => vi.fn())
    const hostileClient = {
      execute: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn()
    }
    Object.defineProperty(hostileClient, 'query', {
      enumerable: true,
      get: queryGetter
    })
    vi.mocked(fixture.options.sqliteOwners.acquire).mockResolvedValueOnce(hostileClient as never)
    await expect(
      registry.dispatch('storage.sqlite.execute', {
        op: 'query',
        sql: 'SELECT id FROM notes',
        params: []
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(queryGetter).not.toHaveBeenCalled()
  })

  it('blocks reserved and private-transition addresses while allowing mapped public IPs', async () => {
    for (const address of ['203.0.113.7', '64:ff9b::7f00:1']) {
      const fixture = createFixture()
      fixture.options.network.resolveAddresses = vi.fn(async () => [address])
      const { registry } = createRegistry(fixture)
      await expect(
        registry.dispatch('http.request', {
          method: 'GET',
          url: 'https://example.com/data',
          responseType: 'json'
        })
      ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
      expect(fixture.networkRequest).not.toHaveBeenCalled()
    }

    const publicFixture = createFixture()
    publicFixture.options.network.resolveAddresses = vi.fn(async () => ['::ffff:5db8:d822'])
    const { registry } = createRegistry(publicFixture)
    await expect(
      registry.dispatch('http.request', {
        method: 'GET',
        url: 'https://example.com/data',
        responseType: 'json'
      })
    ).resolves.toMatchObject({ status: 200, ok: true })
    expect(publicFixture.networkRequest).toHaveBeenCalledWith(expect.any(Object), {
      resolvedAddresses: ['::ffff:5db8:d822'],
      maxResponseBytes: 768 * 1024
    })
  })

  it('derives collision-resistant secret namespaces from dotted plugin names and keys', async () => {
    const first = createFixture()
    const second = createFixture()
    for (const [fixture, name] of [
      [first, 'alpha'],
      [second, 'alpha.beta']
    ] as const) {
      Object.assign(fixture.activation, { name })
      Object.assign(fixture.plugin, { name })
    }
    const firstRegistry = createRegistry(first).registry
    const secondRegistry = createRegistry(second).registry

    await firstRegistry.dispatch('secret.set', { key: 'beta.token', value: 'first' })
    await secondRegistry.dispatch('secret.set', { key: 'token', value: 'second' })

    const firstKey = first.secureSet.mock.calls[0]?.[1]
    const secondKey = second.secureSet.mock.calls[0]?.[1]
    expect(firstKey).not.toBe(secondKey)
  })

  it('rejects absolute dynamic feature icons and redacts host file paths from feature results', async () => {
    const fixture = createFixture()
    const { registry } = createRegistry(fixture)

    await expect(
      registry.dispatch('feature.registry.add', {
        feature: {
          ...feature('absolute-icon'),
          icon: { type: 'file', value: '/private/plugin/icon.png' }
        }
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(fixture.plugin.addBusinessFeature).not.toHaveBeenCalled()

    vi.mocked(fixture.plugin.listBusinessFeatures).mockReturnValue([
      {
        ...feature('host-file-icon'),
        icon: { type: 'file', value: '/private/plugin/resolved-icon.png' }
      }
    ])
    const result = await registry.dispatch('feature.registry.list', null)
    expect(JSON.stringify(result)).not.toContain('/private/plugin')
    expect(result).toMatchObject({
      features: [{ id: 'host-file-icon', icon: { type: 'class' } }]
    })
  })
})
