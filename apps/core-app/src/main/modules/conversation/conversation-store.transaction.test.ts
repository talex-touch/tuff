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
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let db: ReturnType<typeof drizzle>
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

describe('saveConversation rolls back a failed replace-all', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'conversation-store-'))
    const client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
    db = drizzle(client)
    await migrate(db, { migrationsFolder })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('保存两条消息后能读回两条', async () => {
    const { saveConversation } = await loadStore()

    await saveConversation({
      id: 'thread-1',
      title: 'first',
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
