import { describe, expect, it, vi } from 'vitest'
import {
  FILE_PATH_NORMALIZATION_VERSION,
  FileProviderPathNormalizationService,
  planFilePathNormalization,
  shouldDeferReconciliationForPathNormalization,
  shouldRunPathNormalizationOnPlatform,
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
    removeIndexedFile: vi.fn(async () => {}),
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
    expect(NFC_PATH).not.toBe(NFD_PATH)

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

  it('merges a duplicate, rekeys the index entry and records the version', async () => {
    const deps = buildDeps({
      loadRowsPage: pagedRows([
        row(1, NFD_PATH, new Date(9_000)),
        row(4, '/home/me/plain.txt', new Date(1_000))
      ]),
      loadRowsByPaths: vi.fn(async () => [row(2, NFC_PATH, new Date(5_000))])
    })
    const service = new FileProviderPathNormalizationService(deps)

    await expect(service.run()).resolves.toMatchObject({
      status: 'completed',
      scanned: 2,
      rewritten: 1,
      deleted: 1,
      failed: 0
    })

    // The stale twin goes through the existing removal API (item id = path).
    expect(deps.removeIndexedFile).toHaveBeenCalledWith(NFC_PATH)
    expect(deps.rewritePath).toHaveBeenCalledWith({
      id: 1,
      fromPath: NFD_PATH,
      toPath: NFC_PATH
    })
    // Index entries keyed by the replaced id are dropped, then re-indexed.
    expect(deps.removeIndexEntry).toHaveBeenCalledWith(NFD_PATH)
    expect(deps.reindexRows).toHaveBeenCalledWith([1])
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_PATH_NORMALIZATION_VERSION)
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
