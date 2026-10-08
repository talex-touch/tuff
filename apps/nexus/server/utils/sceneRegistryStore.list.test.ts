import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** The scene registry listing against real SQLite: scenes with their bindings, in one round trip. */

let store: typeof import('./sceneRegistryStore')
let d1: SqliteD1Database

function eventFor(db: unknown = d1) {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

function insertScene(id: string, owner: string, bindings: Array<[string, number]>) {
  const at = '2026-10-01T00:00:00.000Z'
  d1.sqlite.prepare(`
    INSERT INTO scene_registry (id, display_name, owner, owner_scope, status, required_capabilities, strategy_mode, fallback, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'system', 'enabled', '["text.chat"]', 'priority', 'enabled', 'admin', ?, ?)
  `).run(id, id, owner, at, at)
  for (const [providerId, priority] of bindings) {
    d1.sqlite.prepare(`
      INSERT INTO scene_strategy_bindings (id, scene_id, provider_id, capability, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, 'text.chat', ?, 'enabled', ?, ?)
    `).run(`${id}:${providerId}`, id, providerId, priority, at, at)
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./sceneRegistryStore')
  d1 = createSqliteD1()
  // Creates the registry tables.
  await store.listSceneRegistryEntries(eventFor())
})

afterEach(() => {
  d1.close()
})

describe('listSceneRegistryEntries', () => {
  it('lists the scenes a filter selects with their own bindings in one round trip', async () => {
    insertScene('scene-a', 'nexus', [['prv_2', 20], ['prv_1', 10]])
    insertScene('scene-b', 'core-app', [['prv_3', 10]])
    let roundTrips = 0
    const counting = {
      prepare: (sql: string) => d1.prepare(sql),
      batch: async (statements: SqliteD1Statement[]) => {
        roundTrips += 1
        return d1.batch(statements)
      },
    }
    await store.listSceneRegistryEntries(eventFor(counting)) // reads the schema record
    const before = roundTrips

    const scenes = await store.listSceneRegistryEntries(eventFor(counting), { owner: 'nexus' as any })

    expect(roundTrips - before).toBe(1)
    expect(scenes.map(scene => [scene.id, scene.bindings.map(binding => binding.providerId)])).toEqual([['scene-a', ['prv_1', 'prv_2']]])
  })

  it('lists more scenes than one statement may bind parameters', async () => {
    for (let index = 0; index < 150; index += 1)
      insertScene(`bulk-${index}`, 'nexus', [['prv_1', 10]])

    const scenes = await store.listSceneRegistryEntries(eventFor())

    expect(scenes).toHaveLength(150)
    expect(scenes.every(scene => scene.bindings.length === 1)).toBe(true)
  })
})
