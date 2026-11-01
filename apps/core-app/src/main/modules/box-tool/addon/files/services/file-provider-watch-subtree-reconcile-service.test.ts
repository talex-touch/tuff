import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { IndexedSourceRoot } from '@talex-touch/utils/search'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileScanRunStats } from '../workers/file-scan-worker-client'
import {
  FileProviderWatchSubtreeReconcileService,
  type FileProviderWatchSubtreeReconcileDeps
} from './file-provider-watch-subtree-reconcile-service'

const SHOT = 'shot.png'

const root = (scope: string): IndexedSourceRoot => ({
  sourceId: 'file-provider',
  path: scope,
  permissionState: 'granted'
})

function readFailure(code: string): Error {
  return Object.assign(new Error(`${code}:fixture`), { code })
}

describe('watched subtree reconcile against the search index reader', () => {
  let parent: string

  beforeEach(async () => {
    parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'subtree-reconcile-')))
  })

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true })
  })

  async function makeScope(name: string): Promise<string> {
    const scope = path.join(parent, name)
    await fs.mkdir(scope)
    return scope
  }

  function createHarness(
    reads: {
      bound?: (scope: string) => Promise<{ highWaterMark: number; small: boolean }>
      page?: (scope: string, small: boolean) => Promise<unknown[]>
    } = {}
  ) {
    const unsupported = (): never => {
      throw new Error('unsupported in this test')
    }
    const readFileSubtreeBound = vi.fn(
      async (scope: string, _signal?: AbortSignal) =>
        await (reads.bound?.(scope) ?? Promise.resolve({ highWaterMark: 0, small: true }))
    )
    const readFileSubtreePage = vi.fn(
      async (
        scope: string,
        small: boolean,
        _afterId: number,
        _throughId: number,
        _limit: number,
        _signal?: AbortSignal
      ) => await (reads.page?.(scope, small) ?? Promise.resolve([]))
    )
    const persistSubtreeRecords = vi.fn(async (records: unknown[]) => ({
      added: records.length,
      changed: 0
    }))
    const persistMissingScope = vi.fn(async () => undefined)
    const finishMissingScope = vi.fn(async () => undefined)
    const saveMissingCursor = vi.fn(async () => undefined)
    const resumeMaintenance = vi.fn()
    const deps: FileProviderWatchSubtreeReconcileDeps = {
      sourceId: 'file-provider',
      getSearchIndex: () => ({ readFileSubtreeBound, readFileSubtreePage }) as never,
      getWatchPaths: () => [parent],
      isShuttingDown: () => false,
      ensureFileSystemWatchers: async () => undefined,
      isWithinWatchRoots: () => true,
      isStaleIndexPath: () => false,
      getWatchDepthForPath: () => 8,
      mapFileToIndexedSourceRecord: unsupported,
      scanDirectoryBatchesWithWorker: async function* (dir, _exclude, _signal, onStats) {
        yield [{ path: path.join(dir, SHOT) }] as never
        onStats?.({ errorCount: 0 } as FileScanRunStats)
      },
      buildFileRecord: unsupported,
      handleIncrementalDeletes: unsupported,
      handleIncrementalAddsOrChanges: unsupported,
      persistSubtreeRecords: persistSubtreeRecords as never,
      deleteReconciledRecords: unsupported,
      pathAbsenceEvidence: async () => 'present',
      canContinue: () => true,
      persistMissingScope,
      getMissingCursor: async () => 0,
      saveMissingCursor,
      finishMissingScope,
      resumeMaintenance,
      isLinkedWorktreeRoot: async () => false
    }
    return {
      service: new FileProviderWatchSubtreeReconcileService(deps),
      readFileSubtreeBound,
      readFileSubtreePage,
      persistSubtreeRecords,
      persistMissingScope,
      finishMissingScope,
      saveMissingCursor,
      resumeMaintenance
    }
  }

  const reconcile = (harness: ReturnType<typeof createHarness>, ...scopes: string[]) =>
    harness.service.reconcile({
      sourceId: 'file-provider',
      roots: scopes.map(root)
    })

  const pageRow = (scope: string, id: number) => ({
    id,
    path: path.join(scope, SHOT),
    mtime: null,
    ctime: null,
    size: null,
    lastIndexedAt: null
  })

  it('pages each scope with the strategy its own bound chose, not the one before', async () => {
    const small = await makeScope('small')
    const large = await makeScope('large')
    const harness = createHarness({
      bound: async (scope) => ({ highWaterMark: 7, small: scope === small }),
      page: async (scope) => [pageRow(scope, 7)]
    })

    await reconcile(harness, small, large)

    expect(harness.readFileSubtreeBound).toHaveBeenCalledTimes(2)
    expect(harness.readFileSubtreePage).toHaveBeenCalledTimes(2)
    const [first, second] = harness.readFileSubtreePage.mock.calls
    expect(first).toEqual([small, true, 0, 7, 64, undefined])
    expect(second).toEqual([large, false, 0, 7, 64, undefined])
  })

  it('reads the bound before the scan writes anything, and the pages only after it', async () => {
    const scope = await makeScope('order')
    const order: string[] = []
    const harness = createHarness({
      bound: async () => {
        order.push('bound')
        return { highWaterMark: 3, small: true }
      },
      page: async () => {
        order.push('page')
        return [pageRow(scope, 3)]
      }
    })
    harness.persistSubtreeRecords.mockImplementation(async (records: unknown[]) => {
      order.push('persist')
      return { added: records.length, changed: 0 }
    })

    await reconcile(harness, scope)

    expect(order).toEqual(['bound', 'persist', 'page'])
  })

  it.each([
    'SEARCH_INDEX_READ_WORKER_UNAVAILABLE',
    'SEARCH_INDEX_READ_QUEUE_FULL',
    'SEARCH_INDEX_READ_TIMEOUT'
  ])(
    'still indexes the folder and leaves the sweep when the reader fails with %s',
    async (code) => {
      const scope = await makeScope('busy')
      const harness = createHarness({
        bound: async () => {
          throw readFailure(code)
        }
      })

      const result = await reconcile(harness, scope)

      expect(result).toMatchObject({ added: 1, deleted: 0, errors: 0 })
      expect(harness.persistSubtreeRecords).toHaveBeenCalledTimes(1)
      expect(harness.persistMissingScope).not.toHaveBeenCalled()
      expect(harness.readFileSubtreePage).not.toHaveBeenCalled()
      expect(harness.resumeMaintenance).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps the opened sweep and its cursor when a page read finds the reader unavailable', async () => {
    const scope = await makeScope('midway')
    const harness = createHarness({
      bound: async () => ({ highWaterMark: 5, small: true }),
      page: async () => {
        throw readFailure('SEARCH_INDEX_READ_WORKER_UNAVAILABLE')
      }
    })

    const result = await reconcile(harness, scope)

    expect(result).toMatchObject({ added: 1, errors: 0 })
    expect(harness.persistMissingScope).toHaveBeenCalledTimes(1)
    expect(harness.saveMissingCursor).not.toHaveBeenCalled()
    expect(harness.finishMissingScope).not.toHaveBeenCalled()
    expect(harness.resumeMaintenance).toHaveBeenCalledTimes(1)
  })

  it('fails the reconcile on a read failure that is not about the reader being busy', async () => {
    const scope = await makeScope('corrupt')
    const harness = createHarness({
      bound: async () => {
        throw readFailure('SQLITE_CORRUPT')
      }
    })

    await expect(reconcile(harness, scope)).rejects.toThrow('SQLITE_CORRUPT')
    expect(harness.persistSubtreeRecords).not.toHaveBeenCalled()
  })

  it('completes the sweep and reports nothing deferred when every read answers', async () => {
    const scope = await makeScope('healthy')
    const harness = createHarness({
      bound: async () => ({ highWaterMark: 4, small: true }),
      page: async () => [pageRow(scope, 4)]
    })

    await reconcile(harness, scope)

    expect(harness.finishMissingScope).toHaveBeenCalledTimes(1)
    expect(harness.resumeMaintenance).not.toHaveBeenCalled()
  })
})
