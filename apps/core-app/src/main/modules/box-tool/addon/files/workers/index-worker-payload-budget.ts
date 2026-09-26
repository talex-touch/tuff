/**
 * Conservative structured-clone payload budgeting for file-index worker results.
 *
 * Walks JSON-like values and binary views without serializing or cloning. It
 * budgets UTF-16 strings, scalars, container slots and binary byteLength, stops
 * at the byte limit, and rejects ancestor cycles, unsupported object types and
 * excessive depth. Reused acyclic subobjects remain valid.
 *
 * This is an admission-budget heuristic, NOT an exact V8 heap measurement — it
 * deliberately over-estimates small scalars and may over-count retained bytes.
 */

/** Per-file result budget: 1 MiB. */
export const INDEX_WORKER_RESULT_MAX_BYTES = 1024 * 1024

/** Admitted batch/results budget including pending and inflight ownership: 32 MiB. */
export const INDEX_WORKER_BATCH_MAX_BYTES = 32 * 1024 * 1024

/** Explicit failed-result reason for oversize output. Never a silent drop. */
export const INDEX_WORKER_RESULT_TOO_LARGE = 'result-too-large'

const PAYLOAD_MAX_DEPTH = 12
const SCALAR_BYTES = 8
const TINY_BYTES = 1

export interface IndexWorkerPayloadBudget {
  /** Estimate, capped at `limit`. */
  bytes: number
  exceedsBudget: boolean
  /** The walk hit a cycle or the depth ceiling; treat as oversize (fail closed). */
  indeterminate: boolean
}

export function measureIndexWorkerPayloadBytes(
  value: unknown,
  limit = INDEX_WORKER_RESULT_MAX_BYTES
): IndexWorkerPayloadBudget {
  const seen = new WeakSet<object>()
  let bytes = 0
  let indeterminate = false

  const walk = (node: unknown, depth: number): void => {
    if (indeterminate || bytes > limit) return
    if (typeof node === 'string') {
      bytes += node.length * 2
      return
    }
    if (typeof node === 'number' || typeof node === 'bigint') {
      bytes += SCALAR_BYTES
      return
    }
    if (typeof node === 'boolean' || node === null || node === undefined) {
      bytes += TINY_BYTES
      return
    }
    if (typeof node !== 'object' || depth >= PAYLOAD_MAX_DEPTH || seen.has(node)) {
      indeterminate = true
      return
    }
    bytes += 16
    if (ArrayBuffer.isView(node)) {
      bytes += node.byteLength
      return
    }
    if (
      node instanceof ArrayBuffer ||
      (typeof SharedArrayBuffer !== 'undefined' && node instanceof SharedArrayBuffer)
    ) {
      bytes += node.byteLength
      return
    }
    if (node instanceof Date) {
      bytes += SCALAR_BYTES
      return
    }
    const isArray = Array.isArray(node)
    const prototype = Object.getPrototypeOf(node)
    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      indeterminate = true
      return
    }
    seen.add(node)
    try {
      if (isArray) {
        for (let index = 0; index < node.length; index += 1) {
          bytes += SCALAR_BYTES
          walk(node[index], depth + 1)
          if (indeterminate || bytes > limit) return
        }
        return
      }
      const record = node as Record<string, unknown>
      for (const key in record) {
        if (!Object.hasOwn(record, key)) continue
        bytes += SCALAR_BYTES + key.length * 2
        walk(record[key], depth + 1)
        if (indeterminate || bytes > limit) return
      }
    } finally {
      seen.delete(node)
    }
  }

  walk(value, 0)
  return {
    bytes: Math.min(bytes, limit),
    exceedsBudget: indeterminate || bytes > limit,
    indeterminate
  }
}

export function estimateIndexWorkerFileResultBytes(result: unknown): number {
  return measureIndexWorkerPayloadBytes(result, INDEX_WORKER_RESULT_MAX_BYTES).bytes
}

export function estimateIndexWorkerFileResultsBytes(results: Iterable<unknown>): number {
  let bytes = 0
  for (const result of results) {
    bytes += estimateIndexWorkerFileResultBytes(result)
  }
  return bytes
}
