import { describe, expect, it, vi } from 'vitest'
import {
  IndexedSourceProgressStoreService,
  resolveIndexedSourceProgressStoreClearDecision
} from '../../search'

function createStore(options: {
  completedPaths?: string[]
  ensureReadyForUpsert?: (reason: string) => Promise<boolean>
} = {}) {
  const loadCompletedPaths = vi.fn(async () => new Set(options.completedPaths ?? []))
  const deleteCompletedPaths = vi.fn(async () => undefined)
  const ensureReadyForUpsert = vi.fn(options.ensureReadyForUpsert ?? (async () => true))
  const upsertCompletedPaths = vi.fn(async () => undefined)

  return {
    deleteCompletedPaths,
    ensureReadyForUpsert,
    loadCompletedPaths,
    service: new IndexedSourceProgressStoreService({
      loadCompletedPaths,
      deleteCompletedPaths,
      ensureReadyForUpsert,
      upsertCompletedPaths
    }),
    upsertCompletedPaths
  }
}

describe('IndexedSourceProgressStoreService', () => {
  it('summarizes pending roots from completed path state', async () => {
    const { service } = createStore({ completedPaths: ['/a'] })

    await expect(service.summarizeRoots(['/a', '/b'])).resolves.toEqual({
      totalRoots: 1,
      pendingRoots: 1
    })
  })

  it('marks all roots pending when the completed path store is unavailable', async () => {
    const { service } = createStore()

    await expect(
      service.summarizeRoots(['/a', '/b'], new Set(), { isStoreAvailable: false })
    ).resolves.toEqual({
      totalRoots: 0,
      pendingRoots: 2
    })
  })

  it('deduplicates watched roots before summarizing pending state', async () => {
    const { service } = createStore({ completedPaths: ['/a'] })

    await expect(service.summarizeRoots(['/a', '/a', '/b', '/b'])).resolves.toEqual({
      totalRoots: 1,
      pendingRoots: 1
    })
  })

  it('skips delete when no paths are provided', async () => {
    const { deleteCompletedPaths, service } = createStore()

    await expect(service.deletePaths([])).resolves.toBe(0)
    expect(deleteCompletedPaths).not.toHaveBeenCalled()
  })

  it('deletes completed paths through the injected store', async () => {
    const { deleteCompletedPaths, service } = createStore()

    await expect(service.deletePaths(['/a', '/b'])).resolves.toBe(2)
    expect(deleteCompletedPaths).toHaveBeenCalledWith(['/a', '/b'])
  })

  it('deduplicates completed paths before delete', async () => {
    const { deleteCompletedPaths, service } = createStore()

    await expect(service.deletePaths(['/a', '/a', '/b'])).resolves.toBe(2)
    expect(deleteCompletedPaths).toHaveBeenCalledWith(['/a', '/b'])
  })

  it('skips upsert when no paths are provided', async () => {
    const { ensureReadyForUpsert, service, upsertCompletedPaths } = createStore()

    await expect(
      service.upsertPaths([], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: false,
      ready: false,
      upserted: 0
    })
    expect(ensureReadyForUpsert).not.toHaveBeenCalled()
    expect(upsertCompletedPaths).not.toHaveBeenCalled()
  })

  it('gates completed path upsert on injected readiness', async () => {
    const { ensureReadyForUpsert, service, upsertCompletedPaths } = createStore({
      ensureReadyForUpsert: async () => false
    })

    await expect(
      service.upsertPaths(['/a'], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: false,
      upserted: 0
    })
    expect(ensureReadyForUpsert).toHaveBeenCalledWith('progress.upsert')
    expect(upsertCompletedPaths).not.toHaveBeenCalled()
  })

  it('upserts completed paths when ready', async () => {
    const { ensureReadyForUpsert, service, upsertCompletedPaths } = createStore()

    await expect(
      service.upsertPaths(['/a'], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 1
    })
    expect(ensureReadyForUpsert).toHaveBeenCalledWith('progress.upsert')
    expect(upsertCompletedPaths).toHaveBeenCalledWith(['/a'], '2026-05-31T00:00:00.000Z')
  })

  it('deduplicates completed paths before upsert', async () => {
    const { service, upsertCompletedPaths } = createStore()

    await expect(
      service.upsertPaths(['/a', '/a', '/b'], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 2
    })
    expect(upsertCompletedPaths).toHaveBeenCalledWith(
      ['/a', '/b'],
      '2026-05-31T00:00:00.000Z'
    )
  })
})

describe('resolveIndexedSourceProgressStoreClearDecision', () => {
  it('requests cleanup when completed progress rows exist', () => {
    expect(resolveIndexedSourceProgressStoreClearDecision(3)).toEqual({
      shouldClear: true,
      result: {
        cleared: true,
        rows: 3
      }
    })
  })

  it('returns a stable no-op reset result when no rows exist', () => {
    expect(resolveIndexedSourceProgressStoreClearDecision(0)).toEqual({
      shouldClear: false,
      result: {
        cleared: false,
        rows: 0
      }
    })
  })

  it('normalizes invalid row counts to a no-op reset result', () => {
    expect(resolveIndexedSourceProgressStoreClearDecision(undefined)).toEqual({
      shouldClear: false,
      result: {
        cleared: false,
        rows: 0
      }
    })
    expect(resolveIndexedSourceProgressStoreClearDecision(-1)).toEqual({
      shouldClear: false,
      result: {
        cleared: false,
        rows: 0
      }
    })
  })
})
