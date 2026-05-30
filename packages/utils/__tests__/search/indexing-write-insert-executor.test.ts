import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteInsertExecutorService } from '../../search'

interface TestInsertRecord {
  path: string
}

describe('indexing-write-insert-executor-service', () => {
  it('persists records, dispatches inserted rows, and logs inserted count', async () => {
    const records: TestInsertRecord[] = [{ path: '/tmp/a.txt' }, { path: '/tmp/b.txt' }]
    const inserted = records.map((record, index) => ({ ...record, id: index + 1 }))
    const persist = vi.fn(async () => inserted)
    const dispatchInserted = vi.fn()
    const logDebug = vi.fn()
    const service = new IndexedWriteInsertExecutorService({
      persist,
      dispatchInserted,
      logDebug,
      successMessage: 'test insert completed'
    })

    await expect(service.execute(records)).resolves.toEqual(inserted)
    expect(persist).toHaveBeenCalledWith(records)
    expect(dispatchInserted).toHaveBeenCalledWith(inserted)
    expect(logDebug).toHaveBeenCalledWith('test insert completed', { inserted: 2 })
  })

  it('returns empty result without persisting empty input', async () => {
    const persist = vi.fn()
    const dispatchInserted = vi.fn()
    const service = new IndexedWriteInsertExecutorService<TestInsertRecord, TestInsertRecord>({
      persist,
      dispatchInserted,
      logDebug: vi.fn()
    })

    await expect(service.execute([])).resolves.toEqual([])
    expect(persist).not.toHaveBeenCalled()
    expect(dispatchInserted).not.toHaveBeenCalled()
  })
})
