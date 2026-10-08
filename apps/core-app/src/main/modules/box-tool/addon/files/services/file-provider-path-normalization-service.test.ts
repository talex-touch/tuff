import { describe, expect, it, vi } from 'vitest'
import {
  FILE_PATH_NORMALIZATION_VERSION,
  FileProviderPathNormalizationService,
  planFilePathNormalization,
  shouldDeferReconciliationForPathNormalization,
  shouldRunPathNormalizationOnPlatform,
  type FilePathNormalizationDeletion,
  type FilePathNormalizationRewrite,
  type FilePathNormalizationRow
} from './file-provider-path-normalization-service'

/** "café.txt" written decomposed (e + U+0301) — the form macOS readdir used
 * to hand us, and the reason two rows could describe one file. */
const NFD_PATH = '/home/me/cafe\u0301.txt'
const NFC_PATH = NFD_PATH.normalize('NFC')

function row(id: number, path: string, lastIndexedAt: Date): FilePathNormalizationRow {
  return { id, path, lastIndexedAt }
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    getAppliedVersion: vi.fn(async () => null),
    setAppliedVersion: vi.fn(async () => {}),
    loadRowsPage: vi.fn(async () => []),
    loadRowsByPaths: vi.fn(async () => []),
    rewritePath: vi.fn(async () => {}),
    removeIndexedFile: vi.fn(async () => true),
    removeIndexEntry: vi.fn(async () => {}),
    reindexRows: vi.fn(async () => {}),
    yieldBetweenPages: vi.fn(async () => {}),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    ...overrides
  }
}

/** Serves one page of rows, then an empty page to end the pass. */
function pagedRows(...pages: FilePathNormalizationRow[][]) {
  const queue = [...pages, []]
  return vi.fn(async () => queue.shift() ?? [])
}

describe('planFilePathNormalization', () => {
  it('rewrites a decomposed path when no composed twin exists', () => {
    const plan = planFilePathNormalization({
      rows: [row(1, NFD_PATH, new Date(1_000))],
      existingNormalizedRows: []
    })

    expect(plan.deletions).toEqual([])
    expect(plan.rewrites).toEqual([{ id: 1, fromPath: NFD_PATH, toPath: NFC_PATH }])
  })

  it('keeps the newer twin and drops the decomposed duplicate', () => {
    const plan = planFilePathNormalization({
      rows: [row(1, NFD_PATH, new Date(1_000))],
      existingNormalizedRows: [row(2, NFC_PATH, new Date(5_000))]
    })

    expect(plan.rewrites).toEqual([])
    expect(plan.deletions).toEqual([{ id: 1, path: NFD_PATH, keptId: 2 }])
  })

  it('keeps the newer decomposed row by dropping the twin and rewriting it', () => {
    const plan = planFilePathNormalization({
      rows: [row(1, NFD_PATH, new Date(9_000))],
      existingNormalizedRows: [row(2, NFC_PATH, new Date(5_000))]
    })

    expect(plan.deletions).toEqual([{ id: 2, path: NFC_PATH, keptId: 1 }])
    expect(plan.rewrites).toEqual([{ id: 1, fromPath: NFD_PATH, toPath: NFC_PATH }])
  })

  it('prefers the already-composed row when both were indexed at the same time', () => {
    const plan = planFilePathNormalization({
      rows: [row(1, NFD_PATH, new Date(5_000))],
      existingNormalizedRows: [row(2, NFC_PATH, new Date(5_000))]
    })

    expect(plan.rewrites).toEqual([])
    expect(plan.deletions).toEqual([{ id: 1, path: NFD_PATH, keptId: 2 }])
  })

  it('collapses several decomposed rows targeting one composed path', () => {
    const plan = planFilePathNormalization({
      rows: [row(1, NFD_PATH, new Date(1_000)), row(3, NFD_PATH, new Date(7_000))],
      existingNormalizedRows: []
    })

    expect(plan.rewrites).toEqual([{ id: 3, fromPath: NFD_PATH, toPath: NFC_PATH }])
    expect(plan.deletions).toEqual([{ id: 1, path: NFD_PATH, keptId: 3 }])
  })

  it('plans nothing for rows already stored in composed form', () => {
    expect(
      planFilePathNormalization({
        rows: [row(1, NFC_PATH, new Date(1_000)), row(2, '/home/me/plain.txt', new Date(1_000))],
        existingNormalizedRows: []
      })
    ).toEqual({ rewrites: [], deletions: [] })
  })
})

describe('FileProviderPathNormalizationService', () => {
  it('skips the pass once the version is recorded', async () => {
    const deps = buildDeps({
      getAppliedVersion: vi.fn(async () => FILE_PATH_NORMALIZATION_VERSION)
    })
    const service = new FileProviderPathNormalizationService(deps)

    await expect(service.run()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'already-applied'
    })
    expect(deps.loadRowsPage).not.toHaveBeenCalled()
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'removing the stale twin itself', concurrentDelete: false, deleted: 1 },
    {
      name: 'a stale twin already removed by another operation',
      concurrentDelete: true,
      deleted: 0
    }
  ])(
    'merges by observed loser/keeper identity and reports actual deletion for $name',
    async ({ concurrentDelete, deleted }) => {
      const entries = [
        row(1, NFD_PATH, new Date(9_000)),
        row(2, NFC_PATH, new Date(5_000)),
        row(4, '/home/me/plain.txt', new Date(1_000))
      ]
      const store = new Map(entries.map((entry) => [entry.id, { ...entry }]))
      const indexed = new Map(entries.map((entry) => [entry.path, entry.id]))
      const rekeyWork = new Set<string>()
      let applied: number | null = null
      const deps = buildDeps({
        getAppliedVersion: async () => applied,
        setAppliedVersion: async (version: number) => {
          applied = version
        },
        loadRowsPage: async (afterId: number, limit: number) =>
          [...store.values()]
            .filter((entry) => entry.id > afterId)
            .sort((left, right) => left.id - right.id)
            .slice(0, limit),
        loadRowsByPaths: async (paths: string[]) =>
          [...store.values()].filter((entry) => paths.includes(entry.path)),
        removeIndexedFile: async (deletion: FilePathNormalizationDeletion) => {
          if (concurrentDelete) {
            store.delete(2)
            indexed.delete(NFC_PATH)
          }
          const loser = store.get(deletion.id)
          if (!loser) return false
          const keeper = store.get(deletion.keptId)
          if (
            !keeper ||
            loser.path !== deletion.path ||
            keeper.path.normalize('NFC') !== loser.path.normalize('NFC')
          ) {
            throw new Error('normalization identity changed')
          }
          store.delete(loser.id)
          indexed.delete(loser.path)
          return true
        },
        rewritePath: async (rewrite: FilePathNormalizationRewrite) => {
          if (
            [...store.values()].some(
              (entry) => entry.id !== rewrite.id && entry.path === rewrite.toPath
            )
          ) {
            throw new Error('canonical metadata path is still owned')
          }
          const current = store.get(rewrite.id)!
          store.set(rewrite.id, { ...current, path: rewrite.toPath })
        },
        removeIndexEntry: async (path: string) => {
          rekeyWork.add(path)
        },
        reindexRows: async (ids: number[]) => {
          for (const id of ids) indexed.set(store.get(id)!.path, id)
        }
      })
      expect(await new FileProviderPathNormalizationService(deps).run()).toMatchObject({
        status: 'completed',
        scanned: 3,
        rewritten: 1,
        deleted,
        failed: 0
      })
      expect([...store.values()].map((entry) => ({ id: entry.id, path: entry.path }))).toEqual([
        { id: 1, path: NFC_PATH },
        { id: 4, path: '/home/me/plain.txt' }
      ])
      expect(indexed.get(NFC_PATH)).toBe(1)
      expect(indexed.get(NFD_PATH)).toBe(1)
      expect([...rekeyWork]).toEqual([NFD_PATH])
      expect(applied).toBe(FILE_PATH_NORMALIZATION_VERSION)
    }
  )

  it('does not mark repair applied when loser deletion is rejected by the current writer or keeper fence', async () => {
    let applied: number | null = null
    const entries = [row(1, NFD_PATH, new Date(1_000)), row(2, NFC_PATH, new Date(5_000))]
    const deps = buildDeps({
      getAppliedVersion: async () => applied,
      setAppliedVersion: async (version: number) => {
        applied = version
      },
      loadRowsPage: pagedRows([entries[0]]),
      loadRowsByPaths: async () => [entries[1]],
      removeIndexedFile: async () => {
        throw new Error('normalization writer deferred')
      }
    })
    expect(await new FileProviderPathNormalizationService(deps).run()).toMatchObject({
      deleted: 0,
      rewritten: 0,
      failed: 1
    })
    expect(applied).toBeNull()
  })

  it('leaves the version unrecorded when a row fails, so the next boot retries', async () => {
    const deps = buildDeps({
      loadRowsPage: pagedRows([row(1, NFD_PATH, new Date(1_000))]),
      rewritePath: vi.fn(async () => {
        throw new Error('SQLITE_BUSY: database is locked')
      })
    })
    const service = new FileProviderPathNormalizationService(deps)

    await expect(service.run()).resolves.toMatchObject({ failed: 1, rewritten: 0 })
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
    expect(deps.reindexRows).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalled()
  })

  it('keeps going and leaves the version unrecorded when the re-index fails', async () => {
    const deps = buildDeps({
      loadRowsPage: pagedRows([row(1, NFD_PATH, new Date(1_000))]),
      reindexRows: vi.fn(async () => {
        throw new Error('read home unavailable')
      })
    })
    const service = new FileProviderPathNormalizationService(deps)

    await expect(service.run()).resolves.toMatchObject({ status: 'completed', failed: 1 })
    expect(deps.rewritePath).toHaveBeenCalledTimes(1)
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalled()
  })

  it('is a no-op on a second run over already-normalized rows', async () => {
    const deps = buildDeps({
      loadRowsPage: pagedRows([row(1, NFC_PATH, new Date(1_000))])
    })
    const service = new FileProviderPathNormalizationService(deps)

    await expect(service.run()).resolves.toMatchObject({
      status: 'completed',
      scanned: 1,
      rewritten: 0,
      deleted: 0
    })
    expect(deps.rewritePath).not.toHaveBeenCalled()
    expect(deps.removeIndexedFile).not.toHaveBeenCalled()
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_PATH_NORMALIZATION_VERSION)
  })
})

describe('shouldRunPathNormalizationOnPlatform', () => {
  it('runs on darwin only', () => {
    expect(shouldRunPathNormalizationOnPlatform('darwin')).toBe(true)
    // Byte-exact filesystems: the two unicode forms are two different files,
    // so merging rows would destroy one of them.
    expect(shouldRunPathNormalizationOnPlatform('linux')).toBe(false)
    expect(shouldRunPathNormalizationOnPlatform('win32')).toBe(false)
    expect(shouldRunPathNormalizationOnPlatform('')).toBe(false)
  })
})

describe('shouldDeferReconciliationForPathNormalization', () => {
  it('defers only between arming the repair and its first attempt', () => {
    expect(
      shouldDeferReconciliationForPathNormalization({ scheduled: true, attempted: false })
    ).toBe(true)
    // Attempted — including a failed attempt: a permanently deferred reconcile
    // is worse than the rebuild churn the deferral avoids.
    expect(
      shouldDeferReconciliationForPathNormalization({ scheduled: true, attempted: true })
    ).toBe(false)
    // Never armed (non-darwin, or shutdown before scheduling).
    expect(
      shouldDeferReconciliationForPathNormalization({ scheduled: false, attempted: false })
    ).toBe(false)
  })
})
