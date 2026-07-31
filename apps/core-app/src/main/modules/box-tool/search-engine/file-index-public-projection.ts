/**
 * File Index public-boundary sanitizers for indexed-source diagnostics
 * (issue #476).
 *
 * Indexed-source runtime/evidence structures are shared by many sources and
 * are intentionally not redesigned here. This module projects ONLY the
 * file-provider source's diagnostics at the main-to-renderer handler boundary
 * so raw exception text (SQL, params, absolute paths, stack) stored in
 * runtime task state, health fallbacks, or flush evidence can never reach the
 * renderer. Stable classification codes (`FILE_INDEX_*`, identifier-shaped
 * operational labels) are preserved so UI chips stay meaningful.
 */
import type {
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceEvidence,
  IndexedSourceReconcileResult,
  IndexedSourceResetResult,
  IndexedSourceTaskHistoryEntry
} from '@talex-touch/utils/search'
import type { OperationalErrorReport } from '@talex-touch/utils'
import { isSqliteBusyError } from '../../../db/sqlite-retry'
import { operationalErrorService } from '../../observability'
import { FILE_INDEXED_SOURCE_ID } from './file-indexed-source'

/** Stable codes/labels: `FILE_INDEX_DATABASE_BUSY`, `scan-failed`, `file-persistence`. */
const STABLE_PUBLIC_TOKEN_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/

const SENSITIVE_METADATA_KEY_PATTERN =
  /(query|text|keyword|path|file|folder|url|email|token|secret|password|credential|clipboard|content|prompt|response|html|image|screenshot|body|payload|stack|trace|request|headers|cookie|sql|params|error|message)/i

function stableTokenOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return STABLE_PUBLIC_TOKEN_PATTERN.test(value) ? value : undefined
}

function sanitizeEvidenceMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const output: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) continue
    if (typeof raw === 'boolean' || typeof raw === 'number') {
      output[key] = raw
      continue
    }
    const token = stableTokenOrUndefined(raw)
    if (token !== undefined) output[key] = token
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function sanitizeEvidence(evidence: IndexedSourceEvidence): IndexedSourceEvidence {
  return {
    ...evidence,
    reason: stableTokenOrUndefined(evidence.reason),
    metadata: sanitizeEvidenceMetadata(evidence.metadata)
  }
}

function sanitizeTaskSummary(
  summary: IndexedSourceTaskHistoryEntry['summary']
): IndexedSourceTaskHistoryEntry['summary'] {
  if (!summary) return summary
  const output: Record<string, string | number | boolean | undefined> = {}
  for (const [key, raw] of Object.entries(summary)) {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) continue
    if (typeof raw === 'boolean' || typeof raw === 'number') {
      output[key] = raw
      continue
    }
    output[key] = stableTokenOrUndefined(raw)
  }
  return output
}

function sanitizeTaskHistoryEntry(
  entry: IndexedSourceTaskHistoryEntry
): IndexedSourceTaskHistoryEntry {
  return {
    ...entry,
    reason: stableTokenOrUndefined(entry.reason),
    errorMessage: undefined,
    error: stableTokenOrUndefined(entry.error),
    summary: sanitizeTaskSummary(entry.summary)
  }
}

/**
 * Project one file-provider source diagnostics entry, dropping or reducing
 * every free-form error/path field the runtime may have recorded.
 */
export function sanitizeFileIndexSourceDiagnostics(
  source: IndexedSourceDiagnostics
): IndexedSourceDiagnostics {
  if (source.descriptor.id !== FILE_INDEXED_SOURCE_ID) return source

  return {
    ...source,
    health: {
      ...source.health,
      reason: stableTokenOrUndefined(source.health.reason),
      lastError: stableTokenOrUndefined(source.health.lastError)
    },
    progress: source.progress
      ? { ...source.progress, reason: stableTokenOrUndefined(source.progress.reason) }
      : source.progress,
    evidence: source.evidence?.map(sanitizeEvidence),
    recentTasks: source.recentTasks?.map(sanitizeTaskHistoryEntry),
    lastScan: source.lastScan
      ? { ...source.lastScan, error: stableTokenOrUndefined(source.lastScan.error) }
      : source.lastScan,
    lastWatch: source.lastWatch
      ? {
          ...source.lastWatch,
          // The changed-file absolute path stays in main-process diagnostics.
          path: '',
          error: stableTokenOrUndefined(source.lastWatch.error)
        }
      : source.lastWatch,
    lastReconcile: source.lastReconcile
      ? { ...source.lastReconcile, error: stableTokenOrUndefined(source.lastReconcile.error) }
      : source.lastReconcile,
    lastReset: source.lastReset
      ? { ...source.lastReset, error: stableTokenOrUndefined(source.lastReset.error) }
      : source.lastReset
  }
}

/** Apply the file-provider projection across a full diagnostics snapshot. */
export function sanitizeFileIndexDiagnosticsSnapshot(
  snapshot: IndexedSourceDiagnosticsSnapshot
): IndexedSourceDiagnosticsSnapshot {
  return {
    ...snapshot,
    sources: snapshot.sources.map((source) =>
      source.descriptor.id === FILE_INDEXED_SOURCE_ID
        ? sanitizeFileIndexSourceDiagnostics(source)
        : source
    )
  }
}

/** Project a file-provider reconcile result: no raw delta errors or reasons. */
export function sanitizeFileIndexReconcileResult(
  result: IndexedSourceReconcileResult
): IndexedSourceReconcileResult {
  if (result.sourceId !== FILE_INDEXED_SOURCE_ID) return result
  return {
    ...result,
    reason: stableTokenOrUndefined(result.reason),
    deltaErrors: result.deltaErrors?.map(() => 'FILE_INDEX_DELTA_FAILED')
  }
}

/**
 * Project a file-provider reset result. The runtime reset path already stores
 * facade-safe failures; anything that is not a stable token (e.g. a free-form
 * source-provided message) is dropped in favor of `errorCode`.
 */
export function sanitizeFileIndexResetResult(
  result: IndexedSourceResetResult
): IndexedSourceResetResult {
  if (result.sourceId !== FILE_INDEXED_SOURCE_ID) return result
  return {
    ...result,
    error: stableTokenOrUndefined(result.error)
  }
}

type FileIndexTransportOperation =
  | 'STATUS'
  | 'STATS'
  | 'FAILED_FILES'
  | 'BATTERY_LEVEL'
  | 'ADD_PATH'
  | 'REBUILD'
  | 'SCAN'
  | 'RECONCILE'
  | 'RESET'
  | 'DIAGNOSTICS'

/**
 * Report a File Index transport-handler failure once (full detail stays in
 * main-local diagnostics + sinks) and return the stable public classification
 * for the projected result DTO.
 */
export function reportFileIndexTransportFailure(
  operation: FileIndexTransportOperation,
  error: unknown
): OperationalErrorReport {
  const busy = isSqliteBusyError(error)
  return operationalErrorService.report({
    domain: 'file-index',
    operation: `transport.${operation.toLowerCase()}`,
    error,
    code: busy ? 'FILE_INDEX_DATABASE_BUSY' : `FILE_INDEX_${operation}_FAILED`,
    retryable: busy,
    userImpact: 'degraded'
  })
}

/**
 * Report an indexed-source handler failure. File-provider failures use stable
 * FILE_INDEX_* codes; other sources keep the generic INDEXED_SOURCE_* family
 * without exposing raw exception text.
 */
export function reportIndexedSourceTransportFailure(
  operation: 'SCAN' | 'RECONCILE' | 'RESET' | 'DIAGNOSTICS',
  sourceId: string,
  error: unknown
): OperationalErrorReport {
  const busy = isSqliteBusyError(error)
  const isFileSource = sourceId === FILE_INDEXED_SOURCE_ID
  const code = busy
    ? isFileSource
      ? 'FILE_INDEX_DATABASE_BUSY'
      : 'INDEXED_SOURCE_DATABASE_BUSY'
    : isFileSource
      ? `FILE_INDEX_${operation}_FAILED`
      : `INDEXED_SOURCE_${operation}_FAILED`
  return operationalErrorService.report({
    domain: isFileSource ? 'file-index' : 'indexing',
    operation: `indexed-source.${operation.toLowerCase()}.handler`,
    error,
    code,
    retryable: busy,
    userImpact: 'degraded',
    context: { sourceId }
  })
}
