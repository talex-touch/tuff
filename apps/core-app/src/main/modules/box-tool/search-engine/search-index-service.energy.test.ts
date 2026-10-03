import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SearchIndexService, type SearchIndexItem } from './search-index-service'

async function withIndex(
  run: (client: Client, service: SearchIndexService, queries: string[]) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-index-energy-'))
  const client = createClient({ url: `file:${join(directory, 'index.db')}` })
  const queries: string[] = []
  try {
    await client.execute(`
      CREATE TABLE keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL DEFAULT '', priority REAL NOT NULL DEFAULT 1
      )
    `)
    const service = new SearchIndexService(
      drizzle(client, { logger: { logQuery: (query) => queries.push(query) } }) as never,
      { directMode: true, initializationMode: 'writer' }
    )
    await service.warmup()
    await run(client, service, queries)
  } finally {
    client.close()
    await rm(directory, { recursive: true, force: true })
  }
}

const document: SearchIndexItem = {
  itemId: 'file:report',
  providerId: 'file-provider',
  type: 'file',
  name: 'quarterly report',
  path: '/documents/report.txt',
  content: 'original body',
  tags: ['finance'],
  keywords: [{ value: 'budget', priority: 1 }]
}

describe('SearchIndexService low-work document mutations', () => {
  it('does not rewrite unchanged FTS documents, but still updates keyword priorities', async () => {
    await withIndex(async (client, service, queries) => {
      await service.applyProviderItems(document.providerId, [
        document,
        { ...document, itemId: 'file:other', name: 'other report' }
      ])
      const before = await client.execute(
        "SELECT rowid FROM search_index WHERE item_id = 'file:report'"
      )
      queries.length = 0

      await service.applyProviderItems(document.providerId, [
        { ...document, keywords: [{ value: 'budget', priority: 2 }] }
      ])

      const ftsWrites = queries.filter((query) =>
        /(?:DELETE FROM|INSERT INTO|UPDATE) search_index(?:\s|\()/i.test(query)
      )
      expect(ftsWrites).toEqual([])
      const after = await client.execute(
        "SELECT rowid FROM search_index WHERE item_id = 'file:report'"
      )
      expect(after.rows).toEqual(before.rows)
      const keywords = await service.lookupByKeywords(document.providerId, ['budget'])
      expect(keywords.get('budget')).toEqual(
        expect.arrayContaining([expect.objectContaining({ itemId: document.itemId, priority: 2 })])
      )
      await expect(service.search(document.providerId, 'original')).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ itemId: document.itemId })])
      )
    })
  })

  it('replaces changed title, path, type, tags and content', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await service.applyProviderItems(document.providerId, [
        {
          ...document,
          name: 'replacement title',
          path: '/archive/replacement.txt',
          type: 'archive',
          tags: ['replacementtag'],
          content: 'replacementbody'
        }
      ])
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([])
      for (const query of ['replacement', 'replacementtag', 'replacementbody']) {
        await expect(service.search(document.providerId, query)).resolves.toEqual([
          expect.objectContaining({ itemId: document.itemId })
        ])
      }
      const stored = await client.execute(
        "SELECT type, path FROM search_index WHERE item_id = 'file:report'"
      )
      expect(stored.rows).toEqual([{ type: 'archive', path: '/archive/replacement.txt' }])
    })
  })

  it('does not mistake an unchanged keyword hash for unchanged document content', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      const before = await client.execute('SELECT keyword_hash FROM search_index_meta')
      await service.applyProviderItems(document.providerId, [
        { ...document, type: 'archive', tags: ['replacementtag'], content: 'replacementbody' }
      ])
      const after = await client.execute('SELECT keyword_hash FROM search_index_meta')
      expect(after.rows).toEqual(before.rows)
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([])
      await expect(service.search(document.providerId, 'replacementbody')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await expect(service.search(document.providerId, 'replacementtag')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })

  it('canonicalizes legacy duplicates without meta and preserves another provider', async () => {
    await withIndex(async (client, service) => {
      await client.execute(`
        INSERT INTO search_index(item_id, provider, type, title, content)
        VALUES ('file:report', 'file-provider', 'file', 'legacy', 'legacybody'),
          ('file:report', 'file-provider', 'file', 'legacy', 'legacybody'),
          ('file:report', 'other-provider', 'file', 'other', 'otherbody')
      `)
      await service.applyProviderItems(document.providerId, [document])
      await expect(service.countByProvider(document.providerId)).resolves.toBe(1)
      await expect(service.search(document.providerId, 'legacybody')).resolves.toEqual([])
      await expect(
        service.removeProviderItems(document.providerId, [document.itemId])
      ).resolves.toBe(1)
      await expect(service.search('other-provider', 'otherbody')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })

  it('deletes every legacy duplicate even with missing metadata', async () => {
    await withIndex(async (client, service) => {
      await client.execute(`
        INSERT INTO search_index(item_id, provider, type, title)
        VALUES ('file:report', 'file-provider', 'file', 'legacy'),
          ('file:report', 'file-provider', 'file', 'legacy')
      `)
      await expect(
        service.removeProviderItems(document.providerId, [document.itemId])
      ).resolves.toBe(2)
      await expect(service.search(document.providerId, 'legacy')).resolves.toEqual([])
    })
  })

  it('reads actual content after an out-of-band policy clear', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await client.execute("UPDATE search_index SET content = '' WHERE provider = 'file-provider'")
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([])
      await service.applyProviderItems(document.providerId, [document])
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })

  it('rediscovers rows written by a legacy writer on restart', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await client.execute('DELETE FROM search_index')
      await client.execute(`
        INSERT INTO search_index(item_id, provider, type, title, content)
        VALUES ('file:report', 'other-provider', 'file', 'other', 'otherbody'),
          ('file:report', 'file-provider', 'file', 'legacy', 'legacybody')
      `)
      const restarted = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await restarted.applyProviderItems(document.providerId, [document])
      await expect(restarted.search(document.providerId, 'legacybody')).resolves.toEqual([])
      await expect(restarted.search(document.providerId, 'original')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await expect(restarted.search('other-provider', 'otherbody')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })

  it('rolls back rowid mappings and retries an interrupted document batch', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await client.execute(`
        CREATE TRIGGER reject_keyword BEFORE INSERT ON keyword_mappings
        WHEN NEW.keyword = 'rejectme' BEGIN SELECT RAISE(ABORT, 'injected failure'); END
      `)
      const changed = {
        ...document,
        content: 'replacementbody',
        keywords: [{ value: 'rejectme', priority: 1 }]
      }
      await expect(
        service.applyProviderItems(document.providerId, [changed])
      ).rejects.toMatchObject({
        cause: { message: expect.stringContaining('injected failure') }
      })
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await expect(service.search(document.providerId, 'replacementbody')).resolves.toEqual([])
      await client.execute('DROP TRIGGER reject_keyword')
      await service.applyProviderItems(document.providerId, [changed])
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([])
      await expect(service.search(document.providerId, 'replacementbody')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await expect(service.countByProvider(document.providerId)).resolves.toBe(1)
    })
  })

  it('uses indexed identity lookup and FTS rowid constraints for item deletion', async () => {
    await withIndex(async (client, service, queries) => {
      await service.applyProviderItems(document.providerId, [document])
      queries.length = 0
      await service.removeProviderItems(document.providerId, [document.itemId])
      const deletion = queries.find((query) =>
        /DELETE FROM search_index WHERE rowid IN/i.test(query)
      )
      expect(deletion).toBeDefined()
      const plan = await client.execute({
        sql: `EXPLAIN QUERY PLAN ${deletion}`,
        args: [document.providerId, document.itemId, document.providerId, document.itemId]
      })
      const details = plan.rows.map((row) => String(row.detail))
      expect(
        details.some((detail) => detail.includes('idx_search_index_rowids_provider_item'))
      ).toBe(true)
      expect(details.some((detail) => /VIRTUAL TABLE INDEX \d+:=/.test(detail))).toBe(true)
    })
  })

  it('keeps insert rowids lossless beyond the JavaScript safe-integer range', async () => {
    await withIndex(async (client, service) => {
      await client.execute(`
        INSERT INTO search_index(rowid, item_id, provider, type, title)
        VALUES (9007199254740993, 'high-row', 'other-provider', 'file', 'untouched')
      `)
      await service.applyProviderItems(document.providerId, [document])
      const stored = await client.execute(
        "SELECT CAST(fts_rowid AS TEXT) AS id FROM search_index_rowids WHERE provider_id = 'file-provider'"
      )
      expect(stored.rows).toEqual([{ id: '9007199254740994' }])
      await service.applyProviderItems(document.providerId, [
        { ...document, content: 'changedbody' }
      ])
      await expect(service.search(document.providerId, 'changedbody')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await service.removeProviderItems(document.providerId, [document.itemId])
      await expect(service.search('other-provider', 'untouched')).resolves.toEqual([
        expect.objectContaining({ itemId: 'high-row' })
      ])
    })
  })

  it('retries first-use discovery after its transaction fails', async () => {
    await withIndex(async (client, service) => {
      await client.execute(`
        INSERT INTO search_index(item_id, provider, type, title)
        VALUES ('file:report', 'file-provider', 'file', 'legacy')
      `)
      await client.execute(`
        CREATE TRIGGER reject_discovery BEFORE INSERT ON search_index_rowids
        BEGIN SELECT RAISE(ABORT, 'discovery failure'); END
      `)
      await expect(
        service.applyProviderItems(document.providerId, [document])
      ).rejects.toMatchObject({
        cause: { message: expect.stringContaining('discovery failure') }
      })
      await client.execute('DROP TRIGGER reject_discovery')
      await service.applyProviderItems(document.providerId, [document])
      await expect(service.countByProvider(document.providerId)).resolves.toBe(1)
      await expect(service.search(document.providerId, 'legacy')).resolves.toEqual([])
      await expect(service.search(document.providerId, 'original')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })

  it('does not delete a reused rowid after whole-index maintenance clears FTS', async () => {
    await withIndex(async (client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await client.execute('DELETE FROM search_index')
      await service.applyProviderItems('other-provider', [
        { ...document, providerId: 'other-provider', name: 'untouched' }
      ])
      await service.removeProviderItems(document.providerId, [document.itemId])
      await expect(service.search('other-provider', 'untouched')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
      await service.applyProviderItems(document.providerId, [document])
      await expect(service.countByProvider(document.providerId)).resolves.toBe(1)
    })
  })

  it('never issues a delete for cold inserts after first-use discovery', async () => {
    await withIndex(async (_client, service, queries) => {
      await service.applyProviderItems(document.providerId, [document])
      queries.length = 0
      await service.applyProviderItems(document.providerId, [
        { ...document, itemId: 'file:new', name: 'new report' }
      ])
      expect(queries.some((query) => /DELETE FROM search_index(?:\s|\()/i.test(query))).toBe(false)
      expect(
        queries.some((query) => /SELECT rowid, provider, item_id FROM search_index/i.test(query))
      ).toBe(false)
      const lookup = queries.find((query) => query.includes('LEFT JOIN search_index AS indexed'))
      expect(lookup).toBeDefined()
    })
  })

  it('resets derived addresses after the public repair recreates FTS', async () => {
    await withIndex(async (_client, service) => {
      await service.applyProviderItems(document.providerId, [document])
      await service.repair()
      await service.applyProviderItems('other-provider', [
        { ...document, providerId: 'other-provider', name: 'untouched' }
      ])
      await service.applyProviderItems(document.providerId, [document])
      await service.removeProviderItems(document.providerId, [document.itemId])
      await expect(service.search('other-provider', 'untouched')).resolves.toEqual([
        expect.objectContaining({ itemId: document.itemId })
      ])
    })
  })
})
