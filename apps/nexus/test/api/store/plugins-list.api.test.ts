import type { H3Event } from 'h3'
import type { StorePluginListResult, StorePluginSearchPlugin } from '../../../server/utils/pluginsStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/store/plugins.get'

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const pluginsStoreMocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  listStorePlugins: vi.fn(),
}))

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'defineEventHandler', {
    configurable: true,
    value: <T>(fn: T) => fn,
  })
  Object.defineProperty(globalThis, 'getQuery', {
    configurable: true,
    value: h3Mocks.getQuery,
  })
})

vi.mock('h3', () => ({
  getQuery: h3Mocks.getQuery,
}))

vi.mock('../../../server/utils/pluginsStore', () => pluginsStoreMocks)

// The handler only passes the event object to mocked h3/store boundaries in this focused route test.
const event = { context: { requestId: 'store-list-test' } } as unknown as H3Event

const plugin = {
  id: 'plugin_1',
  userId: 'user_1',
  ownerOrgId: null,
  slug: 'focus-flow',
  name: 'Focus Flow',
  summary: 'Keeps deep work sessions visible.',
  category: 'productivity',
  artifactType: 'plugin',
  installs: 42,
  homepage: 'https://example.test/focus-flow',
  isOfficial: false,
  badges: ['featured'],
  author: { name: 'Plugin Dev', email: 'dev@example.test' },
  iconUrl: 'https://cdn.example.test/focus-flow.png',
  status: 'approved',
  readmeMarkdown: '# Focus Flow',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  latestVersionId: 'version_2',
  latestVersion: {
    id: 'version_2',
    pluginId: 'plugin_1',
    createdBy: 'user_1',
    channel: 'RELEASE',
    version: '1.0.0',
    signature: 'sig-release',
    packageKey: 'plugins/focus-flow/1.0.0.tpex',
    packageUrl: 'https://storage.example.test/focus-flow.tpex',
    packageSize: 1024,
    iconKey: 'plugins/focus-flow/icon.png',
    iconUrl: 'https://cdn.example.test/focus-flow.png',
    readmeMarkdown: '# Focus Flow',
    status: 'approved',
    manifest: { permissions: ['clipboard', 'storage'] },
    changelog: 'Stable release',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
  versions: [
    {
      id: 'version_1',
      pluginId: 'plugin_1',
      createdBy: 'user_1',
      channel: 'BETA',
      version: '0.9.0',
      signature: 'sig-beta',
      packageKey: 'plugins/focus-flow/0.9.0.tpex',
      packageUrl: 'https://storage.example.test/focus-flow-beta.tpex',
      packageSize: 512,
      iconKey: 'plugins/focus-flow/icon.png',
      iconUrl: 'https://cdn.example.test/focus-flow.png',
      readmeMarkdown: '# Focus Flow beta',
      status: 'approved',
      manifest: { permissions: ['clipboard'] },
      changelog: 'Beta release',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    {
      id: 'version_2',
      pluginId: 'plugin_1',
      createdBy: 'user_1',
      channel: 'RELEASE',
      version: '1.0.0',
      signature: 'sig-release',
      packageKey: 'plugins/focus-flow/1.0.0.tpex',
      packageUrl: 'https://storage.example.test/focus-flow.tpex',
      packageSize: 1024,
      iconKey: 'plugins/focus-flow/icon.png',
      iconUrl: 'https://cdn.example.test/focus-flow.png',
      readmeMarkdown: '# Focus Flow',
      status: 'approved',
      manifest: { permissions: ['clipboard', 'storage'] },
      changelog: 'Stable release',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
} satisfies StorePluginSearchPlugin

beforeEach(() => {
  vi.clearAllMocks()
  h3Mocks.getQuery.mockReturnValue({ compact: '1', limit: '25', offset: '50' })
  pluginsStoreMocks.listStorePlugins.mockResolvedValue({
    plugins: [plugin],
    total: 123,
    limit: 25,
    offset: 50,
  } satisfies StorePluginListResult)
})

describe('/api/store/plugins', () => {
  it('requests a bounded compact store slice and returns stable pagination metadata', async () => {
    const result = await handler(event)

    expect(pluginsStoreMocks.listStorePlugins).toHaveBeenCalledWith(event, {
      compact: true,
      limit: 25,
      offset: 50,
    })
    expect(pluginsStoreMocks.listPlugins).not.toHaveBeenCalled()
    expect(result).toEqual({
      plugins: [
        {
          id: 'plugin_1',
          slug: 'focus-flow',
          name: 'Focus Flow',
          summary: 'Keeps deep work sessions visible.',
          category: 'productivity',
          installs: 42,
          homepage: 'https://example.test/focus-flow',
          isOfficial: false,
          badges: ['featured'],
          author: { name: 'Plugin Dev', email: 'dev@example.test' },
          iconUrl: 'https://cdn.example.test/focus-flow.png',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
          latestVersion: {
            id: 'version_2',
            pluginId: 'plugin_1',
            channel: 'RELEASE',
            version: '1.0.0',
            signature: 'sig-release',
            packageUrl: '/api/store/plugins/focus-flow/download.tpex?version=1.0.0',
            packageSize: 1024,
            status: 'approved',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          readmeUrl: '/api/store/plugins/focus-flow/readme',
        },
      ],
      total: 123,
      limit: 25,
      offset: 50,
    })
    expect(result.plugins[0]).not.toHaveProperty('versions')
    expect(result.plugins[0].latestVersion).not.toHaveProperty('manifest')
    expect(result.plugins[0].latestVersion).not.toHaveProperty('changelog')
  })

  it('clamps invalid pagination before reading the store slice', async () => {
    h3Mocks.getQuery.mockReturnValue({ compact: '1', limit: '1000', offset: '-10' })
    pluginsStoreMocks.listStorePlugins.mockResolvedValue({
      plugins: [],
      total: 0,
      limit: 100,
      offset: 0,
    } satisfies StorePluginListResult)

    const result = await handler(event)

    expect(pluginsStoreMocks.listStorePlugins).toHaveBeenCalledWith(event, {
      compact: true,
      limit: 100,
      offset: 0,
    })
    expect(pluginsStoreMocks.listPlugins).not.toHaveBeenCalled()
    expect(result).toEqual({
      plugins: [],
      total: 0,
      limit: 100,
      offset: 0,
    })
  })
})
