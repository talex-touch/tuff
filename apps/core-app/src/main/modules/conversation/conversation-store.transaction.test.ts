/**
 * saveConversation is a replace-all: it DELETEs every message row for a thread and then INSERTs
 * the new set (#763). scheduleDbWrite serialises that unit against other writers but gives it no
 * rollback boundary, so before the fix a failing insert left the thread row present and every
 * message gone -- the UI kept showing the thread from memory and it opened empty on next launch.
 *
 * These run against a real libsql database with the shipped migrations applied, because the
 * property under test is rollback. A mocked `db` could only prove that `transaction()` was called,
 * not that the delete actually came back.
 */
import type { Client } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let db: ReturnType<typeof drizzle>
let client: Client
let tempDir: string

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

// The scheduler only serialises; running the task inline keeps these tests about the write itself.
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))

async function loadStore(): Promise<typeof import('./conversation-store')> {
  return import('./conversation-store')
}

async function storedMessageIds(conversationId: string): Promise<string[]> {
  const { getConversation } = await loadStore()
  const thread = await getConversation(conversationId)
  return (thread?.messages ?? []).map((message) => message.id)
}

async function seedProject(id: string, rootPath = `/projects/${id}`): Promise<void> {
  await client.execute({
    sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, 0, 0, 1, 1, 1)`,
    args: [id, rootPath, id]
  })
}

async function insertPointer(
  id: string,
  conversationId: string | null,
  projectId: string,
  nativeId = `native-${id}`
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO local_ai_cli_sessions (id, conversation_id, project_id, provider, project_root, native_session_id, title, state, origin, expected_head_id, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, 'pi', ?, ?, '', 'available', 'tuff', NULL, 1, 1, 1)`,
    args: [id, conversationId, projectId, `/projects/${projectId}`, nativeId]
  })
}

async function countPointers(where: string): Promise<number> {
  const result = await client.execute(
    `SELECT COUNT(*) AS n FROM local_ai_cli_sessions WHERE ${where}`
  )
  return Number(result.rows[0]?.n ?? 0)
}

/** Seeds a dirty sync-state row directly, bypassing saveConversation, to test reader filtering. */
async function seedDirtyState(
  conversationId: string,
  dirtyAt: number,
  deletedAt: number | null = null
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO conversation_sync_state (conversation_id, dirty_at, deleted_at) VALUES (?, ?, ?)`,
    args: [conversationId, dirtyAt, deletedAt]
  })
}

describe('saveConversation rolls back a failed replace-all', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'conversation-store-'))
    client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })
  })

  afterEach(async () => {
    client.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('保存两条消息后能读回两条', async () => {
    const { saveConversation } = await loadStore()

    await saveConversation({
      id: 'thread-1',
      title: 'first',
      projectId: null,
      messages: [
        { id: 'm1', role: 'user', content: 'hello', status: 'complete', createdAt: 1 },
        { id: 'm2', role: 'assistant', content: 'hi', status: 'complete', createdAt: 2 }
      ]
    })

    expect(await storedMessageIds('thread-1')).toEqual(['m1', 'm2'])
  })

  it('重复消息 id 导致插入失败时,原有消息必须还在', async () => {
    const { saveConversation } = await loadStore()

    await saveConversation({
      id: 'thread-1',
      title: 'first',
      projectId: null,
      messages: [
        { id: 'm1', role: 'user', content: 'hello', status: 'complete', createdAt: 1 },
        { id: 'm2', role: 'assistant', content: 'hi', status: 'complete', createdAt: 2 }
      ]
    })

    // A retried stream that reuses an id: the DELETE succeeds, the multi-row INSERT aborts on the
    // primary-key conflict. Without a transaction the thread is left with zero messages.
    await expect(
      saveConversation({
        id: 'thread-1',
        title: 'second',
        projectId: null,
        messages: [
          { id: 'dup', role: 'user', content: 'a', status: 'complete', createdAt: 3 },
          { id: 'dup', role: 'assistant', content: 'b', status: 'complete', createdAt: 4 }
        ]
      })
    ).rejects.toThrow()

    expect(await storedMessageIds('thread-1')).toEqual(['m1', 'm2'])
  })

  it('同步确认只清除已推送的会话修订，删除会留下持久标记', async () => {
    const {
      clearConversationSyncState,
      deleteConversation,
      listConversationSyncStates,
      saveConversation
    } = await loadStore()

    const saved = await saveConversation({
      id: 'thread-sync',
      title: 'sync state',
      projectId: null,
      messages: [{ id: 'm1', role: 'user', content: 'hello', status: 'complete' }]
    })

    expect(await listConversationSyncStates()).toEqual([
      {
        conversationId: 'thread-sync',
        dirtyAt: saved.updatedAt,
        deletedAt: null
      }
    ])

    await clearConversationSyncState('thread-sync', saved.updatedAt - 1)
    expect(await listConversationSyncStates()).toHaveLength(1)

    await clearConversationSyncState('thread-sync', saved.updatedAt)
    expect(await listConversationSyncStates()).toEqual([])

    await deleteConversation('thread-sync')
    const [deletedState] = await listConversationSyncStates()
    expect(deletedState).toMatchObject({
      conversationId: 'thread-sync',
      deletedAt: expect.any(Number)
    })
    expect(deletedState?.dirtyAt).toBe(deletedState?.deletedAt)
  })
})

/**
 * Project ownership is device-local. The encrypted conversation sync moves titles and messages, so
 * the snapshot handed to it must not carry an owner from this device, and applying a remote snapshot
 * must not overwrite an owner this device already has.
 *
 * A project thread is excluded from sync entirely: no dirty state is written on local edits, no
 * tombstone is left on local delete, remote snapshots/deletes are no-ops, and the enumeration
 * readers filter them out.
 */
describe('conversation project ownership across local writes and sync', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'conversation-project-'))
    client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })
  })

  afterEach(async () => {
    client.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('local save and rename preserve project id and leave no sync dirt', async () => {
    await seedProject('project-1')
    const { getConversation, getConversationSyncState, renameConversation, saveConversation } =
      await loadStore()

    const saved = await saveConversation({
      id: 'thread-owned',
      projectId: 'project-1',
      title: 'owned',
      messages: [{ id: 'm1', role: 'user', content: 'hello', status: 'complete' }]
    })
    expect(saved.projectId).toBe('project-1')
    expect((await getConversation('thread-owned'))?.projectId).toBe('project-1')

    await renameConversation('thread-owned', 'renamed')
    const renamed = await getConversation('thread-owned')
    expect(renamed?.projectId).toBe('project-1')
    expect(renamed?.title).toBe('renamed')

    // A project thread is never dirtied locally — sync does not track it.
    expect(await getConversationSyncState('thread-owned')).toBeNull()
    expect(
      (
        await client.execute(
          `SELECT * FROM conversation_sync_state WHERE conversation_id = 'thread-owned'`
        )
      ).rows
    ).toHaveLength(0)
  })

  it('rejects saving with a missing or invalid project id', async () => {
    const { getConversation, saveConversation } = await loadStore()

    await expect(
      saveConversation({
        id: 'thread-orphan',
        projectId: 'missing-project',
        title: 'orphan',
        messages: []
      })
    ).rejects.toThrow('CONVERSATION_PROJECT_INVALID')

    await expect(
      saveConversation({
        id: 'thread-escape',
        projectId: '../escape',
        title: 'escape',
        messages: []
      })
    ).rejects.toThrow('CONVERSATION_PROJECT_INVALID')

    expect(await getConversation('thread-orphan')).toBeNull()
    expect(await getConversation('thread-escape')).toBeNull()
  })

  it('refuses to export a project thread to a sync snapshot', async () => {
    await seedProject('project-2')
    const { getConversation, saveConversation, toConversationSyncSnapshot } = await loadStore()

    await saveConversation({
      id: 'thread-snap',
      projectId: 'project-2',
      title: 'snap',
      messages: [{ id: 'm1', role: 'user', content: 'hi', status: 'complete', createdAt: 5 }]
    })

    const thread = await getConversation('thread-snap')
    expect(thread).not.toBeNull()

    // Project ownership is device-local; leaking it into the snapshot would let the remote pick
    // which project a thread belongs to on another device.
    expect(() => toConversationSyncSnapshot(thread!)).toThrow('CONVERSATION_PROJECT_SYNC_EXCLUDED')
  })

  it('remote snapshot does not overwrite a local project; a new Home thread is admitted', async () => {
    await seedProject('project-3')
    const {
      applyConversationSyncSnapshot,
      getConversation,
      getConversationSyncState,
      saveConversation
    } = await loadStore()

    await saveConversation({
      id: 'thread-local',
      projectId: 'project-3',
      title: 'local',
      messages: [{ id: 'm1', role: 'user', content: 'local', status: 'complete', createdAt: 1 }]
    })

    await applyConversationSyncSnapshot({
      id: 'thread-local',
      title: 'from other device',
      createdAt: 10,
      updatedAt: 20,
      messages: [
        {
          id: 'r1',
          role: 'assistant',
          content: 'remote',
          status: 'complete',
          seq: 0,
          createdAt: 15
        }
      ]
    })

    // The remote apply is a no-op: project ownership is preserved, title and messages untouched,
    // and no sync-state tombstone is written.
    const preserved = await getConversation('thread-local')
    expect(preserved?.projectId).toBe('project-3')
    expect(preserved?.title).toBe('local')
    expect(preserved?.messages).toHaveLength(1)
    expect(preserved?.messages[0].id).toBe('m1')
    expect(await getConversationSyncState('thread-local')).toBeNull()

    await applyConversationSyncSnapshot({
      id: 'thread-remote',
      title: 'new elsewhere',
      createdAt: 1,
      updatedAt: 2,
      messages: []
    })

    expect((await getConversation('thread-remote'))?.projectId).toBeNull()
  })

  it('remote deletion does not remove a project thread', async () => {
    await seedProject('project-del-sync')
    const { applyConversationSyncDeletion, getConversation, saveConversation } = await loadStore()
    await saveConversation({
      id: 'thread-project',
      projectId: 'project-del-sync',
      title: 'doomed elsewhere',
      messages: [{ id: 'm1', role: 'user', content: 'doomed', status: 'complete', createdAt: 1 }]
    })

    await applyConversationSyncDeletion('thread-project', 4242)

    // The project thread survives a remote delete — ownership is local.
    const survived = await getConversation('thread-project')
    expect(survived?.projectId).toBe('project-del-sync')
    expect(survived?.messages[0].content).toBe('doomed')
  })

  it('remote snapshot updates a Home thread title and messages', async () => {
    const { applyConversationSyncSnapshot, getConversation, saveConversation } = await loadStore()
    await saveConversation({
      id: 'thread-home',
      projectId: null,
      title: 'home title',
      messages: [
        { id: 'm1', role: 'user', content: 'old content', status: 'complete', createdAt: 1 }
      ]
    })

    await applyConversationSyncSnapshot({
      id: 'thread-home',
      title: 'remote title',
      createdAt: 1,
      updatedAt: 2,
      messages: [
        {
          id: 'r1',
          role: 'assistant',
          content: 'remote content',
          status: 'complete',
          seq: 0,
          createdAt: 2
        }
      ]
    })

    const updated = await getConversation('thread-home')
    expect(updated?.title).toBe('remote title')
    expect(updated?.projectId).toBeNull()
    expect(updated?.messages[0].content).toBe('remote content')
  })

  it('remote deletion removes a Home thread and its native pointer only', async () => {
    await seedProject('project-home')
    const { applyConversationSyncDeletion, getConversation, saveConversation } = await loadStore()
    await saveConversation({
      id: 'thread-home',
      projectId: null,
      title: 'home',
      messages: []
    })
    await insertPointer('ptr-home', 'thread-home', 'project-home')

    await applyConversationSyncDeletion('thread-home', 3210)

    expect(await getConversation('thread-home')).toBeNull()
    expect(await countPointers(`conversation_id = 'thread-home'`)).toBe(0)
  })

  it('enumerate only Home threads eligible for sync, not project threads', async () => {
    await seedProject('project-enum')
    const { listConversationIdsForSync, saveConversation } = await loadStore()

    await saveConversation({
      id: 'home-thread',
      projectId: null,
      title: 'home',
      messages: []
    })
    await saveConversation({
      id: 'project-thread',
      projectId: 'project-enum',
      title: 'project',
      messages: []
    })

    expect((await listConversationIdsForSync()).sort()).toEqual(['home-thread'])
  })

  it('listConversationSyncStates and getConversationSyncState exclude project threads', async () => {
    await seedProject('project-list')
    const { getConversationSyncState, listConversationSyncStates, saveConversation } =
      await loadStore()

    await saveConversation({
      id: 'home-thread',
      projectId: null,
      title: 'home',
      messages: []
    })
    await saveConversation({
      id: 'project-thread',
      projectId: 'project-list',
      title: 'project',
      messages: []
    })

    const states = await listConversationSyncStates()
    expect(states.map((s) => s.conversationId).sort()).toEqual(['home-thread'])

    // A project thread returns null even when a stale dirty row still exists in the raw table.
    expect(await getConversationSyncState('project-thread')).toBeNull()
  })

  it('a stale dirty row on a project thread is invisible to the sync-state reader', async () => {
    await seedProject('project-stale')
    const { getConversationSyncState, listConversationSyncStates, saveConversation } =
      await loadStore()

    await saveConversation({
      id: 'thread-stale',
      projectId: 'project-stale',
      title: 'project',
      messages: []
    })

    // Simulate a legacy row that would have been written before the project boundary existed.
    await seedDirtyState('thread-stale', 999, null)

    // The raw row exists — …
    const raw = await client.execute(
      `SELECT COUNT(*) AS n FROM conversation_sync_state WHERE conversation_id = 'thread-stale'`
    )
    expect(Number(raw.rows[0]?.n ?? 0)).toBe(1)
    // …but the readers filter it out because the conversation has a project.
    expect(await getConversationSyncState('thread-stale')).toBeNull()
    expect((await listConversationSyncStates()).map((s) => s.conversationId)).not.toContain(
      'thread-stale'
    )
  })

  it('normalizeConversationSyncSnapshot rejects a non-null project id', async () => {
    const { normalizeConversationSyncSnapshot } = await loadStore()

    expect(
      normalizeConversationSyncSnapshot({
        id: 'thread',
        projectId: 'leaked-project',
        title: 't',
        createdAt: 1,
        updatedAt: 2,
        messages: []
      })
    ).toBeNull()

    // A null-ish / absent project id is still accepted.
    expect(
      normalizeConversationSyncSnapshot({
        id: 'thread',
        projectId: null,
        title: 't',
        createdAt: 1,
        updatedAt: 2,
        messages: []
      })
    ).not.toBeNull()

    expect(
      normalizeConversationSyncSnapshot({
        id: 'thread',
        title: 't',
        createdAt: 1,
        updatedAt: 2,
        messages: []
      })
    ).not.toBeNull()
  })

  it('moving a thread from Home to a project does not leak sync dirt', async () => {
    await seedProject('project-move')
    const { getConversationSyncState, listConversationSyncStates, saveConversation } =
      await loadStore()

    await saveConversation({
      id: 'thread-move',
      projectId: null,
      title: 'home first',
      messages: [{ id: 'm1', role: 'user', content: 'hi', status: 'complete', createdAt: 1 }]
    })

    const statesBefore = await listConversationSyncStates()
    expect(statesBefore).toHaveLength(1)
    expect(statesBefore[0]?.conversationId).toBe('thread-move')

    // Now adopt it into a project — the dirty state must vanish.
    await saveConversation({
      id: 'thread-move',
      projectId: 'project-move',
      title: 'now in project',
      messages: [{ id: 'm1', role: 'user', content: 'hi', status: 'complete', createdAt: 1 }]
    })

    expect(await getConversationSyncState('thread-move')).toBeNull()
    expect((await listConversationSyncStates()).map((s) => s.conversationId)).not.toContain(
      'thread-move'
    )
  })
})

/**
 * A Home thread lives in two tables: the conversation row the shell renders and the native pointer
 * the Pi provider resumes. Deleting the thread must remove only its own pointer — a broad delete
 * would orphan every other session's continuation, and a pointer left behind would let a deleted
 * thread's native transcript be resumed from the shell.
 */
describe('conversation deletion clears only its own native pointer', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'conversation-pointer-'))
    client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })
  })

  afterEach(async () => {
    client.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('local delete of a Home thread removes only its own pointer and leaves a tombstone', async () => {
    await seedProject('project-home')
    const { deleteConversation, getConversation, getConversationSyncState, saveConversation } =
      await loadStore()
    await saveConversation({
      id: 'thread-doomed',
      projectId: null,
      title: 'doomed',
      messages: []
    })
    await saveConversation({
      id: 'thread-kept',
      projectId: null,
      title: 'kept',
      messages: []
    })
    await insertPointer('ptr-doomed', 'thread-doomed', 'project-home')
    await insertPointer('ptr-kept', 'thread-kept', 'project-home')
    await insertPointer('ptr-unbound', null, 'project-home')

    await deleteConversation('thread-doomed')

    expect(await getConversation('thread-doomed')).toBeNull()
    expect(await countPointers(`conversation_id = 'thread-doomed'`)).toBe(0)
    expect(await countPointers(`id = 'ptr-kept'`)).toBe(1)
    // An unbound pointer (quick invoke) must never be swept up by a conversation deletion.
    expect(await countPointers(`id = 'ptr-unbound'`)).toBe(1)
    // A Home deletion leaves a sync tombstone.
    const state = await getConversationSyncState('thread-doomed')
    expect(state?.deletedAt).toEqual(expect.any(Number))
    expect(state?.dirtyAt).toBe(state?.deletedAt)
  })

  it('local delete of a project thread removes its pointer without a sync tombstone', async () => {
    await seedProject('project-del')
    const { deleteConversation, getConversation, getConversationSyncState, saveConversation } =
      await loadStore()
    await saveConversation({
      id: 'thread-doomed',
      projectId: 'project-del',
      title: 'doomed',
      messages: []
    })
    await saveConversation({
      id: 'thread-kept',
      projectId: 'project-del',
      title: 'kept',
      messages: []
    })
    await insertPointer('ptr-doomed', 'thread-doomed', 'project-del')
    await insertPointer('ptr-kept', 'thread-kept', 'project-del')
    await insertPointer('ptr-unbound', null, 'project-del')

    await deleteConversation('thread-doomed')

    expect(await getConversation('thread-doomed')).toBeNull()
    expect(await countPointers(`conversation_id = 'thread-doomed'`)).toBe(0)
    expect(await countPointers(`id = 'ptr-kept'`)).toBe(1)
    // An unbound pointer (quick invoke) must never be swept up by a conversation deletion.
    expect(await countPointers(`id = 'ptr-unbound'`)).toBe(1)
    // A project deletion produces no sync tombstone — the thread was never synced.
    expect(await getConversationSyncState('thread-doomed')).toBeNull()
  })

  it('remote sync delete of a Home thread removes only its own pointer', async () => {
    await seedProject('project-sync-home')
    const { applyConversationSyncDeletion, getConversation, saveConversation } = await loadStore()
    await saveConversation({
      id: 'thread-remote-gone',
      projectId: null,
      title: 'gone elsewhere',
      messages: []
    })
    await saveConversation({
      id: 'thread-remote-kept',
      projectId: null,
      title: 'kept elsewhere',
      messages: []
    })
    await insertPointer('ptr-remote-gone', 'thread-remote-gone', 'project-sync-home')
    await insertPointer('ptr-remote-kept', 'thread-remote-kept', 'project-sync-home')

    await applyConversationSyncDeletion('thread-remote-gone', 4242)

    expect(await getConversation('thread-remote-gone')).toBeNull()
    expect(await countPointers(`conversation_id = 'thread-remote-gone'`)).toBe(0)
    expect(await countPointers(`id = 'ptr-remote-kept'`)).toBe(1)
  })

  it('remote sync delete of a project thread is a no-op: thread and pointer survive', async () => {
    await seedProject('project-sync-del')
    const { applyConversationSyncDeletion, getConversation, saveConversation } = await loadStore()
    await saveConversation({
      id: 'thread-remote-gone',
      projectId: 'project-sync-del',
      title: 'gone elsewhere',
      messages: []
    })
    await saveConversation({
      id: 'thread-remote-kept',
      projectId: 'project-sync-del',
      title: 'kept elsewhere',
      messages: []
    })
    await insertPointer('ptr-remote-gone', 'thread-remote-gone', 'project-sync-del')
    await insertPointer('ptr-remote-kept', 'thread-remote-kept', 'project-sync-del')

    await applyConversationSyncDeletion('thread-remote-gone', 4242)

    // The project thread survives the remote delete entirely.
    const survived = await getConversation('thread-remote-gone')
    expect(survived?.projectId).toBe('project-sync-del')
    expect(survived?.title).toBe('gone elsewhere')
    expect(await countPointers(`id = 'ptr-remote-gone'`)).toBe(1)
    expect(await countPointers(`id = 'ptr-remote-kept'`)).toBe(1)
  })
})
