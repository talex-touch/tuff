import { describe, expect, it } from 'vitest'
import { FileProviderReconciliationInsertService } from './file-provider-reconciliation-insert-service'

const files = Array.from({ length: 21 }, (_, index) => ({
  path: `/root/${index}.txt`,
  name: `${index}.txt`,
  extension: '.txt',
  size: index,
  mtime: '2026-01-01T00:00:02.000Z',
  ctime: 1000
}))

describe('reconciliation inserts', () => {
  it('keeps transactions bounded and waits for publication before writing the next slice', async () => {
    const persisted: Array<{ path: string; mtime: number; ctime: number }> = []
    const entered = Promise.withResolvers<void>()
    const published = Promise.withResolvers<void>()
    const service = new FileProviderReconciliationInsertService<undefined>({
      persistAndPublish: async (records) => {
        if (records.length > 10) throw new Error('transaction exceeds source slice limit')
        const admitted = records.filter((record) => record.path !== '/root/6.txt')
        for (const record of admitted) {
          persisted.push({
            path: record.path,
            mtime: (record.mtime as Date).getTime(),
            ctime: (record.ctime as Date).getTime()
          })
        }
        if (records[0].path === '/root/0.txt') {
          entered.resolve()
          await published.promise
        }
        return { insertedCount: admitted.length }
      },
      emitProgress: () => undefined
    })
    const operation = service.execute(files, undefined)
    try {
      await entered.promise
      expect(persisted.map((row) => row.path)).toEqual(
        files
          .slice(0, 10)
          .filter((file) => file.path !== '/root/6.txt')
          .map((file) => file.path)
      )
      published.resolve()
      expect(await operation).toEqual({ insertedCount: 20 })
      expect(persisted).toEqual(
        files
          .filter((file) => file.path !== '/root/6.txt')
          .map((file) => ({
            path: file.path,
            mtime: Date.parse(file.mtime),
            ctime: 1000
          }))
      )
    } finally {
      published.resolve()
      await operation
    }
  })

  it('does not write later records or claim completion after a slice transaction fails', async () => {
    const persisted: string[] = []
    const failure = new Error('second slice failed')
    const service = new FileProviderReconciliationInsertService<undefined>({
      persistAndPublish: async (records) => {
        if (records[0].path === '/root/10.txt') throw failure
        persisted.push(...records.map((record) => record.path))
        return { insertedCount: records.length }
      },
      emitProgress: () => undefined
    })
    await expect(service.execute(files, undefined)).rejects.toBe(failure)
    expect(persisted).toEqual(files.slice(0, 10).map((file) => file.path))
  })
})
