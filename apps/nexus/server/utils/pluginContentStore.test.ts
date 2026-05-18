import type { PluginContentStatus, PluginContentVisibility } from '@talex-touch/utils/types/cloud-share'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface ContentRow {
  id: string
  plugin_id: string
  kind: string
  title: string
  summary: string | null
  schema_version: number
  visibility: PluginContentVisibility
  manifest_json: string
  content_ref: string | null
  content_inline_json: string | null
  created_by: string
  status: PluginContentStatus
  install_count: number
  created_at: string
  updated_at: string
  published_at: string | null
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
  rows = new Map<string, ContentRow>()
  schemaStatements = 0

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      this.schemaStatements += 1
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO store_plugin_content_packages')) {
      const [
        id,
        pluginId,
        kind,
        title,
        summary,
        schemaVersion,
        visibility,
        manifestJson,
        contentRef,
        contentInlineJson,
        createdBy,
        status,
        installCount,
        createdAt,
        updatedAt,
        publishedAt,
      ] = args
      this.rows.set(String(id), {
        id: String(id),
        plugin_id: String(pluginId),
        kind: String(kind),
        title: String(title),
        summary: summary == null ? null : String(summary),
        schema_version: Number(schemaVersion),
        visibility: visibility as PluginContentVisibility,
        manifest_json: String(manifestJson),
        content_ref: contentRef == null ? null : String(contentRef),
        content_inline_json: contentInlineJson == null ? null : String(contentInlineJson),
        created_by: String(createdBy),
        status: status as PluginContentStatus,
        install_count: Number(installCount),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
        published_at: publishedAt == null ? null : String(publishedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE store_plugin_content_packages')) {
      const [id, updatedAt] = args
      const current = this.rows.get(String(id))
      if (current) {
        this.rows.set(String(id), {
          ...current,
          install_count: current.install_count + 1,
          updated_at: String(updatedAt),
        })
      }
      return { meta: { changes: current ? 1 : 0 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('COUNT(*) as total'))
      return { total: this.filterRows(sql, args).length }

    if (sql.includes('WHERE id = ?1'))
      return this.rows.get(String(args[0])) ?? null

    return null
  }

  all(sql: string, args: any[]) {
    if (!sql.includes('FROM store_plugin_content_packages'))
      return []

    const limit = Number(args.at(-2) ?? 20)
    const offset = Number(args.at(-1) ?? 0)
    return this.filterRows(sql, args.slice(0, -2)).slice(offset, offset + limit)
  }

  private filterRows(sql: string, args: any[]) {
    return [...this.rows.values()]
      .filter((row) => {
        let index = 0
        if (sql.includes('plugin_id = ?')) {
          const expected = String(args[index++])
          if (row.plugin_id !== expected)
            return false
        }
        if (sql.includes('kind = ?')) {
          const expected = String(args[index++])
          if (row.kind !== expected)
            return false
        }
        if (sql.includes('visibility = ?')) {
          const expected = String(args[index++])
          if (row.visibility !== expected)
            return false
        }
        if (sql.includes('status = ?')) {
          const expected = String(args[index++])
          if (row.status !== expected)
            return false
        }
        if (sql.includes('created_by = ?')) {
          const expected = String(args[index++])
          return row.created_by === expected
            || (row.status === 'published' && ['public', 'unlisted'].includes(row.visibility))
        }
        return row.status === 'published' && ['public', 'unlisted'].includes(row.visibility)
      })
      .sort((a, b) => (b.published_at ?? b.updated_at).localeCompare(a.published_at ?? a.updated_at))
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

const {
  createPluginContentPackage,
  getPluginContentPackage,
  installPluginContentPackage,
  listPluginContentPackages,
} = await import('./pluginContentStore')

const event = {} as any

describe('pluginContentStore', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
    state.storage.clear()
  })

  it('publishes and lists public snippet packs', async () => {
    const item = await createPluginContentPackage(event, {
      pluginId: 'touch-snippets',
      kind: 'snippet-pack',
      title: 'React snippets',
      schemaVersion: 1,
      visibility: 'public',
      status: 'published',
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
      contentInline: { snippets: [] },
    }, 'user-1')

    const list = await listPluginContentPackages(event, {
      pluginId: 'touch-snippets',
      kind: 'snippet-pack',
    })
    const loaded = await getPluginContentPackage(event, item.id)

    expect(list.total).toBe(1)
    expect(list.packages[0]).toMatchObject({
      id: item.id,
      pluginId: 'touch-snippets',
      kind: 'snippet-pack',
      title: 'React snippets',
      status: 'published',
    })
    expect(loaded?.contentInline).toEqual({ snippets: [] })
  })

  it('hides draft packages from public reads but allows owner reads', async () => {
    const draft = await createPluginContentPackage(event, {
      pluginId: 'touch-snippets',
      kind: 'snippet-pack',
      title: 'Draft pack',
      schemaVersion: 1,
      visibility: 'public',
      status: 'draft',
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
      contentInline: { snippets: [] },
    }, 'user-owner')

    expect(await getPluginContentPackage(event, draft.id)).toBeNull()
    expect(await getPluginContentPackage(event, draft.id, { viewerId: 'user-owner' })).toMatchObject({
      id: draft.id,
    })
  })

  it('increments install count only for readable packages', async () => {
    const item = await createPluginContentPackage(event, {
      pluginId: 'touch-snippets',
      kind: 'snippet-pack',
      title: 'Installable pack',
      schemaVersion: 1,
      visibility: 'public',
      status: 'published',
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
      contentInline: { snippets: [] },
    }, 'user-1')

    const installed = await installPluginContentPackage(event, item.id)

    expect(installed?.installCount).toBe(1)
  })
})
