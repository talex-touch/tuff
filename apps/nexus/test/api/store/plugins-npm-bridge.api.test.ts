import type { H3Event } from 'h3'
import type { DashboardPlugin, DashboardPluginVersion, StorePluginListResult, StorePluginSearchPlugin } from '../../../server/utils/pluginsStore'
import { createHash } from 'node:crypto'
import { DEFAULT_NPM_REGISTRY_URL } from '@talex-touch/utils/plugin'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import listHandler from '../../../server/api/store/plugins.get'
import slugHandler from '../../../server/api/store/plugins/[slug].get'

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const pluginsStoreMocks = vi.hoisted(() => ({
  listStorePlugins: vi.fn(),
  getPluginBySlug: vi.fn(),
}))

const pluginStoreAccessMocks = vi.hoisted(() => ({
  resolvePluginStoreAudience: vi.fn(),
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

vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('h3')>()),
  getQuery: h3Mocks.getQuery,
}))

vi.mock('../../../server/utils/pluginsStore', () => pluginsStoreMocks)
vi.mock('../../../server/utils/pluginStoreAccess', () => pluginStoreAccessMocks)

const VALID_SRI = `sha512-${createHash('sha512').update('nexus-npm-bridge-tgz').digest('base64')}`
const VALID_TARBALL_SHA256 = createHash('sha256').update('nexus-npm-bridge-tgz').digest('hex')

function makeVersion(overrides: Partial<DashboardPluginVersion> = {}): DashboardPluginVersion {
  return {
    id: 'version_2',
    pluginId: 'plugin_1',
    createdBy: 'user_1',
    channel: 'RELEASE',
    version: '1.2.0',
    artifactSha256: 'a'.repeat(64),
    nexusAttestation: {
      algorithm: 'Ed25519',
      keyId: 'nexus-key',
      payload: {} as never,
      payloadSha256: 'b'.repeat(64),
      signature: 'nexus-sig',
    },
    admissionStatus: 'eligible',
    policyDecision: 'passed',
    artifactState: 'available',
    packageKey: 'plugins/clipboard-history/1.2.0.tpex',
    packageUrl: 'https://storage.example.test/clipboard-history.tpex',
    packageSize: 2048,
    iconKey: 'plugins/clipboard-history/icon.svg',
    iconUrl: 'https://cdn.example.test/clipboard-history.svg',
    readmeMarkdown: '# Clipboard History',
    manifest: {
      id: 'com.talex.touch.clipboard-history',
      name: 'clipboard-history',
      sdkapi: 261011,
      permissions: { required: ['clipboard.read'] },
    },
    changelog: 'Dual-published release',
    status: 'approved',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePlugin(overrides: Partial<StorePluginSearchPlugin> = {}): StorePluginSearchPlugin {
  const latestVersion = overrides.latestVersion ?? makeVersion()
  const versions = overrides.versions ?? [latestVersion]
  return {
    id: 'plugin_1',
    userId: 'user_1',
    ownerOrgId: null,
    slug: 'clipboard-history',
    name: 'Clipboard History',
    summary: 'Clipboard history manager for Tuff.',
    category: 'productivity',
    artifactType: 'plugin',
    installs: 120,
    homepage: 'https://tuff.tagzxia.com/store/clipboard-history',
    isOfficial: true,
    badges: ['official'],
    author: { name: 'Talex Touch' },
    iconUrl: 'https://cdn.example.test/clipboard-history.svg',
    status: 'approved',
    readmeMarkdown: '# Clipboard History',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    latestVersionId: latestVersion.id,
    latestVersion,
    versions,
    ...overrides,
  }
}

const listEvent = { context: { requestId: 'store-list-npm-test' } } as unknown as H3Event
const slugEvent = {
  context: {
    requestId: 'store-slug-npm-test',
    params: { slug: 'clipboard-history' },
  },
} as unknown as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  pluginStoreAccessMocks.resolvePluginStoreAudience.mockResolvedValue('public')
  h3Mocks.getQuery.mockReturnValue({ compact: '0', limit: '50', offset: '0' })
})

describe('Store API NPM cross-link surfacing (/api/store/plugins and /api/store/plugins/[slug])', () => {
  it('omits npm metadata completely when absent on both list and detail endpoints', async () => {
    const legacyPlugin = makePlugin()
    pluginsStoreMocks.listStorePlugins.mockResolvedValue({
      plugins: [legacyPlugin],
      total: 1,
      limit: 50,
      offset: 0,
    } satisfies StorePluginListResult)
    pluginsStoreMocks.getPluginBySlug.mockResolvedValue(legacyPlugin satisfies DashboardPlugin)

    const listResponse = await listHandler(listEvent) as { plugins: Array<Record<string, unknown>> }
    const detailResponse = await slugHandler(slugEvent) as { plugin: Record<string, unknown> }

    expect(listResponse.plugins[0]).not.toHaveProperty('npm')
    expect(listResponse.plugins[0]?.latestVersion).not.toHaveProperty('npm')
    expect((listResponse.plugins[0]?.versions as Array<Record<string, unknown>>)[0]).not.toHaveProperty('npm')

    expect(detailResponse.plugin).not.toHaveProperty('npm')
    expect(detailResponse.plugin.latestVersion).not.toHaveProperty('npm')
    expect((detailResponse.plugin.versions as Array<Record<string, unknown>>)[0]).not.toHaveProperty('npm')
  })

  it('surfaces validated npm install and provenance metadata alongside nexusAttestation', async () => {
    const olderVersion = makeVersion({
      id: 'version_1',
      version: '1.1.0',
      npmPackageName: null,
      npmRegistry: null,
      npmIntegrity: null,
      npmTarballSha256: null,
    })
    const latestVersion = makeVersion({
      id: 'version_2',
      version: '1.2.0',
      npmIntegrity: VALID_SRI,
      npmTarballSha256: VALID_TARBALL_SHA256,
    })
    const dualPlugin = makePlugin({
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'https://npm.pkg.github.com/',
      latestVersionId: latestVersion.id,
      latestVersion,
      versions: [latestVersion, olderVersion],
    })

    pluginsStoreMocks.listStorePlugins.mockResolvedValue({
      plugins: [dualPlugin],
      total: 1,
      limit: 50,
      offset: 0,
    } satisfies StorePluginListResult)
    pluginsStoreMocks.getPluginBySlug.mockResolvedValue(dualPlugin)

    const expectedPluginNpm = {
      packageName: '@talex-touch/clipboard-history-plugin',
      registry: 'https://npm.pkg.github.com',
      installSource: 'npm:@talex-touch/clipboard-history-plugin',
      officialScope: true,
    }
    const expectedLatestNpm = {
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.2.0',
      registry: 'https://npm.pkg.github.com',
      installSource: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
      officialScope: true,
      integrity: VALID_SRI,
      tarballSha256: VALID_TARBALL_SHA256,
    }
    const expectedOlderNpm = {
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.1.0',
      registry: 'https://npm.pkg.github.com',
      installSource: 'npm:@talex-touch/clipboard-history-plugin@1.1.0',
      officialScope: true,
      integrity: null,
      tarballSha256: null,
    }

    const listResponse = await listHandler(listEvent) as {
      plugins: Array<{
        npm?: unknown
        latestVersion: { npm?: unknown, nexusAttestation?: unknown }
        versions: Array<{ id: string, npm?: unknown }>
      }>
    }
    expect(listResponse.plugins[0]?.npm).toEqual(expectedPluginNpm)
    expect(listResponse.plugins[0]?.latestVersion.npm).toEqual(expectedLatestNpm)
    expect(listResponse.plugins[0]?.latestVersion.nexusAttestation).toBeTruthy()
    expect(listResponse.plugins[0]?.versions.find(v => v.id === 'version_1')?.npm).toEqual(expectedOlderNpm)

    // Compact mode also preserves plugin and latestVersion npm cross-links.
    h3Mocks.getQuery.mockReturnValue({ compact: '1', limit: '50', offset: '0' })
    const compactResponse = await listHandler(listEvent) as {
      plugins: Array<{ npm?: unknown, latestVersion: { npm?: unknown } }>
    }
    expect(compactResponse.plugins[0]?.npm).toEqual(expectedPluginNpm)
    expect(compactResponse.plugins[0]?.latestVersion.npm).toEqual(expectedLatestNpm)

    const detailResponse = await slugHandler(slugEvent) as {
      plugin: {
        npm?: unknown
        latestVersion: { npm?: unknown, nexusAttestation?: unknown }
        versions: Array<{ id: string, npm?: unknown }>
      }
    }
    expect(detailResponse.plugin.npm).toEqual(expectedPluginNpm)
    expect(detailResponse.plugin.latestVersion.npm).toEqual(expectedLatestNpm)
    expect(detailResponse.plugin.latestVersion.nexusAttestation).toBeTruthy()
    expect(detailResponse.plugin.versions.find(v => v.id === 'version_1')?.npm).toEqual(expectedOlderNpm)
  })

  it('defaults registry to registry.npmjs.org and supports version-only npm metadata', async () => {
    const versionWithNpm = makeVersion({
      id: 'version_2',
      version: '2.0.0',
      npmPackageName: 'tuff-plugin-clipboard-history',
      npmRegistry: null,
      npmIntegrity: VALID_SRI,
      npmTarballSha256: VALID_TARBALL_SHA256,
    })
    const versionWithoutNpm = makeVersion({
      id: 'version_1',
      version: '1.0.0',
      npmPackageName: null,
    })
    const plugin = makePlugin({
      npmPackageName: null,
      npmRegistry: null,
      latestVersionId: versionWithNpm.id,
      latestVersion: versionWithNpm,
      versions: [versionWithNpm, versionWithoutNpm],
    })

    pluginsStoreMocks.getPluginBySlug.mockResolvedValue(plugin)
    const detailResponse = await slugHandler(slugEvent) as {
      plugin: {
        npm?: unknown
        latestVersion: { npm?: unknown }
        versions: Array<{ id: string, npm?: unknown }>
      }
    }

    expect(detailResponse.plugin.npm).toEqual({
      packageName: 'tuff-plugin-clipboard-history',
      registry: DEFAULT_NPM_REGISTRY_URL,
      installSource: 'npm:tuff-plugin-clipboard-history',
      officialScope: false,
    })
    expect(detailResponse.plugin.latestVersion.npm).toEqual({
      packageName: 'tuff-plugin-clipboard-history',
      version: '2.0.0',
      registry: DEFAULT_NPM_REGISTRY_URL,
      installSource: 'npm:tuff-plugin-clipboard-history@2.0.0',
      officialScope: false,
      integrity: VALID_SRI,
      tarballSha256: VALID_TARBALL_SHA256,
    })
    expect(detailResponse.plugin.versions.find(v => v.id === 'version_1')).not.toHaveProperty('npm')
  })

  it('rejects and omits invalid package names or non-HTTPS registries from store responses', async () => {
    const invalidPackagePlugin = makePlugin({
      npmPackageName: '../evil-package',
      npmRegistry: DEFAULT_NPM_REGISTRY_URL,
      latestVersion: makeVersion({ npmPackageName: 'INVALID_UPPER' }),
    })
    const invalidRegistryPlugin = makePlugin({
      id: 'plugin_2',
      slug: 'bad-registry',
      npmPackageName: '@talex-touch/clipboard-history-plugin',
      npmRegistry: 'http://registry.evil.test',
      latestVersion: makeVersion({
        id: 'version_bad_reg',
        pluginId: 'plugin_2',
        npmPackageName: '@talex-touch/clipboard-history-plugin',
        npmRegistry: 'http://127.0.0.1:4873',
      }),
    })

    pluginsStoreMocks.listStorePlugins.mockResolvedValue({
      plugins: [invalidPackagePlugin, invalidRegistryPlugin],
      total: 2,
      limit: 50,
      offset: 0,
    } satisfies StorePluginListResult)

    const listResponse = await listHandler(listEvent) as {
      plugins: Array<Record<string, unknown>>
    }
    for (const item of listResponse.plugins) {
      expect(item).not.toHaveProperty('npm')
      expect(item.latestVersion).not.toHaveProperty('npm')
    }

    pluginsStoreMocks.getPluginBySlug.mockResolvedValue(invalidRegistryPlugin)
    const detailResponse = await slugHandler(slugEvent) as {
      plugin: Record<string, unknown>
    }
    expect(detailResponse.plugin).not.toHaveProperty('npm')
    expect(detailResponse.plugin.latestVersion).not.toHaveProperty('npm')
  })
})
