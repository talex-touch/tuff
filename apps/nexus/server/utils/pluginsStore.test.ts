import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { listStorePlugins as listStorePluginsType, searchStorePlugins as searchStorePluginsType } from './pluginsStore'

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
  signature: string
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
  created_at: string
  updated_at: string
}

interface PreparedQuery {
  sql: string
  bindings: unknown[]
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
  prepared: PreparedQuery[] = []

  prepare(sql: string) {
    const query: PreparedQuery = { sql, bindings: [] }
    this.prepared.push(query)

    return {
      bind: (...bindings: unknown[]) => {
        query.bindings = bindings
        return {
          first: async <T>() => this.first<T>(sql, bindings),
          all: async <T>() => this.all<T>(sql, bindings),
          run: async () => ({ success: true, meta: { changes: 0 } }),
        }
      },
      first: async <T>() => this.first<T>(sql, []),
      all: async <T>() => this.all<T>(sql, []),
      run: async () => ({ success: true, meta: { changes: 0 } }),
    }
  }

  private async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes('COUNT(*) AS total'))
      return { total: this.filteredRows(bindings).length } as T
    return null
  }

  private async all<T>(sql: string, bindings: unknown[]): Promise<{ results: T[] }> {
    if (sql.includes('PRAGMA table_info'))
      return { results: [] }
    if (sql.includes('SELECT') && sql.includes('FROM dashboard_plugins') && sql.includes('JOIN dashboard_plugin_versions')) {
      const limit = Number(bindings.at(-2) ?? 50)
      const offset = Number(bindings.at(-1) ?? 0)
      return { results: this.filteredRows(bindings).slice(offset, offset + limit) as T[] }
    }
    if (sql.includes('SELECT *') && sql.includes('FROM dashboard_plugin_versions') && sql.includes('WHERE plugin_id IN')) {
      const status = sql.includes('status =') ? bindings.at(-1) : null
      const pluginIds = status ? bindings.slice(0, -1) : bindings
      return {
        results: this.versions
          .filter(version => pluginIds.includes(version.plugin_id))
          .filter(version => !status || version.status === status)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)) as T[],
      }
    }
    return { results: [] }
  }

  private filteredRows(bindings: unknown[]) {
    const keyword = typeof bindings[2] === 'string' && String(bindings[2]).startsWith('%')
      ? String(bindings[2]).slice(1, -1).toLowerCase()
      : ''
    const category = bindings.find(value => value === 'productivity' || value === 'theme') as string | undefined

    return this.plugins
      .filter(plugin => plugin.status === 'approved')
      .filter(plugin => !category || plugin.category === category)
      .map((plugin) => {
        const selected = this.selectLatestApprovedVersion(plugin.id)
        return selected ? { plugin, selected } : null
      })
      .filter((entry): entry is { plugin: D1PluginRow, selected: D1VersionRow } => Boolean(entry))
      .filter(({ plugin }) => {
        if (!keyword)
          return true
        return [plugin.name, plugin.slug, plugin.summary, plugin.author ?? '']
          .join('\n')
          .toLowerCase()
          .includes(keyword)
      })
      .sort((a, b) => b.plugin.created_at.localeCompare(a.plugin.created_at))
      .map(({ plugin, selected }) => ({
        ...plugin,
        selected_version_id: selected.id,
        selected_version_plugin_id: selected.plugin_id,
        selected_version_created_by: selected.created_by,
        selected_version_channel: selected.channel,
        selected_version_version: selected.version,
        selected_version_signature: selected.signature,
        selected_version_package_key: selected.package_key,
        selected_version_package_url: selected.package_url,
        selected_version_package_size: selected.package_size,
        selected_version_icon_key: selected.icon_key,
        selected_version_icon_url: selected.icon_url,
        selected_version_readme_markdown: selected.readme_markdown,
        selected_version_manifest: selected.manifest,
        selected_version_notes: selected.notes,
        selected_version_status: selected.status,
        selected_version_reviewed_at: selected.reviewed_at,
        selected_version_reject_reason: selected.reject_reason,
        selected_version_created_at: selected.created_at,
        selected_version_updated_at: selected.updated_at,
      }))
  }

  private selectLatestApprovedVersion(pluginId: string) {
    const channelPriority = { RELEASE: 3, SNAPSHOT: 2, BETA: 1 } as const
    return this.versions
      .filter(version => version.plugin_id === pluginId && version.status === 'approved')
      .sort((a, b) => {
        const channelDiff = channelPriority[b.channel] - channelPriority[a.channel]
        if (channelDiff !== 0)
          return channelDiff
        return b.created_at.localeCompare(a.created_at)
      })[0]
  }
}

let searchStorePlugins: typeof searchStorePluginsType
let listStorePlugins: typeof listStorePluginsType
const event = {} as any

beforeAll(async () => {
  const store = await import('./pluginsStore')
  listStorePlugins = store.listStorePlugins
  searchStorePlugins = store.searchStorePlugins
})

beforeEach(() => {
  state.db = null
  state.storage.clear()
})

describe('searchStorePlugins', () => {
  it('filters store fallback by approval, keyword, category, pagination, and selected approved version', async () => {
    seedMemoryStore([
      plugin({
        id: 'approved-alpha',
        slug: 'alpha-flow',
        name: 'Alpha Flow',
        summary: 'Keyboard automation for focused writing',
        category: 'productivity',
        author: { name: 'Flow Labs' },
        status: 'approved',
        createdAt: '2026-06-03T00:00:00.000Z',
        latestVersionId: 'alpha-pending-release',
      }),
      plugin({
        id: 'approved-beta',
        slug: 'beta-flow',
        name: 'Beta Flow',
        summary: 'Keyboard launcher for flow state',
        category: 'productivity',
        author: { name: 'Shortcuts Inc' },
        status: 'approved',
        createdAt: '2026-06-02T00:00:00.000Z',
        latestVersionId: 'beta-approved-release',
      }),
      plugin({
        id: 'approved-theme',
        slug: 'flow-theme',
        name: 'Flow Theme',
        summary: 'Flow visuals for Touch',
        category: 'theme',
        author: { name: 'Theme Studio' },
        status: 'approved',
        createdAt: '2026-06-04T00:00:00.000Z',
        latestVersionId: 'theme-approved-release',
      }),
      plugin({
        id: 'pending-plugin',
        slug: 'pending-flow',
        name: 'Pending Flow',
        summary: 'Should be invisible to store search',
        category: 'productivity',
        author: { name: 'Hidden Labs' },
        status: 'pending',
        createdAt: '2026-06-05T00:00:00.000Z',
        latestVersionId: 'pending-plugin-approved-release',
      }),
      plugin({
        id: 'approved-no-visible-version',
        slug: 'draft-only-flow',
        name: 'Draft Only Flow',
        summary: 'Approved plugin without approved versions',
        category: 'productivity',
        author: { name: 'Invisible Versions' },
        status: 'approved',
        createdAt: '2026-06-01T00:00:00.000Z',
        latestVersionId: 'draft-only-pending-release',
      }),
    ], [
      version({
        id: 'alpha-pending-release',
        pluginId: 'approved-alpha',
        channel: 'RELEASE',
        version: '2.0.0',
        status: 'pending',
        createdAt: '2026-06-04T00:00:00.000Z',
      }),
      version({
        id: 'alpha-approved-snapshot',
        pluginId: 'approved-alpha',
        channel: 'SNAPSHOT',
        version: '1.5.0',
        status: 'approved',
        createdAt: '2026-06-03T00:00:00.000Z',
      }),
      version({
        id: 'alpha-approved-release',
        pluginId: 'approved-alpha',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'approved',
        createdAt: '2026-05-01T00:00:00.000Z',
      }),
      version({
        id: 'beta-approved-release',
        pluginId: 'approved-beta',
        channel: 'RELEASE',
        version: '3.0.0',
        status: 'approved',
        createdAt: '2026-06-02T00:00:00.000Z',
      }),
      version({
        id: 'theme-approved-release',
        pluginId: 'approved-theme',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'approved',
        createdAt: '2026-06-04T00:00:00.000Z',
      }),
      version({
        id: 'pending-plugin-approved-release',
        pluginId: 'pending-plugin',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'approved',
        createdAt: '2026-06-05T00:00:00.000Z',
      }),
      version({
        id: 'draft-only-pending-release',
        pluginId: 'approved-no-visible-version',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'pending',
        createdAt: '2026-06-01T00:00:00.000Z',
      }),
    ])

    const result = await searchStorePlugins(event, {
      keyword: 'flow',
      category: 'productivity',
      limit: 1,
      offset: 1,
    })

    expect(result).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
    })
    expect(Object.keys(result).sort()).toEqual(['limit', 'offset', 'plugins', 'total'])
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0]).toMatchObject({
      id: 'approved-beta',
      status: 'approved',
      category: 'productivity',
      latestVersionId: 'beta-approved-release',
      latestVersion: {
        id: 'beta-approved-release',
        status: 'approved',
        version: '3.0.0',
      },
    })
    expect(result.plugins[0].versions.length).toBeGreaterThan(0)
    expect(result.plugins[0].versions.every(version => version.status === 'approved')).toBe(true)

    const firstPage = await searchStorePlugins(event, {
      keyword: 'flow',
      category: 'productivity',
      limit: 1,
      offset: 0,
    })

    expect(firstPage.plugins).toHaveLength(1)
    expect(firstPage.plugins[0]).toMatchObject({
      id: 'approved-alpha',
      latestVersionId: 'alpha-approved-release',
      latestVersion: {
        id: 'alpha-approved-release',
        status: 'approved',
        version: '1.0.0',
      },
    })
    expect(firstPage.plugins[0].versions.map(version => version.id)).toEqual([
      'alpha-approved-snapshot',
      'alpha-approved-release',
    ])
  })

  it('maps the D1 search result and binds approved filters before keyword/category pagination', async () => {
    const db = new MockD1Database()
    state.db = db
    db.plugins = [
      d1Plugin({
        id: 'd1-alpha',
        slug: 'd1-alpha-flow',
        name: 'D1 Alpha Flow',
        summary: 'Durable keyboard launcher',
        category: 'productivity',
        status: 'approved',
        created_at: '2026-07-02T00:00:00.000Z',
        latest_version_id: 'd1-alpha-pending-release',
      }),
      d1Plugin({
        id: 'd1-hidden',
        slug: 'd1-hidden-flow',
        name: 'D1 Hidden Flow',
        summary: 'Pending plugin should not be counted',
        category: 'productivity',
        status: 'pending',
        created_at: '2026-07-03T00:00:00.000Z',
        latest_version_id: 'd1-hidden-approved-release',
      }),
    ]
    db.versions = [
      d1Version({
        id: 'd1-alpha-pending-release',
        plugin_id: 'd1-alpha',
        channel: 'RELEASE',
        version: '2.0.0',
        status: 'pending',
        created_at: '2026-07-03T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-alpha-approved-release',
        plugin_id: 'd1-alpha',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'approved',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-hidden-approved-release',
        plugin_id: 'd1-hidden',
        channel: 'RELEASE',
        version: '1.0.0',
        status: 'approved',
        created_at: '2026-07-03T00:00:00.000Z',
      }),
    ]

    const result = await searchStorePlugins(event, {
      keyword: 'FLOW',
      category: 'productivity',
      limit: 5,
      offset: 0,
    })

    const countQuery = db.prepared.find(query => query.sql.includes('COUNT(*) AS total'))
    const rowsQuery = db.prepared.find(query => query.sql.includes('SELECT') && query.sql.includes('LIMIT ?5 OFFSET ?6'))
    expect(countQuery?.bindings).toEqual(['approved', 'approved', '%flow%', 'productivity'])
    expect(rowsQuery?.bindings).toEqual(['approved', 'approved', '%flow%', 'productivity', 5, 0])
    expect(rowsQuery?.sql).toContain('vv.status = ?2')
    expect(rowsQuery?.sql).toContain('p.category = ?4')
    expect(result).toMatchObject({
      total: 1,
      limit: 5,
      offset: 0,
      plugins: [
        {
          id: 'd1-alpha',
          status: 'approved',
          latestVersionId: 'd1-alpha-approved-release',
          latestVersion: {
            id: 'd1-alpha-approved-release',
            status: 'approved',
            version: '1.0.0',
          },
        },
      ],
    })
    expect(result.plugins[0].versions).toEqual([result.plugins[0].latestVersion])
  })
})

describe('listStorePlugins', () => {
  it('hydrates approved versions only for the bounded D1 page when compact is false', async () => {
    const db = new MockD1Database()
    state.db = db
    db.plugins = [
      d1Plugin({
        id: 'd1-newest',
        slug: 'd1-newest-flow',
        name: 'D1 Newest Flow',
        created_at: '2026-07-03T00:00:00.000Z',
        latest_version_id: 'd1-newest-release',
      }),
      d1Plugin({
        id: 'd1-current-page',
        slug: 'd1-current-page-flow',
        name: 'D1 Current Page Flow',
        created_at: '2026-07-02T00:00:00.000Z',
        latest_version_id: 'd1-current-release',
      }),
      d1Plugin({
        id: 'd1-oldest',
        slug: 'd1-oldest-flow',
        name: 'D1 Oldest Flow',
        created_at: '2026-07-01T00:00:00.000Z',
        latest_version_id: 'd1-oldest-release',
      }),
    ]
    db.versions = [
      d1Version({
        id: 'd1-newest-release',
        plugin_id: 'd1-newest',
        status: 'approved',
        version: '3.0.0',
        created_at: '2026-07-03T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-current-pending',
        plugin_id: 'd1-current-page',
        status: 'pending',
        version: '2.1.0',
        created_at: '2026-07-05T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-current-rejected',
        plugin_id: 'd1-current-page',
        status: 'rejected',
        version: '2.0.1',
        created_at: '2026-07-04T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-current-snapshot',
        plugin_id: 'd1-current-page',
        channel: 'SNAPSHOT',
        status: 'approved',
        version: '1.5.0',
        created_at: '2026-07-03T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-current-release',
        plugin_id: 'd1-current-page',
        channel: 'RELEASE',
        status: 'approved',
        version: '1.0.0',
        created_at: '2026-07-02T00:00:00.000Z',
      }),
      d1Version({
        id: 'd1-oldest-release',
        plugin_id: 'd1-oldest',
        status: 'approved',
        version: '0.9.0',
        created_at: '2026-07-01T00:00:00.000Z',
      }),
    ]

    const result = await listStorePlugins(event, {
      compact: false,
      limit: 1,
      offset: 1,
    })

    expect(result).toMatchObject({
      total: 3,
      limit: 1,
      offset: 1,
    })
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0]).toMatchObject({
      id: 'd1-current-page',
      latestVersionId: 'd1-current-release',
      latestVersion: {
        id: 'd1-current-release',
        status: 'approved',
      },
    })
    expect(result.plugins[0].versions.map(version => ({ id: version.id, pluginId: version.pluginId, status: version.status }))).toEqual([
      { id: 'd1-current-snapshot', pluginId: 'd1-current-page', status: 'approved' },
      { id: 'd1-current-release', pluginId: 'd1-current-page', status: 'approved' },
    ])

    const versionQueries = db.prepared.filter(query => query.sql.includes('FROM dashboard_plugin_versions') && query.sql.includes('WHERE plugin_id IN'))
    expect(versionQueries).toHaveLength(1)
    expect(versionQueries[0].bindings).toEqual(['d1-current-page', 'approved'])
    expect(versionQueries[0].sql).toContain('AND status = ?2')
    expect(db.prepared.some(query => query.sql.includes('FROM dashboard_plugins') && !query.sql.includes('JOIN dashboard_plugin_versions') && !query.sql.includes('LIMIT'))).toBe(false)
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
  return {
    id,
    pluginId,
    createdBy: 'owner-1',
    channel: 'RELEASE',
    version: '1.0.0',
    signature: `${id}-signature`,
    packageKey: `${id}.tpex`,
    packageUrl: `/packages/${id}.tpex`,
    packageSize: 128,
    iconKey: `${id}.png`,
    iconUrl: `/icons/${id}.png`,
    readmeMarkdown: null,
    manifest: { id: pluginId },
    changelog: null,
    status: 'approved',
    reviewedAt: null,
    rejectReason: null,
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
    signature: `${id}-signature`,
    package_key: `${id}.tpex`,
    package_url: `/packages/${id}.tpex`,
    package_size: 128,
    icon_key: `${id}.png`,
    icon_url: `/icons/${id}.png`,
    readme_markdown: null,
    manifest: JSON.stringify({ id: pluginId }),
    notes: null,
    status: 'approved',
    reviewed_at: null,
    reject_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  }
}
