import type { IndexedSource } from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import { IndexedSourceScanReasons } from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import { ScanScheduler } from './indexing-scan-scheduler'
import { IndexingSourceMutationGate } from './indexing-source-mutation-gate'

function buildSource(scan: IndexedSource['scan']): IndexedSource {
  return {
    descriptor: {
      id: 'test-source',
      kind: 'file',
      displayName: 'Test Source',
      platforms: ['darwin', 'win32', 'linux'],
      priority: 'deferred',
      storage: 'sqlite-index',
      privacy: 'low',
      capabilities: {
        scan: true,
        watch: false,
        reconcile: false,
        clear: true,
        open: true
      }
    },
    getHealth: async () => ({
      status: 'ready',
      permissionState: 'granted',
      itemCount: 0,
      watchState: 'not-supported',
      reconcileState: 'idle'
    }),
    getRoots: async () => [],
    scan
  }
}

describe('ScanScheduler', () => {
  it('guards concurrent scan tasks through the shared run gate', async () => {
    let releaseScan!: () => void
    const blocked = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const scan = vi.fn(async function* () {
      await blocked
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)
    const source = buildSource(scan)

    const first = scheduler.scanSource(source, IndexedSourceScanReasons.Scheduled)

    expect(scheduler.isRunning('test-source')).toBe(true)
    await expect(
      scheduler.scanSource(source, IndexedSourceScanReasons.ManualRebuild)
    ).rejects.toThrow("Indexed source 'test-source' scan is already running")

    releaseScan()
    await expect(first).resolves.toMatchObject({ sourceId: 'test-source' })
    expect(scheduler.isRunning('test-source')).toBe(false)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('uses store batch summaries for indexed record counts', async () => {
    const batch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        }
      ],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield batch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 1,
        indexedItemCount: 0,
        done: true
      })),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSource(buildSource(scan), IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      sourceId: 'test-source',
      batches: 1,
      records: 1,
      indexedRecords: 0
    })
  })

  it('classifies store failures separately from source scan failures', async () => {
    const batch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        }
      ],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield batch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {
        throw new Error('sqlite busy')
      }),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSourcesWithResult([buildSource(scan)], IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      failedSources: 1,
      errors: [
        {
          sourceId: 'test-source',
          message: 'sqlite busy',
          phase: 'store',
          batches: 0,
          records: 0,
          indexedRecords: 0
        }
      ]
    })
  })

  it('keeps partial counters when a source scan fails after applied batches', async () => {
    const firstBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file' as const,
          title: 'Record 1'
        },
        {
          sourceId: 'test-source',
          recordId: 'record-2',
          stableKey: 'record-2',
          kind: 'file' as const,
          title: 'Record 2'
        }
      ]
    }
    const scan = vi.fn(async function* () {
      yield firstBatch
      throw new Error('scanner crashed')
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 2,
        indexedItemCount: 1,
        done: false
      })),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSourcesWithResult([buildSource(scan)], IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      failedSources: 1,
      errors: [
        {
          sourceId: 'test-source',
          message: 'scanner crashed',
          phase: 'source',
          batches: 1,
          records: 2,
          indexedRecords: 1
        }
      ]
    })
  })

  it('applies empty done batches so completion reaches the runtime store boundary', async () => {
    const doneBatch = {
      sourceId: 'test-source',
      records: [],
      done: true
    }
    const scan = vi.fn(async function* () {
      yield doneBatch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.scanSource(buildSource(scan), IndexedSourceScanReasons.Scheduled)
    ).resolves.toMatchObject({
      sourceId: 'test-source',
      batches: 1,
      records: 0,
      indexedRecords: 0
    })

    expect(store.applyBatch).toHaveBeenCalledWith({
      ...doneBatch,
      mutationLeaseId: expect.any(String)
    })
  })

  it('stages SchemaMigration batches before committing the replacement after its terminal batch', async () => {
    const firstBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'one',
          stableKey: 'one',
          kind: 'file' as const,
          title: 'One'
        }
      ]
    }
    const terminalBatch = { sourceId: 'test-source', records: [], done: true }
    const scan = vi.fn(async function* () {
      yield firstBatch
      yield terminalBatch
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 2
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store)

    await expect(
      scheduler.replaceSourceFromSnapshotWithinLease(
        buildSource(scan),
        IndexedSourceScanReasons.SchemaMigration
      )
    ).resolves.toMatchObject({
      removedIndexedItems: 2,
      snapshot: { batches: 2, records: 1, indexedRecords: 1 }
    })

    expect(store.stageSourceReplacement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceId: 'test-source' }),
      firstBatch.records
    )
    expect(store.stageSourceReplacement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceId: 'test-source' }),
      terminalBatch.records
    )
    expect(store.commitSourceReplacement).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'test-source' }),
      { recordCount: 1, indexedItemCount: 1 }
    )
    expect(store.replaceSource).not.toHaveBeenCalled()
    expect(store.clearSource).not.toHaveBeenCalled()
  })

  it('commits an authoritative snapshot before draining same-lease enrichment and rejects snapshot deltas', async () => {
    const gate = new IndexingSourceMutationGate()
    const order: string[] = []
    const drainStarted = Promise.withResolvers<void>()
    const releaseDrain = Promise.withResolvers<void>()
    let scanLeaseId: string | undefined
    let snapshotCommitted = false
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async (delta) => {
        expect(snapshotCommitted).toBe(true)
        expect(delta.mutationLeaseId).toBe(scanLeaseId)
        order.push('enrichment')
      }),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => {
        order.push('begin')
        return { sourceId, replacementId: 'replacement' }
      }),
      stageSourceReplacement: vi.fn(async (_session, records) => {
        order.push('stage')
        return records.length
      }),
      commitSourceReplacement: vi.fn(async (session, totals) => {
        order.push('commit')
        snapshotCommitted = true
        return { sourceId: session.sourceId, ...totals, removedIndexedItems: 0 }
      }),
      abortSourceReplacement: vi.fn(async () => {}),
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const source = buildSource(async function* (request) {
      scanLeaseId = request.mutationLeaseId
      expect(request.onDelta).toEqual(expect.any(Function))
      await expect(
        request.onDelta!({ sourceId: 'test-source', action: 'change', path: '/tmp/late.txt' })
      ).rejects.toThrow('emitted a delta during authoritative snapshot replacement')
      order.push('snapshot')
      yield { sourceId: 'test-source', records: [], done: true }
    })
    source.drainMutations = vi.fn(async ({ leaseId }) => {
      expect(leaseId).toBe(scanLeaseId)
      expect(snapshotCommitted).toBe(true)
      order.push('drain')
      drainStarted.resolve()
      await releaseDrain.promise
      await store.applyDelta({
        sourceId: 'test-source',
        action: 'change',
        path: '/tmp/enriched.txt',
        mutationLeaseId: leaseId
      })
    })
    const scheduler = new ScanScheduler(store, undefined, gate)
    const replacement = gate.run('test-source', async (lease) => {
      return await scheduler.replaceSourceFromSnapshotWithinLease(
        source,
        IndexedSourceScanReasons.ManualRebuild,
        {},
        lease
      )
    })

    await drainStarted.promise
    const exclusive = gate.runExclusive('test-source', async () => {
      order.push('exclusive')
    })
    expect(order).toEqual(['begin', 'snapshot', 'stage', 'commit', 'drain'])

    releaseDrain.resolve()
    await replacement
    await exclusive

    expect(scanLeaseId).toEqual(expect.any(String))
    expect(order).toEqual([
      'begin',
      'snapshot',
      'stage',
      'commit',
      'drain',
      'enrichment',
      'exclusive'
    ])
  })

  it('reports a post-commit drain failure as store phase without aborting the replacement', async () => {
    const abortSourceReplacement = vi.fn(async () => {})
    const commitSourceReplacement = vi.fn(async (session, totals) => ({
      sourceId: session.sourceId,
      ...totals,
      removedIndexedItems: 0
    }))
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement,
      abortSourceReplacement,
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const source = buildSource(async function* () {
      yield { sourceId: 'test-source', records: [], done: true }
    })
    source.drainMutations = vi.fn(async () => {
      throw new Error('worker enrichment failed')
    })
    const gate = new IndexingSourceMutationGate()

    await expect(
      gate.run('test-source', async (lease) => {
        return await new ScanScheduler(store, undefined, gate).replaceSourceFromSnapshotWithinLease(
          source,
          IndexedSourceScanReasons.ManualRebuild,
          {},
          lease
        )
      })
    ).rejects.toMatchObject({
      name: 'ScanSchedulerStoreError',
      phase: 'store',
      message: 'committed-degraded: worker enrichment failed'
    })

    expect(commitSourceReplacement).toHaveBeenCalledOnce()
    expect(abortSourceReplacement).not.toHaveBeenCalled()
  })

  it('drains the failed pre-commit lease before aborting its staged replacement', async () => {
    const gate = new IndexingSourceMutationGate()
    const order: string[] = []
    let scanLeaseId: string | undefined
    const abortSourceReplacement = vi.fn(async () => {
      order.push('abort')
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement,
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const source = buildSource(async function* (request) {
      scanLeaseId = request.mutationLeaseId
      order.push('scan')
      throw new Error('snapshot collection failed')
    })
    source.drainMutations = vi.fn(async ({ leaseId }) => {
      expect(leaseId).toBe(scanLeaseId)
      order.push('drain')
    })

    await expect(
      gate.run('test-source', async (lease) => {
        return await new ScanScheduler(store, undefined, gate).replaceSourceFromSnapshotWithinLease(
          source,
          IndexedSourceScanReasons.ManualRebuild,
          {},
          lease
        )
      })
    ).rejects.toMatchObject({
      name: 'ScanSchedulerSourceError',
      phase: 'source',
      message: 'snapshot collection failed'
    })

    expect(scanLeaseId).toEqual(expect.any(String))
    expect(order).toEqual(['scan', 'drain', 'abort'])
  })

  it.each([
    {
      name: 'source iterator failure',
      scan: async function* () {
        throw new Error('source failed')
      },
      stage: vi.fn(async (_session, records) => records.length),
      commit: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      }))
    },
    {
      name: 'batch staging failure',
      scan: async function* () {
        yield {
          sourceId: 'test-source',
          records: [
            {
              sourceId: 'test-source',
              recordId: 'one',
              stableKey: 'one',
              kind: 'file' as const,
              title: 'One'
            }
          ],
          done: true
        }
      },
      stage: vi.fn(async () => {
        throw new Error('stage failed')
      }),
      commit: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      }))
    },
    {
      name: 'replacement commit failure',
      scan: async function* () {
        yield { sourceId: 'test-source', records: [], done: true }
      },
      stage: vi.fn(async (_session, records) => records.length),
      commit: vi.fn(async () => {
        throw new Error('commit failed')
      })
    }
  ])('aborts without clearing the live source after $name', async ({ scan, stage, commit }) => {
    const abortSourceReplacement = vi.fn(async () => {})
    const clearSource = vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 }))
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: stage,
      commitSourceReplacement: commit,
      abortSourceReplacement,
      clearSource,
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }

    await expect(
      new ScanScheduler(store).replaceSourceFromSnapshotWithinLease(
        buildSource(scan),
        IndexedSourceScanReasons.SchemaMigration
      )
    ).rejects.toThrow(/failed/)

    expect(abortSourceReplacement).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'test-source' })
    )
    expect(clearSource).not.toHaveBeenCalled()
  })

  it('attaches one mutation lease to scan batches and drains source mutations after writer apply', async () => {
    const order: string[] = []
    const batch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'one',
          stableKey: 'one',
          kind: 'file' as const,
          title: 'One'
        }
      ],
      done: true
    }
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async (applied) => {
        order.push('apply')
        return {
          sourceId: applied.sourceId,
          recordCount: applied.records.length,
          indexedItemCount: applied.records.length,
          done: applied.done === true
        }
      }),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const source = buildSource(async function* () {
      yield batch
    })
    source.drainMutations = vi.fn(async (request) => {
      order.push('drain')
      expect(request.leaseId).toEqual(expect.any(String))
    })

    await new ScanScheduler(store).scanSource(source, IndexedSourceScanReasons.Scheduled)

    expect(store.applyBatch).toHaveBeenCalledWith(
      expect.objectContaining({ mutationLeaseId: expect.any(String) })
    )
    expect(order).toEqual(['apply', 'drain'])
  })

  it('drains applied source mutations before releasing the lease when a later scan batch fails', async () => {
    const sourceError = new Error('scanner crashed')
    const order: string[] = []
    const gate = new IndexingSourceMutationGate()
    const source = buildSource(async function* () {
      yield {
        sourceId: 'test-source',
        records: [
          {
            sourceId: 'test-source',
            recordId: 'one',
            stableKey: 'one',
            kind: 'file' as const,
            title: 'One'
          }
        ]
      }
      throw sourceError
    })
    source.drainMutations = vi.fn(async () => {
      order.push('drain')
    })
    const store: IndexStoreAdapter = {
      applyBatch: vi.fn(async (batch) => {
        order.push('apply')
        return {
          sourceId: batch.sourceId,
          recordCount: batch.records.length,
          indexedItemCount: batch.records.length,
          done: false
        }
      }),
      applyDelta: vi.fn(async () => {}),
      replaceSource: vi.fn(async () => ({
        sourceId: 'test-source',
        recordCount: 0,
        indexedItemCount: 0,
        removedIndexedItems: 0
      })),
      beginSourceReplacement: vi.fn(async (sourceId) => ({
        sourceId,
        replacementId: 'replacement'
      })),
      stageSourceReplacement: vi.fn(async (_session, records) => records.length),
      commitSourceReplacement: vi.fn(async (session, totals) => ({
        sourceId: session.sourceId,
        ...totals,
        removedIndexedItems: 0
      })),
      abortSourceReplacement: vi.fn(async () => {}),
      clearSource: vi.fn(async () => ({ sourceId: 'test-source', removedIndexedItems: 0 })),
      cleanupSource: vi.fn(async () => ({ sourceId: 'test-source', removedOrphanedKeywords: 0 })),
      countSource: vi.fn(async () => 0)
    }
    const scheduler = new ScanScheduler(store, undefined, gate)
    const scan = scheduler.scanSource(source, IndexedSourceScanReasons.Scheduled)
    const exclusive = gate.runExclusive('test-source', async () => {
      order.push('exclusive')
    })

    await expect(scan).rejects.toMatchObject({
      phase: 'source',
      message: 'scanner crashed',
      batches: 1,
      records: 1,
      indexedRecords: 1
    })
    await exclusive

    expect(order).toEqual(['apply', 'drain', 'exclusive'])
  })
})
