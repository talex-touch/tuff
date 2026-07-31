import type { Client } from '@libsql/client'
import type { PrivacyRetentionPolicyV1 } from '@talex-touch/utils/transport/events/types'
import type { TempFileService } from '../../../service/temp-file.service'
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
import { definePrivacyDataOwner } from '../data-owner'
import { exportNumber, exportString, writePrivacyOwnerRecords } from '../owner-export-utils'
import {
  addProgress,
  emptyDeleteProgress,
  isOwnerDeadlineExceeded,
  isValidPrivacyOwnerExportRequest,
  isValidPrivacyOwnerRequest,
  normalizePrivacyOwnerLimits,
  privacyDeleteResult,
  privacyInspectionResult,
  privacyPreviewResult,
  resolvePrivacyDeleteScope,
  schedulePrivacyOwnerWrite,
  toUnixSeconds
} from '../owner-utils'
import {
  executePrivacySql,
  queryPrivacyCandidates,
  queryPrivacyCount,
  sqlPlaceholders,
  sumCandidateBytes
} from '../privacy-sql'
import {
  PRIVACY_OCR_TEMP_NAMESPACE,
  PRIVACY_RETENTION_DAY_MS,
  PRIVACY_SCREENSHOT_TEMP_NAMESPACE
} from '../retention-policy'

const CATEGORY = 'ocr-screenshot-temp' as const
const TERMINAL_STATUSES = "'completed', 'failed', 'cancelled'"

export const OCR_INTERMEDIATE_TEMP_NAMESPACE = PRIVACY_OCR_TEMP_NAMESPACE
export const SCREENSHOT_TEMP_NAMESPACE = PRIVACY_SCREENSHOT_TEMP_NAMESPACE
export const OCR_SCREENSHOT_TEMP_NAMESPACES = Object.freeze([
  OCR_INTERMEDIATE_TEMP_NAMESPACE,
  SCREENSHOT_TEMP_NAMESPACE
])

export interface OcrScreenshotRetentionOwnerOptions {
  readonly client: Pick<Client, 'execute' | 'batch'>
  readonly tempFileService: TempFileService
  readonly limits?: Partial<PrivacyOwnerLimits>
  readonly scheduleWrite?: PrivacyOwnerWriteScheduler
}

export async function releaseOcrScreenshotTempArtifact(
  tempFileService: TempFileService,
  artifactPath: string
): Promise<boolean> {
  return await tempFileService.deleteFileFromNamespaces(
    artifactPath,
    OCR_SCREENSHOT_TEMP_NAMESPACES
  )
}

export function createOcrScreenshotRetentionOwner(
  options: OcrScreenshotRetentionOwnerOptions
): PrivacyDataOwner {
  const client: PrivacySqlClient = options.client
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const scheduleWrite = options.scheduleWrite ?? schedulePrivacyOwnerWrite

  const registerNamespaces = (retentionMs: number | null): void => {
    for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
      options.tempFileService.registerNamespace({
        namespace,
        retentionMs,
        automaticCleanup: false
      })
    }
  }
  registerNamespaces(PRIVACY_RETENTION_DAY_MS)

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
      const dbCount = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count,
                COALESCE(SUM(length(COALESCE(meta, '')) + length(COALESCE(last_error, '')) +
                  COALESCE((SELECT SUM(length(COALESCE(text, '')) + length(COALESCE(extra, '')))
                              FROM ocr_results WHERE job_id = ocr_jobs.id), 0)), 0) AS byte_count
           FROM ocr_jobs`
      )
      let itemCount = dbCount.itemCount
      let byteCount = dbCount.byteCount
      for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
        const temp = await options.tempFileService.inspectNamespace(namespace, {
          maxRows: Math.max(1, limits.maxRows - itemCount),
          signal
        })
        itemCount += temp.itemCount
        byteCount += temp.byteCount
        if (temp.cancelled) {
          return privacyInspectionResult(
            CATEGORY,
            request.policy.retentionMs,
            itemCount,
            byteCount,
            'PRIVACY_OWNER_CANCELLED'
          )
        }
        if (temp.failedItemCount > 0) {
          return privacyInspectionResult(
            CATEGORY,
            request.policy.retentionMs,
            itemCount,
            byteCount,
            'PRIVACY_OWNER_RESOURCE_DELETE_FAILED'
          )
        }
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

    const cutoffSeconds = toUnixSeconds(scope.cutoffMs)
    try {
      let eligibleItemCount = 0
      let eligibleByteCount = 0
      let bounded = false
      for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
        const remaining = limits.maxRows - eligibleItemCount
        if (remaining <= 0) {
          bounded = true
          break
        }
        const temp = await options.tempFileService.inspectNamespace(namespace, {
          cutoffMs: scope.cutoffMs,
          maxRows: remaining,
          signal
        })
        if (temp.cancelled) {
          return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
        }
        if (temp.failedItemCount > 0) {
          return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED')
        }
        eligibleItemCount += temp.itemCount
        eligibleByteCount += temp.byteCount
        bounded ||= temp.bounded
      }
      const remaining = limits.maxRows - eligibleItemCount
      if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
      const jobs =
        remaining > 0
          ? await queryPrivacyCandidates(
              client,
              `SELECT id AS owner_id,
                length(COALESCE(meta, '')) + length(COALESCE(last_error, '')) +
                COALESCE((SELECT SUM(length(COALESCE(text, '')) + length(COALESCE(extra, '')))
                            FROM ocr_results WHERE job_id = ocr_jobs.id), 0) AS byte_count
           FROM ocr_jobs
          WHERE status IN (${TERMINAL_STATUSES})
            AND COALESCE(finished_at, queued_at) < ?
          ORDER BY COALESCE(finished_at, queued_at), id
          LIMIT ?`,
              [cutoffSeconds],
              remaining
            )
          : { rows: [], bounded: true }
      eligibleItemCount += jobs.rows.length
      eligibleByteCount += sumCandidateBytes(jobs.rows)
      bounded ||= jobs.bounded || eligibleItemCount > limits.maxRows
      if (signal.aborted) return privacyPreviewResult(CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
      const active = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count, 0 AS byte_count
           FROM ocr_jobs
          WHERE status NOT IN (${TERMINAL_STATUSES}) AND queued_at < ?`,
        [cutoffSeconds]
      )
      return privacyPreviewResult(CATEGORY, {
        eligibleItemCount: Math.min(eligibleItemCount, limits.maxRows),
        eligibleByteCount,
        protectedItemCount: active.itemCount,
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
    if (request.mode === 'retention') {
      registerNamespaces(request.policy.enabled ? request.policy.retentionMs : null)
    }
    if (scope.kind === 'disabled') {
      return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DISABLED', emptyDeleteProgress(), {
        ok: true,
        partial: false
      })
    }

    const progress = emptyDeleteProgress()
    const startedAt = Date.now()
    let stoppedCode:
      | 'PRIVACY_OWNER_CANCELLED'
      | 'PRIVACY_OWNER_LIMIT_REACHED'
      | 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
      | null = null

    try {
      for (const namespace of OCR_SCREENSHOT_TEMP_NAMESPACES) {
        if (signal.aborted) {
          stoppedCode = 'PRIVACY_OWNER_CANCELLED'
          break
        }
        if (isOwnerDeadlineExceeded(startedAt, limits)) {
          stoppedCode = 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
          break
        }
        const remaining = limits.maxRows - progress.deletedItemCount
        if (remaining <= 0) {
          stoppedCode = 'PRIVACY_OWNER_LIMIT_REACHED'
          break
        }
        const temp = await options.tempFileService.cleanupNamespace(namespace, {
          cutoffMs: scope.cutoffMs,
          maxRows: remaining,
          signal
        })
        addProgress(progress, {
          deletedItemCount: temp.deletedItemCount,
          deletedByteCount: temp.deletedByteCount,
          failedItemCount: temp.failedItemCount,
          batches: temp.deletedItemCount > 0 || temp.failedItemCount > 0 ? 1 : 0
        })
        if (temp.cancelled) stoppedCode = 'PRIVACY_OWNER_CANCELLED'
        else if (temp.bounded) stoppedCode = 'PRIVACY_OWNER_LIMIT_REACHED'
        if (stoppedCode) break
      }

      const cutoffSeconds = toUnixSeconds(scope.cutoffMs)
      let cursorTimestamp = -1
      let cursorId = 0
      while (!stoppedCode && progress.deletedItemCount < limits.maxRows) {
        if (signal.aborted) {
          stoppedCode = 'PRIVACY_OWNER_CANCELLED'
          break
        }
        if (isOwnerDeadlineExceeded(startedAt, limits)) {
          stoppedCode = 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
          break
        }
        const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
        const jobs = await queryPrivacyCandidates(
          client,
          `SELECT id AS owner_id,
                  COALESCE(finished_at, queued_at) AS owner_sort,
                  length(COALESCE(meta, '')) + length(COALESCE(last_error, '')) +
                  COALESCE((SELECT SUM(length(COALESCE(text, '')) + length(COALESCE(extra, '')))
                              FROM ocr_results WHERE job_id = ocr_jobs.id), 0) AS byte_count
             FROM ocr_jobs
            WHERE status IN (${TERMINAL_STATUSES})
              AND COALESCE(finished_at, queued_at) < ?
              AND (COALESCE(finished_at, queued_at) > ?
                OR (COALESCE(finished_at, queued_at) = ? AND id > ?))
            ORDER BY COALESCE(finished_at, queued_at), id
            LIMIT ?`,
          [cutoffSeconds, cursorTimestamp, cursorTimestamp, cursorId],
          pageSize
        )
        if (jobs.rows.length === 0) break
        const lastJob = jobs.rows.at(-1)
        const ids = jobs.rows.map((row) => row.id)
        const deletion = await scheduleWrite('privacy.ocr.retention', () =>
          executePrivacySql(
            client,
            `DELETE FROM ocr_jobs
              WHERE id IN (${sqlPlaceholders(ids.length)})
                AND status IN (${TERMINAL_STATUSES})
                AND COALESCE(finished_at, queued_at) < ?
              RETURNING id`,
            [...ids, cutoffSeconds]
          )
        )
        const deletedIds = new Set(deletion.rows.map((row) => Number(row.id)))
        const committedRows = jobs.rows.filter((row) => deletedIds.has(Number(row.id)))
        cursorTimestamp = Number(lastJob?.sortValue ?? cursorTimestamp)
        cursorId = Number(lastJob?.id ?? cursorId)
        addProgress(progress, {
          deletedItemCount: committedRows.length,
          deletedByteCount: sumCandidateBytes(committedRows),
          batches: 1
        })
        if (jobs.rows.length < pageSize) break
      }

      if (!stoppedCode && signal.aborted) {
        stoppedCode = 'PRIVACY_OWNER_CANCELLED'
      } else if (!stoppedCode && isOwnerDeadlineExceeded(startedAt, limits)) {
        stoppedCode = 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
      } else if (!stoppedCode && progress.deletedItemCount >= limits.maxRows) {
        stoppedCode = 'PRIVACY_OWNER_LIMIT_REACHED'
      }

      if (progress.failedItemCount > 0) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      if (stoppedCode) {
        return privacyDeleteResult(CATEGORY, stoppedCode, progress, {
          retryable: stoppedCode !== 'PRIVACY_OWNER_CANCELLED',
          partial: progress.deletedItemCount > 0,
          cancelled: stoppedCode === 'PRIVACY_OWNER_CANCELLED'
        })
      }

      const active = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count, 0 AS byte_count
           FROM ocr_jobs
          WHERE status NOT IN (${TERMINAL_STATUSES}) AND queued_at < ?`,
        [toUnixSeconds(scope.cutoffMs)]
      )
      progress.protectedItemCount = active.itemCount

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
    let rows
    try {
      const result = await client.execute({
        sql: `SELECT id, status, queued_at, finished_at
                FROM ocr_jobs
               ORDER BY queued_at, id
               LIMIT ?`,
        args: [limits.maxRows + 1]
      })
      rows = result.rows
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
    const records = rows.slice(0, limits.maxRows).map((row) => ({
      kind: 'ocr-job-metadata',
      jobId: exportNumber(row.id) ?? exportString(row.id, 256),
      status: exportString(row.status, 64),
      queuedAt: exportNumber(row.queued_at),
      finishedAt: exportNumber(row.finished_at)
    }))
    return await writePrivacyOwnerRecords(
      CATEGORY,
      records,
      writer,
      signal,
      rows.length > limits.maxRows
    )
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
