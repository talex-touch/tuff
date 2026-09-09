/**
 * Regression for the clipboard expiry migration (0044, 2026-09-08).
 *
 * Clipboard capture persists a per-record expiry for verification codes. On a
 * database upgraded through the primary migration chain before 0044, Drizzle's
 * capture-shaped INSERT references `retention_expires_at`, which SQLite rejects
 * because the column does not exist. The migration must create both that
 * storage and the partial index used to find expiring non-favorite records.
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { clipboardHistory } from '../../db/schema'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
const TABLE = 'clipboard_history'
const EXPIRY_INDEX = 'clipboard_history_expiry_idx'

async function applyMigrationFile(client: Client, fileName: string): Promise<void> {
  const sql = await readFile(join(migrationsFolder, fileName), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

async function applyFullChain(client: Client): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as { entries: Array<{ tag: string }> }
  for (const entry of journal.entries) {
    await applyMigrationFile(client, `${entry.tag}.sql`)
  }
}

describe('clipboard_history retention expiry migration', () => {
  let directory: string
  let client: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-clipboard-expiry-schema-'))
    client = createClient({ url: `file:${join(directory, 'chain.db')}` })
    await applyFullChain(client)
  })

  afterEach(async () => {
    client?.close()
    client = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('stores capture expiry timestamps after applying the complete primary migration chain', async () => {
    const columns = await client!.execute(`PRAGMA table_info('${TABLE}')`)
    expect(columns.rows.map((column) => String(column.name))).toContain('retention_expires_at')

    const indexes = await client!.execute(
      `SELECT name, "partial" FROM pragma_index_list('${TABLE}') WHERE name = '${EXPIRY_INDEX}'`
    )
    expect(indexes.rows).toEqual([{ name: EXPIRY_INDEX, partial: 1 }])

    const indexColumns = await client!.execute(
      `SELECT name FROM pragma_index_info('${EXPIRY_INDEX}') ORDER BY seqno`
    )
    expect(indexColumns.rows.map((column) => String(column.name))).toEqual(['retention_expires_at'])

    const db = drizzle(client!, { schema })
    const capturedAt = new Date('2026-09-08T12:00:00.000Z')
    const expiresAt = new Date('2026-09-08T12:15:00.000Z')
    const [inserted] = await db
      .insert(clipboardHistory)
      .values({
        type: 'text',
        content: '493028',
        rawContent: null,
        thumbnail: null,
        timestamp: capturedAt,
        sourceApp: 'ClipboardCapturePipeline',
        isFavorite: false,
        retentionProtected: false,
        retentionExpiresAt: expiresAt,
        metadata: JSON.stringify({ retention_class: 'verification-code' })
      })
      .returning()

    const [persisted] = await db
      .select({
        content: clipboardHistory.content,
        retentionExpiresAt: clipboardHistory.retentionExpiresAt
      })
      .from(clipboardHistory)
      .where(eq(clipboardHistory.id, inserted.id))

    expect(persisted).toEqual({ content: '493028', retentionExpiresAt: expiresAt })
  })
})
