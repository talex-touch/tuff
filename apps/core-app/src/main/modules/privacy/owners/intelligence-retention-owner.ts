import type { Client, InStatement, InValue, Row } from '@libsql/client'
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

const AUDIT_CATEGORY = 'intelligence-audit' as const
const CONTEXT_CATEGORY = 'intelligence-context' as const

function normalizeLifecycleCount(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(maximum, Math.floor(value))
}
const INACTIVE_CONTEXT_STATUSES = "'archived', 'expired'"

interface AuditTarget {
  readonly table: string
  readonly cutoffColumn: string
  readonly cutoffUnit: 'milliseconds' | 'seconds'
  readonly byteExpression: string
  readonly label: string
}

export interface IntelligenceAuditRetentionCursor {
  readonly timestampMs: number
  readonly id: number
}

export interface IntelligenceAuditRetentionLifecycle {
  cleanupRetentionPage: (
    cutoffMs: number,
    batchSize: number,
    signal: AbortSignal,
    cursor?: IntelligenceAuditRetentionCursor,
    admissionFloorMs?: number
  ) => Promise<{
    deletedCount: number
    hasMore: boolean
    cancelled: boolean
    cursor?: IntelligenceAuditRetentionCursor
  }>
}

export interface IntelligenceContextRetentionCursor {
  readonly updatedAtMs: number
  readonly id: string
}

export interface IntelligenceContextRetentionLifecycle {
  cleanupRetentionPage: (
    cutoffMs: number,
    batchSize: number,
    signal: AbortSignal,
    cursor?: IntelligenceContextRetentionCursor,
    includeProtected?: boolean
  ) => Promise<{
    deletedCount: number
    hasMore: boolean
    cancelled: boolean
    cursor?: IntelligenceContextRetentionCursor
  }>
}

export interface IntelligenceRetentionOwnerOptions {
  readonly client: Pick<Client, 'execute' | 'batch'>
  readonly auditLifecycle?: IntelligenceAuditRetentionLifecycle
  readonly contextLifecycle?: IntelligenceContextRetentionLifecycle
  readonly limits?: Partial<PrivacyOwnerLimits>
  readonly scheduleWrite?: PrivacyOwnerWriteScheduler
}

function auditCutoff(cutoffMs: number, unit: AuditTarget['cutoffUnit']): number {
  return unit === 'seconds' ? toUnixSeconds(cutoffMs) : cutoffMs
}

export function createIntelligenceRetentionOwner(
  options: IntelligenceRetentionOwnerOptions
): PrivacyDataOwner {
  const client: PrivacySqlClient = options.client
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const scheduleWrite = options.scheduleWrite ?? schedulePrivacyOwnerWrite
  const auditTargets: readonly AuditTarget[] = Object.freeze([
    {
      table: 'intelligence_audit_logs',
      cutoffColumn: 'timestamp',
      cutoffUnit: 'milliseconds',
      byteExpression:
        "length(COALESCE(trace_id, '')) + length(COALESCE(capability_id, '')) + length(COALESCE(provider, '')) + length(COALESCE(model, '')) + length(COALESCE(prompt_hash, '')) + length(COALESCE(caller, '')) + length(COALESCE(user_id, '')) + length(COALESCE(error, '')) + length(COALESCE(metadata, ''))",
      label: 'audit-logs'
    }
  ])

  async function inspectAudit(request: PrivacyOwnerInspectRequest, signal: AbortSignal) {
    try {
      let itemCount = 0
      let byteCount = 0
      for (const target of auditTargets) {
        if (signal.aborted) {
          return privacyInspectionResult(
            AUDIT_CATEGORY,
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
      return privacyInspectionResult(
        AUDIT_CATEGORY,
        request.policy.retentionMs,
        itemCount,
        byteCount
      )
    } catch {
      return privacyInspectionResult(
        AUDIT_CATEGORY,
        request.policy.retentionMs,
        0,
        0,
        'PRIVACY_OWNER_DATABASE_FAILED'
      )
    }
  }

  async function inspectContext(request: PrivacyOwnerInspectRequest, signal: AbortSignal) {
    if (signal.aborted) {
      return privacyInspectionResult(
        CONTEXT_CATEGORY,
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
                COALESCE(SUM(
                  length(COALESCE(s.objective, '')) + length(COALESCE(s.summary, '')) + length(COALESCE(s.metadata, '')) +
                  COALESCE((SELECT SUM(length(COALESCE(content, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_turns WHERE session_id = s.id), 0) +
                  COALESCE((SELECT SUM(length(COALESCE(reason, '')) + length(COALESCE(summary, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_checkpoints WHERE session_id = s.id), 0) +
                  COALESCE((SELECT SUM(length(COALESCE(goal, '')) + length(COALESCE(current_state, '')) + length(COALESCE(decisions, '')) + length(COALESCE(constraints, '')) + length(COALESCE(artifacts, '')) + length(COALESCE(open_questions, '')) + length(COALESCE(metadata, ''))) FROM intelligence_compression_snapshots WHERE session_id = s.id), 0) +
                  COALESCE((SELECT SUM(length(COALESCE(trace_id, '')) + length(COALESCE(items, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_package_logs WHERE session_id = s.id), 0)
                ), 0) AS byte_count
           FROM intelligence_context_sessions s`
      )
      return privacyInspectionResult(
        CONTEXT_CATEGORY,
        request.policy.retentionMs,
        count.itemCount,
        count.byteCount
      )
    } catch {
      return privacyInspectionResult(
        CONTEXT_CATEGORY,
        request.policy.retentionMs,
        0,
        0,
        'PRIVACY_OWNER_DATABASE_FAILED'
      )
    }
  }

  async function inspect(request: PrivacyOwnerInspectRequest, signal: AbortSignal) {
    if (!isValidPrivacyOwnerRequest(request)) {
      return privacyInspectionResult(AUDIT_CATEGORY, null, 0, 0, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (request.category === AUDIT_CATEGORY) return inspectAudit(request, signal)
    if (request.category === CONTEXT_CATEGORY) return inspectContext(request, signal)
    return privacyInspectionResult(
      AUDIT_CATEGORY,
      request.policy.retentionMs,
      0,
      0,
      'PRIVACY_OWNER_INVALID_REQUEST'
    )
  }

  async function previewAudit(request: PrivacyOwnerDeleteRequest, signal: AbortSignal) {
    const scope = resolvePrivacyDeleteScope(request, false)
    if (scope.kind === 'invalid') {
      return privacyPreviewResult(AUDIT_CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (scope.kind === 'disabled') return privacyPreviewResult(AUDIT_CATEGORY)
    try {
      const cleanupCutoffMs = request.mode === 'manual-delete' ? request.nowMs : scope.cutoffMs
      let eligibleItemCount = 0
      let eligibleByteCount = 0
      let bounded = false
      for (const target of auditTargets) {
        if (signal.aborted)
          return privacyPreviewResult(AUDIT_CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
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
          [auditCutoff(cleanupCutoffMs, target.cutoffUnit)],
          remaining
        )
        eligibleItemCount += rows.rows.length
        eligibleByteCount += sumCandidateBytes(rows.rows)
        bounded ||= rows.bounded
      }
      return privacyPreviewResult(AUDIT_CATEGORY, {
        eligibleItemCount,
        eligibleByteCount,
        bounded
      })
    } catch {
      return privacyPreviewResult(AUDIT_CATEGORY, {}, 'PRIVACY_OWNER_DATABASE_FAILED')
    }
  }

  const contextByteExpression = `
    length(COALESCE(s.objective, '')) + length(COALESCE(s.summary, '')) + length(COALESCE(s.metadata, '')) +
    COALESCE((SELECT SUM(length(COALESCE(content, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_turns WHERE session_id = s.id), 0) +
    COALESCE((SELECT SUM(length(COALESCE(reason, '')) + length(COALESCE(summary, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_checkpoints WHERE session_id = s.id), 0) +
    COALESCE((SELECT SUM(length(COALESCE(goal, '')) + length(COALESCE(current_state, '')) + length(COALESCE(decisions, '')) + length(COALESCE(constraints, '')) + length(COALESCE(artifacts, '')) + length(COALESCE(open_questions, '')) + length(COALESCE(metadata, ''))) FROM intelligence_compression_snapshots WHERE session_id = s.id), 0) +
    COALESCE((SELECT SUM(length(COALESCE(trace_id, '')) + length(COALESCE(items, '')) + length(COALESCE(metadata, ''))) FROM intelligence_context_package_logs WHERE session_id = s.id), 0)
  `

  async function previewContext(request: PrivacyOwnerDeleteRequest, signal: AbortSignal) {
    const scope = resolvePrivacyDeleteScope(request, false)
    if (scope.kind === 'invalid') {
      return privacyPreviewResult(CONTEXT_CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (scope.kind === 'disabled') return privacyPreviewResult(CONTEXT_CATEGORY)
    if (signal.aborted) return privacyPreviewResult(CONTEXT_CATEGORY, {}, 'PRIVACY_OWNER_CANCELLED')
    try {
      const protectionClause = scope.includeProtected
        ? `AND s.status IN (${INACTIVE_CONTEXT_STATUSES})`
        : `AND s.status IN (${INACTIVE_CONTEXT_STATUSES})
           AND COALESCE(s.is_pinned, 0) = 0`
      const rows = await queryPrivacyCandidates(
        client,
        `SELECT s.id AS owner_id, ${contextByteExpression} AS byte_count
           FROM intelligence_context_sessions s
          WHERE s.updated_at < ?
            ${protectionClause}
          ORDER BY s.updated_at, s.id
          LIMIT ?`,
        [scope.cutoffMs],
        limits.maxRows
      )
      const active = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count, 0 AS byte_count
           FROM intelligence_context_sessions
          WHERE updated_at < ?
            AND (status = 'active'${scope.includeProtected ? '' : ' OR COALESCE(is_pinned, 0) = 1'})`,
        [scope.cutoffMs]
      )
      return privacyPreviewResult(CONTEXT_CATEGORY, {
        eligibleItemCount: rows.rows.length,
        eligibleByteCount: sumCandidateBytes(rows.rows),
        protectedItemCount: active.itemCount,
        bounded: rows.bounded
      })
    } catch {
      return privacyPreviewResult(CONTEXT_CATEGORY, {}, 'PRIVACY_OWNER_DATABASE_FAILED')
    }
  }

  async function previewDelete(request: PrivacyOwnerDeleteRequest, signal: AbortSignal) {
    if (!isValidPrivacyOwnerRequest(request)) {
      return privacyPreviewResult(AUDIT_CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
    }
    if (request.category === AUDIT_CATEGORY) return previewAudit(request, signal)
    if (request.category === CONTEXT_CATEGORY) return previewContext(request, signal)
    return privacyPreviewResult(AUDIT_CATEGORY, {}, 'PRIVACY_OWNER_INVALID_REQUEST')
  }

  async function deleteAudit(
    request: PrivacyOwnerDeleteRequest,
    signal: AbortSignal
  ): Promise<PrivacyOwnerDeleteResult> {
    const scope = resolvePrivacyDeleteScope(request, true)
    if (scope.kind === 'invalid') {
      return privacyDeleteResult(
        AUDIT_CATEGORY,
        'PRIVACY_OWNER_INVALID_REQUEST',
        emptyDeleteProgress(),
        {
          partial: false
        }
      )
    }
    if (scope.kind === 'disabled') {
      return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_DISABLED', emptyDeleteProgress(), {
        ok: true,
        partial: false
      })
    }
    const progress = emptyDeleteProgress()
    const startedAt = Date.now()
    const cleanupCutoffMs = request.mode === 'manual-delete' ? request.nowMs : scope.cutoffMs
    try {
      if (options.auditLifecycle) {
        let cursor: IntelligenceAuditRetentionCursor | undefined
        while (progress.deletedItemCount < limits.maxRows) {
          if (signal.aborted) {
            return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return privacyDeleteResult(
              AUDIT_CATEGORY,
              'PRIVACY_OWNER_DEADLINE_EXCEEDED',
              progress,
              {
                retryable: true,
                partial: progress.deletedItemCount > 0
              }
            )
          }
          const pageLimit = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
          const page = await options.auditLifecycle.cleanupRetentionPage(
            cleanupCutoffMs,
            pageLimit,
            signal,
            cursor,
            request.mode === 'manual-delete' ? request.nowMs : cleanupCutoffMs
          )
          cursor = page.cursor ?? cursor
          const deletedCount = normalizeLifecycleCount(page.deletedCount, pageLimit)
          progress.deletedItemCount += deletedCount
          if (deletedCount > 0) progress.batches += 1
          if (page.cancelled) {
            return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (!page.hasMore) {
            return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, {
              partial: false
            })
          }
          if (deletedCount === 0) {
            return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
              retryable: true,
              partial: progress.deletedItemCount > 0
            })
          }
        }
        return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }

      for (const target of auditTargets) {
        const cutoff = auditCutoff(cleanupCutoffMs, target.cutoffUnit)
        let cursorSort = -1
        let cursorId = 0
        while (progress.deletedItemCount < limits.maxRows) {
          if (signal.aborted) {
            return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return privacyDeleteResult(
              AUDIT_CATEGORY,
              'PRIVACY_OWNER_DEADLINE_EXCEEDED',
              progress,
              {
                retryable: true,
                partial: progress.deletedItemCount > 0
              }
            )
          }
          const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
          const rows = await queryPrivacyCandidates(
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
            [cutoff, cursorSort, cursorSort, cursorId],
            pageSize
          )
          if (rows.rows.length === 0) break
          const lastRow = rows.rows.at(-1)
          const ids = rows.rows.map((row) => row.id)
          const deletion = await scheduleWrite(`privacy.intelligence.${target.label}`, () =>
            executePrivacySql(
              client,
              `DELETE FROM ${target.table}
                WHERE rowid IN (${sqlPlaceholders(ids.length)})
                  AND ${target.cutoffColumn} < ?
                RETURNING rowid AS owner_id`,
              [...ids, cutoff]
            )
          )
          const deletedIds = new Set(deletion.rows.map((row) => Number(row.owner_id)))
          const committedRows = rows.rows.filter((row) => deletedIds.has(Number(row.id)))
          cursorSort = Number(lastRow?.sortValue ?? cursorSort)
          cursorId = Number(lastRow?.id ?? cursorId)
          progress.deletedItemCount += committedRows.length
          progress.deletedByteCount += sumCandidateBytes(committedRows)
          progress.batches += 1
          if (rows.rows.length < pageSize) break
        }
        if (progress.deletedItemCount >= limits.maxRows) {
          return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
            retryable: true,
            partial: progress.deletedItemCount > 0
          })
        }
      }
      return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, {
        partial: false
      })
    } catch {
      return privacyDeleteResult(AUDIT_CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
        retryable: true,
        partial: progress.deletedItemCount > 0
      })
    }
  }

  function contextDeleteStatements(
    ids: readonly InValue[],
    cutoffMs: number,
    includeProtected: boolean
  ): InStatement[] {
    const placeholders = sqlPlaceholders(ids.length)
    const protectionClause = includeProtected
      ? `AND status IN (${INACTIVE_CONTEXT_STATUSES})`
      : `AND status IN (${INACTIVE_CONTEXT_STATUSES})
         AND COALESCE(is_pinned, 0) = 0`
    return [
      {
        sql: `DELETE FROM intelligence_context_sessions
               WHERE id IN (${placeholders})
                 AND updated_at < ?
                 ${protectionClause}
             RETURNING id`,
        args: [...ids, cutoffMs]
      }
    ]
  }

  async function deleteContext(
    request: PrivacyOwnerDeleteRequest,
    signal: AbortSignal
  ): Promise<PrivacyOwnerDeleteResult> {
    const scope = resolvePrivacyDeleteScope(request, true)
    if (scope.kind === 'invalid') {
      return privacyDeleteResult(
        CONTEXT_CATEGORY,
        'PRIVACY_OWNER_INVALID_REQUEST',
        emptyDeleteProgress(),
        {
          partial: false
        }
      )
    }
    if (scope.kind === 'disabled') {
      return privacyDeleteResult(
        CONTEXT_CATEGORY,
        'PRIVACY_OWNER_DISABLED',
        emptyDeleteProgress(),
        {
          ok: true,
          partial: false
        }
      )
    }
    const progress = emptyDeleteProgress()
    const startedAt = Date.now()
    let cursorUpdatedAt = -1
    let cursorId = ''
    try {
      if (options.contextLifecycle) {
        let cursor: IntelligenceContextRetentionCursor | undefined
        while (progress.deletedItemCount < limits.maxRows) {
          if (signal.aborted) {
            return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return privacyDeleteResult(
              CONTEXT_CATEGORY,
              'PRIVACY_OWNER_DEADLINE_EXCEEDED',
              progress,
              {
                retryable: true,
                partial: progress.deletedItemCount > 0
              }
            )
          }
          const pageLimit = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
          const page = await options.contextLifecycle.cleanupRetentionPage(
            scope.cutoffMs,
            pageLimit,
            signal,
            cursor,
            scope.includeProtected
          )
          cursor = page.cursor ?? cursor
          const deletedCount = normalizeLifecycleCount(page.deletedCount, pageLimit)
          progress.deletedItemCount += deletedCount
          if (deletedCount > 0) progress.batches += 1
          if (page.cancelled) {
            return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
              partial: progress.deletedItemCount > 0,
              cancelled: true
            })
          }
          if (!page.hasMore) break
          if (deletedCount === 0) {
            return privacyDeleteResult(
              CONTEXT_CATEGORY,
              'PRIVACY_OWNER_DATABASE_FAILED',
              progress,
              {
                retryable: true,
                partial: progress.deletedItemCount > 0
              }
            )
          }
        }
        const protectedRows = await queryPrivacyCount(
          client,
          `SELECT COUNT(*) AS item_count, 0 AS byte_count
             FROM intelligence_context_sessions
            WHERE updated_at < ?
              AND (status = 'active'${scope.includeProtected ? '' : ' OR COALESCE(is_pinned, 0) = 1'})`,
          [scope.cutoffMs]
        )
        progress.protectedItemCount = protectedRows.itemCount
        if (progress.deletedItemCount >= limits.maxRows) {
          return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
            retryable: true,
            partial: progress.deletedItemCount > 0
          })
        }
        return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, {
          partial: false
        })
      }

      while (progress.deletedItemCount < limits.maxRows) {
        if (signal.aborted) {
          return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
            partial: progress.deletedItemCount > 0,
            cancelled: true
          })
        }
        if (isOwnerDeadlineExceeded(startedAt, limits)) {
          return privacyDeleteResult(
            CONTEXT_CATEGORY,
            'PRIVACY_OWNER_DEADLINE_EXCEEDED',
            progress,
            {
              retryable: true,
              partial: progress.deletedItemCount > 0
            }
          )
        }
        const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
        const protectionClause = scope.includeProtected
          ? `AND s.status IN (${INACTIVE_CONTEXT_STATUSES})`
          : `AND s.status IN (${INACTIVE_CONTEXT_STATUSES})
             AND COALESCE(s.is_pinned, 0) = 0`
        const rows = await queryPrivacyCandidates(
          client,
          `SELECT s.id AS owner_id,
                  s.updated_at AS owner_sort,
                  ${contextByteExpression} AS byte_count
             FROM intelligence_context_sessions s
            WHERE s.updated_at < ?
              ${protectionClause}
              AND (s.updated_at > ? OR (s.updated_at = ? AND s.id > ?))
            ORDER BY s.updated_at, s.id
            LIMIT ?`,
          [scope.cutoffMs, cursorUpdatedAt, cursorUpdatedAt, cursorId],
          pageSize
        )
        if (rows.rows.length === 0) break
        const lastRow = rows.rows.at(-1)
        const ids = rows.rows.map((row) => row.id)
        const results = await scheduleWrite('privacy.intelligence.context', () =>
          client.batch(
            contextDeleteStatements(ids, scope.cutoffMs, scope.includeProtected),
            'write'
          )
        )
        const deletedIds = new Set(results.at(-1)?.rows.map((row) => String(row.id)) ?? [])
        const committedRows = rows.rows.filter((row) => deletedIds.has(String(row.id)))
        cursorUpdatedAt = Number(lastRow?.sortValue ?? cursorUpdatedAt)
        cursorId = String(lastRow?.id ?? cursorId)
        progress.deletedItemCount += committedRows.length
        progress.deletedByteCount += sumCandidateBytes(committedRows)
        progress.batches += 1
        if (rows.rows.length < pageSize) break
      }
      const active = await queryPrivacyCount(
        client,
        `SELECT COUNT(*) AS item_count, 0 AS byte_count
           FROM intelligence_context_sessions
          WHERE updated_at < ?
            AND (status = 'active'${scope.includeProtected ? '' : ' OR COALESCE(is_pinned, 0) = 1'})`,
        [scope.cutoffMs]
      )
      progress.protectedItemCount = active.itemCount
      if (progress.deletedItemCount >= limits.maxRows) {
        return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
      return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, {
        partial: false
      })
    } catch {
      return privacyDeleteResult(CONTEXT_CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
        retryable: true,
        partial: progress.deletedItemCount > 0
      })
    }
  }

  async function deleteData(request: PrivacyOwnerDeleteRequest, signal: AbortSignal) {
    if (!isValidPrivacyOwnerRequest(request)) {
      return privacyDeleteResult(
        AUDIT_CATEGORY,
        'PRIVACY_OWNER_INVALID_REQUEST',
        emptyDeleteProgress(),
        { partial: false }
      )
    }
    if (request.category === AUDIT_CATEGORY) return deleteAudit(request, signal)
    if (request.category === CONTEXT_CATEGORY) return deleteContext(request, signal)
    return privacyDeleteResult(
      AUDIT_CATEGORY,
      'PRIVACY_OWNER_INVALID_REQUEST',
      emptyDeleteProgress(),
      {
        partial: false
      }
    )
  }

  async function exportData(
    request: PrivacyOwnerExportRequest,
    writer: PrivacyOwnerExportWriter,
    signal: AbortSignal
  ) {
    if (
      !isValidPrivacyOwnerExportRequest(request) ||
      (request.category !== AUDIT_CATEGORY && request.category !== CONTEXT_CATEGORY)
    ) {
      return {
        ok: false as const,
        code: 'PRIVACY_OWNER_INVALID_REQUEST' as const,
        retryable: false,
        category: AUDIT_CATEGORY,
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: false
      }
    }

    const records: Readonly<Record<string, unknown>>[] = []
    let bounded = false
    try {
      if (request.category === AUDIT_CATEGORY) {
        const result = await client.execute({
          sql: `SELECT timestamp, capability_id, provider, model, caller,
                       prompt_tokens, completion_tokens, total_tokens,
                       estimated_cost, latency, success
                  FROM intelligence_audit_logs
                 ORDER BY timestamp, id
                 LIMIT ?`,
          args: [limits.maxRows + 1]
        })
        bounded = result.rows.length > limits.maxRows
        records.push(
          ...result.rows.slice(0, limits.maxRows).map((row: Row) => ({
            kind: 'intelligence-audit-metadata',
            createdAt: exportNumber(row.timestamp),
            capabilityId: exportString(row.capability_id, 256),
            providerId: exportString(row.provider, 256),
            modelId: exportString(row.model, 256),
            callerId: exportString(row.caller, 256),
            promptTokens: exportNumber(row.prompt_tokens),
            completionTokens: exportNumber(row.completion_tokens),
            totalTokens: exportNumber(row.total_tokens),
            estimatedCost: exportNumber(row.estimated_cost),
            latencyMs: exportNumber(row.latency),
            success: exportBoolean(row.success)
          }))
        )
      } else {
        const sessions = await client.execute({
          sql: `SELECT id, owner, status, created_at, updated_at, archived_at, is_pinned
                  FROM intelligence_context_sessions
                 ORDER BY created_at, id
                 LIMIT ?`,
          args: [limits.maxRows + 1]
        })
        bounded = sessions.rows.length > limits.maxRows
        records.push(
          ...sessions.rows.slice(0, limits.maxRows).map((row: Row) => ({
            kind: 'intelligence-context-session',
            sessionId: exportString(row.id, 256),
            owner: exportString(row.owner, 64),
            status: exportString(row.status, 64),
            createdAt: exportNumber(row.created_at),
            updatedAt: exportNumber(row.updated_at),
            archivedAt: exportNumber(row.archived_at),
            pinned: exportBoolean(row.is_pinned)
          }))
        )
        const remaining = limits.maxRows - records.length
        if (remaining > 0 && !signal.aborted) {
          const turns = await client.execute({
            sql: `SELECT id, session_id, role, privacy_level, token_estimate, created_at
                    FROM intelligence_context_turns
                   WHERE privacy_level != 'secret'
                   ORDER BY created_at, id
                   LIMIT ?`,
            args: [remaining + 1]
          })
          bounded ||= turns.rows.length > remaining
          records.push(
            ...turns.rows.slice(0, remaining).map((row: Row) => ({
              kind: 'intelligence-context-turn',
              turnId: exportString(row.id, 256),
              sessionId: exportString(row.session_id, 256),
              role: exportString(row.role, 64),
              privacyLevel: exportString(row.privacy_level, 64),
              tokenEstimate: exportNumber(row.token_estimate),
              createdAt: exportNumber(row.created_at)
            }))
          )
        }
      }
    } catch {
      return {
        ok: false as const,
        code: 'PRIVACY_OWNER_DATABASE_FAILED' as const,
        retryable: true,
        category: request.category,
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: false
      }
    }
    return await writePrivacyOwnerRecords(request.category, records, writer, signal, bounded)
  }

  async function applyRetention(
    policy: PrivacyRetentionPolicyV1,
    nowMs: number,
    signal: AbortSignal
  ) {
    const results: PrivacyOwnerDeleteResult[] = []
    for (const category of [AUDIT_CATEGORY, CONTEXT_CATEGORY] as const) {
      if (signal.aborted) break
      results.push(
        await deleteData(
          { category, mode: 'retention', policy: policy.categories[category], nowMs },
          signal
        )
      )
    }
    return results
  }

  return definePrivacyDataOwner({
    categories: [AUDIT_CATEGORY, CONTEXT_CATEGORY],
    inspect,
    previewDelete,
    delete: deleteData,
    export: exportData,
    applyRetention
  })
}
