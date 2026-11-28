import { describe, expect, it } from 'vitest'
import { runReconciliationMemoryBenchmark } from './file-reconcile-memory-benchmark.mjs'

describe('file reconciliation + SQLite persistence memory benchmark (#318 / R3)', () => {
  it('reconciles inserts, updates, and keyset-paginated deletions with exact row parity and bounded page size', async () => {
    const result = await runReconciliationMemoryBenchmark({
      fileCount: 400,
      batchSize: 100,
      pageSize: 64,
      addRatio: 0.1,
      updateRatio: 0.1,
      deleteRatio: 0.1
    })

    expect(result.cancelled).toBe(false)
    expect(result.parityOk, result.parityIssues.join('; ')).toBe(true)
    expect(result.dbRowCount).toBe(400)
    expect(result.added).toBe(40)
    expect(result.changed).toBe(40)
    expect(result.deleted).toBe(40)
    expect(result.skipped).toBe(320)
    expect(result.maxScanBatch).toBeLessThanOrEqual(100)
    expect(result.maxMissingPageRows).toBeLessThanOrEqual(64)
    expect(result.missingPagesScanned).toBeGreaterThanOrEqual(7)
    if (result.openHandlesBefore !== null && result.openHandlesAfter !== null) {
      expect(result.openHandlesAfter).toBeLessThanOrEqual(result.openHandlesBefore + 2)
    }
  }, 30_000)

  it('aborts cleanly on cancellation without running destructive missing-row deletions', async () => {
    const result = await runReconciliationMemoryBenchmark({
      fileCount: 500,
      batchSize: 100,
      pageSize: 64,
      cancelAt: 200
    })

    expect(result.cancelled).toBe(true)
    expect(result.parityOk, result.parityIssues.join('; ')).toBe(true)
    expect(result.deleted).toBe(0)
    expect(result.missingPagesScanned).toBe(0)
  }, 30_000)
})
