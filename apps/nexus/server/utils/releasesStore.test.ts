import { beforeEach, describe, expect, it, vi } from 'vitest'

interface ReleaseRow {
  id: string
  tag: string
  name: string
  channel: string
  version: string
  rollback_from_version?: string
  rollback_compatible?: number
  notes: string
  notes_html: string | null
  status: string
  published_at: string | null
  min_app_version: string | null
  is_critical: number
  created_by: string
  created_at: string
  updated_at: string
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

class MockD1Database {
  readonly releases = new Map<string, ReleaseRow>()
  readonly releaseColumns = new Set([
    'id',
    'tag',
    'name',
    'channel',
    'version',
    'notes',
    'status',
    'created_by',
    'created_at',
    'updated_at',
  ])

  readonly assetColumns = new Set([
    'id',
    'release_id',
    'platform',
    'arch',
    'filename',
    'download_url',
    'size',
    'created_at',
    'updated_at',
  ])

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('ALTER TABLE app_releases ADD COLUMN')) {
      this.addColumn(this.releaseColumns, sql)
      return { meta: { changes: 0 } }
    }

    if (sql.includes('ALTER TABLE app_release_assets ADD COLUMN')) {
      this.addColumn(this.assetColumns, sql)
      return { meta: { changes: 0 } }
    }

    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO app_releases')) {
      const requiredColumns = [
        'notes_html',
        'published_at',
        'min_app_version',
        'is_critical',
        'rollback_from_version',
        'rollback_compatible',
      ]
      if (!requiredColumns.every(column => this.releaseColumns.has(column)))
        throw new Error('release metadata insert used a legacy schema')

      const [
        id,
        tag,
        name,
        channel,
        version,
        rollbackFromVersion,
        rollbackCompatible,
        notes,
        notesHtml,
        status,
        publishedAt,
        minAppVersion,
        isCritical,
        createdBy,
        createdAt,
        updatedAt,
      ] = args

      this.releases.set(String(tag), {
        id: String(id),
        tag: String(tag),
        name: String(name),
        channel: String(channel),
        version: String(version),
        rollback_from_version: String(rollbackFromVersion),
        rollback_compatible: Number(rollbackCompatible),
        notes: String(notes),
        notes_html: notesHtml == null ? null : String(notesHtml),
        status: String(status),
        published_at: publishedAt == null ? null : String(publishedAt),
        min_app_version: minAppVersion == null ? null : String(minAppVersion),
        is_critical: Number(isCritical),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE app_releases')) {
      const [
        name,
        notes,
        notesHtml,
        status,
        minAppVersion,
        isCritical,
        publishedAt,
        rollbackFromVersion,
        rollbackCompatible,
        updatedAt,
        tag,
      ] = args
      const existing = this.releases.get(String(tag))
      if (!existing)
        return { meta: { changes: 0 } }

      this.releases.set(String(tag), {
        ...existing,
        name: String(name),
        notes: String(notes),
        notes_html: notesHtml == null ? null : String(notesHtml),
        status: String(status),
        min_app_version: minAppVersion == null ? null : String(minAppVersion),
        is_critical: Number(isCritical),
        published_at: publishedAt == null ? null : String(publishedAt),
        rollback_from_version: String(rollbackFromVersion),
        rollback_compatible: Number(rollbackCompatible),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (
      sql.includes('FROM app_releases')
      && sql.includes('WHERE channel = ?1')
    ) {
      return (
        [...this.releases.values()]
          .filter(
            release =>
              release.channel === args[0] && release.status === 'published',
          )
          .sort(
            (left, right) =>
              Date.parse(right.published_at ?? '')
              - Date.parse(left.published_at ?? ''),
          )[0] ?? null
      )
    }

    if (sql.includes('FROM app_releases') && sql.includes('WHERE tag = ?1'))
      return this.releases.get(String(args[0])) ?? null

    return null
  }

  all(sql: string) {
    if (sql.includes('PRAGMA table_info(app_releases)'))
      return [...this.releaseColumns].map(name => ({ name }))

    if (sql.includes('PRAGMA table_info(app_release_assets)'))
      return [...this.assetColumns].map(name => ({ name }))

    return []
  }

  private addColumn(columns: Set<string>, sql: string) {
    const column = sql.match(/ADD COLUMN\s+(\w+)/i)?.[1]
    if (!column)
      throw new Error('missing migration column name')
    if (columns.has(column))
      throw new Error(`duplicate migration for ${column}`)

    columns.add(column)
    if (columns === this.releaseColumns) {
      for (const release of this.releases.values()) {
        if (column === 'rollback_from_version')
          release.rollback_from_version = ''
        if (column === 'rollback_compatible')
          release.rollback_compatible = 0
      }
    }
  }
}

function releaseInput(
  overrides: {
    tag?: string
    rollbackFromVersion?: string
    rollbackCompatible?: boolean
    status?: 'draft' | 'published'
  } = {},
) {
  return {
    tag: overrides.tag ?? 'v2.4.12-beta.1',
    name: 'Release v2.4.12-beta.1',
    channel: 'BETA' as const,
    version: '2.4.12-beta.1',
    rollbackFromVersion: overrides.rollbackFromVersion ?? '2.4.3-beta.7',
    rollbackCompatible: overrides.rollbackCompatible ?? false,
    notes: { zh: '测试发布', en: 'Test release' },
    notesHtml: { zh: '<p>测试发布</p>', en: '<p>Test release</p>' },
    status: overrides.status ?? 'published',
    createdBy: 'admin-user-1',
  }
}

function legacyReleaseRow(tag: string): ReleaseRow {
  return {
    id: `release-${tag}`,
    tag,
    name: `Release ${tag}`,
    channel: 'BETA',
    version: '2.4.11-beta.1',
    notes: JSON.stringify({ zh: '旧发布', en: 'Legacy release' }),
    notes_html: null,
    status: 'published',
    published_at: '2026-07-01T00:00:00.000Z',
    min_app_version: null,
    is_critical: 0,
    created_by: 'legacy-admin',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
  storage: new Map<string, unknown>(),
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => (state.db ? { DB: state.db } : undefined),
}))

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async (key: string) => state.storage.get(key) ?? null,
    setItem: async (key: string, value: unknown) => {
      state.storage.set(key, value)
    },
  }),
}))

vi.mock('./dashboardStore', () => ({
  upsertReleaseUpdate: vi.fn(),
}))

const event = {} as any

describe('releasesStore', () => {
  beforeEach(() => {
    vi.resetModules()
    state.db = new MockD1Database()
    state.storage.clear()
  })

  it('backfills legacy release D1 columns before persisting rollback metadata', async () => {
    const { createRelease } = await import('./releasesStore')

    const release = await createRelease(
      event,
      releaseInput({
        rollbackFromVersion: '2.4.3-beta.7',
        rollbackCompatible: false,
      }),
    )

    expect(release).toMatchObject({
      rollbackFromVersion: '2.4.3-beta.7',
      rollbackCompatible: false,
    })
    expect([...(state.db?.releaseColumns ?? [])]).toEqual(
      expect.arrayContaining([
        'notes_html',
        'published_at',
        'min_app_version',
        'is_critical',
        'rollback_from_version',
        'rollback_compatible',
      ]),
    )
    expect([...(state.db?.assetColumns ?? [])]).toEqual(
      expect.arrayContaining([
        'source_type',
        'file_key',
        'sha256',
        'content_type',
        'download_count',
      ]),
    )
  })

  it('round-trips exact rollback metadata through create, patch, lookup, and latest', async () => {
    const { createRelease, getLatestRelease, getReleaseByTag, updateRelease }
      = await import('./releasesStore')
    const created = await createRelease(
      event,
      releaseInput({
        rollbackFromVersion: '2.1.0-beta.9',
        rollbackCompatible: false,
      }),
    )

    expect(created).toMatchObject({
      rollbackFromVersion: '2.1.0-beta.9',
      rollbackCompatible: false,
    })

    const compatible = await updateRelease(event, created.tag, {
      rollbackFromVersion: '2.0.4-beta.3',
      rollbackCompatible: true,
    })
    expect(compatible).toMatchObject({
      rollbackFromVersion: '2.0.4-beta.3',
      rollbackCompatible: true,
    })

    const incompatible = await updateRelease(event, created.tag, {
      rollbackCompatible: false,
    })
    expect(incompatible).toMatchObject({
      rollbackFromVersion: '2.0.4-beta.3',
      rollbackCompatible: false,
    })

    await expect(
      getReleaseByTag(event, created.tag, false),
    ).resolves.toMatchObject({
      rollbackFromVersion: '2.0.4-beta.3',
      rollbackCompatible: false,
    })
    await expect(getLatestRelease(event, 'BETA')).resolves.toMatchObject({
      tag: created.tag,
      rollbackFromVersion: '2.0.4-beta.3',
      rollbackCompatible: false,
    })
  })

  it('fails closed for stored metadata and D1 rows that predate rollback fields', async () => {
    const legacyTag = 'v2.4.11-beta.1'
    state.db = null
    state.storage.set('app:releases', [
      {
        id: 'memory-legacy-release',
        tag: legacyTag,
        name: 'Legacy release',
        channel: 'BETA',
        version: '2.4.11-beta.1',
        notes: { zh: '旧发布', en: 'Legacy release' },
        notesHtml: null,
        status: 'published',
        publishedAt: '2026-07-01T00:00:00.000Z',
        minAppVersion: null,
        isCritical: false,
        createdBy: 'legacy-admin',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ])

    const { getLatestRelease, getReleaseByTag }
      = await import('./releasesStore')
    await expect(
      getReleaseByTag(event, legacyTag, false),
    ).resolves.toMatchObject({
      rollbackFromVersion: '',
      rollbackCompatible: false,
    })

    state.db = new MockD1Database()
    state.db.releases.set(legacyTag, legacyReleaseRow(legacyTag))

    await expect(
      getReleaseByTag(event, legacyTag, false),
    ).resolves.toMatchObject({
      rollbackFromVersion: '',
      rollbackCompatible: false,
    })
    await expect(getLatestRelease(event, 'BETA')).resolves.toMatchObject({
      tag: legacyTag,
      rollbackFromVersion: '',
      rollbackCompatible: false,
    })
  })

  it('rejects new releases without rollbackFromVersion before creating a record', async () => {
    const { createRelease, getReleaseByTag } = await import('./releasesStore')
    const {
      rollbackFromVersion: _rollbackFromVersion,
      ...withoutRollbackFromVersion
    } = releaseInput({
      tag: 'v2.4.12-beta.2',
      rollbackCompatible: true,
    })

    await expect(
      createRelease(event, withoutRollbackFromVersion as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'rollbackFromVersion is required.',
    })
    await expect(
      getReleaseByTag(event, withoutRollbackFromVersion.tag, false),
    ).resolves.toBeNull()
  })

  it('runs rollback column backfill safely after a module reload against the same D1 database', async () => {
    const firstModule = await import('./releasesStore')
    await firstModule.createRelease(
      event,
      releaseInput({
        tag: 'v2.4.12-beta.3',
        rollbackFromVersion: '2.4.2-beta.5',
        rollbackCompatible: true,
      }),
    )

    vi.resetModules()
    const secondModule = await import('./releasesStore')
    const second = await secondModule.createRelease(
      event,
      releaseInput({
        tag: 'v2.4.12-beta.4',
        rollbackFromVersion: '2.4.2-beta.5',
        rollbackCompatible: false,
      }),
    )

    await expect(
      secondModule.getReleaseByTag(event, second.tag, false),
    ).resolves.toMatchObject({
      rollbackFromVersion: '2.4.2-beta.5',
      rollbackCompatible: false,
    })
  })
})
