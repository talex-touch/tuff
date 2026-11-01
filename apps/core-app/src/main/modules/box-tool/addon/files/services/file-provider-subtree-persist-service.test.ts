import { describe, expect, it, vi } from 'vitest'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'
import type { FileIndexRunOptions } from '../file-provider-index-contracts'
import type { ScannedFileInfo } from '../types'
import { FileProviderIncrementalWritePlannerService } from './file-provider-incremental-write-planner-service'
import {
  FileProviderSubtreePersistService,
  readFileRowsByPath
} from './file-provider-subtree-persist-service'

const MTIME = new Date('2026-10-30T12:00:00Z')
const STALE_MTIME = new Date(MTIME.getTime() - 60_000)
const OPTIONS: FileIndexRunOptions = { maintenance: true }

const file = (name: string, mtime = MTIME): ScannedFileInfo => ({
  path: `/shots/${name}`,
  name,
  extension: '.png',
  size: 1024,
  ctime: MTIME,
  mtime
})

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index)

const rowFor = (info: ScannedFileInfo, id: number) => ({ ...info, id })

function createHarness(
  options: {
    indexed?: ScannedFileInfo[]
    admit?: (records: UpsertFileRecord[]) => UpsertFileRecord[]
  } = {}
) {
  const store = new Map<string, ReturnType<typeof rowFor>>()
  ;(options.indexed ?? []).forEach((info, index) => store.set(info.path, rowFor(info, index + 1)))
  let leases = 0
  const withFileMutationSlice = vi.fn(
    async (_options: unknown, operation: (leaseId: string) => Promise<unknown>) =>
      await operation(`lease-${(leases += 1)}`)
  )
  const admitScanRecords = vi.fn(async (records: UpsertFileRecord[]) =>
    options.admit ? options.admit(records) : records
  )
  const readRows = vi.fn(async (paths: string[]) =>
    paths.flatMap((path) => (store.has(path) ? [store.get(path)!] : []))
  )
  const applyBatchWithPersistence = vi.fn(async (_batch: unknown, records: UpsertFileRecord[]) => ({
    persistedCount: records.length
  }))
  const mapRecord = vi.fn((row: { path: string }) => ({ path: row.path }))
  const emitCommittedScanProgress = vi.fn(async (_count: number, _options: unknown) => undefined)
  const service = new FileProviderSubtreePersistService({
    sourceId: 'file-provider',
    maintenance: { admitScanRecords, withFileMutationSlice } as never,
    planner: new FileProviderIncrementalWritePlannerService({
      normalizePath: (value) => value,
      timestampToleranceMs: 1_000
    }),
    readRows: readRows as never,
    mapRecord: mapRecord as never,
    applyBatchWithPersistence: applyBatchWithPersistence as never,
    emitCommittedScanProgress
  })
  return {
    service,
    store,
    withFileMutationSlice,
    admitScanRecords,
    readRows,
    applyBatchWithPersistence,
    mapRecord,
    emitCommittedScanProgress
  }
}

describe('subtree persistence', () => {
  it('takes no slice when the index already holds every record as scanned', async () => {
    const files = range(64).map((index) => file(`clean-${index}.png`))
    const harness = createHarness({ indexed: files })

    const result = await harness.service.persist(files, OPTIONS)

    expect(result).toEqual({ added: 0, changed: 0 })
    expect(harness.withFileMutationSlice).not.toHaveBeenCalled()
    expect(harness.applyBatchWithPersistence).not.toHaveBeenCalled()
    expect(harness.emitCommittedScanProgress).not.toHaveBeenCalled()
    expect(harness.readRows).toHaveBeenCalledTimes(1)
  })

  it('takes slices of ten, and only for the records that are new or changed', async () => {
    const clean = range(8).map((index) => file(`clean-${index}.png`))
    const stale = range(14).map((index) => file(`stale-${index}.png`))
    const fresh = range(3).map((index) => file(`fresh-${index}.png`))
    const harness = createHarness({
      indexed: [...clean, ...stale.map((info) => ({ ...info, mtime: STALE_MTIME }))]
    })
    const scanned = range(14).flatMap((index) => [
      stale[index],
      ...(clean[index] ? [clean[index]] : []),
      ...(fresh[index] ? [fresh[index]] : [])
    ])

    const result = await harness.service.persist(scanned, OPTIONS)

    expect(result).toEqual({ added: 3, changed: 14 })
    expect(harness.withFileMutationSlice).toHaveBeenCalledTimes(2)
    const written = harness.applyBatchWithPersistence.mock.calls.map(([, records]) =>
      records.map((record) => record.name)
    )
    expect(written.map((names) => names.length)).toEqual([10, 7])
    expect(written.flat().some((name) => name.startsWith('clean-'))).toBe(false)
    expect(harness.emitCommittedScanProgress.mock.calls.map(([count]) => count)).toEqual([10, 7])
  })

  it('keeps the id of the row it rewrites', async () => {
    const stale = file('stale.png')
    const harness = createHarness({ indexed: [{ ...stale, mtime: STALE_MTIME }] })

    await harness.service.persist([stale], OPTIONS)

    expect(harness.mapRecord).toHaveBeenCalledTimes(1)
    expect(harness.mapRecord.mock.calls[0][0]).toMatchObject({ id: 1, path: stale.path })
  })

  it('compares the slice again under the lease, since the rows may have moved', async () => {
    const stale = file('moved.png')
    const harness = createHarness({ indexed: [{ ...stale, mtime: STALE_MTIME }] })
    const read = harness.readRows.getMockImplementation()!
    harness.readRows.mockImplementationOnce(async (paths) => {
      const rows = await read(paths)
      harness.store.set(stale.path, rowFor(stale, 1))
      return rows
    })

    const result = await harness.service.persist([stale], OPTIONS)

    expect(result).toEqual({ added: 0, changed: 0 })
    expect(harness.withFileMutationSlice).toHaveBeenCalledTimes(1)
    expect(harness.applyBatchWithPersistence).not.toHaveBeenCalled()
    expect(harness.emitCommittedScanProgress).toHaveBeenCalledWith(0, OPTIONS)
  })

  it('leaves out the records the index no longer admits', async () => {
    const harness = createHarness({
      admit: (records) => records.filter((record) => record.name !== 'old.png')
    })

    const result = await harness.service.persist([file('keep.png'), file('old.png')], OPTIONS)

    expect(result).toEqual({ added: 1, changed: 0 })
    for (const [paths] of harness.readRows.mock.calls) expect(paths).toEqual(['/shots/keep.png'])
    expect(harness.applyBatchWithPersistence.mock.calls[0][1].map((record) => record.name)).toEqual(
      ['keep.png']
    )
  })

  it('fails without taking a slice when the index cannot be read', async () => {
    const harness = createHarness()
    harness.readRows.mockRejectedValueOnce(new Error('SQLITE_BUSY'))

    await expect(harness.service.persist([file('a.png')], OPTIONS)).rejects.toThrow('SQLITE_BUSY')

    expect(harness.withFileMutationSlice).not.toHaveBeenCalled()
  })

  it('reports persistence that is not available', async () => {
    await expect(readFileRowsByPath(null, ['/shots/a.png'])).rejects.toThrow(
      'FILE_PROVIDER_PERSISTENCE_UNAVAILABLE'
    )
  })
})
