import type { H3Event } from 'h3'
import type {
  DashboardPlugin,
  DashboardPluginVersion,
  getPluginById as getPluginByIdType,
  getPluginVersionEligibility as getPluginVersionEligibilityType,
  invalidatePluginVersionsForPublisherKey as invalidatePluginVersionsForPublisherKeyType,
  listPluginTimeline as listPluginTimelineType,
  listStorePlugins as listStorePluginsType,
  searchStorePlugins as searchStorePluginsType,
} from './pluginsStore'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface StoredPlugin {
  id: string
  userId: string
  ownerOrgId: string | null
  slug: string
  name: string
  summary: string
  category: string
  artifactType: 'plugin'
  installs: number
  homepage: string | null
  isOfficial: boolean
  badges: string[]
  author: { name: string, email?: string } | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  readmeMarkdown: string | null
  iconKey: string | null
  iconUrl: string | null
  createdAt: string
  updatedAt: string
  latestVersionId: string | null
}

interface StoredVersion {
  id: string
  pluginId: string
  createdBy: string
  channel: 'SNAPSHOT' | 'BETA' | 'RELEASE'
  version: string
  artifactSha256: string
  publisherSignature: Record<string, unknown> | null
  publisherKey: Record<string, unknown> | null
  publisherVerifiedAt: string | null
  nexusAttestation: Record<string, unknown> | null
  admissionStatus: 'pending' | 'eligible' | 'blocked'
  policyDecision: 'passed' | 'failed' | 'unavailable' | 'not-evaluated'
  artifactState: 'available' | 'missing' | 'quarantined'
  revokedAt: string | null
  eligibilityRevision: number
  eligibilityEvaluatedAt: string | null
  eligibilityReasons: string[]
  packageKey: string
  packageUrl: string
  packageSize: number
  iconKey: string
  iconUrl: string
  readmeMarkdown: string | null
  manifest: Record<string, unknown> | null
  changelog: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewedAt: string | null
  rejectReason: string | null
  securityScanDecision: 'passed' | 'review-required' | 'blocked' | 'unavailable' | 'not-evaluated'
  securityScanReportDigest: string | null
  securityScannerVersion: string | null
  securityRuleSetVersion: string | null
  securityScanFindingCount: number | null
  securityScanCompletedAt: string | null
  createdAt: string
  updatedAt: string
}

interface D1PluginRow {
  id: string
  user_id: string
  owner_org_id: string | null
  slug: string
  name: string
  summary: string
  category: string
  artifact_type: string
  installs: number
  homepage: string | null
  is_official: number
  badges: string
  author: string | null
  status: string
  readme_markdown: string | null
  icon: string | null
  icon_key: string | null
  icon_url: string | null
  image_url: string | null
  last_updated: string | null
  version: string | null
  created_at: string
  updated_at: string
  latest_version_id: string | null
}

interface D1VersionRow {
  id: string
  plugin_id: string
  created_by: string
  channel: 'SNAPSHOT' | 'BETA' | 'RELEASE'
  version: string
  signature: string
  artifact_sha256: string
  publisher_signature: string | null
  publisher_key: string | null
  publisher_key_id: string | null
  publisher_verified_at: string | null
  nexus_attestation: string | null
  admission_status: 'pending' | 'eligible' | 'blocked'
  policy_decision: 'passed' | 'failed' | 'unavailable' | 'not-evaluated'
  artifact_state: 'available' | 'missing' | 'quarantined'
  revoked_at: string | null
  eligibility_revision: number
  eligibility_evaluated_at: string | null
  eligibility_reasons: string | null
  package_key: string
  package_url: string
  package_size: number
  icon_key: string
  icon_url: string
  readme_markdown: string | null
  manifest: string | null
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  reject_reason: string | null
  security_scan_decision: 'passed' | 'review-required' | 'blocked' | 'unavailable' | 'not-evaluated'
  security_scan_report_digest: string | null
  security_scanner_version: string | null
  security_rule_set_version: string | null
  security_scan_finding_count: number | null
  security_scan_completed_at: string | null
  created_at: string
  updated_at: string
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
  storage: new Map<string, unknown>(),
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async (key: string) => state.storage.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      state.storage.set(key, value)
    },
  }),
}))

class MockD1Database {
  plugins: D1PluginRow[] = []
  versions: D1VersionRow[] = []
  timeline: Array<Record<string, unknown>> = []

  prepare(sql: string) {
    return {
      bind: (...bindings: unknown[]) => ({
        first: async <T>() => this.first<T>(sql, bindings),
        all: async <T>() => this.all<T>(sql, bindings),
        run: async () => this.run(sql, bindings),
      }),
      first: async <T>() => this.first<T>(sql, []),
      all: async <T>() => this.all<T>(sql, []),
      run: async () => this.run(sql, []),
    }
  }

  private async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes('FROM dashboard_plugins') && sql.includes('WHERE id')) {
      const pluginId = bindings[0]
      return (this.plugins.find(plugin => plugin.id === pluginId) ?? null) as T | null
    }
    return null
  }

  private async all<T>(sql: string, bindings: unknown[]): Promise<{ results: T[] }> {
    if (sql.includes('PRAGMA table_info'))
      return { results: [] }
    if (sql.includes('FROM dashboard_plugin_timeline'))
      return { results: this.timeline.filter(event => event.plugin_id === bindings[0]) as T[] }
    if (sql.includes('FROM dashboard_plugin_versions') && sql.includes('WHERE publisher_key_id')) {
      const keyId = bindings[0]
      return {
        results: this.versions
          .filter(version => version.publisher_key_id === keyId && !version.revoked_at)
          .map(version => ({
            id: version.id,
            plugin_id: version.plugin_id,
            version: version.version,
            channel: version.channel,
          })) as T[],
      }
    }
    if (sql.includes('FROM dashboard_plugin_versions')) {
      const pluginIds = new Set(bindings.filter((value): value is string => typeof value === 'string'))
      return { results: this.versions.filter(version => pluginIds.has(version.plugin_id)) as T[] }
    }
    if (sql.includes('FROM dashboard_plugins'))
      return { results: this.plugins as T[] }
    return { results: [] }
  }

  private async run(sql: string, bindings: unknown[]) {
    if (sql.includes('UPDATE dashboard_plugin_versions') && sql.includes('admission_status = \'blocked\'')) {
      const [revokedAt, eligibilityReasons, keyId] = bindings as [string, string, string]
      const affected = this.versions.filter(version => version.publisher_key_id === keyId && !version.revoked_at)
      for (const version of affected) {
        version.admission_status = 'blocked'
        version.nexus_attestation = null
        version.revoked_at = revokedAt
        version.eligibility_revision += 1
        version.eligibility_evaluated_at = revokedAt
        version.eligibility_reasons = eligibilityReasons
        version.updated_at = revokedAt
      }
      return { success: true, meta: { changes: affected.length } }
    }
    if (sql.includes('UPDATE dashboard_plugins') && sql.includes('latest_version_id')) {
      const [latestVersionId, updatedAt, pluginId] = bindings as [string | null, string, string]
      const plugin = this.plugins.find(plugin => plugin.id === pluginId)
      if (plugin) {
        plugin.latest_version_id = latestVersionId
        plugin.updated_at = updatedAt
      }
      return { success: true, meta: { changes: plugin ? 1 : 0 } }
    }
    if (sql.includes('INSERT INTO dashboard_plugin_timeline')) {
      const [id, pluginId, versionId, eventType, actorId, actorRole, fromStatus, toStatus, reason, meta, createdAt] = bindings
      this.timeline.unshift({
        id,
        plugin_id: pluginId,
        version_id: versionId,
        event_type: eventType,
        actor_id: actorId,
        actor_role: actorRole,
        from_status: fromStatus,
        to_status: toStatus,
        reason,
        meta,
        created_at: createdAt,
      })
      return { success: true, meta: { changes: 1 } }
    }
    return { success: true, meta: { changes: 0 } }
  }
}

let getPluginById: typeof getPluginByIdType
let getPluginVersionEligibility: typeof getPluginVersionEligibilityType
let invalidatePluginVersionsForPublisherKey: typeof invalidatePluginVersionsForPublisherKeyType
let listPluginTimeline: typeof listPluginTimelineType
let searchStorePlugins: typeof searchStorePluginsType
let listStorePlugins: typeof listStorePluginsType
// The store test only needs an event identity for the mocked Cloudflare binding.
const event = {} as H3Event

beforeAll(async () => {
  const store = await import('./pluginsStore')
  getPluginById = store.getPluginById
  getPluginVersionEligibility = store.getPluginVersionEligibility
  invalidatePluginVersionsForPublisherKey = store.invalidatePluginVersionsForPublisherKey
  listPluginTimeline = store.listPluginTimeline
  searchStorePlugins = store.searchStorePlugins
  listStorePlugins = store.listStorePlugins
})

beforeEach(() => {
  state.db = null
  state.storage.clear()
})

describe('searchStorePlugins eligibility projection', () => {
  it('keeps the prior eligible RELEASE, ignores newer pending/rejected and private channels, and selects semver over creation time in memory fallback', async () => {
    seedMemoryStore([plugin({ id: 'focus-flow', name: 'Focus Flow' })], [
      version({ id: 'eligible-1-10', pluginId: 'focus-flow', version: '1.10.0', createdAt: '2026-07-01T00:00:00.000Z' }),
      version({ id: 'eligible-1-9', pluginId: 'focus-flow', version: '1.9.0', createdAt: '2026-07-08T00:00:00.000Z' }),
      version({ id: 'pending-3', pluginId: 'focus-flow', version: '3.0.0', status: 'pending', admissionStatus: 'pending' }),
      version({ id: 'rejected-2', pluginId: 'focus-flow', version: '2.0.0', status: 'rejected', admissionStatus: 'blocked' }),
      version({ id: 'beta-9', pluginId: 'focus-flow', channel: 'BETA', version: '9.0.0' }),
      version({ id: 'snapshot-10', pluginId: 'focus-flow', channel: 'SNAPSHOT', version: '10.0.0' }),
    ])

    const result = await searchStorePlugins(event, { keyword: 'focus' })

    expect(result).toMatchObject({ total: 1 })
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].latestVersionId).toBe('eligible-1-10')
    expect(result.plugins[0].latestVersion).toMatchObject({ id: 'eligible-1-10', version: '1.10.0' })
    expect(result.plugins[0].versions.map(version => version.id)).toEqual(['eligible-1-9', 'eligible-1-10'])
  })

  it.each([
    { name: 'missing policy', overrides: { policyDecision: 'not-evaluated' as const } },
    { name: 'missing scan', overrides: { securityScanDecision: 'not-evaluated' as const } },
    { name: 'missing publisher verification', overrides: { publisherSignature: null, publisherKey: null, publisherVerifiedAt: null } },
    { name: 'missing Nexus attestation', overrides: { nexusAttestation: null } },
  ])('hides a release with $name from list and search', async ({ overrides }) => {
    seedMemoryStore([plugin({ id: 'focus-flow' })], [version({ pluginId: 'focus-flow', ...overrides })])

    await expect(searchStorePlugins(event)).resolves.toMatchObject({ total: 0, plugins: [] })
    await expect(listStorePlugins(event)).resolves.toMatchObject({ total: 0, plugins: [] })
  })

  it.each([
    { name: 'missing artifact', overrides: { artifactState: 'missing' as const } },
    { name: 'quarantined artifact', overrides: { artifactState: 'quarantined' as const } },
    { name: 'revoked publisher', overrides: { revokedAt: '2026-07-08T00:00:00.000Z' } },
  ])('withdraws $name without replacing an older eligible RELEASE', async ({ overrides }) => {
    seedMemoryStore([plugin({ id: 'focus-flow' })], [
      version({ id: 'eligible-1', pluginId: 'focus-flow', version: '1.0.0' }),
      version({ id: 'withdrawn-2', pluginId: 'focus-flow', version: '2.0.0', ...overrides }),
    ])

    const result = await listStorePlugins(event)

    expect(result.plugins[0].latestVersionId).toBe('eligible-1')
    expect(result.plugins[0].versions.map(version => version.id)).toEqual(['eligible-1'])
  })

  it('computes dashboard reasons without requiring an internal scan report', () => {
    // The storage fixture deliberately models a serialized release record.
    const dashboardPlugin = plugin({ id: 'focus-flow' }) as unknown as DashboardPlugin
    const dashboardVersion = version({
      pluginId: 'focus-flow',
      policyDecision: 'failed',
      securityScanDecision: 'blocked',
      securityScanReportDigest: null,
      admissionStatus: 'blocked',
    }) as unknown as DashboardPluginVersion
    expect(getPluginVersionEligibility(dashboardPlugin, dashboardVersion, 'admin')).toEqual({
      eligible: false,
      visibility: 'private',
      reasons: [
        'PLUGIN_ELIGIBILITY_POLICY_NOT_PASSED',
        'PLUGIN_ELIGIBILITY_SCAN_NOT_PASSED',
        'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
      ],
    })
  })
})

describe('listStorePlugins D1 projection', () => {
  it('matches memory fallback eligibility with complete persisted evidence', async () => {
    const db = new MockD1Database()
    state.db = db
    db.plugins = [d1Plugin({ id: 'focus-flow', name: 'Focus Flow' })]
    db.versions = [
      d1Version({ id: 'eligible-1', plugin_id: 'focus-flow', version: '1.0.0' }),
      d1Version({ id: 'pending-2', plugin_id: 'focus-flow', version: '2.0.0', status: 'pending', admission_status: 'pending' }),
      d1Version({ id: 'beta-3', plugin_id: 'focus-flow', channel: 'BETA', version: '3.0.0' }),
      d1Version({ id: 'missing-policy', plugin_id: 'focus-flow', version: '4.0.0', policy_decision: 'not-evaluated' }),
    ]

    const result = await listStorePlugins(event, { compact: false })

    expect(result).toMatchObject({ total: 1 })
    expect(result.plugins[0].latestVersionId).toBe('eligible-1')
    expect(result.plugins[0].versions.map(version => version.id)).toEqual(['eligible-1'])
  })
})

describe('publisher key revocation invalidation', () => {
  it('immediately withdraws every memory-backed release for the key while retaining a prior eligible download', async () => {
    seedMemoryStore([plugin({ id: 'focus-flow' })], [
      version({
        id: 'prior-1',
        pluginId: 'focus-flow',
        version: '1.0.0',
        publisherSignature: { algorithm: 'Ed25519', keyId: 'publisher-key-other' },
        publisherKey: { keyId: 'publisher-key-other', status: 'active' },
      }),
      version({ id: 'revoked-2', pluginId: 'focus-flow', version: '2.0.0' }),
      version({ id: 'revoked-3', pluginId: 'focus-flow', version: '3.0.0' }),
    ])

    expect(await invalidatePluginVersionsForPublisherKey(event, 'publisher-key-1', 'owner-1')).toBe(2)

    const storedVersions = state.storage.get('dashboard:pluginVersions') as StoredVersion[]
    const revokedVersions = storedVersions.filter(version => version.id.startsWith('revoked-'))
    expect(revokedVersions).toHaveLength(2)
    for (const revokedVersion of revokedVersions) {
      expect(revokedVersion).toMatchObject({
        admissionStatus: 'blocked',
        nexusAttestation: null,
        eligibilityRevision: 2,
        eligibilityReasons: [
          'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED',
          'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED',
          'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
        ],
      })
      expect(revokedVersion.revokedAt).toEqual(expect.any(String))
      expect(getPluginVersionEligibility(plugin({ id: 'focus-flow' }) as DashboardPlugin, revokedVersion as DashboardPluginVersion, 'public')).toMatchObject({
        eligible: false,
        visibility: 'private',
      })
    }

    const store = await listStorePlugins(event, { compact: false })
    expect(store.plugins[0]).toMatchObject({ latestVersionId: 'prior-1' })
    expect(store.plugins[0].versions.map(version => version.id)).toEqual(['prior-1'])
    expect((state.storage.get('dashboard:plugins') as StoredPlugin[])[0].latestVersionId).toBe('prior-1')

    const timeline = await listPluginTimeline(event, 'focus-flow')
    expect(timeline).toHaveLength(2)
    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        versionId: 'revoked-2',
        eventType: 'version.status.changed',
        reason: 'publisher-key-revoked',
        meta: expect.objectContaining({ keyId: 'publisher-key-1', admissionStatus: 'blocked' }),
      }),
      expect.objectContaining({
        versionId: 'revoked-3',
        eventType: 'version.status.changed',
        reason: 'publisher-key-revoked',
        meta: expect.objectContaining({ keyId: 'publisher-key-1', admissionStatus: 'blocked' }),
      }),
    ]))

    const initialRevocationState = revokedVersions.map(version => ({
      id: version.id,
      eligibilityRevision: version.eligibilityRevision,
      revokedAt: version.revokedAt,
    }))
    expect(await invalidatePluginVersionsForPublisherKey(event, 'publisher-key-1', 'owner-1')).toBe(0)
    expect((state.storage.get('dashboard:pluginVersions') as StoredVersion[])
      .filter(version => version.id.startsWith('revoked-'))
      .map(version => ({
        id: version.id,
        eligibilityRevision: version.eligibilityRevision,
        revokedAt: version.revokedAt,
      }))).toEqual(initialRevocationState)
    await expect(listPluginTimeline(event, 'focus-flow')).resolves.toHaveLength(2)
  })

  it('persists the same withdrawal, selection, and timeline contract through D1', async () => {
    const db = new MockD1Database()
    state.db = db
    db.plugins = [d1Plugin({ id: 'focus-flow' })]
    db.versions = [
      d1Version({
        id: 'prior-1',
        plugin_id: 'focus-flow',
        version: '1.0.0',
        publisher_key: JSON.stringify({ keyId: 'publisher-key-other', status: 'active' }),
        publisher_key_id: 'publisher-key-other',
      }),
      d1Version({ id: 'revoked-2', plugin_id: 'focus-flow', version: '2.0.0' }),
      d1Version({ id: 'revoked-3', plugin_id: 'focus-flow', version: '3.0.0' }),
    ]

    expect(await invalidatePluginVersionsForPublisherKey(event, 'publisher-key-1', 'owner-1')).toBe(2)

    const revokedVersions = db.versions.filter(version => version.id.startsWith('revoked-'))
    expect(revokedVersions).toHaveLength(2)
    for (const revokedVersion of revokedVersions) {
      expect(revokedVersion).toMatchObject({
        admission_status: 'blocked',
        nexus_attestation: null,
        eligibility_revision: 2,
        eligibility_reasons: JSON.stringify([
          'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED',
          'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED',
          'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
        ]),
      })
      expect(revokedVersion.revoked_at).toEqual(expect.any(String))
    }

    const store = await listStorePlugins(event, { compact: false })
    expect(store.plugins[0]).toMatchObject({ latestVersionId: 'prior-1' })
    expect(store.plugins[0].versions.map(version => version.id)).toEqual(['prior-1'])
    expect(db.plugins[0].latest_version_id).toBe('prior-1')

    const dashboardPlugin = await getPluginById(event, 'focus-flow', { includeVersions: true, viewerIsAdmin: true })
    const revokedVersion = dashboardPlugin?.versions?.find(version => version.id === 'revoked-2')
    expect(revokedVersion).toBeDefined()
    expect(getPluginVersionEligibility(dashboardPlugin as DashboardPlugin, revokedVersion as DashboardPluginVersion, 'public')).toMatchObject({
      eligible: false,
      visibility: 'private',
    })

    const timeline = await listPluginTimeline(event, 'focus-flow')
    expect(timeline).toHaveLength(2)
    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        versionId: 'revoked-2',
        eventType: 'version.status.changed',
        reason: 'publisher-key-revoked',
        meta: expect.objectContaining({ keyId: 'publisher-key-1', admissionStatus: 'blocked' }),
      }),
      expect.objectContaining({
        versionId: 'revoked-3',
        eventType: 'version.status.changed',
        reason: 'publisher-key-revoked',
        meta: expect.objectContaining({ keyId: 'publisher-key-1', admissionStatus: 'blocked' }),
      }),
    ]))

    const initialRevocationState = revokedVersions.map(version => ({
      id: version.id,
      eligibilityRevision: version.eligibility_revision,
      revokedAt: version.revoked_at,
    }))
    expect(await invalidatePluginVersionsForPublisherKey(event, 'publisher-key-1', 'owner-1')).toBe(0)
    expect(db.versions
      .filter(version => version.id.startsWith('revoked-'))
      .map(version => ({
        id: version.id,
        eligibilityRevision: version.eligibility_revision,
        revokedAt: version.revoked_at,
      }))).toEqual(initialRevocationState)
    await expect(listPluginTimeline(event, 'focus-flow')).resolves.toHaveLength(2)
  })
})

function seedMemoryStore(plugins: StoredPlugin[], versions: StoredVersion[]) {
  state.storage.set('dashboard:plugins', plugins)
  state.storage.set('dashboard:pluginVersions', versions)
}

function plugin(overrides: Partial<StoredPlugin>): StoredPlugin {
  const id = overrides.id ?? 'plugin-id'
  const createdAt = overrides.createdAt ?? '2026-06-01T00:00:00.000Z'
  return {
    id,
    userId: 'owner-1',
    ownerOrgId: null,
    slug: id,
    name: id,
    summary: 'Plugin summary',
    category: 'productivity',
    artifactType: 'plugin',
    installs: 0,
    homepage: null,
    isOfficial: false,
    badges: [],
    author: null,
    status: 'approved',
    readmeMarkdown: null,
    iconKey: null,
    iconUrl: null,
    createdAt,
    updatedAt: createdAt,
    latestVersionId: null,
    ...overrides,
  }
}

function version(overrides: Partial<StoredVersion>): StoredVersion {
  const id = overrides.id ?? 'version-id'
  const pluginId = overrides.pluginId ?? 'plugin-id'
  const createdAt = overrides.createdAt ?? '2026-06-01T00:00:00.000Z'
  const publisherSignature = {
    algorithm: 'Ed25519',
    keyId: 'publisher-key-1',
    payload: { policyVersion: 'policy-1' },
    payloadSha256: 'payload-sha',
    signature: 'publisher-signature',
  }
  const publisherKey = { keyId: 'publisher-key-1', status: 'active' }
  const nexusAttestation = { keyId: 'nexus-key-1', signature: 'nexus-attestation' }
  return {
    id,
    pluginId,
    createdBy: 'owner-1',
    channel: 'RELEASE',
    version: '1.0.0',
    artifactSha256: 'a'.repeat(64),
    publisherSignature,
    publisherKey,
    publisherVerifiedAt: createdAt,
    nexusAttestation,
    admissionStatus: 'eligible',
    policyDecision: 'passed',
    artifactState: 'available',
    revokedAt: null,
    eligibilityRevision: 1,
    eligibilityEvaluatedAt: createdAt,
    eligibilityReasons: [],
    packageKey: `${id}.tpex`,
    packageUrl: `/packages/${id}.tpex`,
    packageSize: 128,
    iconKey: `${id}.png`,
    iconUrl: `/icons/${id}.png`,
    readmeMarkdown: null,
    manifest: { id: pluginId },
    changelog: null,
    status: 'approved',
    reviewedAt: createdAt,
    rejectReason: null,
    securityScanDecision: 'passed',
    securityScanReportDigest: 'scan-report-sha',
    securityScannerVersion: 'scanner-1',
    securityRuleSetVersion: 'rules-1',
    securityScanFindingCount: 0,
    securityScanCompletedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

function d1Plugin(overrides: Partial<D1PluginRow>): D1PluginRow {
  const id = overrides.id ?? 'plugin-id'
  const createdAt = overrides.created_at ?? '2026-07-01T00:00:00.000Z'
  return {
    id,
    user_id: 'owner-1',
    owner_org_id: null,
    slug: id,
    name: id,
    summary: 'Plugin summary',
    category: 'productivity',
    artifact_type: 'plugin',
    installs: 0,
    homepage: null,
    is_official: 0,
    badges: JSON.stringify([]),
    author: JSON.stringify({ name: 'D1 Author' }),
    status: 'approved',
    readme_markdown: null,
    icon: null,
    icon_key: null,
    icon_url: null,
    image_url: null,
    last_updated: null,
    version: null,
    created_at: createdAt,
    updated_at: createdAt,
    latest_version_id: null,
    ...overrides,
  }
}

function d1Version(overrides: Partial<D1VersionRow>): D1VersionRow {
  const id = overrides.id ?? 'version-id'
  const pluginId = overrides.plugin_id ?? 'plugin-id'
  const createdAt = overrides.created_at ?? '2026-07-01T00:00:00.000Z'
  return {
    id,
    plugin_id: pluginId,
    created_by: 'owner-1',
    channel: 'RELEASE',
    version: '1.0.0',
    signature: 'legacy-signature',
    artifact_sha256: 'a'.repeat(64),
    publisher_signature: JSON.stringify({ payload: { policyVersion: 'policy-1' } }),
    publisher_key: JSON.stringify({ keyId: 'publisher-key-1', status: 'active' }),
    publisher_key_id: 'publisher-key-1',
    publisher_verified_at: createdAt,
    nexus_attestation: JSON.stringify({ keyId: 'nexus-key-1', signature: 'nexus-attestation' }),
    admission_status: 'eligible',
    policy_decision: 'passed',
    artifact_state: 'available',
    revoked_at: null,
    eligibility_revision: 1,
    eligibility_evaluated_at: createdAt,
    eligibility_reasons: JSON.stringify([]),
    package_key: `${id}.tpex`,
    package_url: `/packages/${id}.tpex`,
    package_size: 128,
    icon_key: `${id}.png`,
    icon_url: `/icons/${id}.png`,
    readme_markdown: null,
    manifest: JSON.stringify({ id: pluginId }),
    notes: null,
    status: 'approved',
    reviewed_at: createdAt,
    reject_reason: null,
    security_scan_decision: 'passed',
    security_scan_report_digest: 'scan-report-sha',
    security_scanner_version: 'scanner-1',
    security_rule_set_version: 'rules-1',
    security_scan_finding_count: 0,
    security_scan_completed_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  }
}
