import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { IndexedWriteBufferService } from '@talex-touch/utils/search'
import {
  getIndexedWriteFlushDelay,
  getIndexedWriteFlushExponentialRetryDelay
} from '@talex-touch/utils/search'

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
  private readonly buffer: IndexedWriteBufferService<number, IndexWorkerFileResult>

  constructor(
    pending: Map<number, IndexWorkerFileResult>,
    inflight: Map<number, IndexWorkerFileResult>
  ) {
    this.buffer = new IndexedWriteBufferService(pending, inflight)
  }

  get pendingSize(): number {
    return this.buffer.pendingSize
  }

  get inflightSize(): number {
    return this.buffer.inflightSize
  }

  enqueue(payload: IndexWorkerFileResult): number {
    return this.buffer.enqueue(payload.fileId, payload)
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
