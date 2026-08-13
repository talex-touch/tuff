import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SEARCH_KEYWORD_SCHEMA_VERSION,
  expandSearchLookupVariants
} from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'
import type { SearchIndexItem, SearchIndexKeyword } from './search-index-service'
import { SearchIndexService } from './search-index-service'

type SearchIndexHarness = Omit<
  SearchIndexService,
  'buildKeywordHash' | 'initialized' | 'prepareDocument'
> & {
  initialized: boolean
  buildKeywordHash: (entries: SearchIndexKeyword[]) => string
  prepareDocument: (item: SearchIndexItem) => Promise<{
    keywordEntries: SearchIndexKeyword[]
    keywordHash: string
  }>
}

function createServiceHarness(): SearchIndexHarness {
  return new SearchIndexService(
    {} as ConstructorParameters<typeof SearchIndexService>[0]
  ) as unknown as SearchIndexHarness
}

async function prepareKeywords(item: SearchIndexItem): Promise<string[]> {
  const doc = await createServiceHarness().prepareDocument(item)
  return doc.keywordEntries.map((entry) => entry.value)
}

async function withIndexService(
  run: (service: SearchIndexService) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-charset-'))
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
    await run(service)
  } finally {
    client?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function lookupItemIds(
  service: SearchIndexService,
  providerId: string,
  term: string
): Promise<string[]> {
  const result = await service.lookupByKeywords(providerId, expandSearchLookupVariants(term), 200)
  const itemIds = new Set<string>()
  for (const entries of result.values()) {
    for (const entry of entries) itemIds.add(entry.itemId)
  }
  return Array.from(itemIds)
}

describe('SearchIndexService keyword charset', () => {
  it('keeps keywords from scripts the old veto dropped', async () => {
    const keywords = await prepareKeywords({
      itemId: 'file:/tmp/i18n',
      providerId: 'file-provider',
      type: 'file',
      name: 'ひらがな',
      keywords: [
        { value: '한글', priority: 1.1 },
        { value: 'Привет', priority: 1.1 },
        { value: 'ملف', priority: 1.1 }
      ]
    })

    expect(keywords).toContain('ひらがな')
    expect(keywords).toContain('한글')
    expect(keywords).toContain('привет')
    expect(keywords).toContain('ملف')
  })

  it('cleans separators instead of dropping the whole keyword', async () => {
    const keywords = await prepareKeywords({
      itemId: 'app:/Applications/7-Zip.app',
      providerId: 'app-provider',
      type: 'application',
      name: '7-Zip File Manager',
      path: '/Applications/7-Zip.app',
      extension: '.app',
      aliases: [{ value: 'vs code', priority: 1.4 }]
    })

    // full title, multi-word alias, dotted extension and full path all survive
    expect(keywords).toContain('7 zip file manager')
    expect(keywords).toContain('vs code')
    expect(keywords).toContain('app')
    expect(keywords).toContain('applications 7 zip app')
  })

  it('keeps spaced keywords out of the n-gram sources', async () => {
    const doc = await createServiceHarness().prepareDocument({
      itemId: 'app:/Applications/Visual Studio Code.app',
      providerId: 'app-provider',
      type: 'application',
      name: 'Visual Studio Code',
      path: '/Applications/Visual Studio Code.app'
    })
    const ngrams = doc.keywordEntries
      .map((entry) => entry.value)
      .filter((value) => value.startsWith('ng:'))

    expect(ngrams.length).toBeGreaterThan(0)
    expect(ngrams.filter((value) => value.includes(' '))).toEqual([])
  })

  it('stores a diacritic-folded twin for accented keywords', async () => {
    const keywords = await prepareKeywords({
      itemId: 'file:/tmp/resume',
      providerId: 'file-provider',
      type: 'file',
      name: 'Résumé',
      keywords: [{ value: 'café', priority: 1.1 }]
    })

    expect(keywords).toContain('résumé')
    expect(keywords).toContain('resume')
    expect(keywords).toContain('café')
    expect(keywords).toContain('cafe')
  })

  it('keeps generating pinyin keywords for Han titles', async () => {
    const keywords = await prepareKeywords({
      itemId: 'app:/Applications/Chat.app',
      providerId: 'app-provider',
      type: 'application',
      name: '聊天'
    })

    expect(keywords).toContain('聊天')
    expect(keywords).toContain('liaotian')
    expect(keywords).toContain('lt')
  })

  it('stops emitting a single-character keyword for multi-word titles', async () => {
    const multiWord = await prepareKeywords({
      itemId: 'file:/tmp/my-document.txt',
      providerId: 'file-provider',
      type: 'file',
      name: 'My Document'
    })

    expect(multiWord).toContain('md')
    expect(multiWord).not.toContain('m')

    const singleWord = await prepareKeywords({
      itemId: 'file:/tmp/notes.txt',
      providerId: 'file-provider',
      type: 'file',
      name: 'Notes'
    })

    expect(singleWord).toContain('n')
  })

  it('folds the keyword schema version into the item hash', () => {
    const service = createServiceHarness()
    const versioned = createHash('sha1')
      .update(`schema:${SEARCH_KEYWORD_SCHEMA_VERSION}`)
      .digest('hex')

    expect(service.buildKeywordHash([])).toBe(versioned)
    expect(service.buildKeywordHash([])).not.toBe(createHash('sha1').update('').digest('hex'))
  })

  it('round-trips accented names through both spellings', async () => {
    await withIndexService(async (service) => {
      await service.indexItems([
        {
          itemId: 'file:/tmp/café.pdf',
          providerId: 'file-provider',
          type: 'file',
          name: 'café.pdf',
          keywords: [{ value: 'café', priority: 1.1 }]
        }
      ])

      await expect(lookupItemIds(service, 'file-provider', 'café')).resolves.toContain(
        'file:/tmp/café.pdf'
      )
      await expect(lookupItemIds(service, 'file-provider', 'cafe')).resolves.toContain(
        'file:/tmp/café.pdf'
      )
    })
  })

  it('reaches a spaced alias through the full cleaned query', async () => {
    await withIndexService(async (service) => {
      await service.indexItems([
        {
          itemId: 'app:/Applications/Visual Studio Code.app',
          providerId: 'app-provider',
          type: 'application',
          name: 'Visual Studio Code',
          aliases: [{ value: 'vs code', priority: 1.4 }]
        }
      ])

      await expect(lookupItemIds(service, 'app-provider', 'vs code')).resolves.toContain(
        'app:/Applications/Visual Studio Code.app'
      )
      await expect(lookupItemIds(service, 'app-provider', 'visual studio code')).resolves.toContain(
        'app:/Applications/Visual Studio Code.app'
      )
    })
  })

  it('matches kana and hangul items through FTS', async () => {
    await withIndexService(async (service) => {
      await service.indexItems([
        {
          itemId: 'file:/tmp/ひらがな.txt',
          providerId: 'file-provider',
          type: 'file',
          name: 'ひらがな.txt'
        },
        {
          itemId: 'file:/tmp/한글.txt',
          providerId: 'file-provider',
          type: 'file',
          name: '한글.txt'
        }
      ])

      await expect(service.search('file-provider', 'ひらがな')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:/tmp/ひらがな.txt' })
      ])
      await expect(service.search('file-provider', '한글')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:/tmp/한글.txt' })
      ])
    })
  })

  it('quotes FTS tokens so query text cannot reach MATCH syntax', async () => {
    await withIndexService(async (service) => {
      await service.indexItems([
        {
          itemId: 'file:/tmp/annual.txt',
          providerId: 'file-provider',
          type: 'file',
          name: 'annual report'
        }
      ])

      await expect(service.search('file-provider', 'annual" OR "report')).resolves.toEqual([])
      await expect(service.search('file-provider', 'annual OR report')).resolves.toEqual([])
      await expect(service.search('file-provider', 'annual NEAR( report')).resolves.toEqual([])
      await expect(service.search('file-provider', 'annual report')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:/tmp/annual.txt' })
      ])
    })
  })
})
