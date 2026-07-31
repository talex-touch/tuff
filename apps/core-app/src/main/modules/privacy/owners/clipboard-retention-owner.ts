import type { Client } from '@libsql/client'
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
import { definePrivacyDataOwner } from '../data-owner'
import {
  exportBoolean,
  exportNumber,
  exportString,
  writePrivacyOwnerRecords
} from '../owner-export-utils'
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

const CATEGORY = 'clipboard-history' as const

export interface ClipboardImageRetentionResult {
  readonly deletedCount: number
  readonly deletedByteCount: number
  readonly failedCount: number
  readonly bounded?: boolean
  readonly cancelled?: boolean
}

export interface ClipboardImageRetentionOwner {
  deleteReferences: (
    references: readonly string[],
    signal: AbortSignal
  ) => Promise<ClipboardImageRetentionResult>
  reconcileOrphans: (signal: AbortSignal, maxRows: number) => Promise<ClipboardImageRetentionResult>
}

export interface ClipboardImagePersistenceAdapter {
  deleteOwnedImageReferences: (
    references: readonly string[],
    signal?: AbortSignal
  ) => Promise<ClipboardImageRetentionResult>
  cleanupOrphanClipboardImages: (
    signal?: AbortSignal,
    maxRows?: number
  ) => Promise<ClipboardImageRetentionResult>
}

export function createClipboardImageRetentionAdapter(
  persistence: ClipboardImagePersistenceAdapter
): ClipboardImageRetentionOwner {
  return Object.freeze({
    deleteReferences: (references, signal) =>
      persistence.deleteOwnedImageReferences(references, signal),
    reconcileOrphans: (signal, maxRows) => persistence.cleanupOrphanClipboardImages(signal, maxRows)
  })
}

export interface ClipboardRetentionOwnerOptions {
  readonly client: Pick<Client, 'execute' | 'batch'>
  readonly imageOwner?: ClipboardImageRetentionOwner
  readonly limits?: Partial<PrivacyOwnerLimits>
  readonly scheduleWrite?: PrivacyOwnerWriteScheduler
  readonly onDeleted?: (ids: readonly number[]) => void
}

const missingImageOwner: ClipboardImageRetentionOwner = Object.freeze({
  async deleteReferences(references) {
    return { deletedCount: 0, deletedByteCount: 0, failedCount: references.length }
  },
  async reconcileOrphans() {
    return { deletedCount: 0, deletedByteCount: 0, failedCount: 0 }
  }
})

function disabledDelete(): PrivacyOwnerDeleteResult {
  return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DISABLED', emptyDeleteProgress(), {
    ok: true,
    partial: false
  })
}

export function createClipboardRetentionOwner(
  options: ClipboardRetentionOwnerOptions
): PrivacyDataOwner {
  const client: PrivacySqlClient = options.client
  const imageOwner = options.imageOwner ?? missingImageOwner
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const scheduleWrite = options.scheduleWrite ?? schedulePrivacyOwnerWrite

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
      const count = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count,
                COALESCE(SUM(CASE WHEN type = 'image' THEN 0 ELSE length(COALESCE(content, '')) END), 0) AS byte_count
           FROM clipboard_history`
      )
      return privacyInspectionResult(
        CATEGORY,
        request.policy.retentionMs,
        count.itemCount,
        count.byteCount
      )
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

    const cutoff = toUnixSeconds(scope.cutoffMs)
    const protectionClause = scope.includeProtected
      ? ''
      : 'AND COALESCE(is_favorite, 0) = 0 AND COALESCE(retention_protected, 0) = 0'
    try {
      const candidates = await queryPrivacyCandidates(
        client,
        `SELECT id AS owner_id,
                CASE WHEN type = 'image' THEN 0 ELSE length(COALESCE(content, '')) END AS byte_count
           FROM clipboard_history
          WHERE timestamp < ? ${protectionClause}
          ORDER BY timestamp, id
          LIMIT ?`,
        [cutoff],
        limits.maxRows
      )
      const protectedRows = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count, 0 AS byte_count
           FROM clipboard_history
          WHERE timestamp < ?
            AND (COALESCE(is_favorite, 0) = 1 OR COALESCE(retention_protected, 0) = 1)`,
        [cutoff]
      )
      return privacyPreviewResult(CATEGORY, {
        eligibleItemCount: candidates.rows.length,
        eligibleByteCount: sumCandidateBytes(candidates.rows),
        protectedItemCount: protectedRows.itemCount,
        bounded: candidates.bounded
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
    if (scope.kind === 'disabled') return disabledDelete()

    const progress = emptyDeleteProgress()
    const startedAt = Date.now()
    const cutoff = toUnixSeconds(scope.cutoffMs)
    const protectionClause = scope.includeProtected
      ? ''
      : 'AND COALESCE(is_favorite, 0) = 0 AND COALESCE(retention_protected, 0) = 0'
    let terminalCode:
      | 'PRIVACY_OWNER_COMPLETED'
      | 'PRIVACY_OWNER_CANCELLED'
      | 'PRIVACY_OWNER_LIMIT_REACHED'
      | 'PRIVACY_OWNER_DEADLINE_EXCEEDED' = 'PRIVACY_OWNER_COMPLETED'
    let resourceFailed = false
    let cursorTimestamp = -1
    let cursorId = 0

    try {
      if (!scope.includeProtected) {
        const protectedRows = await queryPrivacyCount(
          client,
          `SELECT COUNT(*) AS item_count, 0 AS byte_count
             FROM clipboard_history
            WHERE timestamp < ?
              AND (COALESCE(is_favorite, 0) = 1 OR COALESCE(retention_protected, 0) = 1)`,
          [cutoff]
        )
        progress.protectedItemCount = protectedRows.itemCount
      }
      while (progress.deletedItemCount < limits.maxRows) {
        if (signal.aborted) {
          terminalCode = 'PRIVACY_OWNER_CANCELLED'
          break
        }
        if (isOwnerDeadlineExceeded(startedAt, limits)) {
          terminalCode = 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
          break
        }
        const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
        const candidates = await queryPrivacyCandidates(
          client,
          `SELECT id AS owner_id,
                  timestamp AS owner_sort,
                  CASE WHEN type = 'image' THEN 0 ELSE length(COALESCE(content, '')) END AS byte_count,
                  CASE WHEN type = 'image' THEN content ELSE NULL END AS owner_reference
             FROM clipboard_history
            WHERE timestamp < ? ${protectionClause}
              AND (timestamp > ? OR (timestamp = ? AND id > ?))
            ORDER BY timestamp, id
            LIMIT ?`,
          [cutoff, cursorTimestamp, cursorTimestamp, cursorId],
          pageSize
        )
        if (candidates.rows.length === 0) break

        const lastCandidate = candidates.rows.at(-1)
        const ids = candidates.rows.map((row) => row.id)
        const deletion = await scheduleWrite('privacy.clipboard.retention', () =>
          executePrivacySql(
            client,
            `DELETE FROM clipboard_history
              WHERE id IN (${sqlPlaceholders(ids.length)})
                AND timestamp < ? ${protectionClause}
              RETURNING id`,
            [...ids, cutoff]
          )
        )
        const deletedIds = deletion.rows.map((row) => Number(row.id))
        const deletedIdSet = new Set(deletedIds)
        const committedRows = candidates.rows.filter((row) => deletedIdSet.has(Number(row.id)))
        cursorTimestamp = Number(lastCandidate?.sortValue ?? cursorTimestamp)
        cursorId = Number(lastCandidate?.id ?? cursorId)
        progress.deletedItemCount += committedRows.length
        progress.deletedByteCount += sumCandidateBytes(committedRows)
        progress.batches += 1
        options.onDeleted?.(deletedIds)

        const references = committedRows
          .map((row) => row.reference)
          .filter((reference): reference is string => Boolean(reference))
        const imageResult = await imageOwner.deleteReferences(references, signal)
        progress.deletedByteCount += Math.max(0, imageResult.deletedByteCount)
        if (imageResult.failedCount > 0) {
          progress.failedItemCount += imageResult.failedCount
          resourceFailed = true
        }
        if (signal.aborted || imageResult.cancelled) {
          terminalCode = 'PRIVACY_OWNER_CANCELLED'
          break
        }
        if (imageResult.bounded) {
          terminalCode = 'PRIVACY_OWNER_LIMIT_REACHED'
          break
        }
        if (candidates.rows.length < pageSize) break
      }

      if (
        terminalCode === 'PRIVACY_OWNER_COMPLETED' &&
        progress.deletedItemCount >= limits.maxRows
      ) {
        terminalCode = 'PRIVACY_OWNER_LIMIT_REACHED'
      }

      const reconcileRemaining = limits.maxRows - progress.deletedItemCount
      if (
        terminalCode === 'PRIVACY_OWNER_COMPLETED' &&
        reconcileRemaining > 0 &&
        !isOwnerDeadlineExceeded(startedAt, limits)
      ) {
        const reconcile = await imageOwner.reconcileOrphans(signal, reconcileRemaining)
        progress.deletedByteCount += Math.max(0, reconcile.deletedByteCount)
        progress.failedItemCount += Math.max(0, reconcile.failedCount)
        resourceFailed ||= reconcile.failedCount > 0
        if (signal.aborted || reconcile.cancelled) {
          terminalCode = 'PRIVACY_OWNER_CANCELLED'
        } else if (reconcile.bounded) {
          terminalCode = 'PRIVACY_OWNER_LIMIT_REACHED'
        }
      } else if (
        terminalCode === 'PRIVACY_OWNER_COMPLETED' &&
        isOwnerDeadlineExceeded(startedAt, limits)
      ) {
        terminalCode = 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
      }
      if (resourceFailed) {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }

      if (terminalCode === 'PRIVACY_OWNER_COMPLETED') {
        return privacyDeleteResult(CATEGORY, terminalCode, progress, { partial: false })
      }
      return privacyDeleteResult(CATEGORY, terminalCode, progress, {
        retryable: terminalCode !== 'PRIVACY_OWNER_CANCELLED',
        partial: progress.deletedItemCount > 0,
        cancelled: terminalCode === 'PRIVACY_OWNER_CANCELLED'
      })
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
    if (signal.aborted) {
      return {
        ok: false as const,
        code: 'PRIVACY_OWNER_CANCELLED' as const,
        retryable: false,
        category: CATEGORY,
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: true
      }
    }

    let rows
    try {
      const result = await client.execute({
        sql: `SELECT id, type, timestamp, is_favorite, retention_protected
                FROM clipboard_history
               ORDER BY timestamp, id
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

    const bounded = rows.length > limits.maxRows
    const records = rows.slice(0, limits.maxRows).map((row) => ({
      kind: 'clipboard-record',
      id: exportNumber(row.id),
      type: exportString(row.type, 128),
      createdAt: exportNumber(row.timestamp),
      favorite: exportBoolean(row.is_favorite),
      important: exportBoolean(row.retention_protected)
    }))
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
