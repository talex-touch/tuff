/**
 * Regression for the `conversation_messages` primary key (0037, 2026-08-06).
 *
 * Message ids are renderer-assigned and only unique within their thread
 * ('user-1', 'assistant-2', …), while the table originally declared a global
 * `id` PRIMARY KEY. The second conversation to save its own 'user-1' collided
 * with the first one's row and the whole save failed — after the store had
 * already deleted the thread it was rewriting. The key must be
 * (conversation_id, id).
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

const TABLE = 'conversation_messages'

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

function insertMessage(client: Client, conversationId: string, id: string): Promise<unknown> {
  return client.execute({
    sql: `INSERT INTO ${TABLE} (id, conversation_id, role, content, status, meta, seq, created_at) VALUES (?, ?, 'user', 'hi', 'complete', NULL, 0, 0)`,
    args: [id, conversationId]
  })
}

describe('conversation_messages composite primary key', () => {
  let directory: string
  let client: Client | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-conversation-schema-'))
    client = createClient({ url: `file:${join(directory, 'chain.db')}` })
    await applyFullChain(client)
    for (const conversationId of ['conv-a', 'conv-b']) {
      await client.execute({
        sql: `INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, '', 0, 0)`,
        args: [conversationId]
      })
    }
  })

  afterEach(async () => {
    client?.close()
    client = undefined
    await rm(directory, { recursive: true, force: true })
  })

  it('keys messages by (conversation_id, id)', async () => {
    const columns = await client!.execute(
      `SELECT name, pk FROM pragma_table_info('${TABLE}') WHERE pk > 0 ORDER BY pk`
    )
    expect(columns.rows.map((row) => String(row.name))).toEqual(['conversation_id', 'id'])
  })

  it('lets two threads use the same renderer-assigned message id', async () => {
    await insertMessage(client!, 'conv-a', 'user-1')
    await expect(insertMessage(client!, 'conv-b', 'user-1')).resolves.toBeDefined()

    const rows = await client!.execute(
      `SELECT conversation_id FROM ${TABLE} ORDER BY conversation_id`
    )
    expect(rows.rows.map((row) => String(row.conversation_id))).toEqual(['conv-a', 'conv-b'])
  })

  it('still rejects a duplicate id inside one thread', async () => {
    await insertMessage(client!, 'conv-a', 'user-1')
    await expect(insertMessage(client!, 'conv-a', 'user-1')).rejects.toThrow(/UNIQUE|PRIMARY/i)
  })

  it('survives the replace-all rewrite the store performs on every save', async () => {
    await insertMessage(client!, 'conv-a', 'user-1')
    await client!.execute({
      sql: `DELETE FROM ${TABLE} WHERE conversation_id = ?`,
      args: ['conv-a']
    })
    await expect(insertMessage(client!, 'conv-a', 'user-1')).resolves.toBeDefined()
  })
})
