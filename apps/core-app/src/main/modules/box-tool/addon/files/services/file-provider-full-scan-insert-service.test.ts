import { describe, expect, it } from 'vitest'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'
import {
  FileProviderFullScanInsertService,
  resolveFullScanPacingMs
} from './file-provider-full-scan-insert-service'

const records: UpsertFileRecord[] = Array.from({ length: 21 }, (_, index) => ({
  path: `/root/${index}.txt`,
  name: `${index}.txt`,
  size: index,
  mtime: new Date(1000),
  ctime: new Date(1000),
  lastIndexedAt: new Date(2000),
  isDir: false,
  type: 'file'
}))

describe('full scan insertion ownership and pacing', () => {
  it('caps an oversized adaptive batch and does not persist another slice before publication and pacing', async () => {
    const persisted: string[] = []
    const publicationEntered = Promise.withResolvers<void>()
    const publicationReleased = Promise.withResolvers<void>()
    let clock = 0
    let needsPause = false
    const service = new FileProviderFullScanInsertService<undefined>({
      getBatchSize: () => 50,
      recordBatchDuration: () => undefined,
      waitForIdle: async () => undefined,
      persistAndEmitBatch: async (chunk) => {
        if (chunk.length > 10) throw new Error('worker transaction exceeds source slice limit')
        if (needsPause) throw new Error('next write arrived before cooperative pause')
        const admitted = chunk.filter((record) => record.path !== '/root/6.txt')
        persisted.push(...admitted.map((record) => record.path))
        clock += 10
        if (chunk[0].path === '/root/0.txt') {
          publicationEntered.resolve()
          await publicationReleased.promise
        }
        needsPause = true
        return { insertedCount: admitted.length, workerCpuMicros: 1000 }
      },
      emitProgress: () => undefined,
      sleep: async (duration) => {
        clock += duration
        needsPause = false
      },
      now: () => clock,
      formatDuration: (duration) => `${duration}ms`,
      logInfo: () => undefined,
      logDebug: () => undefined
    })
    const operation = service.execute('/root', records, undefined)
    try {
      await publicationEntered.promise
      expect(persisted).toEqual(
        records
          .slice(0, 10)
          .filter((record) => record.path !== '/root/6.txt')
          .map((record) => record.path)
      )
      publicationReleased.resolve()
      expect(await operation).toEqual({ insertedCount: 20 })
      expect(persisted).toEqual(
        records.filter((record) => record.path !== '/root/6.txt').map((record) => record.path)
      )
      expect(clock).toBe(780)
    } finally {
      publicationReleased.resolve()
      await operation
    }
  })

  it('stops at the committed boundary when cooperative pacing is cancelled', async () => {
    const persisted: string[] = []
    const cancellation = new Error('scan cancelled during backoff')
    const service = new FileProviderFullScanInsertService<undefined>({
      getBatchSize: () => 10,
      recordBatchDuration: () => undefined,
      waitForIdle: async () => undefined,
      persistAndEmitBatch: async (chunk) => {
        persisted.push(...chunk.map((record) => record.path))
        return { insertedCount: chunk.length, workerCpuMicros: 1000 }
      },
      emitProgress: () => undefined,
      sleep: async () => {
        throw cancellation
      },
      now: () => 0,
      formatDuration: (duration) => `${duration}ms`,
      logInfo: () => undefined,
      logDebug: () => undefined
    })
    await expect(service.execute('/root', records, undefined)).rejects.toBe(cancellation)
    expect(persisted).toEqual(records.slice(0, 10).map((record) => record.path))
  })

  it('waits outside persistence for idle before beginning any fullscan transaction', async () => {
    const idleEntered = Promise.withResolvers<void>()
    const idleReleased = Promise.withResolvers<void>()
    const persisted: string[] = []
    const service = new FileProviderFullScanInsertService<undefined>({
      getBatchSize: () => 10,
      recordBatchDuration: () => undefined,
      waitForIdle: async () => {
        idleEntered.resolve()
        await idleReleased.promise
      },
      persistAndEmitBatch: async (chunk) => {
        persisted.push(...chunk.map((record) => record.path))
        return { insertedCount: chunk.length, workerCpuMicros: 1000 }
      },
      emitProgress: () => undefined,
      sleep: async () => undefined,
      now: () => 0,
      formatDuration: (duration) => `${duration}ms`,
      logInfo: () => undefined,
      logDebug: () => undefined
    })
    const operation = service.execute('/root', records.slice(0, 1), undefined)
    try {
      await idleEntered.promise
      expect(persisted).toEqual([])
      idleReleased.resolve()
      expect(await operation).toEqual({ insertedCount: 1 })
      expect(persisted).toEqual(['/root/0.txt'])
    } finally {
      idleReleased.resolve()
      await operation
    }
  })

  it.each([
    { name: 'fast transaction still cooperates', batchMs: 20, cpu: 1000, expected: 250 },
    { name: 'just below proportional backoff', batchMs: 249, cpu: 1000, expected: 250 },
    { name: 'at proportional backoff boundary', batchMs: 250, cpu: 1000, expected: 250 },
    { name: 'slow transaction proportional gap', batchMs: 350, cpu: 1000, expected: 350 },
    { name: 'proportional gap cap', batchMs: 1500, cpu: 1000, expected: 1000 },
    {
      name: 'CPU duty budget dominates gap',
      batchMs: 100,
      cpu: 350_000,
      expected: 900,
      tolerance: 1
    },
    {
      name: 'CPU budget is not truncated by proportional cap',
      batchMs: 100,
      cpu: 700_000,
      expected: 1900,
      tolerance: 1
    }
  ])('preserves $name', (row) => {
    const pause = resolveFullScanPacingMs(row.batchMs, row.cpu)
    expect(pause).toBeGreaterThanOrEqual(row.expected)
    expect(pause).toBeLessThanOrEqual(row.expected + (row.tolerance ?? 0))
  })
})
