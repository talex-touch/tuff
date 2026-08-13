import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SearchIndexService } from './search-index-service'

/**
 * lookupByKeywordPrefix built its pattern as `${prefix}%` from raw user text,
 * with no escaping and no ESCAPE clause — unlike the subsequence sibling. '%'
 * therefore reached SQLite as a wildcard, so typing it matched every keyword
 * row for the provider and the search returned unrelated apps as "prefix
 * matches" (#663). These run against a real SQLite file, not a mock, so the
 * assertions are about what the engine actually matches.
 */

const PROVIDER = 'app-provider'

async function withIndexService(
  run: (service: SearchIndexService, client: Client) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-like-'))
  let client: Client | undefined
  try {
    client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
    await client.execute(`
      CREATE TABLE keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL DEFAULT '',
        priority REAL NOT NULL DEFAULT 1.0
      )
    `)
    await client.execute(`
      CREATE TABLE search_index_meta (
        provider_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        keyword_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (provider_id, item_id)
      )
    `)
    const service = new SearchIndexService(drizzle(client) as never, {
      directMode: true,
      initializationMode: 'writer'
    })
    await service.warmup()
    await run(service, client)
  } finally {
    client?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function seed(client: Client, keywords: string[]): Promise<void> {
  for (const keyword of keywords) {
    await client.execute({
      sql: 'INSERT INTO keyword_mappings (keyword, item_id, provider_id, priority) VALUES (?, ?, ?, 1.0)',
      args: [keyword, `item:${keyword}`, PROVIDER]
    })
  }
}

const prefixOf = (rows: Array<{ itemId: string; keyword: string; priority: number }>): string[] =>
  rows.map((row) => row.keyword).sort()

describe('lookupByKeywordPrefix LIKE escaping', () => {
  it('treats % as a literal instead of matching every keyword', async () => {
    await withIndexService(async (service, client) => {
      await seed(client, ['chrome', 'firefox', 'safari', '100% orange juice'])

      const rows = await service.lookupByKeywordPrefix(PROVIDER, '%')

      // Before the fix the pattern was '%%', which matches all four rows.
      expect(prefixOf(rows)).toEqual([])
    })
  })

  it('matches a literal % where one genuinely starts the keyword', async () => {
    await withIndexService(async (service, client) => {
      await seed(client, ['%battery', 'battery'])

      const rows = await service.lookupByKeywordPrefix(PROVIDER, '%b')

      expect(prefixOf(rows)).toEqual(['%battery'])
    })
  })

  it('treats _ as a literal rather than a single-character wildcard', async () => {
    await withIndexService(async (service, client) => {
      await seed(client, ['abc', 'a1c', 'a_c'])

      const rows = await service.lookupByKeywordPrefix(PROVIDER, 'a_c')

      // Before the fix 'a_c' also matched 'abc' and 'a1c'.
      expect(prefixOf(rows)).toEqual(['a_c'])
    })
  })

  it('treats a backslash as a literal, not as an escape introducer', async () => {
    await withIndexService(async (service, client) => {
      await seed(client, ['back\\slash', 'backslash'])

      const rows = await service.lookupByKeywordPrefix(PROVIDER, 'back\\')

      expect(prefixOf(rows)).toEqual(['back\\slash'])
    })
  })

  it('still returns ordinary prefix matches', async () => {
    await withIndexService(async (service, client) => {
      await seed(client, ['chrome', 'chromium', 'firefox'])

      const rows = await service.lookupByKeywordPrefix(PROVIDER, 'chrom')

      expect(prefixOf(rows)).toEqual(['chrome', 'chromium'])
    })
  })
})
