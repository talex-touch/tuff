import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Published preset downloads against real SQLite: counted, without reordering the list. */

let store: typeof import('./presetStore')
let d1: SqliteD1Database

function eventFor(): H3Event {
  return { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
}

function insertPreset(id: string, updatedAt: string) {
  d1.sqlite.prepare(`
    INSERT INTO app_presets (id, slug, name, channel, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, 'stable', 'published', '{"version":1,"meta":{"name":""}}', '2026-01-01T00:00:00.000Z', ?)
  `).run(id, id, id, updatedAt)
}

async function afterResponseWork() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./presetStore')
  d1 = createSqliteD1()
  // Creates the preset table.
  await store.listPublishedPresets(eventFor())
  insertPreset('older', '2026-01-01T00:00:00.000Z')
  insertPreset('newer', '2026-02-01T00:00:00.000Z')
})

afterEach(() => {
  d1.close()
})

describe('downloadPublishedPreset', () => {
  it('counts a download without moving the preset up the recently-updated list', async () => {
    const download = await store.downloadPublishedPreset(eventFor(), 'older')
    await afterResponseWork()

    expect(download?.summary).toMatchObject({ id: 'older', downloads: 0 })
    expect(d1.sqlite.prepare(`SELECT download_count, updated_at FROM app_presets WHERE id = 'older'`).get())
      .toEqual({ download_count: 1, updated_at: '2026-01-01T00:00:00.000Z' })
    expect((await store.listPublishedPresets(eventFor())).map(preset => preset.id)).toEqual(['newer', 'older'])
  })

  it('answers null for a preset that is not published', async () => {
    d1.sqlite.prepare(`UPDATE app_presets SET status = 'draft' WHERE id = 'older'`).run()

    expect(await store.downloadPublishedPreset(eventFor(), 'older')).toBeNull()
    await afterResponseWork()
    expect(d1.sqlite.prepare(`SELECT download_count FROM app_presets WHERE id = 'older'`).get()).toEqual({ download_count: 0 })
  })
})
