import { describe, expect, it, vi } from 'vitest'
import {
  FILE_OVERLONG_CONTENT_CLEANUP_VERSION,
  FileProviderOverlongContentCleanupService,
  type FileOverlongContentCleanupDeps
} from './file-provider-overlong-content-cleanup-service'

function makeService(
  ids: number[],
  overrides: Partial<FileOverlongContentCleanupDeps<{ id: number }>> = {}
) {
  // Same contract as the SQL: id-ordered rows still selected, i.e. not cleaned yet.
  const pending = new Set(ids)
  const processed: number[][] = []
  const deps: FileOverlongContentCleanupDeps<{ id: number }> = {
    getAppliedVersion: vi.fn(async () => null),
    setAppliedVersion: vi.fn(async () => {}),
    isReady: () => true,
    loadPage: async (afterId, limit) =>
      [...pending]
        .filter((id) => id > afterId)
        .sort((a, b) => a - b)
        .slice(0, limit)
        .map((id) => ({ id })),
    processPage: async (rows) => {
      processed.push(rows.map((row) => row.id))
      for (const row of rows) pending.delete(row.id)
    },
    waitForWriteCapacity: async () => {},
    logInfo: () => {},
    logWarn: () => {},
    ...overrides
  }
  return { service: new FileProviderOverlongContentCleanupService(deps), deps, pending, processed }
}

describe('FileProviderOverlongContentCleanupService', () => {
  it('cleans every selected row across pages and records the version', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => index + 1)
    const { service, deps, pending, processed } = makeService(ids)

    await expect(service.run()).resolves.toEqual({
      status: 'completed',
      scanned: 120,
      cleaned: 120,
      failed: 0
    })

    expect(pending.size).toBe(0)
    expect(processed.length).toBeGreaterThan(1)
    expect(processed.flat()).toEqual(ids)
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_OVERLONG_CONTENT_CLEANUP_VERSION)
  })

  it('leaves the version unrecorded when a page fails, and a rerun finishes only what is left', async () => {
    let failOnce = true
    const ids = Array.from({ length: 120 }, (_, index) => index + 1)
    const base = makeService(ids)
    const { service, deps, pending } = makeService(ids, {
      processPage: async (rows) => {
        if (failOnce) {
          failOnce = false
          throw new Error('SQLITE_BUSY')
        }
        await base.deps.processPage(rows)
        for (const row of rows) pending.delete(row.id)
      }
    })

    const first = await service.run()
    expect(first.failed).toBeGreaterThan(0)
    expect(first.cleaned + first.failed).toBe(120)
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
    // The failed page stays selected for the next boot: nothing was cleaned that was not written.
    expect(pending.size).toBe(first.failed)

    await expect(service.run()).resolves.toMatchObject({ scanned: first.failed, failed: 0 })
    expect(pending.size).toBe(0)
    expect(deps.setAppliedVersion).toHaveBeenCalledTimes(1)
  })

  it('skips without reading when the version is already recorded', async () => {
    const loadPage = vi.fn(async () => [])
    const { service } = makeService([], {
      getAppliedVersion: async () => FILE_OVERLONG_CONTENT_CLEANUP_VERSION,
      loadPage
    })

    await expect(service.run()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'already-applied'
    })
    expect(loadPage).not.toHaveBeenCalled()
  })

  it('skips without recording while the write path is not ready', async () => {
    const { service, deps } = makeService([1], { isReady: () => false })

    await expect(service.run()).resolves.toMatchObject({ status: 'skipped', reason: 'unavailable' })
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })
})
