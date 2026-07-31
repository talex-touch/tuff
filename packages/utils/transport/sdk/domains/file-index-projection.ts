/**
 * Runtime projectors for the File Index public boundary (issue #476).
 *
 * Every projector builds a fresh object containing only allowlisted fields
 * with strict type coercion. Raw diagnostics (`error`, `message`,
 * `startupError`, absolute `path`, `lastError`, stack, cause) are never
 * forwarded, even if a malformed payload contains them. Both the main-side
 * transport handlers and the renderer settings SDK apply these projections so
 * the contract holds at each end of the wire.
 */
import type {
  FileIndexAddPathResult,
  FileIndexBatteryStatus,
  FileIndexEstimateBasis,
  FileIndexEstimateStatus,
  FileIndexFailedFile,
  FileIndexFailedFilesResult,
  FileIndexRebuildResult,
  FileIndexStage,
  FileIndexStats,
  FileIndexStatus,
} from '../../events/types/file-index'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asNullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,95}$/

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asSafeToken(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value) ? value : undefined
}

function asNullableErrorCode(value: unknown): string | null {
  return typeof value === 'string' && ERROR_CODE_PATTERN.test(value) ? value : null
}

function asErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && ERROR_CODE_PATTERN.test(value) ? value : undefined
}

function asNullableReportId(value: unknown): string | null {
  return asSafeToken(value) ?? null
}

function asReportId(value: unknown): string | undefined {
  return asSafeToken(value)
}

function asStage(value: unknown): FileIndexStage | null {
  return (asSafeToken(value) as FileIndexStage | undefined) ?? null
}

function asEstimateStatus(value: unknown): FileIndexEstimateStatus | undefined {
  return asSafeToken(value) as FileIndexEstimateStatus | undefined
}

function asEstimateBasis(value: unknown): FileIndexEstimateBasis | undefined {
  return asSafeToken(value) as FileIndexEstimateBasis | undefined
}

function asNullableIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString() === value ? value : null
}

export function projectFileIndexStatus(raw: unknown): FileIndexStatus {
  const input = asRecord(raw) ?? {}
  const progress = asRecord(input.progress) ?? {}
  return {
    isInitializing: asBoolean(input.isInitializing),
    initializationFailed: asBoolean(input.initializationFailed),
    errorCode: asNullableErrorCode(input.errorCode),
    retryable: asOptionalBoolean(input.retryable),
    reportId: asNullableReportId(input.reportId),
    startupReady: asOptionalBoolean(input.startupReady),
    startupPending: asOptionalBoolean(input.startupPending),
    startupErrorCode: asNullableErrorCode(input.startupErrorCode),
    progress: {
      stage: asStage(progress.stage),
      current: asFiniteNumber(progress.current, 0),
      total: asFiniteNumber(progress.total, 0),
    },
    startTime: asNullableFiniteNumber(input.startTime),
    estimatedCompletion: asNullableFiniteNumber(input.estimatedCompletion),
    estimatedRemainingMs: asNullableFiniteNumber(input.estimatedRemainingMs),
    averageItemsPerSecond: asFiniteNumber(input.averageItemsPerSecond, 0),
    estimateStatus: asEstimateStatus(input.estimateStatus),
    speedSampleCount: asOptionalFiniteNumber(input.speedSampleCount),
    estimateBasis: asEstimateBasis(input.estimateBasis),
  }
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function projectFileIndexStats(raw: unknown): FileIndexStats {
  const input = asRecord(raw) ?? {}
  const stats: FileIndexStats = {
    totalFiles: asFiniteNumber(input.totalFiles, 0),
    failedFiles: asFiniteNumber(input.failedFiles, 0),
    skippedFiles: asFiniteNumber(input.skippedFiles, 0),
    completedFiles: asFiniteNumber(input.completedFiles, 0),
    embeddingCompletedFiles: asFiniteNumber(input.embeddingCompletedFiles, 0),
    embeddingRows: asFiniteNumber(input.embeddingRows, 0),
  }
  const errorCode = asErrorCode(input.errorCode)
  const reportId = asReportId(input.reportId)
  if (errorCode) stats.errorCode = errorCode
  if (reportId) stats.reportId = reportId
  return stats
}

const REBUILD_REASONS = new Set(['battery-low', 'initializing', 'missing-context', 'policy-blocked'])

export function projectFileIndexRebuildResult(raw: unknown): FileIndexRebuildResult {
  const input = asRecord(raw) ?? {}
  const result: FileIndexRebuildResult = {
    success: asBoolean(input.success),
  }
  const errorCode = asErrorCode(input.errorCode)
  const retryable = asOptionalBoolean(input.retryable)
  const reportId = asReportId(input.reportId)
  const reason = asSafeToken(input.reason)
  const threshold = asOptionalFiniteNumber(input.threshold)
  if (errorCode) result.errorCode = errorCode
  if (retryable !== undefined) result.retryable = retryable
  if (reportId) result.reportId = reportId
  if (typeof input.requiresConfirm === 'boolean') result.requiresConfirm = input.requiresConfirm
  if (reason && REBUILD_REASONS.has(reason)) {
    result.reason = reason as NonNullable<FileIndexRebuildResult['reason']>
  }
  const battery = projectFileIndexBatteryStatus(input.battery)
  if (battery) result.battery = battery
  if (threshold !== undefined) result.threshold = threshold
  return result
}

export function projectFileIndexBatteryStatus(raw: unknown): FileIndexBatteryStatus | null {
  const input = asRecord(raw)
  if (!input) return null
  const level = asOptionalFiniteNumber(input.level)
  const charging = asOptionalBoolean(input.charging)
  if (level === undefined || charging === undefined) return null
  return { level, charging }
}

function basenameFromPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(segment => segment.length > 0)
  return segments.at(-1) ?? ''
}

export function projectFileIndexFailedFile(raw: unknown): FileIndexFailedFile | null {
  const input = asRecord(raw)
  if (!input) return null
  const fileId = asOptionalFiniteNumber(input.fileId)
  if (fileId === undefined) return null
  // Only the basename may cross. A legacy `path` field is reduced to its
  // basename; the absolute path itself is never forwarded.
  const directFileName = typeof input.fileName === 'string' ? input.fileName : ''
  const legacyPath = typeof input.path === 'string' ? input.path : ''
  const fileName = basenameFromPath(directFileName || legacyPath)
  return {
    fileId,
    fileName,
    errorCode: asNullableErrorCode(input.errorCode),
    updatedAt: asNullableIsoTimestamp(input.updatedAt),
  }
}

export function projectFileIndexFailedFiles(raw: unknown): FileIndexFailedFilesResult {
  const input = asRecord(raw)
  // Tolerate a legacy bare-array payload while still projecting every entry.
  const rawFiles = Array.isArray(raw) ? raw : Array.isArray(input?.files) ? input.files : []
  const files = rawFiles
    .map(entry => projectFileIndexFailedFile(entry))
    .filter((entry): entry is FileIndexFailedFile => entry !== null)
  const result: FileIndexFailedFilesResult = { files }
  const errorCode = asErrorCode(input?.errorCode)
  const retryable = asOptionalBoolean(input?.retryable)
  const reportId = asReportId(input?.reportId)
  if (errorCode) result.errorCode = errorCode
  if (retryable !== undefined) result.retryable = retryable
  if (reportId) result.reportId = reportId
  return result
}

const ADD_PATH_STATUSES = new Set(['added', 'exists', 'invalid', 'error'])

export function projectFileIndexAddPathResult(raw: unknown): FileIndexAddPathResult {
  const input = asRecord(raw) ?? {}
  const status = asSafeToken(input.status)
  const result: FileIndexAddPathResult = {
    success: asBoolean(input.success),
    status: ADD_PATH_STATUSES.has(status ?? '') ? (status as FileIndexAddPathResult['status']) : 'error',
  }
  // `path` echoes an intentional user-selected watch path back to the UI.
  const path = asString(input.path)
  const reason = asSafeToken(input.reason)
  const errorCode = asErrorCode(input.errorCode)
  const reportId = asReportId(input.reportId)
  if (path) result.path = path
  if (reason) result.reason = reason
  if (errorCode) result.errorCode = errorCode
  if (reportId) result.reportId = reportId
  return result
}
