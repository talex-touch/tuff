import type { H3Event } from 'h3'
import type { StorePluginSearchPlugin, StorePluginSearchResult } from '../../../server/utils/pluginsStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/store/search.get'

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const pluginsStoreMocks = vi.hoisted(() => ({
  searchStorePlugins: vi.fn(),
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
const event = { context: { requestId: 'store-search-test' } } as unknown as H3Event

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
    version: '1.0.0+build/5',
    signature: 'sig-release',
    artifactSha256: 'a'.repeat(64),
    publisherSignature: { keyId: 'publisher-key', signature: 'publisher-signature' },
    publisherKey: { keyId: 'publisher-key', status: 'active' },
    publisherVerifiedAt: '2026-06-01T00:00:00.000Z',
    nexusAttestation: { keyId: 'nexus-key', signature: 'nexus-attestation' },
    admissionStatus: 'eligible',
    policyDecision: 'passed',
    artifactState: 'available',
    revokedAt: null,
    securityScanDecision: 'passed',
    securityScanReportDigest: 'scan-report-sha',
    securityScannerVersion: 'scanner-1',
    securityRuleSetVersion: 'rules-1',
    securityScanFindingCount: 0,
    securityScanCompletedAt: '2026-06-01T00:00:00.000Z',
    packageKey: 'plugins/focus-flow/1.0.0.tpex',
    packageUrl: 'https://storage.example.test/private/focus-flow.tpex',
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
    artifactSha256: 'b'.repeat(64),
    publisherSignature: { keyId: 'publisher-key', signature: 'publisher-signature' },
    publisherKey: { keyId: 'publisher-key', status: 'active' },
    publisherVerifiedAt: '2026-05-01T00:00:00.000Z',
    nexusAttestation: { keyId: 'nexus-key', signature: 'nexus-attestation' },
    admissionStatus: 'eligible',
    policyDecision: 'passed',
    artifactState: 'available',
    revokedAt: null,
    securityScanDecision: 'passed',
    securityScanReportDigest: 'scan-report-sha',
    securityScannerVersion: 'scanner-1',
    securityRuleSetVersion: 'rules-1',
    securityScanFindingCount: 0,
    securityScanCompletedAt: '2026-05-01T00:00:00.000Z',
      packageKey: 'plugins/focus-flow/0.9.0.tpex',
      packageUrl: 'https://storage.example.test/private/focus-flow-beta.tpex',
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
      version: '1.0.0+build/5',
      signature: 'sig-release',
      artifactSha256: 'a'.repeat(64),
      publisherSignature: { keyId: 'publisher-key', signature: 'publisher-signature' },
      publisherKey: { keyId: 'publisher-key', status: 'active' },
      publisherVerifiedAt: '2026-06-01T00:00:00.000Z',
      nexusAttestation: { keyId: 'nexus-key', signature: 'nexus-attestation' },
      admissionStatus: 'eligible',
      policyDecision: 'passed',
      artifactState: 'available',
      revokedAt: null,
      securityScanDecision: 'passed',
      securityScanReportDigest: 'scan-report-sha',
      securityScannerVersion: 'scanner-1',
      securityRuleSetVersion: 'rules-1',
      securityScanFindingCount: 0,
      securityScanCompletedAt: '2026-06-01T00:00:00.000Z',
      packageKey: 'plugins/focus-flow/1.0.0.tpex',
      packageUrl: 'https://storage.example.test/private/focus-flow.tpex',
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
  h3Mocks.getQuery.mockReturnValue({ q: ' flow ', category: ' productivity ', limit: '25.9', offset: '5.1' })
  pluginsStoreMocks.searchStorePlugins.mockResolvedValue({
    plugins: [plugin],
    total: 123,
    limit: 25,
    offset: 5,
  } satisfies StorePluginSearchResult)
})

describe('/api/store/search', () => {
  it('searches a bounded default compact slice and returns only card-safe plugin fields', async () => {
    const result = await handler(event)

    expect(pluginsStoreMocks.searchStorePlugins).toHaveBeenCalledWith(event, {
      keyword: 'flow',
      category: 'productivity',
      limit: 25,
      offset: 5,
    })
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
            version: '1.0.0+build/5',
            artifactSha256: 'a'.repeat(64),
            nexusAttestation: { keyId: 'nexus-key', signature: 'nexus-attestation' },
            availability: 'available',
            packageUrl: '/api/store/plugins/focus-flow/download.tpex?version=1.0.0%2Bbuild%2F5',
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
      offset: 5,
    })
    expect(Object.keys(result.plugins[0]).sort()).toEqual([
      'author',
      'badges',
      'category',
      'createdAt',
      'homepage',
      'iconUrl',
      'id',
      'installs',
      'isOfficial',
      'latestVersion',
      'name',
      'readmeUrl',
      'slug',
      'summary',
      'updatedAt',
    ])
    expect(result.plugins[0]).not.toHaveProperty('versions')
    expect(result.plugins[0]).not.toHaveProperty('readmeMarkdown')
    expect(result.plugins[0].latestVersion).not.toHaveProperty('manifest')
    expect(result.plugins[0].latestVersion).not.toHaveProperty('changelog')
    expect(result.plugins[0].latestVersion).not.toHaveProperty('readmeMarkdown')
    expect(result.plugins[0].latestVersion.packageUrl).not.toContain('storage.example.test')
  })

  it('keeps compact=false responses sanitized while preserving public release metadata', async () => {
    h3Mocks.getQuery.mockReturnValue({ q: 'flow', compact: '0', limit: '10', offset: '2' })
    pluginsStoreMocks.searchStorePlugins.mockResolvedValue({
      plugins: [plugin],
      total: 1,
      limit: 10,
      offset: 2,
    } satisfies StorePluginSearchResult)

    const result = await handler(event)

    expect(pluginsStoreMocks.searchStorePlugins).toHaveBeenCalledWith(event, {
      keyword: 'flow',
      category: undefined,
      limit: 10,
      offset: 2,
    })
    expect(result).toMatchObject({ total: 1, limit: 10, offset: 2 })
    expect(result.plugins[0].versions).toHaveLength(2)
    expect(result.plugins[0].latestVersion).toMatchObject({
      artifactSha256: 'a'.repeat(64),
      nexusAttestation: { keyId: 'nexus-key', signature: 'nexus-attestation' },
      availability: 'available',
      packageUrl: '/api/store/plugins/focus-flow/download.tpex?version=1.0.0%2Bbuild%2F5',
      manifest: { permissions: ['clipboard', 'storage'] },
      changelog: 'Stable release',
    })
    for (const publicVersion of result.plugins[0].versions) {
      expect(publicVersion).not.toHaveProperty('packageKey')
      expect(publicVersion).not.toHaveProperty('publisherKey')
      expect(publicVersion).not.toHaveProperty('publisherSignature')
      expect(publicVersion).not.toHaveProperty('policyDecision')
      expect(publicVersion).not.toHaveProperty('artifactState')
      expect(publicVersion).not.toHaveProperty('securityScanReportDigest')
    }
  })

  it('clamps invalid pagination before searching the store', async () => {
    h3Mocks.getQuery.mockReturnValue({ q: 'flow', category: 'productivity', limit: '1000', offset: '-10' })
    pluginsStoreMocks.searchStorePlugins.mockResolvedValue({
      plugins: [],
      total: 0,
      limit: 100,
      offset: 0,
    } satisfies StorePluginSearchResult)

    const result = await handler(event)

    expect(pluginsStoreMocks.searchStorePlugins).toHaveBeenCalledWith(event, {
      keyword: 'flow',
      category: 'productivity',
      limit: 100,
      offset: 0,
    })
    expect(result).toEqual({
      plugins: [],
      total: 0,
      limit: 100,
      offset: 0,
    })
  })
})
