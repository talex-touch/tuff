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

  it('本地保存与重命名保留项目归属并标记同步脏状态', async () => {
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

    const syncState = await getConversationSyncState('thread-owned')
    expect(syncState?.deletedAt).toBeNull()
    expect(syncState?.dirtyAt).toBe(renamed?.updatedAt)
  })

  it('拒绝把会话归属到不存在或非法 id 的项目', async () => {
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

  it('toConversationSyncSnapshot 不传输项目归属', async () => {
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
    const snapshot = toConversationSyncSnapshot(thread!)

    expect(Object.keys(snapshot).sort()).toEqual([
      'createdAt',
      'id',
      'messages',
      'title',
      'updatedAt'
    ])
    expect(JSON.stringify(snapshot)).not.toContain('project-2')
  })

  it('远端同步保留本地项目归属，新的远端会话归入 Home', async () => {
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

    const preserved = await getConversation('thread-local')
    expect(preserved?.projectId).toBe('project-3')
    expect(preserved?.title).toBe('from other device')
    // A remote apply acknowledges the sync, so it is no longer dirty here.
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
})
