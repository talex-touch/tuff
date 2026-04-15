import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'

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
  const entries: IndexWorkerFileResult[] = []
  const keys: number[] = []

  for (const [key, value] of pending) {
    entries.push(value)
    keys.push(key)
    pending.delete(key)
    inflight.set(key, value)
    if (entries.length >= maxEntries) {
      break
    }
  }

  return { entries, keys }
}

export function commitIndexWorkerFlushBatch(
  inflight: Map<number, IndexWorkerFileResult>,
  keys: number[]
): void {
  for (const key of keys) {
    inflight.delete(key)
  }
}

export function rollbackIndexWorkerFlushBatch(
  pending: Map<number, IndexWorkerFileResult>,
  inflight: Map<number, IndexWorkerFileResult>,
  keys: number[]
): void {
  for (const key of keys) {
    const inflightValue = inflight.get(key)
    if (!inflightValue) {
      continue
    }
    if (!pending.has(key)) {
      pending.set(key, inflightValue)
    }
    inflight.delete(key)
  }
}
