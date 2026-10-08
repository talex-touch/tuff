import { createClient, type Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  searchIndexMaintenanceProgress,
  searchIndexMeta,
  searchIndexPendingCommits,
  searchIndexFileMaintenance
} from '../../db/schema'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
let directory: string
let client: Client

// Follow the real journal chain, as in project-native-sessions-schema.test.ts; the optional
// bounds model a profile created before locator support, rather than inventing an old schema.
async function applyChain(
  fromIdx = 0,
  untilIdxExclusive = Number.POSITIVE_INFINITY
): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as {
    entries: Array<{ idx: number; tag: string }>
  }
  for (const entry of journal.entries) {
    if (entry.idx < fromIdx || entry.idx >= untilIdxExclusive) continue
    const sql = await readFile(join(migrationsFolder, `${entry.tag}.sql`), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.execute(statement)
    }
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-index-locator-migration-'))
  client = createClient({ url: `file:${join(directory, 'database.sqlite')}` })
})

afterEach(async () => {
  client?.close()
  await rm(directory, { recursive: true, force: true })
})

describe('search document locator migration', () => {
  it('upgrades existing provider-scoped identities without losing their keyword state', async () => {
    await applyChain(0, 53)
    await client.execute(`INSERT INTO search_index_meta (provider_id, item_id, keyword_hash, updated_at)
      VALUES ('provider-a', 'shared', 'hash-a', 111), ('provider-b', 'shared', 'hash-b', 222)`)
    await applyChain(53)
    const db = drizzle(client)
    await db
      .update(searchIndexMeta)
      .set({ ftsRowId: 41, documentHash: 'document-a' })
      .where(eq(searchIndexMeta.providerId, 'provider-a'))
    await db
      .update(searchIndexMeta)
      .set({ ftsRowId: 42, documentHash: 'document-b' })
      .where(eq(searchIndexMeta.providerId, 'provider-b'))
    expect(await db.select().from(searchIndexMeta).orderBy(searchIndexMeta.providerId)).toEqual([
      {
        providerId: 'provider-a',
        itemId: 'shared',
        keywordHash: 'hash-a',
        updatedAt: new Date(111_000),
        ftsRowId: 41,
        documentHash: 'document-a'
      },
      {
        providerId: 'provider-b',
        itemId: 'shared',
        keywordHash: 'hash-b',
        updatedAt: new Date(222_000),
        ftsRowId: 42,
        documentHash: 'document-b'
      }
    ])
    await db.insert(searchIndexMaintenanceProgress).values({ task: 'locator-backfill', cursor: 42 })
    const removedRecord = {
      id: 1,
      path: '/root/removed.txt',
      mtime: 11,
      ctime: 7,
      size: 3,
      lastIndexedAt: 13,
      itemId: 'file:1'
    }
    const deletedRecords = JSON.stringify([removedRecord])
    const expectedRecord = JSON.stringify(removedRecord)
    await db.insert(searchIndexPendingCommits).values({
      commitId: 'commit-a',
      sourceId: 'provider-a',
      deletedRecords,
      removedIndexedItems: 1
    })
    await db.insert(searchIndexFileMaintenance).values([
      {
        taskId: 'work-a',
        sourceId: 'provider-a',
        reason: 'missing-root',
        filePath: '/root',
        expectedRecord: null,
        cursor: 64
      },
      {
        taskId: 'work-b',
        sourceId: 'provider-b',
        reason: 'stale-file',
        filePath: '/root/removed.txt',
        expectedRecord,
        cursor: 7
      }
    ])
    client.close()
    client = createClient({ url: `file:${join(directory, 'database.sqlite')}` })
    expect(await drizzle(client).select().from(searchIndexMaintenanceProgress)).toEqual([
      { task: 'locator-backfill', cursor: 42 }
    ])
    const reopened = drizzle(client)
    expect(await reopened.select().from(searchIndexPendingCommits)).toEqual([
      { commitId: 'commit-a', sourceId: 'provider-a', deletedRecords, removedIndexedItems: 1 }
    ])
    expect(
      await reopened
        .select()
        .from(searchIndexFileMaintenance)
        .orderBy(searchIndexFileMaintenance.taskId)
    ).toEqual([
      {
        taskId: 'work-a',
        sourceId: 'provider-a',
        reason: 'missing-root',
        filePath: '/root',
        expectedRecord: null,
        cursor: 64
      },
      {
        taskId: 'work-b',
        sourceId: 'provider-b',
        reason: 'stale-file',
        filePath: '/root/removed.txt',
        expectedRecord,
        cursor: 7
      }
    ])
  })

  it('keeps independent maintenance cursors and locator identities on a freshly migrated database', async () => {
    await applyChain()
    const db = drizzle(client)
    await db.insert(searchIndexMeta).values([
      {
        providerId: 'provider-a',
        itemId: 'shared',
        keywordHash: 'hash-a',
        updatedAt: new Date(111_000),
        ftsRowId: 31,
        documentHash: 'document-a'
      },
      {
        providerId: 'provider-b',
        itemId: 'shared',
        keywordHash: 'hash-b',
        updatedAt: new Date(222_000),
        ftsRowId: 32,
        documentHash: 'document-b'
      }
    ])
    await db.insert(searchIndexMaintenanceProgress).values([
      { task: 'locators', cursor: 31 },
      { task: 'orphan-keywords', cursor: 98 }
    ])
    await db
      .update(searchIndexMaintenanceProgress)
      .set({ cursor: 32 })
      .where(eq(searchIndexMaintenanceProgress.task, 'locators'))
    await db.delete(searchIndexMeta).where(eq(searchIndexMeta.providerId, 'provider-a'))
    expect(await db.select().from(searchIndexMeta)).toEqual([
      {
        providerId: 'provider-b',
        itemId: 'shared',
        keywordHash: 'hash-b',
        updatedAt: new Date(222_000),
        ftsRowId: 32,
        documentHash: 'document-b'
      }
    ])
    expect(
      await db
        .select()
        .from(searchIndexMaintenanceProgress)
        .orderBy(searchIndexMaintenanceProgress.task)
    ).toEqual([
      { task: 'locators', cursor: 32 },
      { task: 'orphan-keywords', cursor: 98 }
    ])
  })
})
