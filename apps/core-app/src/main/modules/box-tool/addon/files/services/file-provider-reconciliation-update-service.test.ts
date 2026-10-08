import { describe, expect, it } from 'vitest'
import { FileProviderReconciliationUpdateService } from './file-provider-reconciliation-update-service'

const updates = Array.from({ length: 21 }, (_, id) => ({ id, name: `updated-${id}` }))

describe('reconciliation updates', () => {
  it('counts only surviving rows and does not begin the next bounded slice before publication', async () => {
    const rows = new Map(updates.filter((row) => row.id !== 9).map((row) => [row.id, 'old']))
    const entered = Promise.withResolvers<void>()
    const published = Promise.withResolvers<void>()
    const service = new FileProviderReconciliationUpdateService<
      { id: number; name: string },
      undefined
    >({
      persistAndPublish: async (records) => {
        if (records.length > 10) throw new Error('transaction exceeds source slice limit')
        let updatedCount = 0
        for (const record of records) {
          if (!rows.has(record.id)) continue
          rows.set(record.id, record.name)
          updatedCount += 1
        }
        if (records[0].id === 0) {
          entered.resolve()
          await published.promise
        }
        return { updatedCount }
      }
    })
    const operation = service.execute(updates, undefined)
    try {
      await entered.promise
      expect(rows.get(8)).toBe('updated-8')
      expect(rows.get(10)).toBe('old')
      published.resolve()
      expect(await operation).toEqual({ updatedCount: 20 })
      expect([...rows.entries()]).toEqual(
        updates.filter((row) => row.id !== 9).map((row) => [row.id, row.name])
      )
    } finally {
      published.resolve()
      await operation
    }
  })

  it('leaves later rows unchanged when a prior slice fails', async () => {
    const rows = new Map(updates.map((row) => [row.id, 'old']))
    const failure = new Error('second slice failed')
    const service = new FileProviderReconciliationUpdateService<
      { id: number; name: string },
      undefined
    >({
      persistAndPublish: async (records) => {
        if (records[0].id === 10) throw failure
        for (const record of records) rows.set(record.id, record.name)
        return { updatedCount: records.length }
      }
    })
    await expect(service.execute(updates, undefined)).rejects.toBe(failure)
    expect([...rows.entries()]).toEqual(
      updates.map((row) => [row.id, row.id < 10 ? row.name : 'old'])
    )
  })
})
