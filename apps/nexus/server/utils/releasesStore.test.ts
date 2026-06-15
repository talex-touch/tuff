import { beforeEach, describe, expect, it, vi } from 'vitest'

interface ReleaseRow {
  id: string
  tag: string
  name: string
  channel: string
  version: string
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
      for (const column of ['notes_html', 'published_at', 'min_app_version', 'is_critical'])
        expect(this.releaseColumns.has(column)).toBe(true)

      const [
        id,
        tag,
        name,
        channel,
        version,
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

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
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
    const column = sql.match(/ADD COLUMN\s+([a-z0-9_]+)/i)?.[1]
    if (column)
      columns.add(column)
  }
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

vi.mock('./dashboardStore', () => ({
  upsertReleaseUpdate: vi.fn(),
}))

const event = {} as any

describe('releasesStore', () => {
  beforeEach(() => {
    vi.resetModules()
    state.db = new MockD1Database()
  })

  it('backfills legacy release D1 columns before creating a release', async () => {
    const { createRelease } = await import('./releasesStore')

    const release = await createRelease(event, {
      tag: 'v2.4.12-beta.1',
      name: 'Release v2.4.12-beta.1',
      channel: 'BETA',
      version: '2.4.12-beta.1',
      notes: { zh: '测试发布', en: 'Test release' },
      notesHtml: { zh: '<p>测试发布</p>', en: '<p>Test release</p>' },
      status: 'draft',
      createdBy: 'admin-user-1',
    })

    expect(release.tag).toBe('v2.4.12-beta.1')
    expect([...(state.db?.releaseColumns ?? [])]).toEqual(expect.arrayContaining([
      'notes_html',
      'published_at',
      'min_app_version',
      'is_critical',
    ]))
    expect([...(state.db?.assetColumns ?? [])]).toEqual(expect.arrayContaining([
      'source_type',
      'file_key',
      'sha256',
      'content_type',
      'download_count',
    ]))
  })
})
