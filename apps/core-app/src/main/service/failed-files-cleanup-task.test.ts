import { describe, expect, it, vi } from 'vitest'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../db/schema'
import { createFailedFilesCleanupTask } from './failed-files-cleanup-task'

type Db = LibSQLDatabase<typeof schema>

interface ReadDbMockOptions {
  rows: Array<{ id: number; path: string; lastError: string | null; updatedAt: Date }>
  compiled?: { sql: string; params: unknown[] }
}

/**
 * Minimal drizzle-shaped mock: select().from().innerJoin().where().limit() for
 * the failed-rows read, delete().where().toSQL() for split-on statement
 * compilation (never awaited — the statement executes on the worker).
 */
function createReadDbMock(options: ReadDbMockOptions): {
  db: Db
  limit: ReturnType<typeof vi.fn>
  deleteToSql: ReturnType<typeof vi.fn>
} {
  const limit = vi.fn(async () => options.rows)
  const deleteToSql = vi.fn(() => options.compiled ?? { sql: 'compiled-delete', params: [] })
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({ limit }))
        }))
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ toSQL: deleteToSql }))
    }))
  } as unknown as Db
  return { db, limit, deleteToSql }
}

function createPrimaryDbMock(): { db: Db; deleteWhere: ReturnType<typeof vi.fn> } {
  const deleteWhere = vi.fn(async () => undefined)
  const db = {
    delete: vi.fn(() => ({ where: deleteWhere }))
  } as unknown as Db
  return { db, deleteWhere }
}

const failedRows = [
  { id: 11, path: '/tmp/a.txt', lastError: 'boom', updatedAt: new Date(0) },
  { id: 12, path: '/tmp/b.txt', lastError: 'boom', updatedAt: new Date(0) },
  { id: 13, path: '/tmp/c.txt', lastError: 'boom', updatedAt: new Date(0) }
]

describe('failed-files-cleanup-task split routing', () => {
  it('split off: keeps the legacy per-id deletes on the primary connection', async () => {
    const read = createReadDbMock({ rows: failedRows })
    const primary = createPrimaryDbMock()
    const execSearchIndexWrite = vi.fn(async () => [])

    const task = createFailedFilesCleanupTask({
      getReadDb: () => read.db,
      getPrimaryDb: () => primary.db,
      isSearchSplitEnabled: () => false,
      execSearchIndexWrite
    })
    await task.execute()

    // Byte-identical legacy shape: one delete per failed file id.
    expect(primary.deleteWhere).toHaveBeenCalledTimes(failedRows.length)
    expect(execSearchIndexWrite).not.toHaveBeenCalled()
    expect(read.deleteToSql).not.toHaveBeenCalled()
  })

  it('split on: forwards ONE compiled delete through the worker writer', async () => {
    const compiled = { sql: 'DELETE FROM file_index_progress WHERE file_id IN (?, ?, ?)', params: [11, 12, 13] }
    const read = createReadDbMock({ rows: failedRows, compiled })
    const primary = createPrimaryDbMock()
    const execSearchIndexWrite = vi.fn(async () => [])

    const task = createFailedFilesCleanupTask({
      getReadDb: () => read.db,
      getPrimaryDb: () => primary.db,
      isSearchSplitEnabled: () => true,
      execSearchIndexWrite
    })
    await task.execute()

    expect(execSearchIndexWrite).toHaveBeenCalledTimes(1)
    expect(execSearchIndexWrite).toHaveBeenCalledWith(
      [{ sql: compiled.sql, args: compiled.params }],
      'single'
    )
    // The main thread never executes the delete itself (worker is the sole
    // writer of search-index.db); the builder is only used for compilation.
    expect(primary.deleteWhere).not.toHaveBeenCalled()
  })

  it('split on without a worker write path: fails closed before any delete', async () => {
    const read = createReadDbMock({ rows: failedRows })
    const primary = createPrimaryDbMock()

    const task = createFailedFilesCleanupTask({
      getReadDb: () => read.db,
      getPrimaryDb: () => primary.db,
      isSearchSplitEnabled: () => true
    })

    await expect(task.execute()).rejects.toThrow(
      'FAILED_FILES_CLEANUP_REQUIRES_SEARCH_INDEX_WRITER'
    )
    expect(primary.deleteWhere).not.toHaveBeenCalled()
  })

  it('no failed rows: performs no delete on either home', async () => {
    const read = createReadDbMock({ rows: [] })
    const primary = createPrimaryDbMock()
    const execSearchIndexWrite = vi.fn(async () => [])

    const task = createFailedFilesCleanupTask({
      getReadDb: () => read.db,
      getPrimaryDb: () => primary.db,
      isSearchSplitEnabled: () => true,
      execSearchIndexWrite
    })
    await task.execute()

    expect(execSearchIndexWrite).not.toHaveBeenCalled()
    expect(primary.deleteWhere).not.toHaveBeenCalled()
  })
})
