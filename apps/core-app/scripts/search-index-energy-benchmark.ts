import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import type { SearchIndexItem } from '../src/main/modules/box-tool/search-engine/search-index-service'

const count = Number(process.argv[2] ?? 100_000)
const repeats = Number(process.argv[3] ?? 3)
const coldCount = Number(process.argv[5] ?? 20)
if (
  !Number.isSafeInteger(count) ||
  count < 100 ||
  !Number.isSafeInteger(repeats) ||
  repeats < 1 ||
  !Number.isSafeInteger(coldCount) ||
  coldCount < 1
) {
  throw new Error(
    'Usage: tsx scripts/search-index-energy-benchmark.ts <rows >= 100> <repeats> [module path] [cold items]'
  )
}

async function main(): Promise<void> {
  const { SearchIndexService } = await import(
    process.argv[4]
      ? pathToFileURL(resolve(process.argv[4])).href
      : '../src/main/modules/box-tool/search-engine/search-index-service'
  )
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-index-energy-bench-'))
    const client = createClient({ url: `file:${join(directory, 'index.db')}` })
    try {
      await client.execute('PRAGMA journal_mode=WAL')
      await client.execute(`
      CREATE TABLE keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL DEFAULT '', priority REAL NOT NULL DEFAULT 1
      )
    `)
      const service = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      await client.execute({
        sql: `
        WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n < ?)
        INSERT INTO search_index(item_id, provider, type, title, title_compact, keywords, tags, path, content)
        SELECT 'file:' || n, 'file-provider', 'file', 'fixture' || n, 'fixture' || n,
          '', '', '/documents/fixture' || n || '.txt', '' FROM sequence
      `,
        args: [count]
      })
      await client.execute(`
      INSERT INTO search_index_meta(provider_id, item_id, keyword_hash)
      SELECT provider, item_id, '' FROM search_index
    `)
      const items: SearchIndexItem[] = Array.from({ length: 20 }, (_, index) => ({
        itemId: `file:${index + 1}`,
        providerId: 'file-provider',
        type: 'file',
        name: `energyprobe${index}end`,
        path: `/documents/fixture${index + 1}.txt`
      }))
      const results: Array<{ phase: string; wallMs: number; cpuMs: number }> = []
      const measure = async (phase: string, operation: () => Promise<unknown>): Promise<void> => {
        const cpu = process.cpuUsage()
        const started = performance.now()
        await operation()
        const elapsedCpu = process.cpuUsage(cpu)
        results.push({
          phase,
          wallMs: performance.now() - started,
          cpuMs: (elapsedCpu.user + elapsedCpu.system) / 1000
        })
      }
      await measure('first-update-including-rowid-discovery', () =>
        service.applyProviderItems('file-provider', items)
      )
      await measure('unchanged-update', () => service.applyProviderItems('file-provider', items))
      await measure('changed-update', () =>
        service.applyProviderItems(
          'file-provider',
          items.map((item) => ({ ...item, content: 'newbody' }))
        )
      )
      const coldItems = Array.from({ length: coldCount }, (_, index) => ({
        ...items[index % items.length],
        itemId: `file:${count + index + 1}`,
        name: `coldprobe${index}end`
      }))
      await measure('cold-insert', () => service.applyProviderItems('file-provider', coldItems))
      const searchTimes: number[] = []
      for (let query = 0; query < 40; query += 1) {
        const started = performance.now()
        const found = await service.search('file-provider', `energyprobe${query % 20}end`)
        if (found.length !== 1) throw new Error('SEARCH_RESULT_MISMATCH')
        searchTimes.push(performance.now() - started)
      }
      await measure('delete', () =>
        service.removeProviderItems(
          'file-provider',
          items.map((item) => item.itemId)
        )
      )
      const remaining = await client.execute('SELECT count(*) AS count FROM search_index')
      const expectedCount = count + coldItems.length - items.length
      if (Number(remaining.rows[0]?.count) !== expectedCount) {
        throw new Error('INDEX_COUNT_MISMATCH')
      }
      searchTimes.sort((left, right) => left - right)
      console.log(
        JSON.stringify({
          repeat: repeat + 1,
          rows: count,
          coldItems: coldCount,
          results,
          searchMedianMs: searchTimes[Math.floor(searchTimes.length / 2)],
          searchP95Ms: searchTimes[Math.ceil(searchTimes.length * 0.95) - 1],
          remaining: expectedCount
        })
      )
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
