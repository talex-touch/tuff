import { describe, expect, it, vi } from 'vitest'
import { readStoredVector } from '../../../../../db/embedding-vector-codec'
import {
  FILE_EMBEDDING_BLOB_MIGRATION_VERSION,
  FileProviderEmbeddingBlobMigrationService,
  type FileEmbeddingBlobMigrationDeps,
  type FileEmbeddingBlobMigrationRow
} from './file-provider-embedding-blob-migration-service'

function makeService(
  rows: FileEmbeddingBlobMigrationRow[],
  {
    failFirstWrite = false,
    ...overrides
  }: Partial<FileEmbeddingBlobMigrationDeps> & {
    failFirstWrite?: boolean
  } = {}
) {
  let failNextWrite = failFirstWrite
  const stored = new Map<number, string | Uint8Array>(rows.map((row) => [row.id, row.embedding]))
  const deps: FileEmbeddingBlobMigrationDeps = {
    getAppliedVersion: vi.fn(async () => null),
    setAppliedVersion: vi.fn(async () => {}),
    isReady: () => true,
    // Same contract as the SQL: only rows that are still text, in id order.
    loadPage: async (afterId, limit) =>
      [...stored.entries()]
        .filter(([id, value]) => id > afterId && typeof value === 'string')
        .slice(0, limit)
        .map(([id, value]) => ({ id, embedding: value as string })),
    writePage: async (updates) => {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('SQLITE_BUSY')
      }
      for (const update of updates) {
        if (typeof stored.get(update.id) === 'string') stored.set(update.id, update.blob)
      }
    },
    waitForWriteCapacity: async () => {},
    logInfo: () => {},
    logWarn: () => {},
    ...overrides
  }
  return { service: new FileProviderEmbeddingBlobMigrationService(deps), deps, stored }
}

describe('FileProviderEmbeddingBlobMigrationService', () => {
  it('converts JSON vectors, keeps what each one decodes to, and records the version', async () => {
    const { service, deps, stored } = makeService([
      { id: 1, embedding: '[0.25,-0.5,1]' },
      { id: 2, embedding: '[1,2,3,4]' }
    ])

    await expect(service.run()).resolves.toMatchObject({ converted: 2, undecodable: 0, failed: 0 })

    expect(Array.from(readStoredVector(stored.get(1), 3)!)).toEqual([0.25, -0.5, 1])
    expect(Array.from(readStoredVector(stored.get(2), 4)!)).toEqual([1, 2, 3, 4])
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_EMBEDDING_BLOB_MIGRATION_VERSION)
  })

  it('leaves a row it cannot decode untouched and does not abort the rows after it', async () => {
    const { service, stored } = makeService([
      { id: 1, embedding: '{broken' },
      { id: 2, embedding: '[1,null]' },
      { id: 3, embedding: '[1e309,0]' },
      { id: 4, embedding: '[]' },
      { id: 5, embedding: '[0.5,0.5]' }
    ])

    await expect(service.run()).resolves.toMatchObject({ converted: 1, undecodable: 4, failed: 0 })

    expect([1, 2, 3, 4].map((id) => stored.get(id))).toEqual([
      '{broken',
      '[1,null]',
      '[1e309,0]',
      '[]'
    ])
    expect(stored.get(5)).toBeInstanceOf(Uint8Array)
  })

  it('walks more than one page', async () => {
    const rows = Array.from({ length: 450 }, (_, index) => ({
      id: index + 1,
      embedding: `[${index},1]`
    }))
    const { service, stored } = makeService(rows)

    await expect(service.run()).resolves.toMatchObject({ scanned: 450, converted: 450 })

    expect([...stored.values()].every((value) => value instanceof Uint8Array)).toBe(true)
  })

  it('does not record the version when a page fails to write, and a rerun finishes the rest', async () => {
    const rows = [
      ...Array.from({ length: 200 }, (_, index) => ({ id: index + 1, embedding: '[1,2]' })),
      { id: 201, embedding: '[3,4]' }
    ]
    const { service, deps, stored } = makeService(rows, { failFirstWrite: true })

    await expect(service.run()).resolves.toMatchObject({ converted: 1, failed: 200 })
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()

    await expect(service.run()).resolves.toMatchObject({ converted: 200, failed: 0 })
    expect(deps.setAppliedVersion).toHaveBeenCalledTimes(1)
    expect([...stored.values()].every((value) => value instanceof Uint8Array)).toBe(true)
  })

  it('skips without reading when the version is already recorded', async () => {
    const loadPage = vi.fn(async () => [])
    const { service } = makeService([], {
      getAppliedVersion: async () => FILE_EMBEDDING_BLOB_MIGRATION_VERSION,
      loadPage
    })

    await expect(service.run()).resolves.toMatchObject({ status: 'skipped' })
    expect(loadPage).not.toHaveBeenCalled()
  })

  it('does not record the version while the write path is unavailable', async () => {
    const { service, deps } = makeService([{ id: 1, embedding: '[1]' }], { isReady: () => false })

    await expect(service.run()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'unavailable'
    })
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })
})
