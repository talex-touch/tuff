import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  FileWatchSubtreeService,
  type FileWatchSubtreeDeps,
  type WatchSubtreeRecord
} from './file-watch-subtree-service'

interface ScannedRecord {
  path: string
  content: string
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createHarness(initialFiles: ScannedRecord[]) {
  const disk = new Map(initialFiles.map((record) => [record.path, { ...record }]))
  const store = new Map(
    initialFiles.map((record, index) => [index + 1, { ...record, id: index + 1 }])
  )
  const cursors = new Map<string, number>()
  const sweeps = new Set<string>()
  const maintenance = { clock: 0, active: true }
  let nextId = initialFiles.length + 1
  const deps: FileWatchSubtreeDeps<ScannedRecord, WatchSubtreeRecord> = {
    normalizePath: path.normalize,
    isAdmitted: (candidate) => !candidate.includes('/private/'),
    pathExists: vi.fn(async (candidate) => {
      return (
        disk.has(candidate) || [...disk.keys()].some((entry) => entry.startsWith(`${candidate}/`))
      )
    }),
    scan: vi.fn(async function* (scope) {
      for (const record of disk.values()) {
        if (record.path === scope || record.path.startsWith(`${scope}/`)) {
          yield [record]
        }
      }
    }),
    upsert: vi.fn(async (_scope, records) => {
      let added = 0
      let changed = 0
      for (const record of records) {
        const existing = [...store.values()].find((entry) => entry.path === record.path)
        if (existing) {
          if (existing.content !== record.content) {
            store.set(existing.id, { ...record, id: existing.id })
            changed += 1
          }
        } else {
          store.set(nextId, { ...record, id: nextId })
          nextId += 1
          added += 1
        }
      }
      return { added, changed }
    }),
    getHighWaterMark: vi.fn(async () => Math.max(0, ...store.keys())),
    readPage: vi.fn(async (_scope, afterId, throughId, limit) => {
      return [...store.values()]
        .filter((record) => record.id > afterId && record.id <= throughId)
        .sort((left, right) => left.id - right.id)
        .slice(0, limit)
    }),
    deleteRecords: vi.fn(async (records) => {
      for (const record of records) {
        store.delete(record.id)
      }
      return { deletedCount: records.length, deferred: false }
    }),
    beginMissingSweep: async (scope) => {
      sweeps.add(scope)
    },
    loadCursor: async (scope) => cursors.get(scope) ?? 0,
    saveCursor: async (scope, cursor) => {
      cursors.set(scope, cursor)
    },
    finishMissingSweep: async (scope) => {
      sweeps.delete(scope)
      cursors.delete(scope)
    },
    canContinue: () => maintenance.active,
    now: () => maintenance.clock
  }
  return {
    disk,
    store,
    deps,
    cursors,
    sweeps,
    maintenance,
    snapshot: () => [...store.values()].map(({ path: recordPath }) => recordPath).sort()
  }
}

describe('file-watch-subtree-service', () => {
  it('converges a populated directory move and removal without touching neighboring roots', async () => {
    const harness = createHarness([
      { path: '/workspace/source/first.txt', content: 'first' },
      { path: '/workspace/source/nested/second.txt', content: 'second' },
      { path: '/workspace/source-neighbor/keep.txt', content: 'neighbor' },
      { path: '/elsewhere/keep.txt', content: 'outside' }
    ])
    harness.disk.delete('/workspace/source/first.txt')
    harness.disk.delete('/workspace/source/nested/second.txt')
    harness.disk.set('/workspace/destination/first.txt', {
      path: '/workspace/destination/first.txt',
      content: 'first'
    })
    harness.disk.set('/workspace/destination/nested/second.txt', {
      path: '/workspace/destination/nested/second.txt',
      content: 'second'
    })
    const service = new FileWatchSubtreeService(harness.deps)

    await expect(service.execute('/workspace/source', { batchSize: 2 })).resolves.toMatchObject({
      added: 0,
      changed: 0,
      deleted: 2,
      skipped: 2,
      errors: 0
    })
    expect(harness.deps.scan).not.toHaveBeenCalled()
    await expect(
      service.execute('/workspace/destination', { batchSize: 2 })
    ).resolves.toMatchObject({
      added: 2,
      changed: 0,
      deleted: 0,
      errors: 0
    })
    expect(harness.snapshot()).toEqual([
      '/elsewhere/keep.txt',
      '/workspace/destination/first.txt',
      '/workspace/destination/nested/second.txt',
      '/workspace/source-neighbor/keep.txt'
    ])

    harness.disk.delete('/workspace/destination/first.txt')
    harness.disk.delete('/workspace/destination/nested/second.txt')
    await expect(
      service.execute('/workspace/destination', { batchSize: 2 })
    ).resolves.toMatchObject({
      deleted: 2
    })
    expect(harness.snapshot()).toEqual([
      '/elsewhere/keep.txt',
      '/workspace/source-neighbor/keep.txt'
    ])
  })

  it('splits oversized scan chunks and waits for each write before pulling more input', async () => {
    const harness = createHarness([])
    const firstWriteStarted = deferred()
    const releaseFirstWrite = deferred()
    const writtenSizes: number[] = []
    const upsert = harness.deps.upsert
    let pulledChunks = 0
    harness.deps.pathExists = vi.fn(async () => true)
    harness.deps.scan = vi.fn(async function* () {
      pulledChunks += 1
      yield Array.from({ length: 7 }, (_, index) => ({
        path: `/workspace/subtree/file-${index}.txt`,
        content: 'new'
      }))
      pulledChunks += 1
      yield [{ path: '/workspace/subtree/last.txt', content: 'last' }]
    })
    harness.deps.upsert = vi.fn(async (scope, records, signal) => {
      writtenSizes.push(records.length)
      if (writtenSizes.length === 1) {
        firstWriteStarted.resolve()
        await releaseFirstWrite.promise
      }
      return upsert(scope, records, signal)
    })
    const execution = new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
      batchSize: 2
    })
    await firstWriteStarted.promise
    try {
      expect(writtenSizes).toEqual([2])
      expect(pulledChunks).toBe(1)
      expect(harness.deps.readPage).not.toHaveBeenCalled()
    } finally {
      releaseFirstWrite.resolve()
      await execution
    }
    expect(writtenSizes).toEqual([2, 2, 2, 1, 1])
    expect(harness.store.size).toBe(8)
    await expect(execution).resolves.toMatchObject({
      added: 8,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    })
  })

  it('fixes the original upper ID before upserts and leaves concurrent inserts for another run', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/current.txt', content: 'old' },
      { path: '/workspace/subtree/gone.txt', content: 'gone' }
    ])
    harness.disk.set('/workspace/subtree/current.txt', {
      path: '/workspace/subtree/current.txt',
      content: 'changed'
    })
    harness.disk.delete('/workspace/subtree/gone.txt')
    harness.disk.set('/workspace/subtree/added.txt', {
      path: '/workspace/subtree/added.txt',
      content: 'new'
    })
    const upsert = harness.deps.upsert
    harness.deps.upsert = vi.fn(async (scope, records, signal) => {
      expect(harness.deps.getHighWaterMark).toHaveBeenCalledTimes(1)
      const result = await upsert(scope, records, signal)
      harness.store.set(100, {
        id: 100,
        path: '/workspace/subtree/concurrent.txt',
        content: 'late'
      })
      return result
    })
    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', { batchSize: 1 })
    ).resolves.toMatchObject({ added: 1, changed: 1, deleted: 1, skipped: 0, errors: 0 })
    expect(harness.snapshot()).toEqual([
      '/workspace/subtree/added.txt',
      '/workspace/subtree/concurrent.txt',
      '/workspace/subtree/current.txt'
    ])
    expect(harness.store.get(1)?.content).toBe('changed')
    expect(harness.deps.readPage).toHaveBeenNthCalledWith(
      1,
      '/workspace/subtree',
      0,
      2,
      1,
      undefined
    )
    expect(harness.deps.readPage).toHaveBeenNthCalledWith(
      2,
      '/workspace/subtree',
      1,
      2,
      1,
      undefined
    )
    expect(harness.deps.readPage).toHaveBeenCalledTimes(2)
    expect(harness.deps.pathExists).not.toHaveBeenCalledWith(
      '/workspace/subtree/concurrent.txt',
      undefined
    )
  })

  it('bounds existence checks and waits for each delete batch before reading the next page', async () => {
    const harness = createHarness(
      Array.from({ length: 13 }, (_, index) => ({
        path: `/workspace/subtree/file-${index}.txt`,
        content: 'gone'
      }))
    )
    harness.disk.clear()
    let activeChecks = 0
    let peakChecks = 0
    let deletePending = false
    const deletedSizes: number[] = []
    const readPage = harness.deps.readPage
    const deleteRecords = harness.deps.deleteRecords
    harness.deps.pathExists = vi.fn(async (candidate) => {
      if (candidate === '/workspace/subtree') return false
      activeChecks += 1
      peakChecks = Math.max(peakChecks, activeChecks)
      await new Promise<void>((resolve) => setImmediate(resolve))
      activeChecks -= 1
      return false
    })
    harness.deps.readPage = vi.fn(async (...args) => {
      expect(deletePending).toBe(false)
      return readPage(
        args[0] as string,
        args[1] as number,
        args[2] as number,
        args[3] as number,
        args[4] as AbortSignal | undefined
      )
    })
    harness.deps.deleteRecords = vi.fn(async (records, signal) => {
      expect(activeChecks).toBe(0)
      expect(deletePending).toBe(false)
      deletePending = true
      deletedSizes.push(records.length)
      await new Promise<void>((resolve) => setImmediate(resolve))
      const result = await deleteRecords(records, signal)
      deletePending = false
      return result
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', { batchSize: 5 })
    ).resolves.toMatchObject({ added: 0, changed: 0, deleted: 13, skipped: 0, errors: 0 })
    expect(peakChecks).toBeLessThanOrEqual(5)
    expect(activeChecks).toBe(0)
    expect(deletePending).toBe(false)
    expect(deletedSizes).toEqual([5, 5, 3])
    expect(harness.deps.scan).not.toHaveBeenCalled()
    expect(harness.deps.readPage).toHaveBeenNthCalledWith(
      1,
      '/workspace/subtree',
      0,
      13,
      5,
      undefined
    )
    expect(harness.deps.readPage).toHaveBeenNthCalledWith(
      2,
      '/workspace/subtree',
      5,
      13,
      5,
      undefined
    )
    expect(harness.deps.readPage).toHaveBeenNthCalledWith(
      3,
      '/workspace/subtree',
      10,
      13,
      5,
      undefined
    )
    expect(harness.snapshot()).toEqual([])
  })

  it('rejects an already aborted run without calling any dependency', async () => {
    const harness = createHarness([])
    const controller = new AbortController()
    controller.abort()

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        signal: controller.signal
      })
    ).rejects.toBe(controller.signal.reason)
    expect(harness.deps.getHighWaterMark).not.toHaveBeenCalled()
    expect(harness.deps.pathExists).not.toHaveBeenCalled()
    expect(harness.deps.scan).not.toHaveBeenCalled()
  })

  it('closes the scanner on cancellation after a write without pulling or deleting more rows', async () => {
    const harness = createHarness([{ path: '/workspace/subtree/stale.txt', content: 'stale' }])
    const controller = new AbortController()
    const reason = new Error('cancel subtree')
    const upsert = harness.deps.upsert
    let pulledChunks = 0
    let scannerClosed = false
    harness.deps.scan = vi.fn(async function* (_scope, signal) {
      expect(signal).toBe(controller.signal)
      try {
        pulledChunks += 1
        yield [{ path: '/workspace/subtree/first.txt', content: 'first' }]
        pulledChunks += 1
        yield [{ path: '/workspace/subtree/second.txt', content: 'second' }]
      } finally {
        scannerClosed = true
      }
    })
    harness.deps.upsert = vi.fn(async (scope, records, signal) => {
      expect(signal).toBe(controller.signal)
      const result = await upsert(scope, records, signal)
      controller.abort(reason)
      return result
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        signal: controller.signal,
        batchSize: 1
      })
    ).rejects.toBe(reason)
    expect(pulledChunks).toBe(1)
    expect(scannerClosed).toBe(true)
    expect(harness.snapshot()).toEqual([
      '/workspace/subtree/first.txt',
      '/workspace/subtree/stale.txt'
    ])
    expect(harness.deps.readPage).not.toHaveBeenCalled()
    expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
  })

  it.each(['getHighWaterMark', 'pathExists', 'readPage'] as const)(
    'checks cancellation after awaiting %s even if the dependency ignores its signal',
    async (boundary) => {
      const harness = createHarness([{ path: '/workspace/subtree/gone.txt', content: 'gone' }])
      harness.disk.clear()
      const controller = new AbortController()
      if (boundary === 'getHighWaterMark') {
        harness.deps.getHighWaterMark = vi.fn(async (_scope, signal) => {
          expect(signal).toBe(controller.signal)
          controller.abort()
          return 1
        })
      } else if (boundary === 'pathExists') {
        harness.deps.pathExists = vi.fn(async (_candidate, signal) => {
          expect(signal).toBe(controller.signal)
          controller.abort()
          return false
        })
      } else {
        harness.deps.readPage = vi.fn(async (_scope, _afterId, _throughId, _limit, signal) => {
          expect(signal).toBe(controller.signal)
          controller.abort()
          return [{ id: 1, path: '/workspace/subtree/gone.txt' }]
        })
      }

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(harness.snapshot()).toEqual(['/workspace/subtree/gone.txt'])
      expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
    }
  )

  it('does not delete a checked page when an existence check aborts the run', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/first.txt', content: 'first' },
      { path: '/workspace/subtree/second.txt', content: 'second' }
    ])
    const controller = new AbortController()
    harness.deps.pathExists = vi.fn(async (candidate, signal) => {
      expect(signal).toBe(controller.signal)
      if (candidate !== '/workspace/subtree') controller.abort()
      return false
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(harness.store.size).toBe(2)
    expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
  })

  it('awaits a started delete and rejects cancellation before requesting another page', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/first.txt', content: 'first' },
      { path: '/workspace/subtree/second.txt', content: 'second' }
    ])
    harness.disk.clear()
    const controller = new AbortController()
    const deleteRecords = harness.deps.deleteRecords
    harness.deps.deleteRecords = vi.fn(async (records, signal) => {
      expect(signal).toBe(controller.signal)
      const result = await deleteRecords(records, signal)
      controller.abort()
      return result
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        signal: controller.signal,
        batchSize: 1
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(harness.snapshot()).toEqual(['/workspace/subtree/second.txt'])
    expect(harness.deps.readPage).toHaveBeenCalledTimes(1)
  })

  it.each(['EACCES', 'EPERM', 'EIO'])(
    'propagates %s from the scope probe without deleting existing rows',
    async (code) => {
      const harness = createHarness([{ path: '/workspace/subtree/keep.txt', content: 'keep' }])
      const failure = Object.assign(new Error('scope unavailable'), { code })
      harness.deps.pathExists = vi.fn(async () => {
        throw failure
      })

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
      ).rejects.toBe(failure)
      expect(harness.snapshot()).toEqual(['/workspace/subtree/keep.txt'])
      expect(harness.deps.scan).not.toHaveBeenCalled()
      expect(harness.deps.readPage).not.toHaveBeenCalled()
      expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
    }
  )

  it.each(['EACCES', 'EIO'])(
    'preserves the entire pending page when an individual existence check fails with %s',
    async (code) => {
      const harness = createHarness([
        { path: '/workspace/subtree/missing.txt', content: 'missing' },
        { path: '/workspace/subtree/unreadable.txt', content: 'unreadable' }
      ])
      const failure = Object.assign(new Error('entry unavailable'), { code })
      harness.deps.pathExists = vi.fn(async (candidate) => {
        if (candidate.endsWith('/unreadable.txt')) throw failure
        return false
      })

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
      ).rejects.toBe(failure)
      expect(harness.store.size).toBe(2)
      expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
    }
  )

  it('never starts deletion after a partially successful scan fails', async () => {
    const harness = createHarness([{ path: '/workspace/subtree/keep.txt', content: 'keep' }])
    const failure = Object.assign(new Error('scan unreadable'), { code: 'EACCES' })
    harness.deps.scan = vi.fn(async function* () {
      yield [{ path: '/workspace/subtree/added.txt', content: 'new' }]
      throw failure
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
    ).rejects.toBe(failure)
    expect(harness.snapshot()).toEqual([
      '/workspace/subtree/added.txt',
      '/workspace/subtree/keep.txt'
    ])
    expect(harness.deps.readPage).not.toHaveBeenCalled()
    expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
  })

  it('rejects hostile scan and DB paths before filesystem checks or writes', async () => {
    const hostilePaths = [
      '/workspace/subtree-neighbor/keep.txt',
      '/workspace/subtree/../neighbor/keep.txt',
      '/workspace/subtree/private/keep.txt',
      'relative.txt',
      '',
      '/workspace/subtree/invalid\0.txt',
      '/workspace'
    ]
    const hostileRecords = hostilePaths.map((recordPath) => ({ path: recordPath, content: 'keep' }))
    const harness = createHarness([
      { path: '/workspace/subtree/current.txt', content: 'old' },
      { path: '/workspace/subtree/gone.txt', content: 'gone' },
      ...hostileRecords
    ])
    harness.disk.clear()
    harness.disk.set('/workspace/subtree/current.txt', {
      path: '/workspace/subtree/current.txt',
      content: 'changed'
    })
    harness.deps.normalizePath = (candidate) => path.resolve('/workspace/subtree', candidate)
    harness.deps.scan = vi.fn(async function* (scope) {
      expect(scope).toBe('/workspace/subtree')
      yield [...hostileRecords, { path: '/workspace/subtree/current.txt', content: 'changed' }]
    })

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree/.', { batchSize: 3 })
    ).resolves.toMatchObject({ added: 0, changed: 1, deleted: 1, skipped: 14, errors: 0 })
    expect(harness.snapshot()).toEqual([...hostilePaths, '/workspace/subtree/current.txt'].sort())
    expect(harness.deps.pathExists).toHaveBeenCalledTimes(3)
    for (const candidate of hostilePaths) {
      expect(harness.deps.pathExists).not.toHaveBeenCalledWith(candidate, undefined)
    }
  })

  it.each(['', 'relative/subtree', '/workspace/invalid\0subtree'])(
    'rejects an invalid scope %j without resolving it against the working directory',
    async (scope) => {
      const harness = createHarness([])
      harness.deps.normalizePath = vi.fn((candidate) => path.resolve('/workspace', candidate))

      await expect(new FileWatchSubtreeService(harness.deps).execute(scope)).rejects.toThrow(
        /scope/i
      )
      expect(harness.deps.normalizePath).not.toHaveBeenCalled()
      expect(harness.deps.getHighWaterMark).not.toHaveBeenCalled()
      expect(harness.deps.pathExists).not.toHaveBeenCalled()
    }
  )

  it('rejects normalization that produces a relative scope', async () => {
    const harness = createHarness([])
    harness.deps.normalizePath = () => 'relative/subtree'

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
    ).rejects.toThrow(/scope/i)
    expect(harness.deps.getHighWaterMark).not.toHaveBeenCalled()
  })

  it('skips a non-admitted scope without starting filesystem or database work', async () => {
    const harness = createHarness([{ path: '/workspace/subtree/gone.txt', content: 'gone' }])
    harness.disk.clear()
    harness.deps.isAdmitted = () => false

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
    ).resolves.toMatchObject({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 1,
      errors: 0
    })
    expect(harness.deps.getHighWaterMark).not.toHaveBeenCalled()
    expect(harness.deps.pathExists).not.toHaveBeenCalled()
    expect(harness.deps.scan).not.toHaveBeenCalled()
    expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
    expect(harness.store.size).toBe(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid batch size %s before doing any work',
    async (batchSize) => {
      const harness = createHarness([])

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', { batchSize })
      ).rejects.toThrow(/batch/i)
      expect(harness.deps.getHighWaterMark).not.toHaveBeenCalled()
      expect(harness.deps.pathExists).not.toHaveBeenCalled()
    }
  )

  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid high-water mark %s before scanning or deleting',
    async (throughId) => {
      const harness = createHarness([])
      harness.deps.getHighWaterMark = vi.fn(async () => throughId)

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
      ).rejects.toThrow(/high.water/i)
      expect(harness.deps.pathExists).not.toHaveBeenCalled()
      expect(harness.deps.scan).not.toHaveBeenCalled()
      expect(harness.deps.readPage).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['zero', [0]],
    ['negative', [-1]],
    ['fraction', [1.5]],
    ['NaN', [Number.NaN]],
    ['unsafe', [Number.MAX_SAFE_INTEGER + 1]],
    ['duplicate', [1, 1]],
    ['descending', [2, 1]],
    ['past upper bound', [1, 4]]
  ] as const)(
    'rejects a %s page cursor before mutating any row in that page',
    async (_label, ids) => {
      const harness = createHarness([
        { path: '/workspace/subtree/first.txt', content: 'first' },
        { path: '/workspace/subtree/second.txt', content: 'second' },
        { path: '/workspace/subtree/third.txt', content: 'third' }
      ])
      harness.disk.clear()
      harness.deps.readPage = vi
        .fn<FileWatchSubtreeDeps<ScannedRecord, WatchSubtreeRecord>['readPage']>()
        .mockResolvedValueOnce(ids.map((id) => ({ id, path: '/workspace/subtree/first.txt' })))
        .mockResolvedValue([])

      await expect(
        new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree')
      ).rejects.toThrow(/page|cursor/i)
      expect(harness.deps.readPage).toHaveBeenCalledTimes(1)
      expect(harness.deps.pathExists).toHaveBeenCalledTimes(1)
      expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
      expect(harness.store.size).toBe(3)
    }
  )

  it('rejects a page that exceeds its requested bound', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/first.txt', content: 'first' },
      { path: '/workspace/subtree/second.txt', content: 'second' }
    ])
    harness.disk.clear()
    harness.deps.readPage = vi.fn(async () => [...harness.store.values()])

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', { batchSize: 1 })
    ).rejects.toThrow(/page/i)
    expect(harness.deps.deleteRecords).not.toHaveBeenCalled()
    expect(harness.store.size).toBe(2)
  })

  it('fails rather than looping when a subsequent page repeats its cursor', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/first.txt', content: 'first' },
      { path: '/workspace/subtree/second.txt', content: 'second' }
    ])
    harness.disk.clear()
    const firstPage: WatchSubtreeRecord[] = [{ id: 1, path: '/workspace/subtree/first.txt' }]
    harness.deps.readPage = vi
      .fn<FileWatchSubtreeDeps<ScannedRecord, WatchSubtreeRecord>['readPage']>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValue([])

    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', { batchSize: 1 })
    ).rejects.toThrow(/page|cursor/i)
    expect(harness.deps.readPage).toHaveBeenCalledTimes(2)
    expect(harness.deps.deleteRecords).toHaveBeenCalledTimes(1)
    expect(harness.snapshot()).toEqual(['/workspace/subtree/second.txt'])
  })
})

describe('bounded durable subtree missing sweeps', () => {
  it('preserves the observed record version so a recreated file survives delayed deletion', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/old.txt', content: 'old' },
      { path: '/workspace/subtree/recreated.txt', content: 'old-version' }
    ])
    harness.disk.clear()
    const readPage = harness.deps.readPage
    harness.deps.readPage = async (...args) => {
      const page = await readPage(...args)
      harness.store.set(2, {
        id: 2,
        path: '/workspace/subtree/recreated.txt',
        content: 'new-version'
      })
      return page
    }
    harness.deps.deleteRecords = async (records) => {
      let deletedCount = 0
      for (const observed of records) {
        const current = harness.store.get(observed.id)
        if (current?.content !== (observed as WatchSubtreeRecord & ScannedRecord).content) continue
        harness.store.delete(observed.id)
        deletedCount += 1
      }
      return { deletedCount, deferred: false }
    }
    const result = await new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
      batchSize: 2,
      roundBudgetMs: 100
    })
    expect(result).toMatchObject({ deleted: 1, deferred: false })
    expect(harness.snapshot()).toEqual(['/workspace/subtree/recreated.txt'])
    expect(harness.store.get(2)?.content).toBe('new-version')
  })

  it('includes commit and publication in the round budget and resumes only after its committed cursor', async () => {
    const harness = createHarness(
      Array.from({ length: 6 }, (_, index) => ({
        path: `/workspace/subtree/${index}.txt`,
        content: 'old'
      }))
    )
    harness.disk.clear()
    const remove = harness.deps.deleteRecords
    harness.deps.deleteRecords = async (...args) => {
      const result = await remove(...args)
      harness.maintenance.clock += 6
      return result
    }
    const first = await new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
      batchSize: 2,
      roundBudgetMs: 5
    })
    expect(first).toMatchObject({ deleted: 2, deferred: true })
    expect(harness.cursors.get('/workspace/subtree')).toBe(2)
    expect([...harness.store.keys()]).toEqual([3, 4, 5, 6])
    const resumed = await new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
      batchSize: 2,
      roundBudgetMs: 100
    })
    expect(resumed).toMatchObject({ deleted: 4, deferred: false })
    expect(harness.snapshot()).toEqual([])
    expect([...harness.sweeps]).toEqual([])
  })

  it('counts a committed partial deletion but leaves the deferred page eligible', async () => {
    const harness = createHarness([
      { path: '/workspace/subtree/first.txt', content: 'old' },
      { path: '/workspace/subtree/second.txt', content: 'old' }
    ])
    harness.disk.clear()
    const remove = harness.deps.deleteRecords
    harness.deps.deleteRecords = async (records, signal) => {
      await remove(records.slice(0, 1), signal)
      return { deletedCount: 1, deferred: true }
    }
    const first = await new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
      batchSize: 2,
      roundBudgetMs: 100
    })
    expect(first).toMatchObject({ deleted: 1, deferred: true })
    expect(harness.cursors.has('/workspace/subtree')).toBe(false)
    expect(harness.snapshot()).toEqual(['/workspace/subtree/second.txt'])
    harness.deps.deleteRecords = remove
    expect(
      await new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        batchSize: 2,
        roundBudgetMs: 100
      })
    ).toMatchObject({ deleted: 1, deferred: false })
    expect(harness.snapshot()).toEqual([])
  })

  it('does not create durable missing work when an incomplete scanner throws after a batch', async () => {
    const harness = createHarness([{ path: '/workspace/subtree/keep.txt', content: 'old' }])
    const failure = new Error('incomplete scan')
    harness.deps.scan = async function* () {
      yield [{ path: '/workspace/subtree/seen.txt', content: 'new' }]
      throw failure
    }
    await expect(
      new FileWatchSubtreeService(harness.deps).execute('/workspace/subtree', {
        batchSize: 2,
        roundBudgetMs: 100
      })
    ).rejects.toBe(failure)
    expect([...harness.sweeps]).toEqual([])
    expect(harness.snapshot()).toEqual([
      '/workspace/subtree/keep.txt',
      '/workspace/subtree/seen.txt'
    ])
  })
})
