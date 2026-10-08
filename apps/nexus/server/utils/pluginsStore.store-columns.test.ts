import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * Store listings read whether a plugin has a readme, not the readme, and none of its versions'
 * readmes — against real SQLite, so the statements are the ones D1 would run.
 */

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({ getItem: async () => null, setItem: async () => {} }),
}))

let store: typeof import('./pluginsStore')
let d1: SqliteD1Database

function eventFor() {
  return { context: { cloudflare: { env: { DB: d1 } } } } as any
}

const AT = '2026-10-01T00:00:00.000Z'

function seedStorePlugin(sqlite: SqliteD1Database, input: {
  slug: string
  readme: string | null
  versions: Array<{ id: string, version: string, readme?: string | null, createdAt?: string }>
  category?: string
}) {
  sqlite.sqlite.prepare(`
    INSERT INTO dashboard_plugins (id, user_id, name, summary, category, badges, author, slug, status, readme_markdown, icon_url, created_at, updated_at)
    VALUES (?, 'owner-1', ?, ?, ?, '["official"]', '{"name":"Talex"}', ?, 'approved', ?, ?, ?, ?)
  `).run(`plugin-${input.slug}`, `Plugin ${input.slug}`, `About ${input.slug}`, input.category ?? 'utilities', input.slug, input.readme, `/api/images/${input.slug}.png`, AT, AT)
  for (const version of input.versions) {
    sqlite.sqlite.prepare(`
      INSERT INTO dashboard_plugin_versions (
        id, plugin_id, created_by, channel, version, signature, artifact_sha256,
        publisher_signature, publisher_key, publisher_key_id, publisher_verified_at, nexus_attestation,
        admission_status, policy_decision, artifact_state, package_key, package_url, package_size,
        icon_key, icon_url, readme_markdown, manifest, notes, status, security_scan_decision, created_at, updated_at
      ) VALUES (?, ?, 'owner-1', 'RELEASE', ?, 'sig', ?, ?, ?, 'key-1', ?, ?, 'eligible', 'passed', 'available',
        ?, ?, 2048, 'icon', '/icon', ?, ?, ?, 'approved', 'passed', ?, ?)
    `).run(
      version.id,
      `plugin-${input.slug}`,
      version.version,
      'a'.repeat(64),
      JSON.stringify({ payload: { policyVersion: 'v1' } }),
      JSON.stringify({ keyId: 'key-1' }),
      AT,
      JSON.stringify({ issuer: 'nexus' }),
      `${version.id}.tpex`,
      `/api/plugins/assets/${version.id}.tpex`,
      version.readme ?? null,
      JSON.stringify({ name: input.slug, version: version.version, main: 'index.js' }),
      `Changes in ${version.version}`,
      version.createdAt ?? AT,
      version.createdAt ?? AT,
    )
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./pluginsStore')
  d1 = createSqliteD1()
  // Creates the plugin tables.
  await store.getPluginBySlug(eventFor(), 'warm-up')
  seedStorePlugin(d1, {
    slug: 'with-readme',
    readme: '# A long readme',
    versions: [
      { id: 'w-1', version: '1.0.0', readme: '# version readme', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'w-2', version: '1.1.0', readme: '# newer readme', createdAt: '2026-10-02T00:00:00.000Z' },
    ],
  })
  seedStorePlugin(d1, { slug: 'empty-readme', readme: '', versions: [{ id: 'e-1', version: '0.1.0' }] })
  seedStorePlugin(d1, { slug: 'no-readme', readme: null, versions: [{ id: 'n-1', version: '2.0.0' }] })
})

afterEach(() => {
  d1.close()
})

function withoutReadmeFields<T extends { readmeMarkdown?: unknown, hasReadme?: unknown, versions?: Array<{ readmeMarkdown?: unknown }>, latestVersion?: { readmeMarkdown?: unknown } }>(plugin: T) {
  const { readmeMarkdown: _readme, hasReadme: _has, ...rest } = plugin
  return {
    ...rest,
    versions: (plugin.versions ?? []).map(({ readmeMarkdown: _v, ...version }) => version),
    ...(plugin.latestVersion ? { latestVersion: (({ readmeMarkdown: _l, ...version }) => version)(plugin.latestVersion) } : {}),
  }
}

describe('store listings without readmes', () => {
  it('names every version column but the readme', () => {
    const columns = (d1.sqlite.prepare(`PRAGMA table_info(dashboard_plugin_versions)`).all() as Array<{ name: string }>)
      .map(row => row.name)
      .filter(name => name !== 'readme_markdown')
    expect([...store.PLUGIN_VERSION_COLUMNS_WITHOUT_README].sort()).toEqual(columns.sort())
  })

  it('reads whether each plugin has a readme, and no readme text', async () => {
    const result = await store.listStorePlugins(eventFor())
    const bySlug = new Map(result.plugins.map(plugin => [plugin.slug, plugin]))

    expect(bySlug.get('with-readme')).toMatchObject({ hasReadme: true, readmeMarkdown: null })
    expect(bySlug.get('empty-readme')).toMatchObject({ hasReadme: false, readmeMarkdown: null })
    expect(bySlug.get('no-readme')).toMatchObject({ hasReadme: false, readmeMarkdown: null })
    for (const plugin of result.plugins) {
      for (const version of plugin.versions)
        expect(version.readmeMarkdown).toBeUndefined()
    }
  })

  it('answers exactly as the full read does, readmes aside', async () => {
    const lean = await store.searchStorePlugins(eventFor(), { includeReadme: false })
    const full = await store.searchStorePlugins(eventFor(), {})

    expect(full.plugins.find(plugin => plugin.slug === 'with-readme')?.readmeMarkdown).toBe('# A long readme')
    expect(full.plugins.find(plugin => plugin.slug === 'with-readme')?.latestVersion.readmeMarkdown).toBe('# newer readme')
    expect(lean.plugins.map(withoutReadmeFields)).toEqual(full.plugins.map(withoutReadmeFields))
    expect(lean.total).toBe(full.total)
  })
})
