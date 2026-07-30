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

const CATEGORY = 'search-history' as const
const DAY_MS = 86_400_000

type CutoffUnit = 'seconds' | 'day'

interface SearchRetentionTarget {
  readonly client: PrivacySqlClient
  readonly label: string
  readonly table: string
  readonly cutoffColumn: string
  readonly cutoffUnit: CutoffUnit
  readonly byteExpression: string
  readonly includeExpired?: boolean
}

export interface SearchRetentionOwnerOptions {
  readonly coreClient: Pick<Client, 'execute' | 'batch'>
  readonly auxiliaryClient: Pick<Client, 'execute' | 'batch'>
  readonly limits?: Partial<PrivacyOwnerLimits>
  readonly scheduleWrite?: PrivacyOwnerWriteScheduler
  readonly onDeletedPage?: (target: string, rowIds: readonly number[]) => void
  readonly beforeDelete?: () => void | Promise<void>
  readonly onCompleted?: () => void | Promise<void>
}

function cutoffValue(cutoffMs: number, unit: CutoffUnit): number {
  return unit === 'day' ? Math.floor(cutoffMs / DAY_MS) : toUnixSeconds(cutoffMs)
}

function retentionQuery(
  target: SearchRetentionTarget,
  cutoffMs: number,
  nowMs: number
): { predicate: string; sortExpression: string; args: InValue[] } {
  const cutoff = cutoffValue(cutoffMs, target.cutoffUnit)
  if (target.includeExpired) {
    return {
      predicate: `(${target.cutoffColumn} < ? OR expires_at <= ?)`,
      sortExpression: `MIN(${target.cutoffColumn}, expires_at)`,
      args: [cutoff, toUnixSeconds(nowMs)]
    }
  }
  return {
    predicate: `${target.cutoffColumn} < ?`,
    sortExpression: target.cutoffColumn,
    args: [cutoff]
  }
}

export function createSearchRetentionOwner(options: SearchRetentionOwnerOptions): PrivacyDataOwner {
  const limits = normalizePrivacyOwnerLimits(options.limits)
  const scheduleWrite = options.scheduleWrite ?? schedulePrivacyOwnerWrite
  const targets: readonly SearchRetentionTarget[] = Object.freeze([
    {
      client: options.coreClient,
      label: 'query-completions',
      table: 'query_completions',
      cutoffColumn: 'last_completed',
      cutoffUnit: 'seconds',
      byteExpression:
        "length(COALESCE(prefix, '')) + length(COALESCE(source_id, '')) + length(COALESCE(item_id, ''))"
    },
    {
      client: options.coreClient,
      label: 'contextual-embeddings',
      table: 'contextual_embeddings',
      cutoffColumn: 'timestamp',
      cutoffUnit: 'seconds',
      byteExpression:
        "length(COALESCE(session_id, '')) + length(COALESCE(context_text, '')) + length(COALESCE(embedding, X'')) + length(COALESCE(model, ''))"
    },
    {
      client: options.coreClient,
      label: 'usage-logs',
      table: 'usage_logs',
      cutoffColumn: 'timestamp',
      cutoffUnit: 'seconds',
      byteExpression:
        "length(COALESCE(item_id, '')) + length(COALESCE(action, '')) + length(COALESCE(source, '')) + length(COALESCE(keyword, '')) + length(COALESCE(context, ''))"
    },
    {
      client: options.coreClient,
      label: 'usage-summary',
      table: 'usage_summary',
      cutoffColumn: 'last_used',
      cutoffUnit: 'seconds',
      byteExpression: "length(COALESCE(item_id, ''))"
    },
    {
      client: options.coreClient,
      label: 'item-usage',
      table: 'item_usage_stats',
      cutoffColumn:
        'MAX(COALESCE(last_searched, 0), COALESCE(last_executed, 0), COALESCE(last_cancelled, 0), updated_at)',
      cutoffUnit: 'seconds',
      byteExpression:
        "length(COALESCE(source_id, '')) + length(COALESCE(item_id, '')) + length(COALESCE(source_type, ''))"
    },
    {
      client: options.coreClient,
      label: 'item-time',
      table: 'item_time_stats',
      cutoffColumn: 'last_updated',
      cutoffUnit: 'seconds',
      byteExpression:
        "length(COALESCE(source_id, '')) + length(COALESCE(item_id, '')) + length(COALESCE(hour_distribution, '')) + length(COALESCE(day_of_week_distribution, '')) + length(COALESCE(time_slot_distribution, ''))"
    },
    {
      client: options.coreClient,
      label: 'usage-trend',
      table: 'usage_trend_daily',
      cutoffColumn: 'day',
      cutoffUnit: 'day',
      byteExpression: "length(COALESCE(source_id, '')) + length(COALESCE(item_id, ''))"
    },
    {
      client: options.auxiliaryClient,
      label: 'recommendation-cache',
      table: 'recommendation_cache',
      cutoffColumn: 'created_at',
      cutoffUnit: 'seconds',
      byteExpression: "length(COALESCE(cache_key, '')) + length(COALESCE(recommended_items, ''))",
      includeExpired: true
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
          target.client,
          `SELECT COUNT(*) AS item_count,
                  COALESCE(SUM(${target.byteExpression}), 0) AS byte_count
             FROM ${target.table}`
        )
        itemCount += count.itemCount
        byteCount += count.byteCount
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
        const query = retentionQuery(target, scope.cutoffMs, request.nowMs)
        const rows = await queryPrivacyCandidates(
          target.client,
          `SELECT rowid AS owner_id, ${target.byteExpression} AS byte_count
             FROM ${target.table}
            WHERE ${query.predicate}
            ORDER BY ${query.sortExpression}, rowid
            LIMIT ?`,
          query.args,
          remaining
        )
        eligibleItemCount += rows.rows.length
        eligibleByteCount += sumCandidateBytes(rows.rows)
        bounded ||= rows.bounded
      }
      return privacyPreviewResult(CATEGORY, {
        eligibleItemCount,
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
    let cacheInvalidationRequired = false
    const finish = async (
      result: PrivacyOwnerDeleteResult,
      forceCacheInvalidation = false
    ): Promise<PrivacyOwnerDeleteResult> => {
      if (!options.onCompleted || (!forceCacheInvalidation && !cacheInvalidationRequired)) {
        return result
      }
      try {
        await options.onCompleted()
        cacheInvalidationRequired = false
        return result
      } catch {
        return privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      }
    }
    try {
      await options.beforeDelete?.()
      for (const target of targets) {
        const query = retentionQuery(target, scope.cutoffMs, request.nowMs)
        let cursorSort = -1
        let cursorId = 0
        while (progress.deletedItemCount < limits.maxRows) {
          if (signal.aborted) {
            return await finish(
              privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_CANCELLED', progress, {
                partial: progress.deletedItemCount > 0,
                cancelled: true
              })
            )
          }
          if (isOwnerDeadlineExceeded(startedAt, limits)) {
            return await finish(
              privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DEADLINE_EXCEEDED', progress, {
                retryable: true,
                partial: progress.deletedItemCount > 0
              })
            )
          }
          const pageSize = Math.min(limits.batchSize, limits.maxRows - progress.deletedItemCount)
          const rows = await queryPrivacyCandidates(
            target.client,
            `SELECT rowid AS owner_id,
                    ${query.sortExpression} AS owner_sort,
                    ${target.byteExpression} AS byte_count
               FROM ${target.table}
              WHERE ${query.predicate}
                AND (${query.sortExpression} > ?
                  OR (${query.sortExpression} = ? AND rowid > ?))
              ORDER BY ${query.sortExpression}, rowid
              LIMIT ?`,
            [...query.args, cursorSort, cursorSort, cursorId],
            pageSize
          )
          if (rows.rows.length === 0) break
          const lastRow = rows.rows.at(-1)
          const ids: InValue[] = rows.rows.map((row) => row.id)
          const deletion = await scheduleWrite(`privacy.search.${target.label}`, () =>
            executePrivacySql(
              target.client,
              `DELETE FROM ${target.table}
                WHERE rowid IN (${sqlPlaceholders(ids.length)})
                  AND ${query.predicate}
                RETURNING rowid AS owner_id`,
              [...ids, ...query.args]
            )
          )
          const deletedIds = new Set(deletion.rows.map((row) => Number(row.owner_id)))
          const committedRows = rows.rows.filter((row) => deletedIds.has(Number(row.id)))
          cursorSort = Number(lastRow?.sortValue ?? cursorSort)
          cursorId = Number(lastRow?.id ?? cursorId)
          progress.deletedItemCount += committedRows.length
          progress.deletedByteCount += sumCandidateBytes(committedRows)
          progress.batches += 1
          cacheInvalidationRequired ||= committedRows.length > 0
          options.onDeletedPage?.(target.label, [...deletedIds])
          if (rows.rows.length < pageSize) break
        }
        if (progress.deletedItemCount >= limits.maxRows) {
          return await finish(
            privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_LIMIT_REACHED', progress, {
              retryable: true,
              partial: progress.deletedItemCount > 0
            })
          )
        }
      }
      return await finish(
        privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_COMPLETED', progress, { partial: false }),
        true
      )
    } catch {
      return await finish(
        privacyDeleteResult(CATEGORY, 'PRIVACY_OWNER_DATABASE_FAILED', progress, {
          retryable: true,
          partial: progress.deletedItemCount > 0
        })
      )
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

    const exportTargets: readonly {
      readonly client: PrivacySqlClient
      readonly sql: string
      readonly map: (row: Row) => Readonly<Record<string, unknown>>
    }[] = [
      {
        client: options.coreClient,
        sql: `SELECT completion_count, last_completed
                FROM query_completions ORDER BY last_completed, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'query-completion',
          completionCount: exportNumber(row.completion_count),
          lastCompletedAt: exportNumber(row.last_completed)
        })
      },
      {
        client: options.coreClient,
        sql: `SELECT action, source, timestamp
                FROM usage_logs ORDER BY timestamp, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'search-usage',
          action: exportString(row.action, 128),
          sourceType: exportString(row.source, 256),
          createdAt: exportNumber(row.timestamp)
        })
      },
      {
        client: options.coreClient,
        sql: `SELECT click_count, last_used
                FROM usage_summary ORDER BY last_used, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'usage-summary',
          executeCount: exportNumber(row.click_count),
          lastUsedAt: exportNumber(row.last_used)
        })
      },
      {
        client: options.coreClient,
        sql: `SELECT source_type, search_count, execute_count, cancel_count,
                     last_searched, last_executed, last_cancelled, updated_at
                FROM item_usage_stats ORDER BY updated_at, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'item-usage',
          sourceType: exportString(row.source_type, 256),
          searchCount: exportNumber(row.search_count),
          executeCount: exportNumber(row.execute_count),
          cancelCount: exportNumber(row.cancel_count),
          lastSearchedAt: exportNumber(row.last_searched),
          lastExecutedAt: exportNumber(row.last_executed),
          lastCancelledAt: exportNumber(row.last_cancelled),
          updatedAt: exportNumber(row.updated_at)
        })
      },
      {
        client: options.coreClient,
        sql: `SELECT last_updated FROM item_time_stats ORDER BY last_updated, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'item-time-usage',
          updatedAt: exportNumber(row.last_updated)
        })
      },
      {
        client: options.coreClient,
        sql: `SELECT day, execute_count
                FROM usage_trend_daily ORDER BY day, rowid LIMIT ?`,
        map: (row) => ({
          kind: 'usage-trend',
          day: exportNumber(row.day),
          executeCount: exportNumber(row.execute_count)
        })
      }
    ]

    const records: Readonly<Record<string, unknown>>[] = []
    let bounded = false
    try {
      for (const target of exportTargets) {
        if (signal.aborted) break
        const remaining = limits.maxRows - records.length
        if (remaining <= 0) {
          bounded = true
          break
        }
        const result = await target.client.execute({ sql: target.sql, args: [remaining + 1] })
        bounded ||= result.rows.length > remaining
        records.push(...result.rows.slice(0, remaining).map(target.map))
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
