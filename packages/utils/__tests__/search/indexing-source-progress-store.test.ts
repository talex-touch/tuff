import { describe, expect, it, vi } from 'vitest'
import {
  expandIndexedSourceProgressPaths,
  filterIndexedSourceProgressPaths,
  IndexedSourceProgressStoreService,
  normalizeIndexedSourceProgressPaths,
  resolveIndexedSourceProgressStoreClearDecision
} from '../../search'

function createStore(options: {
  completedPaths?: string[]
  ensureReadyForUpsert?: (reason: string) => Promise<boolean>
  upsertCompletedPaths?: (paths: string[], completedAt: string) => Promise<number | void>
} = {}) {
  const loadCompletedPaths = vi.fn(async () => new Set(options.completedPaths ?? []))
  const deleteCompletedPaths = vi.fn(async () => undefined)
  const ensureReadyForUpsert = vi.fn(options.ensureReadyForUpsert ?? (async () => true))
  const upsertCompletedPaths = vi.fn(options.upsertCompletedPaths ?? (async () => undefined))

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

  it('sanitizes loaded completed paths before exposing progress state', async () => {
    const { service } = createStore({ completedPaths: ['/a', '/a', '', '   '] })

    await expect(service.getCompletedPaths()).resolves.toEqual(new Set(['/a']))
    await expect(service.summarizeRoots(['/a', '/b'])).resolves.toEqual({
      totalRoots: 1,
      pendingRoots: 1
    })
  })

  it('sanitizes caller-provided completed paths before summarizing progress state', async () => {
    const { service } = createStore()

    await expect(
      service.summarizeRoots(['/a', '/b'], new Set(['/a', '/a', '', '   ']))
    ).resolves.toEqual({
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

  it('ignores empty roots before summarizing pending state', async () => {
    const { service } = createStore({ completedPaths: ['/a'] })

    await expect(service.summarizeRoots(['/a', '', '   ', '/b'])).resolves.toEqual({
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

  it('ignores empty completed paths before delete', async () => {
    const { deleteCompletedPaths, service } = createStore()

    await expect(service.deletePaths(['/a', '', '   '])).resolves.toBe(1)
    expect(deleteCompletedPaths).toHaveBeenCalledWith(['/a'])
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

  it('uses adapter-provided upsert counts when available', async () => {
    const { service, upsertCompletedPaths } = createStore({
      upsertCompletedPaths: async () => 1
    })

    await expect(
      service.upsertPaths(['/a', '/b'], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 1
    })
    expect(upsertCompletedPaths).toHaveBeenCalledWith(['/a', '/b'], '2026-05-31T00:00:00.000Z')
  })

  it('normalizes invalid adapter-provided upsert counts', async () => {
    const { service } = createStore({
      upsertCompletedPaths: async () => Number.NaN
    })

    await expect(
      service.upsertPaths(['/a'], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 0
    })
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

  it('ignores empty completed paths before upsert', async () => {
    const { service, upsertCompletedPaths } = createStore()

    await expect(
      service.upsertPaths(['/a', '', '   '], '2026-05-31T00:00:00.000Z', 'progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 1
    })
    expect(upsertCompletedPaths).toHaveBeenCalledWith(['/a'], '2026-05-31T00:00:00.000Z')
  })
})

describe('indexed source progress path helpers', () => {
  it('normalizes and deduplicates progress paths', () => {
    expect(
      normalizeIndexedSourceProgressPaths(
        ['/Users/me/Documents', '/users/me/documents', '   ', '/Other'],
        (path) => path.trim().toLowerCase()
      )
    ).toEqual(['/users/me/documents', '/other'])
  })

  it('expands raw and normalized progress paths while preserving first-seen order', () => {
    expect(
      expandIndexedSourceProgressPaths(
        ['/Users/me/Documents', '/users/me/documents', '   '],
        (path) => path.trim().toLowerCase()
      )
    ).toEqual(['/Users/me/Documents', '/users/me/documents'])
  })

  it('can drop raw progress paths rejected by the normalizer during expansion', () => {
    expect(
      expandIndexedSourceProgressPaths(
        ['/Users/me/Documents', '/ignored'],
        (path) => (path === '/ignored' ? '' : path.toLowerCase()),
        { dropWhenNormalizedEmpty: true }
      )
    ).toEqual(['/Users/me/Documents', '/users/me/documents'])
  })

  it('filters progress paths by normalized value', () => {
    expect(
      filterIndexedSourceProgressPaths(
        ['/Users/me/Documents', '   ', '/Other'],
        (path) => path.trim().toLowerCase()
      )
    ).toEqual(['/Users/me/Documents', '/Other'])
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
