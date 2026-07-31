import type { Client, InValue, Row } from '@libsql/client'
import type { PrivacyRetentionPolicyV1 } from '@talex-touch/utils/transport/events/types'
import type {
  PrivacyDataOwner,
  PrivacyOwnerDeleteRequest,
  PrivacyOwnerDeleteResult,
  PrivacyOwnerExportRequest,
  PrivacyOwnerExportWriter,
  PrivacyOwnerInspectRequest
} from '../data-owner'
import type { PrivacyOwnerLimits, PrivacyOwnerWriteScheduler } from '../owner-utils'
import type { PrivacySqlClient } from '../privacy-sql'
import fs from 'node:fs/promises'
import path from 'node:path'
import { definePrivacyDataOwner } from '../data-owner'
import { exportNumber, exportString, writePrivacyOwnerRecords } from '../owner-export-utils'
import {
  emptyDeleteProgress,
  isOwnerDeadlineExceeded,
  isValidPrivacyOwnerExportRequest,
  isValidPrivacyOwnerRequest,
  normalizePrivacyOwnerLimits,
  privacyDeleteResult,
  privacyInspectionResult,
  privacyPreviewResult,
  resolvePrivacyDeleteScope,
  schedulePrivacyOwnerWrite
} from '../owner-utils'
import {
  executePrivacySql,
  queryPrivacyCandidates,
  queryPrivacyCount,
  sqlPlaceholders,
  sumCandidateBytes
} from '../privacy-sql'

const CATEGORY = 'diagnostics' as const

interface DiagnosticsTarget {
  readonly table: string
  readonly cutoffColumn: string
  readonly byteExpression: string
  readonly label: string
}

interface LogCandidate {
  readonly path: string
  readonly size: number
  readonly dev: number
  readonly ino: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

export interface DiagnosticsTelemetryRetentionLifecycle {
  clearFailureBefore: (cutoffMs: number, maxRows: number, signal?: AbortSignal) => Promise<number>
}

export interface DiagnosticsRetentionOwnerOptions {
  readonly client: Pick<Client, 'execute' | 'batch'>
  readonly logDirectory: string
  readonly telemetryLifecycle?: DiagnosticsTelemetryRetentionLifecycle
  readonly limits?: Partial<PrivacyOwnerLimits>
  readonly scheduleWrite?: PrivacyOwnerWriteScheduler
  readonly removeLogFile?: (filePath: string) => Promise<void>
}

function isCoreLogFileName(name: string): boolean {
  return /^[DE][._-]?\d{4}-\d{2}-\d{2}\.(?:log|err)(?:\.\d+)?(?:\.gz)?$/.test(name)
}

function isCoreCrashFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.dmp')
}

async function resolveCanonicalLogDirectory(logDirectory: string): Promise<string | null> {
  try {
    const stat = await fs.lstat(logDirectory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null
    return await fs.realpath(logDirectory)
  } catch {
    return null
  }
}

function isWithinLogDirectory(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`)
}

function sameLogCandidate(file: LogCandidate, stat: Awaited<ReturnType<typeof fs.lstat>>): boolean {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    file.dev === Number(stat.dev) &&
    file.ino === Number(stat.ino) &&
    file.size === Number(stat.size) &&
    file.mtimeMs === Number(stat.mtimeMs) &&
    file.ctimeMs === Number(stat.ctimeMs)
  )
}

async function resolveOwnedLogFile(
  logDirectory: string,
  file: LogCandidate
): Promise<string | null> {
  try {
    const root = await resolveCanonicalLogDirectory(logDirectory)
    if (!root || !isWithinLogDirectory(root, file.path)) return null
    const candidate = await fs.realpath(file.path)
    if (candidate !== file.path || !isWithinLogDirectory(root, candidate)) return null
    const relative = path.relative(root, candidate)
    const segments = relative.split(path.sep)
    const fileName = segments.at(-1) ?? ''
    const ownedName =
      (segments.length === 1 && isCoreLogFileName(fileName)) ||
      (segments.length > 1 && segments[0] === 'crashes' && isCoreCrashFileName(fileName))
    if (!ownedName) return null
    const stat = await fs.lstat(candidate)
    return sameLogCandidate(file, stat) ? candidate : null
  } catch {
    return null
  }
}

async function collectLogCandidates(
  logDirectory: string,
  cutoffMs: number | undefined,
  maxRows: number,
  signal: AbortSignal
): Promise<{
  files: LogCandidate[]
  failedItemCount: number
  bounded: boolean
  cancelled: boolean
}> {
  const files: LogCandidate[] = []
  let failedItemCount = 0
  let bounded = false
  let cancelled = false
  const canonicalRoot = await resolveCanonicalLogDirectory(logDirectory)
  if (!canonicalRoot) return { files, failedItemCount, bounded, cancelled }

  const visit = async (directory: string, crashDirectory: boolean): Promise<void> => {
    let entries: Array<import('node:fs').Dirent>
    let canonicalDirectory: string
    try {
      canonicalDirectory = await fs.realpath(directory)
      if (!isWithinLogDirectory(canonicalRoot, canonicalDirectory)) {
        throw new Error('DIAGNOSTIC_LOG_PATH_INVALID')
      }
      entries = await fs.readdir(canonicalDirectory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedItemCount += 1
      return
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (signal.aborted) {
        cancelled = true
        return
      }
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && (!crashDirectory ? entry.name === 'crashes' : true)) {
        await visit(path.join(canonicalDirectory, entry.name), true)
        if (bounded || cancelled) return
        continue
      }
      if (
        !entry.isFile() ||
        (crashDirectory ? !isCoreCrashFileName(entry.name) : !isCoreLogFileName(entry.name))
      ) {
        continue
      }
      try {
        const filePath = path.join(canonicalDirectory, entry.name)
        const directStat = await fs.lstat(filePath)
        if (!directStat.isFile() || directStat.isSymbolicLink()) continue
        const canonicalFile = await fs.realpath(filePath)
        if (!isWithinLogDirectory(canonicalRoot, canonicalFile)) {
          throw new Error('DIAGNOSTIC_LOG_PATH_INVALID')
        }
        const stat = await fs.lstat(canonicalFile)
        if (!stat.isFile() || stat.isSymbolicLink()) continue
        if (cutoffMs !== undefined && stat.mtimeMs >= cutoffMs) continue
        if (files.length >= maxRows) {
          bounded = true
          return
        }
        files.push({
          path: canonicalFile,
          size: Math.max(0, Number(stat.size)),
          dev: Number(stat.dev),
          ino: Number(stat.ino),
          mtimeMs: Number(stat.mtimeMs),
          ctimeMs: Number(stat.ctimeMs)
        })
      } catch {
        failedItemCount += 1
      }
    }
  }

  await visit(canonicalRoot, false)
  return { files, failedItemCount, bounded, cancelled }
}

export function createDiagnosticsRetentionOwner(
  options: DiagnosticsRetentionOwnerOptions
): PrivacyDataOwner {
  const client: PrivacySqlClient = options.client
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const scheduleWrite = options.scheduleWrite ?? schedulePrivacyOwnerWrite
  const removeLogFile = options.removeLogFile ?? fs.unlink.bind(fs)
  const targets: readonly DiagnosticsTarget[] = Object.freeze([
    {
      table: 'analytics_snapshots',
      cutoffColumn: 'timestamp',
      byteExpression: "length(COALESCE(metrics, ''))",
      label: 'snapshots'
    },
    {
      table: 'plugin_analytics',
      cutoffColumn: 'timestamp',
      byteExpression:
        "length(COALESCE(plugin_name, '')) + length(COALESCE(plugin_version, '')) + length(COALESCE(feature_id, '')) + length(COALESCE(event_type, '')) + length(COALESCE(metadata, ''))",
      label: 'plugin-events'
    },
    {
      table: 'analytics_report_queue',
      cutoffColumn: 'created_at',
      byteExpression:
        "length(COALESCE(endpoint, '')) + length(COALESCE(payload, '')) + length(COALESCE(last_error, ''))",
      label: 'report-queue'
    }
  ])

  async function inspect(request: PrivacyOwnerInspectRequest, signal: AbortSignal) {
    if (!isValidPrivacyOwnerRequest(request) || request.category !== CATEGORY) {
      return privacyInspectionResult(CATEGORY, null, 0, 0, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (signal.aborted) {
      return privacyInspectionResult(
        CATEGORY,
        request.policy.retentionMs,
        0,
        0,
        'PRIVACY_OWNER_CANCELLED'
      )
    }
    try {
      let itemCount = 0
      let byteCount = 0
      for (const target of targets) {
        if (signal.aborted) {
          return privacyInspectionResult(
            CATEGORY,
            request.policy.retentionMs,
            itemCount,
            byteCount,
            'PRIVACY_OWNER_CANCELLED'
          )
        }
        const count = await queryPrivacyCount(
          client,
          `SELECT COUNT(*) AS item_count, COALESCE(SUM(${target.byteExpression}), 0) AS byte_count
             FROM ${target.table}`
        )
        itemCount += count.itemCount
        byteCount += count.byteCount
      }
      if (signal.aborted) {
        return privacyInspectionResult(
          CATEGORY,
          request.policy.retentionMs,
          itemCount,
          byteCount,
          'PRIVACY_OWNER_CANCELLED'
        )
      }
      const telemetry = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count,
                COALESCE(SUM(length(COALESCE(last_failure_message, ''))), 0) AS byte_count
           FROM telemetry_upload_stats`
      )
      itemCount += telemetry.itemCount
      byteCount += telemetry.byteCount
      const logs = await collectLogCandidates(
        options.logDirectory,
        undefined,
        limits.maxRows,
        signal
      )
      itemCount += logs.files.length
      byteCount += logs.files.reduce((sum, file) => sum + file.size, 0)
      if (logs.cancelled || signal.aborted) {
        return privacyInspectionResult(
          CATEGORY,
          request.policy.retentionMs,
          itemCount,
          byteCount,
          'PRIVACY_OWNER_CANCELLED'
        )
      }
      if (logs.failedItemCount > 0) {
        return privacyInspectionResult(
          CATEGORY,
          request.policy.retentionMs,
          itemCount,
          byteCount,
          'PRIVACY_OWNER_RESOURCE_DELETE_FAILED'
        )
      }
      return privacyInspectionResult(CATEGORY, request.policy.retentionMs, itemCount, byteCount)
    } catch {
      return privacyInspectionResult(
        CATEGORY,
        request.policy.retentionMs,
        0,
        0,
        'PRIVACY_OWNER_DATABASE_FAILED'
      )
    }
  }

  async function previewDelete(request: PrivacyOwnerDeleteRequest, signal: AbortSignal) {
    if (!isValidPrivacyOwnerRequest(request) || request.category !== CATEGORY) {
      return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
    const scope = resolvePrivacyDeleteScope(request, false)
    if (scope.kind === 'invalid') {
      return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (scope.kind === 'disabled') return privacyPreviewResult(CATEGORY)

    try {
      let eligibleItemCount = 0
      let eligibleByteCount = 0
      let bounded = false
      for (const target of targets) {
        if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
        const remaining = limits.maxRows - eligibleItemCount
        if (remaining <= 0) {
          bounded = true
          break
        }
        const rows = await queryPrivacyCandidates(
          client,
          `SELECT rowid AS owner_id, ${target.byteExpression} AS byte_count
             FROM ${target.table}
            WHERE ${target.cutoffColumn} < ?
            ORDER BY ${target.cutoffColumn}, rowid
            LIMIT ?`,
          [scope.cutoffMs],
          remaining
        )
        eligibleItemCount += rows.rows.length
        eligibleByteCount += sumCandidateBytes(rows.rows)
        bounded ||= rows.bounded
      }
      const telemetryRemaining = limits.maxRows - eligibleItemCount
      if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
      if (telemetryRemaining > 0) {
        const telemetryRows = await queryPrivacyCandidates(
          client,
          `SELECT rowid AS owner_id,
                  length(COALESCE(last_failure_message, '')) AS byte_count
             FROM telemetry_upload_stats
            WHERE last_failure_at IS NOT NULL AND last_failure_at < ?
            ORDER BY last_failure_at, rowid
            LIMIT ?`,
          [scope.cutoffMs],
          telemetryRemaining
        )
        eligibleItemCount += telemetryRows.rows.length
        eligibleByteCount += sumCandidateBytes(telemetryRows.rows)
        bounded ||= telemetryRows.bounded
      } else {
        bounded = true
      }

      const logRemaining = limits.maxRows - eligibleItemCount
      const logs =
        logRemaining > 0
          ? await collectLogCandidates(options.logDirectory, scope.cutoffMs, logRemaining, signal)
          : { files: [], failedItemCount: 0, bounded: true, cancelled: false }
      eligibleItemCount += logs.files.length
      eligibleByteCount += logs.files.reduce((sum, file) => sum + file.size, 0)
      bounded ||= logs.bounded || eligibleItemCount > limits.maxRows
      if (logs.cancelled || signal.aborted) {
        return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
      }
      if (logs.failedItemCount > 0) {
        return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED')
      }
      return privacyPreviewResult(CATEGORY, {
        eligibleItemCount: Math.min(eligibleItemCount, limits.maxRows),
        eligibleByteCount,
        bounded
      })
    } catch {
      return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_DATABASE_FAILED')
    }
  }

  async function deleteData(
    request: PrivacyOwnerDeleteRequest,
    signal: AbortSignal
  ): Promise<PrivacyOwnerDeleteResult> {
    if (!isValidPrivacyOwnerRequest(request) || request.category !== CATEGORY) {
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_INVALID_REQUEST', emptyDeleteProgress(), {
        partial: false
      })
    }
    const scope = resolvePrivacyDeleteScope(request, true)
    if (scope.kind === 'invalid') {
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_INVALID_REQUEST', emptyDeleteProgress(), {
        partial: false
      })
    }
    if (scope.kind === 'disabled') {
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DISABLED', emptyDeleteProgress(), {
        ok: true,
        partial: false
      })
    }

    const progress = emptyDeleteProgress()
    const startedAt = Date.now()
    let databaseFailed = false
    let resourceFailed = false
    let ownerBounded = false
    try {
      for (const target of targets) {
        let cursorSort = -1
        let cursorId = 0
        while (progress.deletedItemCount < limits.maxRows) {
          if (signal.aborted) {
            return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
              retryable: true,
              partial: progress.deletedItemCount > 0
            })
          }
          const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
          let rows
          try {
            rows = await queryPrivacyCandidates(
              client,
              `SELECT rowid AS owner_id,
                      ${target.cutoffColumn} AS owner_sort,
                      ${target.byteExpression} AS byte_count
                 FROM ${target.table}
                WHERE ${target.cutoffColumn} < ?
                  AND (${target.cutoffColumn} > ?
                    OR (${target.cutoffColumn} = ? AND rowid > ?))
                ORDER BY ${target.cutoffColumn}, rowid
                LIMIT ?`,
              [scope.cutoffMs, cursorSort, cursorSort, cursorId],
              pageSize
            )
          } catch {
            databaseFailed = true
            progress.failedItemCount += 1
            break
          }
          if (rows.rows.length === 0) break
          const lastRow = rows.rows.at(-1)
          const ids: InValue[] = rows.rows.map((row) => row.id)
          try {
            const deletion = await scheduleWrite(`privacy.diagnostics.${target.label}`, () =>
              executePrivacySql(
                client,
                `DELETE FROM ${target.table}
                  WHERE rowid IN (${sqlPlaceholders(ids.length)})
                    AND ${target.cutoffColumn} < ?
                  RETURNING rowid AS owner_id`,
                [...ids, scope.cutoffMs]
              )
            )
            const deletedIds = new Set(deletion.rows.map((row) => Number(row.owner_id)))
            const committedRows = rows.rows.filter((row) => deletedIds.has(Number(row.id)))
            cursorSort = Number(lastRow?.sortValue ?? cursorSort)
            cursorId = Number(lastRow?.id ?? cursorId)
            progress.deletedItemCount += committedRows.length
            progress.deletedByteCount += sumCandidateBytes(committedRows)
            progress.batches += 1
          } catch {
            databaseFailed = true
            progress.failedItemCount += rows.rows.length
            break
          }
          if (rows.rows.length < pageSize) break
        }
      }

      const telemetryRemaining = limits.maxRows - progress.deletedItemCount
      if (signal.aborted) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
          partial: progress.deletedItemCount > 0,
          cancelled: true
        })
      }
      if (isOwnerDeadlineExceeded(startedAt, limits)) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      if (telemetryRemaining > 0) {
        try {
          let clearedCount = 0
          if (options.telemetryLifecycle) {
            clearedCount = await options.telemetryLifecycle.clearFailureBefore(
              scope.cutoffMs,
              telemetryRemaining,
              signal
            )
            ownerBounded ||= clearedCount >= telemetryRemaining
          } else {
            const rows = await queryPrivacyCandidates(
              client,
              `SELECT rowid AS owner_id,
                      length(COALESCE(last_failure_message, '')) AS byte_count
                 FROM telemetry_upload_stats
                WHERE last_failure_at IS NOT NULL AND last_failure_at < ?
                ORDER BY last_failure_at, rowid
                LIMIT ?`,
              [scope.cutoffMs],
              telemetryRemaining
            )
            ownerBounded ||= rows.bounded
            if (rows.rows.length > 0) {
              const ids = rows.rows.map((row) => row.id)
              const cleared = await scheduleWrite('privacy.diagnostics.upload-stats', () =>
                executePrivacySql(
                  client,
                  `UPDATE telemetry_upload_stats
                      SET last_failure_at = NULL, last_failure_message = NULL
                    WHERE rowid IN (${sqlPlaceholders(ids.length)})
                      AND last_failure_at IS NOT NULL
                      AND last_failure_at < ?
                    RETURNING rowid AS owner_id`,
                  [...ids, scope.cutoffMs]
                )
              )
              const clearedIds = new Set(cleared.rows.map((row) => Number(row.owner_id)))
              const committedRows = rows.rows.filter((row) => clearedIds.has(Number(row.id)))
              clearedCount = committedRows.length
              progress.deletedByteCount += sumCandidateBytes(committedRows)
            }
          }
          clearedCount =
            Number.isFinite(clearedCount) && clearedCount > 0
              ? Math.min(telemetryRemaining, Math.floor(clearedCount))
              : 0
          progress.deletedItemCount += clearedCount
          if (clearedCount > 0) progress.batches += 1
        } catch {
          databaseFailed = true
          progress.failedItemCount += 1
        }
      } else {
        ownerBounded = true
      }

      if (signal.aborted) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
          partial: progress.deletedItemCount > 0,
          cancelled: true
        })
      }
      if (isOwnerDeadlineExceeded(startedAt, limits)) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }

      const logRemaining = limits.maxRows - progress.deletedItemCount
      const logs =
        logRemaining > 0
          ? await collectLogCandidates(options.logDirectory, scope.cutoffMs, logRemaining, signal)
          : { files: [], failedItemCount: 0, bounded: true, cancelled: false }
      progress.failedItemCount += logs.failedItemCount
      resourceFailed ||= logs.failedItemCount > 0
      if (logs.cancelled || signal.aborted) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
          partial: progress.deletedItemCount > 0,
          cancelled: true
        })
      }
      for (const file of logs.files) {
        if (signal.aborted) {
          return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
            partial: progress.deletedItemCount > 0,
            cancelled: true
          })
        }
        if (isOwnerDeadlineExceeded(startedAt, limits)) {
          return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
            retryable: true,
            partial: progress.deletedItemCount > 0
          })
        }
        try {
          const ownedPath = await resolveOwnedLogFile(options.logDirectory, file)
          if (!ownedPath) {
            try {
              await fs.lstat(file.path)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
              throw error
            }
            throw new Error('DIAGNOSTIC_LOG_PATH_INVALID')
          }
          await removeLogFile(ownedPath)
          progress.deletedItemCount += 1
          progress.deletedByteCount += file.size
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
          progress.failedItemCount += 1
          resourceFailed = true
        }
      }
      if (logs.files.length > 0) progress.batches += 1
      if (databaseFailed) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      if (resourceFailed) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      if (ownerBounded || logs.bounded || progress.deletedItemCount >= limits.maxRows) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, { partial: false })
    } catch {
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
        retryable: true,
        partial: progress.deletedItemCount > 0
      })
    }
  }

  async function exportData(
    request: PrivacyOwnerExportRequest,
    writer: PrivacyOwnerExportWriter,
    signal: AbortSignal
  ) {
    if (!isValidPrivacyOwnerExportRequest(request) || request.category !== CATEGORY) {
      return {
        ok: false as const,
        code: 'PRIVACY_OWNER_INVALID_REQUEST' as const,
        retryable: false,
        category: CATEGORY,
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: false
      }
    }
    const specs: readonly {
      readonly sql: string
      readonly map: (row: Row) => Readonly<Record<string, unknown>>
    }[] = [
      {
        sql: `SELECT window_type, timestamp FROM analytics_snapshots
               ORDER BY timestamp, id LIMIT ?`,
        map: (row) => ({
          kind: 'analytics-snapshot-metadata',
          windowType: exportString(row.window_type, 128),
          createdAt: exportNumber(row.timestamp)
        })
      },
      {
        sql: `SELECT plugin_name, plugin_version, feature_id, event_type, count, timestamp
                FROM plugin_analytics ORDER BY timestamp, id LIMIT ?`,
        map: (row) => ({
          kind: 'plugin-analytics-metadata',
          pluginId: exportString(row.plugin_name, 256),
          pluginVersion: exportString(row.plugin_version, 128),
          featureId: exportString(row.feature_id, 256),
          eventType: exportString(row.event_type, 128),
          count: exportNumber(row.count),
          createdAt: exportNumber(row.timestamp)
        })
      },
      {
        sql: `SELECT created_at, retry_count, last_attempt_at
                FROM analytics_report_queue ORDER BY created_at, id LIMIT ?`,
        map: (row) => ({
          kind: 'analytics-queue-metadata',
          createdAt: exportNumber(row.created_at),
          retryCount: exportNumber(row.retry_count),
          lastAttemptAt: exportNumber(row.last_attempt_at)
        })
      },
      {
        sql: `SELECT search_count, total_uploads, failed_uploads,
                     last_upload_time, last_failure_at, updated_at
                FROM telemetry_upload_stats ORDER BY id LIMIT ?`,
        map: (row) => ({
          kind: 'telemetry-upload-metadata',
          searchCount: exportNumber(row.search_count),
          totalUploads: exportNumber(row.total_uploads),
          failedUploads: exportNumber(row.failed_uploads),
          lastUploadAt: exportNumber(row.last_upload_time),
          lastFailureAt: exportNumber(row.last_failure_at),
          updatedAt: exportNumber(row.updated_at)
        })
      }
    ]

    const records: Readonly<Record<string, unknown>>[] = []
    let bounded = false
    try {
      for (const spec of specs) {
        if (signal.aborted) break
        const remaining = limits.maxRows - records.length
        if (remaining <= 0) {
          bounded = true
          break
        }
        const result = await client.execute({ sql: spec.sql, args: [remaining + 1] })
        bounded ||= result.rows.length > remaining
        records.push(...result.rows.slice(0, remaining).map(spec.map))
      }
    } catch {
      return {
        ok: false as const,
        code: 'PRIVACY_OWNER_DATABASE_FAILED' as const,
        retryable: true,
        category: CATEGORY,
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: false
      }
    }
    return await writePrivacyOwnerRecords(CATEGORY, records, writer, signal, bounded)
  }

  async function applyRetention(
    policy: PrivacyRetentionPolicyV1,
    nowMs: number,
    signal: AbortSignal
  ) {
    return [
      await deleteData(
        { category: CATEGORY, mode: 'retention', policy: policy.categories[CATEGORY], nowMs },
        signal
      )
    ]
  }

  return definePrivacyDataOwner({
    categories: [CATEGORY],
    inspect,
    previewDelete,
    delete: deleteData,
    export: exportData,
    applyRetention
  })
}
