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
  it('recreates the derived FTS table when search_index metadata is unreadable', async () => {
    const db = createMockDb({ tableInfoError: new Error('disk I/O error'), masterReadable: true })
    const service = new SearchIndexService(db as never)

    await service.warmup()

    expect(service.didMigrate).toBe(true)
    expect(db.all).toHaveBeenCalledTimes(2)
    expect(db.runQueries).toContain('DROP TABLE IF EXISTS search_index')
    expect(
      db.runQueries.some((query) =>
        query.includes('CREATE VIRTUAL TABLE IF NOT EXISTS search_index')
      )
    ).toBe(true)
  })

  it('does not auto-repair when primary database metadata is unreadable', async () => {
    const db = createMockDb({ tableInfoError: new Error('disk I/O error'), masterReadable: false })
    const service = new SearchIndexService(db as never)

    await expect(service.warmup()).rejects.toThrow('disk I/O error')

    expect(service.didMigrate).toBe(false)
    expect(db.run).not.toHaveBeenCalled()
  })
})
