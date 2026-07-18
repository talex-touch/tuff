import { describe, expect, it, vi } from 'vitest'
import { SearchIndexService } from './search-index-service'

function queryText(query: unknown): string {
  const chunks = (query as { queryChunks?: Array<{ value?: string[] }> }).queryChunks ?? []
  return chunks
    .flatMap((chunk) => chunk.value ?? [])
    .join('')
    .trim()
}

function createMockDb(input?: { tableInfoError?: Error; masterReadable?: boolean }) {
  const runQueries: string[] = []
  const all = vi.fn(async (query: unknown) => {
    const text = queryText(query)
    if (text.includes("pragma_table_xinfo('search_index')")) {
      if (input?.tableInfoError) throw input.tableInfoError
      return []
    }
    if (text.includes('sqlite_master')) {
      if (input?.masterReadable === false) {
        throw new Error('database metadata unreadable')
      }
      return [{ name: 'files' }]
    }
    return []
  })
  const run = vi.fn(async (query: unknown) => {
    runQueries.push(queryText(query))
  })

  return {
    all,
    run,
    runQueries
  }
}

describe('SearchIndexService schema repair', () => {
  it('uses the readiness gate to verify reader schema without issuing DDL', async () => {
    const readiness = { waitUntilReady: vi.fn(async () => undefined) }
    const db = {
      all: vi.fn(async () => [{ name: 'item_id' }, { name: 'provider' }, { name: 'content' }]),
      run: vi.fn(async () => undefined)
    }
    const service = new SearchIndexService(db as never, {
      initializationMode: 'reader',
      readiness
    })

    await service.warmup()

    expect(readiness.waitUntilReady).toHaveBeenCalledTimes(1)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('rejects search_index xinfo disk I/O failures without issuing repair DDL', async () => {
    const db = createMockDb({ tableInfoError: new Error('disk I/O error'), masterReadable: true })
    const service = new SearchIndexService(db as never)

    await expect(service.warmup()).rejects.toThrow('disk I/O error')

    expect(service.didMigrate).toBe(false)
    expect(db.all).toHaveBeenCalledTimes(1)
    expect(db.run).not.toHaveBeenCalled()
  })

  it('does not auto-repair when primary database metadata is unreadable', async () => {
    const db = createMockDb({ tableInfoError: new Error('disk I/O error'), masterReadable: false })
    const service = new SearchIndexService(db as never)

    await expect(service.warmup()).rejects.toThrow('disk I/O error')

    expect(service.didMigrate).toBe(false)
    expect(db.run).not.toHaveBeenCalled()
  })
})
