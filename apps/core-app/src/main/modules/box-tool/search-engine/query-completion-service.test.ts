import type { DbUtils } from '../../../db/utils'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// This file drives a real libsql migration chain. It runs in 778ms here, but on a CI
// runner -- fewer cores, the whole suite in parallel workers -- it went past vitest's 5s
// default and timed out (#1596). Raised per file rather than globally so a genuine hang
// elsewhere still fails fast.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { QueryCompletionService } from './query-completion-service'

/**
 * getSuggestions built its LIKE pattern from raw user text and called .all()
 * with no LIMIT — the `limit` argument was applied in JS only after every
 * matching row had been loaded and exp()-scored. Typing '%' matched the whole
 * table, and injectCompletionWeights runs this on each debounced keystroke of
 * the interactive search path (#664). Real SQLite, so the assertions are about
 * what the engine actually returns.
 */

/** SQL the service issued, in order — lets the tests assert the query shape. */
type Recorder = { sql: string[] }

function recordingClient(client: Client, recorder: Recorder): Client {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'execute') {
        return (statement: unknown, ...rest: unknown[]) => {
          const text =
            typeof statement === 'string' ? statement : ((statement as { sql?: string })?.sql ?? '')
          recorder.sql.push(text)
          return (target.execute as (...args: unknown[]) => unknown)(statement, ...rest)
        }
      }
      return Reflect.get(target, property, receiver)
    }
  }) as Client
}

async function withService(
  run: (service: QueryCompletionService, client: Client, recorder: Recorder) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-query-completion-'))
  let client: Client | undefined
  try {
    client = createClient({ url: `file:${join(directory, 'completions.sqlite')}` })
    await client.execute(`
      CREATE TABLE query_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prefix TEXT NOT NULL,
        source_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        completion_count INTEGER NOT NULL DEFAULT 1,
        last_completed INTEGER NOT NULL,
        avg_query_length REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `)
    const recorder: Recorder = { sql: [] }
    const db = drizzle(recordingClient(client, recorder))
    const dbUtils = { getDb: () => db } as unknown as DbUtils
    await run(new QueryCompletionService(dbUtils), client, recorder)
  } finally {
    client?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function seed(client: Client, prefixes: string[]): Promise<void> {
  const lastCompleted = Math.floor(new Date('2026-08-01T00:00:00Z').getTime() / 1000)
  for (const [index, prefix] of prefixes.entries()) {
    await client.execute({
      sql: `INSERT INTO query_completions
              (prefix, source_id, item_id, completion_count, last_completed, avg_query_length)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [prefix, 'app-provider', `item-${index}`, 1, lastCompleted, prefix.length]
    })
  }
}

describe('QueryCompletionService.getSuggestions', () => {
  it('treats % as a literal instead of matching the whole table', async () => {
    await withService(async (service, client) => {
      await seed(client, ['chrome', 'firefox', 'safari', 'slack'])

      const suggestions = await service.getSuggestions('%%')

      // Before the fix this matched all four rows.
      expect(suggestions).toEqual([])
    })
  })

  it('treats _ as a literal rather than a single-character wildcard', async () => {
    await withService(async (service, client) => {
      await seed(client, ['abc', 'a1c', 'a_c'])

      const suggestions = await service.getSuggestions('a_c')

      expect(suggestions.map((s) => s.prefix)).toEqual(['a_c'])
    })
  })

  it('bounds how many rows reach the JS scorer', async () => {
    await withService(async (service, client, recorder) => {
      await seed(
        client,
        Array.from({ length: 640 }, (_, i) => `chrome-${String(i).padStart(4, '0')}`)
      )
      recorder.sql.length = 0

      const suggestions = await service.getSuggestions('chrome', 10)

      // All 640 rows share the prefix. Before the fix every one of them was
      // loaded and exp()-scored; the row cap is what makes the keystroke cheap,
      // so assert on the statement the service actually issued rather than on
      // the trimmed result, which looked identical either way.
      const select = recorder.sql.find((text) => text.includes('query_completions'))
      expect(select).toBeDefined()
      expect(select).toMatch(/limit\s+\?/i)
      expect(suggestions).toHaveLength(10)
    })
  })

  it('honours a limit above the scan cap without truncating to it', async () => {
    await withService(async (service, client) => {
      await seed(
        client,
        Array.from({ length: 300 }, (_, i) => `chrome-${String(i).padStart(4, '0')}`)
      )

      const suggestions = await service.getSuggestions('chrome', 250)

      // max(limit, SCAN_LIMIT) — a caller asking for more than the cap must not
      // be silently cut back to 200.
      expect(suggestions).toHaveLength(250)
    })
  })

  it('still returns ordinary prefix matches', async () => {
    await withService(async (service, client) => {
      await seed(client, ['chrome', 'chromium', 'firefox'])

      const suggestions = await service.getSuggestions('chrom')

      expect(suggestions.map((s) => s.prefix).sort()).toEqual(['chrome', 'chromium'])
    })
  })
})
