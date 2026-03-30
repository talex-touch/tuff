import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { describe, expect, it } from 'vitest'
import {
  commitIndexWorkerFlushBatch,
  getIndexWorkerBusyRetryDelay,
  getIndexWorkerFlushDelay,
  rollbackIndexWorkerFlushBatch,
  takeIndexWorkerFlushBatch
} from './file-provider-index-flush-service'

function createResult(fileId: number, content: string): IndexWorkerFileResult {
  return {
    type: 'file',
    taskId: `task-${fileId}`,
    fileId,
    progress: {
      status: 'completed',
      progress: 100,
      processedBytes: 1,
      totalBytes: 1,
      lastError: null,
      updatedAt: new Date().toISOString()
    },
    fileUpdate: {
      content,
      embeddingStatus: 'pending',
      contentHash: null
    },
    indexItem: {
      itemId: String(fileId),
      providerId: 'file-provider',
      type: 'file',
      name: `file-${fileId}`,
      content
    }
  }
}

describe('file-provider-index-flush-service', () => {
  it('失败回补时保留 pending 中更“新”的 payload', () => {
    const pending = new Map<number, IndexWorkerFileResult>([
      [1, createResult(1, 'old-content')],
      [2, createResult(2, 'file-2')]
    ])
    const inflight = new Map<number, IndexWorkerFileResult>()

    const firstBatch = takeIndexWorkerFlushBatch(pending, inflight, 2)
    expect(firstBatch.keys).toEqual([1, 2])
    expect(pending.size).toBe(0)
    expect(inflight.size).toBe(2)

    // flush 期间 fileId=1 收到更新数据，写到 pending 中
    pending.set(1, createResult(1, 'new-content'))

    rollbackIndexWorkerFlushBatch(pending, inflight, firstBatch.keys)

    expect(inflight.size).toBe(0)
    expect(pending.get(1)?.indexItem.content).toBe('new-content')
    expect(pending.get(2)?.indexItem.content).toBe('file-2')

    const retryBatch = takeIndexWorkerFlushBatch(pending, inflight, 2)
    expect(retryBatch.entries.map((entry) => entry.fileId).sort((a, b) => a - b)).toEqual([1, 2])
    expect(retryBatch.entries.find((entry) => entry.fileId === 1)?.indexItem.content).toBe(
      'new-content'
    )

    commitIndexWorkerFlushBatch(inflight, retryBatch.keys)
    expect(inflight.size).toBe(0)
  })

  it('flush delay 在 backlog 时切换到更长延迟', () => {
    expect(getIndexWorkerFlushDelay(5)).toBe(250)
    expect(getIndexWorkerFlushDelay(31)).toBe(500)
  })

  it('busy 重试 delay 递增并受上限保护', () => {
    const first = getIndexWorkerBusyRetryDelay(0, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })
    const second = getIndexWorkerBusyRetryDelay(first.nextRetryCount, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })
    const capped = getIndexWorkerBusyRetryDelay(10, {
      baseDelayMs: 200,
      maxDelayMs: 1000,
      random: () => 0.5
    })

    expect(first.delayMs).toBe(200)
    expect(second.delayMs).toBe(400)
    expect(capped.delayMs).toBe(1000)
  })
})
