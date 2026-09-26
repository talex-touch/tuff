import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import {
  IndexedEntryKeyedWriteBufferService,
  IndexedWriteBufferService
} from '@talex-touch/utils/search'
import {
  getIndexedWriteFlushDelay,
  getIndexedWriteFlushExponentialRetryDelay
} from '@talex-touch/utils/search'
import { estimateIndexWorkerFileResultsBytes } from '../workers/index-worker-payload-budget'

export interface IndexWorkerBusyRetryOptions {
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

export function getIndexWorkerFlushDelay(
  pendingSize: number,
  options: { baseDelayMs?: number; backlogDelayMs?: number; backlogThreshold?: number } = {}
): number {
  return getIndexedWriteFlushDelay(pendingSize, options)
}

export function getIndexWorkerBusyRetryDelay(
  retryCount: number,
  options: IndexWorkerBusyRetryOptions = {}
): { delayMs: number; nextRetryCount: number } {
  return getIndexedWriteFlushExponentialRetryDelay(retryCount, options)
}

export function takeIndexWorkerFlushBatch(
  pending: Map<number, IndexWorkerFileResult>,
  inflight: Map<number, IndexWorkerFileResult>,
  maxEntries: number
): { entries: IndexWorkerFileResult[]; keys: number[] } {
  return new IndexedWriteBufferService(pending, inflight).take(maxEntries)
}

export function commitIndexWorkerFlushBatch(
  inflight: Map<number, IndexWorkerFileResult>,
  keys: number[]
): void {
  new IndexedWriteBufferService(new Map<number, IndexWorkerFileResult>(), inflight).commit(keys)
}

export function rollbackIndexWorkerFlushBatch(
  pending: Map<number, IndexWorkerFileResult>,
  inflight: Map<number, IndexWorkerFileResult>,
  keys: number[]
): void {
  new IndexedWriteBufferService(pending, inflight).rollback(keys)
}

export class FileProviderIndexFlushBufferService {
  private readonly buffer: IndexedEntryKeyedWriteBufferService<number, IndexWorkerFileResult>

  constructor(
    private readonly pending: Map<number, IndexWorkerFileResult>,
    private readonly inflight: Map<number, IndexWorkerFileResult>
  ) {
    this.buffer = new IndexedEntryKeyedWriteBufferService(
      pending,
      inflight,
      (entry) => entry.fileId
    )
  }

  get pendingSize(): number {
    return this.buffer.pendingSize
  }

  get inflightSize(): number {
    return this.buffer.inflightSize
  }

  get pendingBytes(): number {
    return estimateIndexWorkerFileResultsBytes(this.pending.values())
  }

  get inflightBytes(): number {
    return estimateIndexWorkerFileResultsBytes(this.inflight.values())
  }

  enqueue(payload: IndexWorkerFileResult): number {
    const version = payload.fileVersion
    if (typeof version === 'number' && Number.isFinite(version)) {
      // A result produced for an older file version must never displace a newer
      // one already owned here. The persistence fence is the authoritative
      // guard; this keeps stale results from occupying capacity at all.
      const newestOwned = Math.max(
        this.pending.get(payload.fileId)?.fileVersion ?? Number.NEGATIVE_INFINITY,
        this.inflight.get(payload.fileId)?.fileVersion ?? Number.NEGATIVE_INFINITY
      )
      if (version < newestOwned) return this.buffer.pendingSize
    }
    return this.buffer.enqueue(payload)
  }

  take(maxEntries: number): { entries: IndexWorkerFileResult[]; keys: number[] } {
    return this.buffer.take(maxEntries)
  }

  commit(keys: number[]): void {
    this.buffer.commit(keys)
  }

  rollback(keys: number[]): void {
    this.buffer.rollback(keys)
  }
}
