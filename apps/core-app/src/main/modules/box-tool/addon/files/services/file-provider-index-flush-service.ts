import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { IndexedWriteBufferService } from '../../../search-engine/indexing-write-buffer-service'

export interface IndexWorkerBusyRetryOptions {
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

export function getIndexWorkerFlushDelay(
  pendingSize: number,
  options: { baseDelayMs?: number; backlogDelayMs?: number; backlogThreshold?: number } = {}
): number {
  const baseDelayMs = options.baseDelayMs ?? 250
  const backlogDelayMs = options.backlogDelayMs ?? 500
  const backlogThreshold = options.backlogThreshold ?? 30
  return pendingSize > backlogThreshold ? backlogDelayMs : baseDelayMs
}

export function getIndexWorkerBusyRetryDelay(
  retryCount: number,
  options: IndexWorkerBusyRetryOptions = {}
): { delayMs: number; nextRetryCount: number } {
  const baseDelayMs = options.baseDelayMs ?? 250
  const maxDelayMs = options.maxDelayMs ?? 5000
  const random = options.random ?? Math.random

  const exponent = Math.min(Math.max(0, retryCount), 6)
  const base = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent)
  const jitterRange = Math.max(1, Math.round(base * 0.2))
  const jitter = Math.round((random() * 2 - 1) * jitterRange)

  return {
    delayMs: Math.max(baseDelayMs, base + jitter),
    nextRetryCount: retryCount + 1
  }
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
